#!/usr/bin/env node
/**
 * 旧站 → 新站内容迁移（Phase 3）。
 *
 * 映射表见 night-work/PHASE3-MAPPING.md。这个脚本只做三件事：
 * 读旧库、按映射转换、走新站 REST 写入；每一步都留报告，失败不中断整批。
 *
 * 用法（Node >= 22.16，需 --experimental-strip-types 才能导入 .ts 转换器）：
 *   node --experimental-strip-types scripts/migrate-old-site.mjs \
 *     --old-db ./.migration-fixture/old-site/blog.sqlite \
 *     --old-uploads ./.migration-fixture/old-site/uploads \
 *     --site http://localhost:4321 \
 *     --cookie "emdash_session=..."        # 或 --token ec_pat_...
 *     [--new-db ./data.db]                 # 会员/点赞收藏直接写插件存储时需要
 *     [--dry-run]
 *
 * 幂等：slug 已存在则跳过并记录；媒体按旧路径去重。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { markdownToPortableText } from "./lib/markdown-to-portable-text.ts";

// ─── 参数 ─────────────────────────────────────────────────────────

function arg(name, fallback) {
	const index = process.argv.indexOf(name);
	return index === -1 ? fallback : process.argv[index + 1];
}
const flag = (name) => process.argv.includes(name);

const oldDbPath = resolve(arg("--old-db", "./.migration-fixture/old-site/blog.sqlite"));
const oldUploads = arg("--old-uploads") ? resolve(arg("--old-uploads")) : null;
const site = arg("--site", "http://localhost:4321").replace(/\/$/, "");
const cookie = arg("--cookie");
const token = arg("--token");
const newDbPath = arg("--new-db") ? resolve(arg("--new-db")) : null;
const dryRun = flag("--dry-run");
const outDir = resolve(arg("--out", "./.migration"));
const redirectsOut = resolve(arg("--redirects-out", "./src/data/legacy-redirects.json"));

if (!existsSync(oldDbPath)) {
	console.error(`找不到旧库：${oldDbPath}\n（真实数据到位前可先用 scripts/make-old-site-fixture.mjs 造夹具）`);
	process.exit(1);
}
if (!dryRun && !cookie && !token) {
	console.error("需要 --cookie 或 --token 才能写入站点（或加 --dry-run 只做转换检查）");
	process.exit(1);
}

const report = { entries: [], media: [], comments: [], members: [], activity: [], warnings: [], failures: [] };
const idMap = { articles: {}, life: {}, projects: {}, comments: {} };

// 续跑支持：上一次的映射表里已经有结果时直接复用，避免重复插入（评论尤其如此）
const idMapFile = resolve(arg("--out", "./.migration"), "id-map.json");
if (existsSync(idMapFile)) {
	try {
		const previous = JSON.parse(readFileSync(idMapFile, "utf8"));
		for (const key of ["articles", "life", "projects", "comments"]) {
			Object.assign(idMap[key], previous?.idMap?.[key] ?? {});
		}
		report.warnings.push(`复用上一次的映射表：${Object.values(idMap).reduce((sum, group) => sum + Object.keys(group).length, 0)} 条`);
	} catch {
		report.warnings.push(`上一次的映射表无法解析，按首次迁移处理：${idMapFile}`);
	}
}

// ─── 站内 REST 客户端 ─────────────────────────────────────────────

const headers = () => ({
	"X-EmDash-Request": "1",
	...(token ? { Authorization: `Bearer ${token}` } : {}),
	...(cookie ? { cookie } : {}),
});

async function api(path, options = {}) {
	const response = await fetch(`${site}${path}`, {
		...options,
		headers: { ...headers(), ...options.headers },
	});
	const text = await response.text();
	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		// 非 JSON（例如 HTML 错误页）保留原文
	}
	return { status: response.status, ok: response.ok, json, text };
}

const unwrap = (json) => json?.data?.data ?? json?.data ?? json;

// ─── 读旧库 ───────────────────────────────────────────────────────

const old = new DatabaseSync(oldDbPath, { readOnly: true });
const readAll = (sql) => old.prepare(sql).all();
const iso = (ms) => (ms ? new Date(Number(ms)).toISOString() : null);
const parseJsonArray = (value) => {
	try {
		const parsed = JSON.parse(value ?? "[]");
		return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
	} catch {
		return [];
	}
};

const articles = readAll("select * from articles order by id");
const lifeRecords = readAll("select * from life_records order by id");
const projects = readAll("select * from projects order by id");
const comments = readAll("select * from comments order by id");
const members = readAll("select * from members order by id");
const identities = readAll("select * from member_identities order by id");
const likes = readAll("select * from member_likes order by id");
const favorites = readAll("select * from member_favorites order by id");
const settings = readAll("select * from settings");

const identityByMember = new Map(identities.map((row) => [row.member_id, row]));

// ─── 媒体 ─────────────────────────────────────────────────────────

/** 媒体接口按 Blob 的 type 校验，必须显式给对 */
/** 友链地址必须是 http(s) */
const FRIEND_URL_PATTERN = /^https?:\/\//i;

