#!/usr/bin/env node
/**
 * 造一个「旧站」SQLite 夹具（Phase 3 迁移用）。
 *
 * 旧站的数据库与 uploads 不在本仓库里，所以迁移脚本必须能对着一个**结构完全一致**的
 * 夹具跑起来。表结构照抄旧站 `server/src/db/schema.ts`（Drizzle），字段类型与默认值保持一致：
 * 时间戳是毫秒整数，tags/tech/screenshots 是 JSON 字符串。
 *
 * 用法：
 *   node scripts/make-old-site-fixture.mjs [--out <目录>]
 * 产出 <目录>/blog.sqlite 与 <目录>/uploads/*.png
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

function readArg(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

const outDir = resolve(readArg("--out") ?? "./.migration-fixture/old-site");
const dbPath = resolve(outDir, "blog.sqlite");
const uploadsDir = resolve(outDir, "uploads");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(uploadsDir, { recursive: true });

/** 1×1 PNG，够用来验证"图片真的被搬过去了" */
const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);
writeFileSync(resolve(uploadsDir, "cover-astro.png"), PNG);
writeFileSync(resolve(uploadsDir, "life-garden.png"), PNG);

const db = new DatabaseSync(dbPath);
db.exec(`
create table admin_users (
  id integer primary key,
  username text not null unique,
  password_hash text not null,
  created_at integer not null,
  updated_at integer not null
);
create table sessions (
  id text primary key,
  user_id integer not null references admin_users(id),
  expires_at integer not null,
  created_at integer not null
);
create table members (
  id integer primary key,
  display_name text not null,
  avatar_url text not null default '',
  bio text not null default '',
  status text not null default 'active',
  created_at integer not null,
  updated_at integer not null
);
create table member_identities (
  id integer primary key,
  member_id integer not null references members(id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  nickname text not null default '',
  avatar_url text not null default '',
  created_at integer not null,
  updated_at integer not null
);
create unique index member_identities_provider_subject_unique on member_identities(provider, provider_subject);
create unique index member_identities_member_unique on member_identities(member_id);
create table member_sessions (
  id text primary key,
  member_id integer not null references members(id) on delete cascade,
  expires_at integer not null,
  created_at integer not null
);
create table oauth_states (
  id text primary key,
  intent text not null,
  member_id integer references members(id) on delete cascade,
  return_to text not null,
  expires_at integer not null,
  created_at integer not null
);
create table member_likes (
  id integer primary key,
  member_id integer not null references members(id) on delete cascade,
  target_type text not null,
  target_id integer not null,
  created_at integer not null
);
create unique index member_likes_member_target_unique on member_likes(member_id, target_type, target_id);
create table member_favorites (
  id integer primary key,
  member_id integer not null references members(id) on delete cascade,
  target_type text not null,
  target_id integer not null,
  created_at integer not null
);
create unique index member_favorites_member_target_unique on member_favorites(member_id, target_type, target_id);
create table articles (
  id integer primary key,
  title text not null,
  slug text not null unique,
  summary text not null,
  content text not null,
  cover_image text,
  status text not null,
  category text not null,
  tags text not null default '[]',
  pinned integer not null default 0,
  published_at integer,
  created_at integer not null,
  updated_at integer not null
);
create table life_records (
  id integer primary key,
  title text not null,
  summary text not null,
  content text not null,
  cover_image text,
  record_date text not null,
  status text not null,
  category text not null,
  tags text not null default '[]',
  views integer not null default 0,
  comments integer not null default 0,
  allow_comment integer not null default 1,
  pinned integer not null default 0,
  published_at integer,
  created_at integer not null,
  updated_at integer not null
);
create table projects (
  id integer primary key,
  name text not null,
  description text not null,
  home_image text,
  cover_image text,
  type text not null,
  tech text not null default '[]',
  screenshots text not null default '[]',
  stars integer not null default 0,
  forks integer not null default 0,
  featured integer not null default 0,
  preview text not null default '',
  code text not null default '',
  show_code integer not null default 1,
  sort_order integer not null default 0,
  status text not null,
  published_at integer,
  created_at integer not null,
  updated_at integer not null
);
create table comments (
  id integer primary key,
  target_type text not null,
  target_id integer not null,
  parent_id integer,
  member_id integer references members(id) on delete set null,
  author text not null,
  initials text not null,
  time_label text not null,
  content text not null,
  likes integer not null default 0,
  is_author integer not null default 0,
  status text not null,
  created_at integer not null,
  updated_at integer not null
);
create table content_id_tombstones (
  target_type text not null,
  target_id integer not null,
  primary key (target_type, target_id)
);
create table settings (
  key text primary key,
  value text not null,
  updated_at integer not null
);
`);

const at = (iso) => Date.parse(iso);

// ─── 文章 ─────────────────────────────────────────────────────────

