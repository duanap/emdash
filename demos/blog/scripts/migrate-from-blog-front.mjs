#!/usr/bin/env node
/**
 * migrate-from-blog-front.mjs — 旧站（blog-front, Vue3+Fastify+SQLite）
 * 内容一次性导入 EmDash 的迁移工具。
 *
 * 用法：
 *   node scripts/migrate-from-blog-front.mjs --db <旧库.sqlite> [options]
 *
 * 必填：
 *   --db <path>          旧站 SQLite 路径（服务器 server/data/blog.sqlite 的副本）
 *
 * 可选：
 *   --api <url>          EmDash 站点地址（默认 http://localhost:4321）
 *   --token <token>      Bearer token（或环境变量 EMDASH_TOKEN）。后台生成的 PAT，
 *                        需要 content:create / content:publish_any / media 权限
 *   --only <a,b,c>       只导入部分阶段：posts,life,projects,comments（默认全部）
 *   --limit <n>          每个集合最多导入 n 条（调试用）
 *   --dry-run            只转换与报告，不写 EmDash（不写映射文件）
 *   --old-uploads <dir>  旧站 server/uploads 目录（封面图入库用）
 *
 * 行为：
 *   1. 文章/生活/作品：Markdown 正文经 emdash 内置的 markdownToPortableText
 *      转为 Portable Text；分类/标签映射到 seed 中的 term slug；
 *      走 REST 创建草稿再发布（保留 publishedAt/createdAt 需要 publish 权限）。
 *   2. 封面图：--old-uploads 提供时，把 /uploads/** 文件通过
 *      POST /_emdash/api/media 上传，并把返回的媒体引用写入 featured_image。
 *   3. 评论：仅导入 published 状态；targetId 通过新旧 ID 映射转换；
 *      targetType=message（留言墙）暂跳过（Phase 5 决策项）。
 *   4. 每次真实运行都会把 `old_id -> 新 ULID` 映射写入
 *      .migration/mapping.json —— 会员点赞/收藏数据将来靠它对账，切勿丢失。
 *
 * 幂等性：以旧 id 为素材生成 slug（`old-<id>-<slug>`），冲突时 REST 返回
 *   409 即视为已导入并跳过，可安全重跑。
 */

import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { markdownToPortableText } from "emdash/client";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const MIGRATION_DIR = join(scriptDir, "..", ".migration");

// --- CLI -----------------------------------------------------------------

const args = process.argv.slice(2);
function arg(name) {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
}
const hasFlag = (name) => args.includes(`--${name}`);

const dbPath = arg("db");
const apiBase = (arg("api") ?? "http://localhost:4321").replace(/\/$/, "");
const token = arg("token") ?? process.env.EMDASH_TOKEN;
const only = (arg("only") ?? "posts,life,projects,comments").split(",");
const limit = arg("limit") ? Number(arg("limit")) : Infinity;
const dryRun = hasFlag("dry-run");
const oldUploads = arg("old-uploads") ? resolve(arg("old-uploads")) : undefined;

if (!dbPath || !existsSync(dbPath)) {
	console.error("错误：请通过 --db 提供旧站 SQLite 路径");
	process.exit(1);
}
if (!dryRun && !token) {
	console.error("错误：非 dry-run 需要 --token 或环境变量 EMDASH_TOKEN");
	process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });

// --- 旧分类 -> seed term slug --------------------------------------------

const CATEGORY_MAP = {
	技术笔记: "tech-notes",
	作品记录: "project-log",
	部署记录: "deployment",
	资源收藏: "resources",
	设计复盘: "design-review",
};
const LIFE_CATEGORY_MAP = {
	日常记录: "daily",
	旅行见闻: "travel",
	摄影作品: "photo",
	生活随笔: "essay",
	阅读笔记: "reading-notes",
};
const PROJECT_TYPE_MAP = {
	开源项目: "open-source",
	个人项目: "personal",
	小工具: "tools",
	工具: "tools",
};
function mapTerm(map, label, warnings, context) {
	if (!label) return null;
	const slug = map[label];
	if (!slug) {
		warnings.push(`未映射分类「${label}」（${context}）`);
		return null;
	}
	return slug;
}
function parseTags(json) {
	try {
		const arr = JSON.parse(json ?? "[]");
		return Array.isArray(arr) ? arr.filter((t) => typeof t === "string") : [];
	} catch {
		return [];
	}
}

// 旧站中文标签 -> seed 已有 term slug；未命中的运行时自动补建
const KNOWN_TAG_MAP = {
	摄影: "photography",
	读书: "reading",
	数码: "gears",
	自托管: "self-hosting",
	Astro: "astro",
	EmDash: "emdash",
	Vue: "vue",
	TypeScript: "typescript",
};
/** tag slug：已知映射优先，否则小写连字符化（中文原样保留） */
function tagSlug(label) {
	return KNOWN_TAG_MAP[label] ?? String(label).trim().toLowerCase().replace(/\s+/g, "-");
}