const MIME_BY_EXT = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	svg: "image/svg+xml",
};

const mediaByOldPath = new Map();
const PROJECT_TECH_OPTIONS = new Set([
	"Vue",
	"React",
	"Astro",
	"TypeScript",
	"JavaScript",
	"Node.js",
	"Fastify",
	"Vite",
	"Rust",
	"Python",
	"Go",
	"SQLite",
]);

const resolveImageUrl = (url) => (url?.startsWith("/uploads/") ? mediaByOldPath.get(url)?.url ?? url : url);

function collectMediaPaths() {
	const paths = new Set();
	const add = (value) => {
		if (typeof value === "string" && value.startsWith("/uploads/")) paths.add(value);
	};
	for (const row of articles) add(row.cover_image);
	for (const row of lifeRecords) add(row.cover_image);
	for (const row of projects) {
		add(row.cover_image);
		add(row.home_image);
		for (const shot of parseJsonArray(row.screenshots)) add(shot);
	}
	// 正文里的图片：先用占位解析器把 /uploads/ 路径挖出来
	for (const row of [...articles, ...lifeRecords]) {
		const blocks = markdownToPortableText(row.content ?? "", { resolveImageUrl: (url) => url });
		for (const block of blocks) {
			if (block._type === "image") add(block.asset?.url);
			for (const mark of block.markDefs ?? []) add(mark.href);
		}
	}
	return [...paths];
}

async function uploadMedia() {
	const paths = collectMediaPaths();
	for (const oldPath of paths) {
		const file = oldUploads ? resolve(oldUploads, basename(oldPath)) : null;
		if (!file || !existsSync(file)) {
			report.warnings.push(`媒体缺失，正文保留原路径：${oldPath}`);
			continue;
		}
		if (dryRun) {
			mediaByOldPath.set(oldPath, { url: `(dry-run)${oldPath}` });
			report.media.push(`${oldPath} → 待上传`);
			continue;
		}
		const form = new FormData();
		const extension = basename(oldPath).split(".").pop()?.toLowerCase() ?? "";
		form.append(
			"file",
			new Blob([readFileSync(file)], { type: MIME_BY_EXT[extension] ?? "application/octet-stream" }),
			basename(oldPath),
		);
		const result = await api("/_emdash/api/media", { method: "POST", body: form });
		if (!result.ok) {
			report.failures.push(`媒体上传失败 ${oldPath}：${result.status} ${result.text.slice(0, 160)}`);
			continue;
		}
		const item = unwrap(result.json)?.item ?? unwrap(result.json);
		const url = item?.url ?? `/_emdash/api/media/file/${basename(oldPath)}`;
		mediaByOldPath.set(oldPath, { url, id: item?.id });
		report.media.push(`${oldPath} → ${url}`);
	}
}

// ─── 分类法词条 ───────────────────────────────────────────────────

function slugify(value) {
	return (
		String(value)
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "term"
	);
}

const termCache = new Map();

