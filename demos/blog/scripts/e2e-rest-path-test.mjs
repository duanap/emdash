#!/usr/bin/env node
/**
 * 一次性端到端测试（本地 dev）：用 dev-bypass 会话 cookie 走通
 * 创建→发布→评论 的真实 REST 路径，然后清理测试数据。
 * 仅适用于本地开发环境（生产无 dev-bypass）。
 */
import { DatabaseSync } from "node:sqlite";
import { markdownToPortableText } from "emdash/client";

const base = "http://localhost:4321";
const db = new DatabaseSync(
	"C:/Users/18282/AppData/Local/Temp/mig-test/old-blog.sqlite",
	{ readOnly: true },
);

// 1. dev-bypass 换取会话 cookie
const bypass = await fetch(`${base}/_emdash/api/setup/dev-bypass`, {
	redirect: "manual",
});
const setCookie = bypass.headers.getSetCookie?.() ?? [];
const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
if (!cookie) {
	console.error("未获取到 dev cookie", bypass.status);
	process.exit(1);
}
console.log("cookie OK");

const headers = {
	Cookie: cookie,
	"X-EmDash-Request": "1",
	"Content-Type": "application/json",
};

// 1.5 解析 duanap 的 byline id（seed 的 id 只是引用键，库里是 ULID）
const bylinesRes = await fetch(`${base}/_emdash/api/admin/bylines`, { headers });
const bylinesJson = await bylinesRes.json();
const bylineId = bylinesJson.data?.items?.find((b) => b.slug === "duanap")?.id
	?? bylinesJson.data?.find((b) => b.slug === "duanap")?.id;
if (!bylineId) {
	console.error("找不到 duanap byline:", JSON.stringify(bylinesJson).slice(0, 300));
	process.exit(1);
}
console.log("bylineId:", bylineId);

// 2. 创建草稿（模拟迁移脚本 payload）
const row = db.prepare("SELECT * FROM articles WHERE id = 1").get();
const payload = {
	slug: `old-${row.id}-${row.slug}-e2e-${Date.now()}`,
	data: {
		title: `${row.title}（链路测试）`,
		excerpt: row.summary,
		content: markdownToPortableText(row.content),
		pinned: false,
	},
	taxonomies: { category: ["tech-notes"], tag: ["vue", "self-hosting"] },
	bylines: [{ bylineId }],
	publishedAt: new Date(Number(row.published_at)).toISOString(),
};
const created = await fetch(`${base}/_emdash/api/content/posts`, {
	method: "POST",
	headers,
	body: JSON.stringify(payload),
});
const createdJson = await created.json();
console.log("create:", created.status, JSON.stringify(createdJson).slice(0, 160));
if (!created.ok) process.exit(1);
const newId = createdJson.data?.item?.id;
console.log("newId:", newId);

// 3. 发布
const published = await fetch(
	`${base}/_emdash/api/content/posts/${newId}/publish`,
	{ method: "POST", headers, body: "{}" },
);
console.log("publish:", published.status, JSON.stringify(await published.json()).slice(0, 160));

// 4. 评论（API 字段：authorName/authorEmail/body）
const commented = await fetch(`${base}/_emdash/api/comments/posts/${newId}`, {
	method: "POST",
	headers,
	body: JSON.stringify({
		authorName: "测试访客",
		authorEmail: "old-1@migrated.duanap.cn",
		body: "链路测试评论",
	}),
});
console.log("comment:", commented.status, JSON.stringify(await commented.json()).slice(0, 160));

// 5. 前台可见性检查（发布后稍等缓存失效）
await new Promise((r) => setTimeout(r, 1500));
const page = await fetch(`${base}/posts/old-1-migration-test-with-code-e2e-${Date.now() > 0 ? payload.slug.match(/e2e-(\d+)/)[1] : ""}`);
console.log("front-end:", page.status);

// 6. 清理：软删除（回收站）后永久删除
const trash = await fetch(`${base}/_emdash/api/content/posts/${newId}`, {
	method: "DELETE",
	headers,
});
console.log("trash:", trash.status);
const purged = await fetch(
	`${base}/_emdash/api/content/posts/${newId}/permanent`,
	{ method: "DELETE", headers },
);
console.log("purge:", purged.status, JSON.stringify(await purged.json()).slice(0, 120));