const warnings = [];

// --- REST helper ----------------------------------------------------------

async function api(method, path, body, isForm = false) {
	const headers = { "X-EmDash-Request": "1" };
	if (token) headers.Authorization = `Bearer ${token}`;
	if (body && !isForm) headers["Content-Type"] = "application/json";
	const res = await fetch(`${apiBase}${path}`, {
		method,
		headers,
		body: isForm ? body : body ? JSON.stringify(body) : undefined,
	});
	const json = await res.json().catch(() => ({}));
	return { status: res.status, ok: res.ok, json };
}

/**
 * seed 里 byline 的 id 只是引用键；数据库存的是生成 ULID。
 * 通过 slug 在运行时解析真实 id（REST 创建条目时必填）。
 */
let cachedBylineId;
async function resolveBylineId() {
	if (cachedBylineId) return cachedBylineId;
	if (dryRun) return "byline-duanap"; // dry-run 不触网，仅占位
	const res = await api("GET", "/_emdash/api/admin/bylines");
	const items = res.json?.data?.items ?? res.json?.data ?? [];
	const found = Array.isArray(items)
		? items.find((b) => b.slug === "duanap")
		: null;
	if (!found) throw new Error("找不到 slug 为 duanap 的 byline（先应用 seed）");
	cachedBylineId = found.id;
	return cachedBylineId;
}

// --- 标签：加载已有 term，缺失的自动创建 -----------------------------------

const existingTagSlugs = new Set();
let tagsLoaded = false;
async function loadTags() {
	if (tagsLoaded || dryRun) return;
	const res = await api("GET", "/_emdash/api/taxonomies/tag/terms");
	const items = res.json?.data?.items ?? res.json?.data ?? [];
	if (Array.isArray(items)) {
		for (const t of items) existingTagSlugs.add(t.slug);
	}
	tagsLoaded = true;
}

async function ensureTag(label) {
	const slug = tagSlug(label);
	if (!slug) return null;
	if (existingTagSlugs.has(slug)) return slug;
	if (dryRun) return slug;
	const res = await api("POST", "/_emdash/api/taxonomies/tag/terms", {
		slug,
		label: String(label),
	});
	if (res.ok) {
		existingTagSlugs.add(slug);
	} else if (res.status !== 409) {
		warnings.push(`标签「${label}」创建失败 ${res.status}，跳过`);
		return null;
	}
	existingTagSlugs.add(slug);
	return slug;
}

async function resolveTags(labels) {
	await loadTags();
	const out = [];
	for (const label of labels) {
		const slug = await ensureTag(label);
		if (slug) out.push(slug);
	}
	return out;
}

async function uploadMedia(filePath, alt) {
	// 文档化端点：POST /_emdash/api/media（multipart，字段名 file）
	const form = new FormData();
	const bytes = readFileSync(filePath);
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "webp";
	form.append("file", new Blob([bytes], { type: `image/${ext === "jpg" ? "jpeg" : ext}` }), filePath.split(/[\\/]/).pop());
	if (alt) form.append("alt", alt);
	const res = await api("POST", "/_emdash/api/media", form, true);
	if (!res.ok) {
		throw new Error(`媒体上传失败 ${res.status}: ${JSON.stringify(res.json)}`);
	}
	const media = res.json?.data ?? res.json;
	// image 字段存 {id, src?, alt} 形态的引用；渲染器以 id 解析
	return { id: media.id ?? media.mediaId, alt };
}

async function createEntry(collection, payload) {
	const created = await api(
		"POST",
		`/_emdash/api/content/${collection}`,
		payload,
	);
	if (created.status === 409) return { skipped: true };
	if (!created.ok) {
		throw new Error(
			`创建 ${collection} 失败 ${created.status}: ${JSON.stringify(created.json)}`,
		);
	}
	const entry = created.json?.data?.item;
	const id = entry?.id;
	if (!id) throw new Error(`创建成功但未返回 id: ${JSON.stringify(created.json)}`);
	// 创建接口只接受 draft；发布走独立端点
	if (payload.__publish) {
		const published = await api(
			"POST",
			`/_emdash/api/content/${collection}/${id}/publish`,
			{},
		);
		if (!published.ok) {
			throw new Error(
				`发布 ${collection}/${id} 失败 ${published.status}: ${JSON.stringify(published.json)}`,
			);
		}
	}
	return { id };
}

// --- 转换器 ---------------------------------------------------------------