async function ensureTerm(taxonomy, label) {
	const key = `${taxonomy}:${label}`;
	if (termCache.has(key)) return termCache.get(key);
	const slug = slugify(label);
	if (dryRun) {
		termCache.set(key, slug);
		return slug;
	}
	const created = await api(`/_emdash/api/taxonomies/${taxonomy}/terms`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ slug, label }),
	});
	if (created.ok) {
		termCache.set(key, slug);
		return slug;
	}
	// 已存在（或 slug 冲突）时按 label 回查
	const list = await api(`/_emdash/api/taxonomies/${taxonomy}/terms?limit=100`);
	// 这个接口返回 { data: { terms: [...] } }，不是 items
	const payload = unwrap(list.json);
	const items = payload?.terms ?? payload?.items ?? [];
	const found = items.find((term) => term.label === label || term.slug === slug);
	if (found) {
		termCache.set(key, found.slug ?? slug);
		return found.slug ?? slug;
	}
	report.warnings.push(`词条无法创建：${taxonomy}/${label}（${created.status}）`);
	termCache.set(key, null);
	return null;
}

async function taxonomyAssignment(taxonomy, labels) {
	const slugs = [];
	for (const label of labels.filter(Boolean)) {
		const slug = await ensureTerm(taxonomy, label);
		if (slug) slugs.push(slug);
	}
	return slugs;
}

// ─── 条目 ─────────────────────────────────────────────────────────

/** 按 slug 回查已存在的条目（409 之后复用，保证迁移可重跑） */
async function findEntry(collection, slug) {
	const direct = await api(`/_emdash/api/content/${collection}/${encodeURIComponent(slug)}`);
	if (direct.ok) {
		const item = unwrap(direct.json)?.item ?? unwrap(direct.json);
		if (item?.id) return item;
	}
	const list = await api(`/_emdash/api/content/${collection}?slug=${encodeURIComponent(slug)}&limit=5`);
	if (!list.ok) return null;
	const payload = unwrap(list.json);
	const items = payload?.items ?? [];
	return items.find((item) => item.slug === slug) ?? null;
}