const articleContent = `# 迁移测试文章

这是一篇用来验证 **Markdown → Portable Text** 的文章，包含 *斜体*、\`行内代码\`、~~删除线~~ 和 [外链](https://example.com/docs "文档")。

## 二级标题

- 列表第一项
- 列表第二项
  - 嵌套项
    - 更深一层
- 列表第三项

1. 有序第一步
2. 有序第二步
   1) 有序嵌套

> 引用第一行
> 引用第二行

\`\`\`ts title=example.ts
const answer: number = 42;
console.log(answer);
\`\`\`

---

![封面图](/uploads/cover-astro.png "文章封面")

结尾段落，含转义星号 \\* 与裸链接文本。`;

const db_insert_article = db.prepare(
	`insert into articles (id, title, slug, summary, content, cover_image, status, category, tags, pinned, published_at, created_at, updated_at)
	 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
db_insert_article.run(
	1,
	"迁移测试文章",
	"migration-test-article",
	"验证 Markdown 转换的文章",
	articleContent,
	"/uploads/cover-astro.png",
	"published",
	"技术",
	JSON.stringify(["Astro", "迁移"]),
	1,
	at("2026-03-01T08:00:00Z"),
	at("2026-02-28T08:00:00Z"),
	at("2026-03-01T08:00:00Z"),
);
db_insert_article.run(
	2,
	"草稿文章",
	"draft-only",
	"还在写",
	"## 未完成的草稿\n\n正文待补。",
	null,
	"draft",
	"随笔",
	JSON.stringify(["草稿"]),
	0,
	null,
	at("2026-03-02T08:00:00Z"),
	at("2026-03-02T08:00:00Z"),
);
db_insert_article.run(
	3,
	"没有封面的短文",
	"short-post",
	"短文",
	"转发一下。",
	null,
	"published",
	"随笔",
	"[]",
	0,
	at("2026-03-03T08:00:00Z"),
	at("2026-03-03T08:00:00Z"),
	at("2026-03-03T08:00:00Z"),
);

// ─── 生活记录 ─────────────────────────────────────────────────────

db.prepare(
	`insert into life_records (id, title, summary, content, cover_image, record_date, status, category, tags, views, comments, allow_comment, pinned, published_at, created_at, updated_at)
	 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
).run(
	1,
	"周末逛植物园",
	"天气不错",
	"今天去了植物园，拍了几张照片。\n\n![植物园](/uploads/life-garden.png)\n\n下次早点去。",
	"/uploads/life-garden.png",
	"2026-03-08",
	"published",
	"生活",
	JSON.stringify(["周末"]),
	12,
	1,
	1,
	0,
	at("2026-03-08T10:00:00Z"),
	at("2026-03-08T10:00:00Z"),
	at("2026-03-08T10:00:00Z"),
);
db.prepare(
	`insert into life_records (id, title, summary, content, cover_image, record_date, status, category, tags, views, comments, allow_comment, pinned, published_at, created_at, updated_at)
	 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
).run(
	2,
	"未发布的记录",
	"草稿",
	"草稿内容",
	null,
	"2026-03-09",
	"draft",
	"生活",
	"[]",
	0,
	0,
	1,
	0,
	null,
	at("2026-03-09T10:00:00Z"),
	at("2026-03-09T10:00:00Z"),
);

// ─── 作品 ─────────────────────────────────────────────────────────

db.prepare(
	`insert into projects (id, name, description, home_image, cover_image, type, tech, screenshots, stars, forks, featured, preview, code, show_code, sort_order, status, published_at, created_at, updated_at)
	 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
).run(
	1,
	"迁移测试作品",
	"用来验证作品迁移",
	"/uploads/cover-astro.png",
	"/uploads/cover-astro.png",
	"网站",
	JSON.stringify(["Astro", "SQLite"]),
	JSON.stringify(["/uploads/cover-astro.png", "/uploads/life-garden.png"]),
	3,
	1,
	1,
	"https://example.com/preview",
	"https://example.com/code",
	1,
	1,
	"published",
	at("2026-03-05T08:00:00Z"),
	at("2026-03-04T08:00:00Z"),
	at("2026-03-05T08:00:00Z"),
);
db.prepare(
	`insert into projects (id, name, description, home_image, cover_image, type, tech, screenshots, stars, forks, featured, preview, code, show_code, sort_order, status, published_at, created_at, updated_at)
	 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
).run(
	2,
	"草稿作品",
	"还没做完",
	null,
	null,
	"工具",
	"[]",
	"[]",
	0,
	0,
	0,
	"",
	"",
	1,
	2,
	"draft",
	null,
	at("2026-03-06T08:00:00Z"),
	at("2026-03-06T08:00:00Z"),
);

// ─── 会员与互动 ───────────────────────────────────────────────────

const insertMember = db.prepare(
	"insert into members (id, display_name, avatar_url, bio, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
);
insertMember.run(1, "老会员甲", "https://thirdqq.qlogo.cn/a.png", "旧站就注册了", "active", at("2025-06-01T08:00:00Z"), at("2026-01-01T08:00:00Z"));
insertMember.run(2, "老会员乙", "", "", "disabled", at("2025-07-01T08:00:00Z"), at("2026-01-02T08:00:00Z"));
db.prepare(
	"insert into member_identities (id, member_id, provider, provider_subject, nickname, avatar_url, created_at, updated_at) values (?, ?, 'qq', ?, ?, ?, ?, ?)",
).run(1, 1, "QQ-OPENID-OLD-1", "老会员甲", "https://thirdqq.qlogo.cn/a.png", at("2025-06-01T08:00:00Z"), at("2026-01-01T08:00:00Z"));
db.prepare(
	"insert into member_identities (id, member_id, provider, provider_subject, nickname, avatar_url, created_at, updated_at) values (?, ?, 'qq', ?, ?, ?, ?, ?)",
).run(2, 2, "QQ-OPENID-OLD-2", "老会员乙", "", at("2025-07-01T08:00:00Z"), at("2026-01-02T08:00:00Z"));

const insertLike = db.prepare(
	"insert into member_likes (id, member_id, target_type, target_id, created_at) values (?, ?, ?, ?, ?)",
);
insertLike.run(1, 1, "article", 1, at("2026-03-01T09:00:00Z"));
insertLike.run(2, 1, "life", 1, at("2026-03-08T11:00:00Z"));
insertLike.run(3, 1, "comment", 1, at("2026-03-01T09:30:00Z"));
const insertFavorite = db.prepare(
	"insert into member_favorites (id, member_id, target_type, target_id, created_at) values (?, ?, ?, ?, ?)",
);
insertFavorite.run(1, 1, "article", 1, at("2026-03-01T09:05:00Z"));
insertFavorite.run(2, 2, "project", 1, at("2026-03-05T09:00:00Z"));

// ─── 评论（含嵌套、隐藏、留言墙） ─────────────────────────────────

const insertComment = db.prepare(
	`insert into comments (id, target_type, target_id, parent_id, member_id, author, initials, time_label, content, likes, is_author, status, created_at, updated_at)
	 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
insertComment.run(1, "article", 1, null, 1, "老会员甲", "老", "2026-03-01", "写得不错，收藏了。", 2, 0, "published", at("2026-03-01T12:00:00Z"), at("2026-03-01T12:00:00Z"));
insertComment.run(2, "article", 1, 1, null, "路人", "路", "2026-03-01", "同感。", 0, 0, "published", at("2026-03-01T13:00:00Z"), at("2026-03-01T13:00:00Z"));
insertComment.run(3, "article", 1, null, null, "待审核的人", "待", "2026-03-02", "这条还在审核。", 0, 0, "pending", at("2026-03-02T12:00:00Z"), at("2026-03-02T12:00:00Z"));
insertComment.run(4, "article", 1, null, null, "被隐藏的人", "隐", "2026-03-02", "这条被隐藏了。", 0, 0, "hidden", at("2026-03-02T13:00:00Z"), at("2026-03-02T13:00:00Z"));
insertComment.run(5, "message", 0, null, 1, "老会员甲", "老", "2026-03-03", "留言墙上的第一条。", 1, 0, "published", at("2026-03-03T12:00:00Z"), at("2026-03-03T12:00:00Z"));
insertComment.run(6, "life", 1, null, null, "路人", "路", "2026-03-08", "照片拍得好。", 0, 0, "published", at("2026-03-08T12:00:00Z"), at("2026-03-08T12:00:00Z"));

// ─── 其它 ─────────────────────────────────────────────────────────

db.prepare("insert into settings (key, value, updated_at) values (?, ?, ?)").run("site.title", "duanap的小破站", at("2026-01-01T00:00:00Z"));
db.prepare("insert into settings (key, value, updated_at) values (?, ?, ?)").run("comment.enabled", "true", at("2026-01-01T00:00:00Z"));
db.prepare("insert into settings (key, value, updated_at) values (?, ?, ?)").run(
	"friends.items",
	JSON.stringify([
		{ name: "示例小站", url: "https://example.com", desc: "一个示例友链", avatar: "" },
		{ name: "另一个小站", url: "https://example.org", desc: "", avatar: "" },
		{ name: "坏数据", url: "not-a-url", desc: "应被过滤", avatar: "" },
	]),
	at("2026-01-01T00:00:00Z"),
);
db.prepare("insert into content_id_tombstones (target_type, target_id) values (?, ?)").run("article", 99);
db.prepare("insert into admin_users (id, username, password_hash, created_at, updated_at) values (?, ?, ?, ?, ?)").run(1, "duanap", "scrypt$placeholder", at("2025-01-01T00:00:00Z"), at("2025-01-01T00:00:00Z"));

const counts = {};
for (const table of [
	"articles",
	"life_records",
	"projects",
	"comments",
	"members",
	"member_identities",
	"member_likes",
	"member_favorites",
	"settings",
	"content_id_tombstones",
]) {
	counts[table] = db.prepare(`select count(*) as n from ${table}`).get().n;
}
db.close();

console.log(`旧站夹具已生成：${dbPath}`);
console.log(`  上传目录：${uploadsDir}（2 个 PNG）`);
for (const [table, count] of Object.entries(counts)) console.log(`  ${table}: ${count} 行`);