async function articleToPost(row) {
	return {
		slug: `old-${row.id}-${row.slug}`,
		data: {
			title: row.title,
			excerpt: row.summary || undefined,
			content: markdownToPortableText(row.content ?? ""),
			pinned: !!row.pinned,
		},
		bylines: [{ bylineId: await resolveBylineId() }],
		publishedAt: row.publishedAt ?? undefined,
		createdAt: row.createdAt ?? undefined,
		status: row.status,
		taxonomies: {
			category: [mapTerm(CATEGORY_MAP, row.category, warnings, `文章 ${row.id}`)].filter(Boolean),
			tag: await resolveTags(parseTags(row.tags)),
		},
	};
}

async function lifeToEntry(row) {
	return {
		slug: `old-${row.id}-${row.id}`, // 旧站 URL 是 /life/<id>，slug 用数字 id 保链接
		data: {
			title: row.title,
			excerpt: row.summary || undefined,
			content: markdownToPortableText(row.content ?? ""),
			record_date: row.recordDate ? new Date(`${row.recordDate}T09:00:00Z`).toISOString() : undefined,
			pinned: !!row.pinned,
		},
		publishedAt: row.publishedAt ?? undefined,
		createdAt: row.createdAt ?? undefined,
		status: row.status,
		bylines: [{ bylineId: await resolveBylineId() }],
		taxonomies: {
			life_category: [mapTerm(LIFE_CATEGORY_MAP, row.category, warnings, `生活 ${row.id}`)].filter(Boolean),
			tag: await resolveTags(parseTags(row.tags)),
		},
	};
}

async function projectToEntry(row) {
	let screenshots = [];
	try {
		screenshots = JSON.parse(row.screenshots ?? "[]");
	} catch {
		/* ignore */
	}
	return {
		slug: `old-${row.id}-${row.id}`,
		data: {
			title: row.name,
			summary: row.description || undefined,
			content: markdownToPortableText(row.description ?? ""),
			tech: parseTags(row.tech),
			preview_url: row.preview || undefined,
			repo_url: row.showCode ? row.code || undefined : undefined,
			featured: !!row.featured,
			stars: row.stars ?? undefined,
			forks: row.forks ?? undefined,
			show_code: !!row.showCode,
			sort_order: row.sortOrder ?? undefined,
			screenshots: [],
		},
		publishedAt: row.publishedAt ?? undefined,
		createdAt: row.createdAt ?? undefined,
		status: row.status,
		bylines: [{ bylineId: await resolveBylineId() }],
		taxonomies: {
			project_type: [mapTerm(PROJECT_TYPE_MAP, row.type, warnings, `作品 ${row.id}`)].filter(Boolean),
		},
	};
}

// 评论插入需要 { authorName, authorEmail, body, parentId }；旧评论无 email。
async function importComments(mapping) {
	const rows = db
		.prepare(
			"SELECT * FROM comments WHERE status = 'published' AND target_type != 'message' ORDER BY id",
		)
		.all();
	console.log(`评论（published，非留言墙）：${rows.length} 条`);
	const collectionOf = { article: "posts", life: "life", project: "projects" };
	let done = 0;
	let skipped = 0;
	for (const row of rows.slice(0, limit)) {
		// 旧库列名是 snake_case
		const targetType = row.target_type;
		const targetId = row.target_id;
		const collection = collectionOf[targetType];
		const newId = mapping[`${collection}_id`]?.[String(targetId)];
		if (!collection || !newId) {
			skipped++;
			warnings.push(`评论 ${row.id}：目标 ${targetType}/${targetId} 未导入，跳过`);
			continue;
		}
		if (dryRun) {
			done++;
			continue;
		}
		const body = {
			authorName: row.author || "访客",
			// API 必填合法 email；旧评论没有邮箱，用可辨识的占位域
			authorEmail: `old-${row.id}@migrated.duanap.cn`,
			body: row.content,
		};
		if (row.parent_id) {
			const parentNew = mapping.comment_id?.[String(row.parent_id)];
			if (parentNew) body.parentId = parentNew;
		}
		const res = await api(
			"POST",
			`/_emdash/api/comments/${collection}/${newId}`,
			body,
		);
		if (!res.ok) {
			warnings.push(`评论 ${row.id} 导入失败 ${res.status}，跳过`);
			skipped++;
			continue;
		}
		const newCommentId = res.json?.data?.id;
		if (newCommentId) {
			mapping.comment_id = mapping.comment_id ?? {};
			mapping.comment_id[String(row.id)] = newCommentId;
		}
		done++;
	}
	console.log(`  导入 ${done}，跳过 ${skipped}`);
}

// --- 主流程 ---------------------------------------------------------------