async function createEntry(collection, { slug, data, status, publishedAt, createdAt, taxonomies }) {
	if (dryRun) {
		report.entries.push(`[dry-run] ${collection}/${slug} status=${status} taxonomies=${JSON.stringify(taxonomies ?? {})}`);
		return { id: `dry-${collection}-${slug}`, slug };
	}
	const created = await api(`/_emdash/api/content/${collection}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			data,
			slug,
			status: "draft",
			...(publishedAt ? { publishedAt } : {}),
			...(createdAt ? { createdAt } : {}),
			...(Object.keys(taxonomies ?? {}).length > 0 ? { taxonomies } : {}),
		}),
	});
	if (!created.ok) {
		const message = `${collection}/${slug} 创建失败：${created.status} ${created.text.slice(0, 200)}`;
		if (created.status === 409) {
			// 已存在：回查它的 id 写进映射，否则失败的批次重跑会丢映射（评论就挂不上目标）
			const existing = await findEntry(collection, slug);
			report.warnings.push(`${collection}/${slug} 已存在，复用 ${existing?.id ?? "?"}`);
			return existing ? { id: existing.id, slug } : null;
		}
		report.failures.push(message);
		return null;
	}
	const item = unwrap(created.json)?.item ?? unwrap(created.json);
	const id = item?.id;
	if (status === "published" && id) {
		const published = await api(`/_emdash/api/content/${collection}/${id}/publish`, { method: "POST" });
		if (!published.ok) {
			report.failures.push(`${collection}/${slug} 发布失败：${published.status} ${published.text.slice(0, 160)}`);
		}
	}
	report.entries.push(`${collection}/${slug} → ${id ?? "(无 id)"}${status === "published" ? " published" : " draft"}`);
	return { id, slug };
}

function postData(row) {
	const blocks = markdownToPortableText(row.content ?? "", { resolveImageUrl });
	return {
		title: row.title,
		excerpt: row.summary ?? "",
		content: blocks,
		...(row.cover_image && mediaByOldPath.has(row.cover_image)
			? { featured_image: { src: mediaByOldPath.get(row.cover_image).url, alt: row.title } }
			: {}),
		...(row.pinned ? { pinned: true } : {}),
	};
}

// ─── 主流程 ───────────────────────────────────────────────────────

console.log(`旧库：${oldDbPath}${dryRun ? "（dry-run）" : ""}`);
console.log(`站点：${site}`);

await uploadMedia();

// 文章
for (const row of articles) {
	const taxonomies = {};
	const category = await taxonomyAssignment("category", [row.category]);
	if (category.length > 0) taxonomies.category = category;
	const tags = await taxonomyAssignment("tag", parseJsonArray(row.tags));
	if (tags.length > 0) taxonomies.tag = tags;
	const result = await createEntry("posts", {
		slug: row.slug,
		data: postData(row),
		status: row.status,
		publishedAt: iso(row.published_at ?? row.created_at),
		createdAt: iso(row.created_at),
		taxonomies,
	});
	if (result) idMap.articles[row.id] = result;
}

// 生活记录
for (const row of lifeRecords) {
	const taxonomies = {};
	const category = await taxonomyAssignment("life_category", [row.category]);
	if (category.length > 0) taxonomies.life_category = category;
	const tags = await taxonomyAssignment("tag", parseJsonArray(row.tags));
	if (tags.length > 0) taxonomies.tag = tags;
	const result = await createEntry("life", {
		slug: `life-${row.id}`,
		data: {
			title: row.title,
			excerpt: row.summary ?? "",
			content: markdownToPortableText(row.content ?? "", { resolveImageUrl }),
			record_date: row.record_date ? `${row.record_date}T00:00:00Z` : null,
			...(row.cover_image && mediaByOldPath.has(row.cover_image)
				? { featured_image: { src: mediaByOldPath.get(row.cover_image).url, alt: row.title } }
				: {}),
			...(row.pinned ? { pinned: true } : {}),
		},
		status: row.status,
		publishedAt: iso(row.published_at ?? row.created_at),
		createdAt: iso(row.created_at),
		taxonomies,
	});
	if (result) idMap.life[row.id] = result;
}

// 作品
for (const row of projects) {
	const tech = parseJsonArray(row.tech);
	const kept = tech.filter((item) => PROJECT_TECH_OPTIONS.has(item));
	const dropped = tech.filter((item) => !PROJECT_TECH_OPTIONS.has(item));
	if (dropped.length > 0) report.warnings.push(`作品「${row.name}」丢弃非枚举技术栈：${dropped.join(", ")}`);
	const screenshots = parseJsonArray(row.screenshots).flatMap((shot) => {
		const media = mediaByOldPath.get(shot);
		return media ? [{ image: { src: media.url, alt: row.name }, caption: "" }] : [];
	});
	const cover = row.cover_image && mediaByOldPath.has(row.cover_image) ? row.cover_image : row.home_image;
	const typeSlug = row.type ? await ensureTerm("project_type", row.type) : null;
	const result = await createEntry("projects", {
		slug: `project-${row.id}`,
		data: {
			title: row.name,
			summary: row.description ?? "",
			content: [],
			...(cover && mediaByOldPath.has(cover)
				? { cover_image: { src: mediaByOldPath.get(cover).url, alt: row.name } }
				: {}),
			...(kept.length > 0 ? { tech: kept } : {}),
			...(row.preview ? { preview_url: row.preview } : {}),
			...(row.show_code && row.code ? { repo_url: row.code } : {}),
			...(row.featured ? { featured: true } : {}),
			...(row.stars ? { stars: Number(row.stars) } : {}),
			...(row.forks ? { forks: Number(row.forks) } : {}),
			...(row.sort_order ? { sort_order: Number(row.sort_order) } : {}),
			...(screenshots.length > 0 ? { screenshots } : {}),
			show_code: Boolean(row.show_code),
		},
		status: row.status,
		publishedAt: iso(row.published_at ?? row.created_at),
		createdAt: iso(row.created_at),
		taxonomies: typeSlug ? { project_type: [typeSlug] } : {},
	});
	if (result) idMap.projects[row.id] = result;
}

// 留言墙条目的 id（评论迁移用）
const wallEntry = await (async () => {
	if (dryRun) return { id: "dry-wall" };
	const found = await api("/_emdash/api/content/wall?limit=10");
	const items = unwrap(found.json)?.items ?? [];
	return items.find((item) => item.slug === "wall") ?? items[0] ?? null;
})();

// ─── 评论 ─────────────────────────────────────────────────────────

const commentTarget = (row) => {
	if (row.target_type === "message") return { collection: "wall", entry: wallEntry };
	if (row.target_type === "article") return { collection: "posts", entry: idMap.articles[row.target_id] };
	if (row.target_type === "life") return { collection: "life", entry: idMap.life[row.target_id] };
	if (row.target_type === "project") return { collection: "projects", entry: idMap.projects[row.target_id] };
	return { collection: null, entry: null };
};

/**
 * 旧文章往往早就超过集合的「发布 N 天后自动关闭评论」窗口，公开提交接口会直接 403。
 * 迁移历史评论时临时把窗口设为 0，结束（含异常）后恢复原值。
 */
function openCommentWindows() {
	if (!newDbPath) {
		report.warnings.push("未提供 --new-db：若集合设置了自动关闭评论，历史评论会导入失败");
		return () => {};
	}
	const db = new DatabaseSync(newDbPath);
	const rows = db.prepare("select slug, comments_closed_after_days from _emdash_collections").all().filter((row) => Number(row.comments_closed_after_days) > 0);
	if (rows.length === 0) {
		db.close();
		return () => {};
	}
	const update = db.prepare("update _emdash_collections set comments_closed_after_days = ? where slug = ?");
	for (const row of rows) update.run(0, row.slug);
	db.close();
	report.warnings.push(`迁移期间临时打开评论窗口：${rows.map((row) => row.slug).join(", ")}`);
	return () => {
		const restore = new DatabaseSync(newDbPath);
		const updateBack = restore.prepare("update _emdash_collections set comments_closed_after_days = ? where slug = ?");
		for (const row of rows) updateBack.run(Number(row.comments_closed_after_days), row.slug);
		restore.close();
	};
}

const memberEmail = (identity) => {
	if (!identity) return null;
	const subject = String(identity.provider_subject ?? "");
	return { name: identity.nickname || "会员", email: `member-legacy-${subject}@import.local` };
};

// 先父后子：旧站 parent_id 指向旧评论
const commentIdMap = new Map();
const closeCommentWindows = dryRun ? () => {} : openCommentWindows();
try {
	for (const row of comments) {
	if (idMap.comments[row.id]) {
		report.comments.push(`跳过（已迁移）：评论 ${row.id} → ${idMap.comments[row.id]}`);
		commentIdMap.set(row.id, idMap.comments[row.id]);
		continue;
	}
	const target = commentTarget(row);
	if (!target.collection || !target.entry?.id) {
		report.warnings.push(`评论 ${row.id} 找不到目标（${row.target_type}#${row.target_id}），跳过`);
		continue;
	}
	const identity = row.member_id ? identityByMember.get(row.member_id) : null;
	const author = memberEmail(identity) ?? { name: row.author, email: `legacy-comment-${row.id}@import.local` };
	const parentNewId = row.parent_id ? commentIdMap.get(row.parent_id) : null;
	if (dryRun) {
		report.comments.push(`[dry-run] ${row.target_type}#${row.target_id} 「${row.author}」${row.status} parent=${parentNewId ?? "无"}`);
		commentIdMap.set(row.id, `dry-c-${row.id}`);
		continue;
	}
	// 匿名提交：带上管理员会话的话，宿主会把评论归给该 CMS 用户，作者名就变成了管理员
	const created = await fetch(`${site}/_emdash/api/comments/${target.collection}/${target.entry.id}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			authorName: author.name,
			authorEmail: author.email,
			body: row.content,
			...(parentNewId ? { parentId: parentNewId } : {}),
		}),
	});
	const createdText = await created.text();
	if (!created.ok) {
		report.failures.push(`评论 ${row.id} 创建失败：${created.status} ${createdText.slice(0, 160)}`);
		continue;
	}
	const createdJson = (() => {
		try {
			return JSON.parse(createdText);
		} catch {
			return null;
		}
	})();
	const newId = unwrap(createdJson)?.id;
	commentIdMap.set(row.id, newId);
	idMap.comments[row.id] = newId;
	const status = row.status === "published" ? "approved" : row.status === "hidden" ? "spam" : "pending";
	// 一律显式设置：公开接口有自己的审核策略（例如老访客自动通过），不能假设它给出 pending
	const updated = await api(`/_emdash/api/admin/comments/${newId}/status`, {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ status }),
	});
	if (!updated.ok) report.failures.push(`评论 ${row.id} 状态设置失败：${updated.status}`);
		report.comments.push(`${row.target_type}#${row.target_id} 「${row.author}」→ ${status}`);
	}
} finally {
	closeCommentWindows();
}


