#!/usr/bin/env node
/**
 * 生成一个结构等同旧站 blog-front 的合成 SQLite，用于在拿不到真实
 * 数据库时测试 migrate-from-blog-front.mjs 的转换与映射逻辑。
 *
 *   node scripts/test-fixture-old-blog.mjs <输出路径.sqlite>
 */
import { DatabaseSync } from "node:sqlite";

const out = process.argv[2];
if (!out) {
	console.error("用法: node scripts/test-fixture-old-blog.mjs <out.sqlite>");
	process.exit(1);
}

const db = new DatabaseSync(out);
db.exec(`
CREATE TABLE articles (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL, content TEXT NOT NULL, cover_image TEXT,
  status TEXT NOT NULL, category TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0, published_at INTEGER, created_at INTEGER, updated_at INTEGER
);
CREATE TABLE life_records (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL,
  content TEXT NOT NULL, cover_image TEXT, record_date TEXT NOT NULL,
  status TEXT NOT NULL, category TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
  views INTEGER NOT NULL DEFAULT 0, comments INTEGER NOT NULL DEFAULT 0,
  allow_comment INTEGER NOT NULL DEFAULT 1, pinned INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER, created_at INTEGER, updated_at INTEGER
);
CREATE TABLE projects (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
  home_image TEXT, cover_image TEXT, type TEXT NOT NULL, tech TEXT NOT NULL DEFAULT '[]',
  screenshots TEXT NOT NULL DEFAULT '[]', stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0,
  preview TEXT NOT NULL DEFAULT '', code TEXT NOT NULL DEFAULT '',
  show_code INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, published_at INTEGER, created_at INTEGER, updated_at INTEGER
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY, target_type TEXT NOT NULL, target_id INTEGER NOT NULL,
  parent_id INTEGER, member_id INTEGER, author TEXT NOT NULL, initials TEXT NOT NULL,
  time_label TEXT NOT NULL, content TEXT NOT NULL, likes INTEGER NOT NULL DEFAULT 0,
  is_author INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
  created_at INTEGER, updated_at INTEGER
);
`);

const now = Date.now();
const day = 86_400_000;
const insArticle = db.prepare(
	"INSERT INTO articles (id,title,slug,summary,content,cover_image,status,category,tags,pinned,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
);
insArticle.run(
	1,
	"迁移测试文章（Markdown 含代码块）",
	"migration-test-with-code",
	"验证 Markdown → Portable Text 转换。",
	[
		"## 小节标题",
		"",
		"正文段落，包含 **加粗**、_斜体_、`行内代码` 和 [链接](https://example.com)。",
		"",
		"```ts",
		"const answer: number = 42;",
		"console.log(answer);",
		"```",
		"",
		"- 列表项 A",
		"- 列表项 B",
	].join("\n"),
	null,
	"published",
	"技术笔记",
	JSON.stringify(["Vue", "自托管"]),
	0,
	now - 3 * day,
	now - 3 * day,
	now,
);
insArticle.run(
	2,
	"未映射分类的草稿",
	"draft-unknown-category",
	"分类不在映射表内，应产生警告。",
	"草稿正文。",
	null,
	"draft",
	"不存在的分类",
	"[]",
	1,
	null,
	now - day,
	now,
);

db.prepare(
	"INSERT INTO life_records (id,title,summary,content,record_date,status,category,tags,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
).run(
	7,
	"测试生活记录",
	"一条测试。",
	"今天的记录正文。",
	"2026-08-15",
	"published",
	"旅行见闻",
	"[]",
	now - 10 * day,
	now - 10 * day,
	now,
);

db.prepare(
	"INSERT INTO projects (id,name,description,type,tech,featured,code,show_code,sort_order,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
).run(
	3,
	"测试项目",
	"一个**测试**项目描述。",
	"开源项目",
	JSON.stringify(["TypeScript", "Node.js"]),
	1,
	"https://github.com/duanap/blog-front",
	1,
	1,
	"published",
	now - 30 * day,
	now - 30 * day,
	now,
);

const insComment = db.prepare(
	"INSERT INTO comments (id,target_type,target_id,parent_id,author,initials,time_label,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
);
insComment.run(1, "article", 1, null, "测试访客", "访", "3 天前", "这篇文章帮大忙了！", "published", now, now);
insComment.run(2, "article", 1, 1, "duanap", "du", "2 天前", "@测试访客 感谢支持", "published", now, now);
insComment.run(3, "life", 7, null, "另一访客", "另", "1 天前", "记录真勤", "published", now, now);
insComment.run(4, "message", 0, null, "留言者", "留", "刚刚", "留言墙消息，应被跳过", "published", now, now);

console.log(`合成旧库已生成: ${out}`);