const STAGES = {
	async posts(mapping) {
		const rows = db
			.prepare("SELECT * FROM articles ORDER BY id")
			.all()
			.map((r) => ({
				...r,
				publishedAt: r.published_at ? Number(r.published_at) : null,
				createdAt: r.created_at ? Number(r.created_at) : null,
			}));
		console.log(`文章：${rows.length} 条`);
		for (const row of rows.slice(0, limit)) {
			const payload = await articleToPost(row);
			if (dryRun) {
				const blocks = payload.data.content.length;
				console.log(`  [dry] ${row.id} ${row.title}（${blocks} 个 PT 块）`);
				continue;
			}
			// 封面图
			if (row.cover_image && oldUploads) {
				const local = join(oldUploads, row.cover_image.replace(/^\/uploads\//, ""));
				if (existsSync(local)) {
					try {
						payload.data.featured_image = await uploadMedia(local, row.title);
					} catch (e) {
						warnings.push(`文章 ${row.id} 封面上传失败：${e.message}`);
					}
				} else {
					warnings.push(`文章 ${row.id} 封面文件不存在：${row.cover_image}`);
				}
			}
			payload.__publish = row.status === "published";
			const { id, skipped } = await createEntry("posts", payload);
			if (skipped) {
				console.log(`  = ${row.id} 已存在，跳过`);
			} else {
				mapping.posts_id[String(row.id)] = id;
				console.log(`  + ${row.id} -> ${id}`);
			}
		}
	},
	async life(mapping) {
		const rows = db
			.prepare("SELECT * FROM life_records ORDER BY id")
			.all()
			.map((r) => ({
				...r,
				publishedAt: r.published_at ? Number(r.published_at) : null,
				createdAt: r.created_at ? Number(r.created_at) : null,
			}));
		console.log(`生活记录：${rows.length} 条`);
		for (const row of rows.slice(0, limit)) {
			const payload = await lifeToEntry(row);
			if (dryRun) {
				console.log(`  [dry] ${row.id} ${row.title}`);
				continue;
			}
			payload.__publish = row.status === "published";
			const { id, skipped } = await createEntry("life", payload);
			if (skipped) console.log(`  = ${row.id} 已存在，跳过`);
			else {
				mapping.life_id[String(row.id)] = id;
				console.log(`  + ${row.id} -> ${id}`);
			}
		}
	},
	async projects(mapping) {
		const rows = db
			.prepare("SELECT * FROM projects ORDER BY id")
			.all()
			.map((r) => ({
				...r,
				publishedAt: r.published_at ? Number(r.published_at) : null,
				createdAt: r.created_at ? Number(r.created_at) : null,
			}));
		console.log(`作品：${rows.length} 条`);
		for (const row of rows.slice(0, limit)) {
			const payload = await projectToEntry(row);
			if (dryRun) {
				console.log(`  [dry] ${row.id} ${row.name}`);
				continue;
			}
			payload.__publish = row.status === "published";
			const { id, skipped } = await createEntry("projects", payload);
			if (skipped) console.log(`  = ${row.id} 已存在，跳过`);
			else {
				mapping.projects_id[String(row.id)] = id;
				console.log(`  + ${row.id} -> ${id}`);
			}
		}
	},
	async comments(mapping) {
		await importComments(mapping);
	},
};

const mapping = {
	// posts_id: { 旧id: 新ULID }, life_id, projects_id, comment_id
	posts_id: {},
	life_id: {},
	projects_id: {},
	comment_id: {},
};
const MAPPING_PATH = join(MIGRATION_DIR, "mapping.json");

// 评论阶段依赖内容 ID 映射：先恢复历史映射（幂等重跑的关键）
if (!dryRun && existsSync(MAPPING_PATH)) {
	try {
		const prev = JSON.parse(readFileSync(MAPPING_PATH, "utf8"));
		for (const key of ["posts_id", "life_id", "projects_id", "comment_id"]) {
			mapping[key] = { ...prev[key] };
		}
		console.log("已加载历史映射文件");
	} catch {
		warnings.push("历史 mapping.json 解析失败，忽略");
	}
}

console.log(`== 旧站迁移 ${dryRun ? "（dry-run）" : `-> ${apiBase}`} ==`);
for (const stage of only) {
	const fn = STAGES[stage.trim()];
	if (fn) await fn(mapping);
}

if (!dryRun) {
	mkdirSync(MIGRATION_DIR, { recursive: true });
	writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, "\t"));
	console.log(`映射已写入 ${MAPPING_PATH}`);
}

if (warnings.length) {
	console.log(`\n⚠ ${warnings.length} 条警告：`);
	for (const w of warnings) console.log(`  - ${w}`);
}
console.log(dryRun ? "\ndry-run 完成，未写入任何数据" : "\n迁移完成");