// ─── 友链（旧站是 settings 里的 friends.items） ────────────────────

/** 把旧站的友链数组转成 Portable Text：每行「名称 — 描述」，名称为链接 */
function friendsToPortableText(items) {
	const blocks = [];
	items.forEach((item, index) => {
		const name = String(item.name ?? "").trim();
		const url = String(item.url ?? "").trim();
		const desc = String(item.desc ?? "").trim();
		if (!name || !FRIEND_URL_PATTERN.test(url)) return;
		const markKey = `friends${index}`;
		const children = [
			{ _type: "span", _key: `f${index}s0`, text: name, marks: [markKey] },
		];
		if (desc) children.push({ _type: "span", _key: `f${index}s1`, text: ` — ${desc}`, marks: [] });
		blocks.push({
			_type: "block",
			_key: `fb${index}`,
			style: "normal",
			markDefs: [{ _key: markKey, _type: "link", href: url }],
			children,
		});
	});
	return blocks;
}

async function migrateFriendLinks() {
	const raw = settings.find((row) => row.key === "friends.items")?.value;
	if (!raw) return;
	let items = [];
	try {
		const parsed = JSON.parse(raw);
		items = Array.isArray(parsed) ? parsed : [];
	} catch {
		report.warnings.push("friends.items 不是合法 JSON，友链未迁移");
		return;
	}
	const blocks = friendsToPortableText(items);
	if (blocks.length === 0) {
		report.warnings.push("旧站没有有效友链，跳过");
		return;
	}
	if (dryRun) {
		report.entries.push(`[dry-run] pages/friends 友链 ${blocks.length} 条`);
		return;
	}
	const found = await api("/_emdash/api/content/pages?limit=50");
	const page = (unwrap(found.json)?.items ?? []).find((item) => item.slug === "friends");
	if (!page?.id) {
		report.warnings.push("新站找不到 friends 页面，友链未写入");
		return;
	}
	const updated = await api(`/_emdash/api/content/pages/${page.id}`, {
		// 内容更新只有 PUT（路由里没有 PATCH）
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ data: { content: blocks } }),
	});
	if (!updated.ok) {
		report.failures.push(`友链写入失败：${updated.status} ${updated.text.slice(0, 160)}`);
		return;
	}
	// PUT 写的是草稿修订，公开页面渲染已发布修订 —— 必须再发布一次才可见
	const published = await api(`/_emdash/api/content/pages/${page.id}/publish`, { method: "POST" });
	if (!published.ok) {
		report.failures.push(`友链发布失败：${published.status} ${published.text.slice(0, 160)}`);
		return;
	}
	report.entries.push(`pages/friends 友链 ${blocks.length} 条（已发布）`);
}

await migrateFriendLinks();
// ─── 会员、点赞、收藏（直接写插件存储） ───────────────────────────

const ACTIVITY_TYPE = { article: "posts", life: "life", project: "projects", comment: "comment" };

function pluginStorageWrites() {
	const rows = [];
	const now = new Date().toISOString();
	for (const member of members) {
		const identity = identityByMember.get(member.id);
		if (!identity) {
			report.warnings.push(`会员 ${member.id} 没有身份记录（登录方式无法迁移），跳过`);
			continue;
		}
		rows.push({
			collection: "members",
			id: `mem_${member.id}`,
			data: {
				displayName: member.display_name,
				avatarUrl: member.avatar_url ?? "",
				bio: member.bio ?? "",
				status: member.status,
				qqOpenid: identity.provider_subject,
				createdAt: iso(member.created_at) ?? now,
				updatedAt: iso(member.updated_at) ?? now,
			},
		});
		report.members.push(`会员 ${member.id} → mem_${member.id} (qq:${identity.provider_subject})`);
	}

	const memberById = new Map(members.map((row) => [row.id, row]));
	const addActivity = (kind, row) => {
		const member = memberById.get(row.member_id);
		const identity = member ? identityByMember.get(member.id) : null;
		if (!identity) return;
		const targetType = ACTIVITY_TYPE[row.target_type];
		if (!targetType) return;
		let targetId = String(row.target_id);
		if (targetType === "posts") targetId = idMap.articles[row.target_id]?.id ?? targetId;
		else if (targetType === "life") targetId = idMap.life[row.target_id]?.id ?? targetId;
		else if (targetType === "projects") targetId = idMap.projects[row.target_id]?.id ?? targetId;
		else if (targetType === "comment") targetId = idMap.comments[row.target_id] ?? targetId;
		rows.push({
			collection: "activity",
			id: `${kind}:${identity.provider_subject}:${targetType}:${targetId}`,
			data: {
				kind,
				memberOpenid: identity.provider_subject,
				targetType,
				targetId,
				createdAt: iso(row.created_at) ?? now,
			},
		});
		report.activity.push(`${kind} ${row.target_type}#${row.target_id} → ${targetType}#${targetId}`);
	};
	for (const row of likes) addActivity("like", row);
	for (const row of favorites) addActivity("favorite", row);
	return rows;
}

const storageRows = pluginStorageWrites();

if (!dryRun && storageRows.length > 0) {
	if (!newDbPath) {
		report.warnings.push("未提供 --new-db：会员与点赞收藏没有写入（其余已迁移）");
	} else {
		const db = new DatabaseSync(newDbPath);
		const put = db.prepare(
			"insert or replace into _plugin_storage (plugin_id, collection, id, data, created_at, updated_at, revision) values ('duanap-members', ?, ?, ?, ?, ?, '0')",
		);
		const now = new Date().toISOString();
		for (const row of storageRows) {
			put.run(row.collection, row.id, JSON.stringify(row.data), now, now);
		}
		db.close();
	}
}

// ─── 产出映射表与报告 ─────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });
const redirects = {};
for (const [oldId, entry] of Object.entries(idMap.articles)) {
	if (entry?.slug) redirects[`/article/${oldId}`] = `/posts/${entry.slug}`;
}
for (const [oldId, entry] of Object.entries(idMap.life)) {
	if (entry?.slug) {
		redirects[`/life/${oldId}`] = `/life/${entry.slug}`;
		redirects[`/life-detail/${oldId}`] = `/life/${entry.slug}`;
	}
}

// 站点静态读取这份映射（src/utils/legacy-redirects.ts），缺失时为空对象即可
writeFileSync(redirectsOut, `${JSON.stringify(redirects, null, "\t")}\n`, "utf8");
report.warnings.push(`旧地址映射已写入 ${redirectsOut}（${Object.keys(redirects).length} 条）`);

writeFileSync(
	resolve(outDir, "id-map.json"),
	`${JSON.stringify({ generatedAt: new Date().toISOString(), site, idMap, redirects }, null, "\t")}\n`,
	"utf8",
);
if (settings.length > 0) {
	report.warnings.push(`旧站 settings 未映射（新站设置项不同）：${settings.map((row) => row.key).join(", ")}`);
}

const summary = [
	`条目：${report.entries.length}`,
	`媒体：${report.media.length}`,
	`评论：${report.comments.length}`,
	`会员：${report.members.length}`,
	`互动：${report.activity.length}`,
	`警告：${report.warnings.length}`,
	`失败：${report.failures.length}`,
];
writeFileSync(
	resolve(outDir, "report.txt"),
	`${[
		`Phase 3 迁移${dryRun ? "（dry-run）" : ""} @ ${new Date().toISOString()}`,
		`旧库：${oldDbPath}`,
		`站点：${site}`,
		"",
		"== 条目 ==",
		...report.entries,
		"",
		"== 媒体 ==",
		...report.media,
		"",
		"== 评论 ==",
		...report.comments,
		"",
		"== 会员 ==",
		...report.members,
		"",
		"== 互动 ==",
		...report.activity,
		"",
		"== 警告 ==",
		...report.warnings,
		"",
		"== 失败 ==",
		...report.failures,
	].join("\n")}\n`,
	"utf8",
);
old.close();

console.log(`\n${summary.join(" | ")}`);
console.log(`映射表：${resolve(outDir, "id-map.json")}`);
console.log(`报告：${resolve(outDir, "report.txt")}`);
console.log(`旧地址映射：${redirectsOut}`);
if (report.failures.length > 0) process.exit(1);
