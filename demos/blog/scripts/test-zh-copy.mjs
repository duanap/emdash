#!/usr/bin/env node
/**
 * 核心公开 UI 中文兜底的验证（src/scripts/zh-copy.ts）。
 *
 * 兜底是 DOM 层替换，风险在于误伤内容 —— 所以这里既测"该翻的翻对"，
 * 也测"不该动的一个字都不许动"（正文标题、中文、URL、前缀相似的英文词）。
 *
 * 用法（Node >= 22.16）：
 *   node --experimental-strip-types scripts/test-zh-copy.mjs
 */

import assert from "node:assert/strict";

import { translateAttributeValue, translateText } from "../src/scripts/zh-copy.ts";

const results = [];
let failures = 0;

async function test(name, fn) {
	try {
		await fn();
		results.push(`  PASS  ${name}`);
	} catch (error) {
		failures += 1;
		results.push(`  FAIL  ${name}\n        ${error.message.split("\n").join("\n        ")}`);
	}
}

// ─── 该翻译的 ─────────────────────────────────────────────────────

await test("评论表单与列表的固定文案", () => {
	assert.equal(translateText("Name"), "昵称");
	assert.equal(translateText("Email"), "邮箱");
	assert.equal(translateText("Comment"), "评论");
	assert.equal(translateText("Post Comment"), "发表评论");
	assert.equal(translateText("No comments yet"), "还没有评论");
	assert.equal(translateText("Like"), "赞");
});

await test("服务端返回的提交结果文案", () => {
	assert.equal(translateText("Comment submitted for review"), "评论已提交，等待审核。");
	assert.equal(translateText("Comment published"), "评论已发布。");
	assert.equal(translateText("Comment submitted!"), "评论已提交，感谢参与。");
});

await test("提交失败与网络异常的提示", () => {
	assert.equal(translateText("Failed to submit comment."), "评论提交失败，请稍后重试。");
	assert.equal(translateText("Network error. Please try again."), "网络异常，请稍后重试。");
});

await test("评论数量（单复数都要）", () => {
	assert.equal(translateText("1 Comment"), "1 条评论");
	assert.equal(translateText("3 Comments"), "3 条评论");
	assert.equal(translateText("12 Comments"), "12 条评论");
});

await test("归档月份", () => {
	assert.equal(translateText("September 2026"), "2026 年 9 月");
	assert.equal(translateText("January 2027"), "2027 年 1 月");
});

await test("评论时间（core 用 en-US 渲染，含 AM/PM 边界）", () => {
	assert.equal(translateText("September 30, 2026 at 9:27 PM"), "2026年9月30日 21:27");
	assert.equal(translateText("January 5, 2026 at 9:07 AM"), "2026年1月5日 09:07");
	assert.equal(translateText("March 1, 2026 at 12:05 AM"), "2026年3月1日 00:05");
	assert.equal(translateText("March 1, 2026 at 12:30 PM"), "2026年3月1日 12:30");
});

await test("属性值（aria-label / title / placeholder）", () => {
	assert.equal(translateAttributeValue("Site member"), "本站会员");
	assert.equal(translateAttributeValue("Search"), "搜索");
	assert.equal(translateAttributeValue("Search..."), "搜索…");
	assert.equal(translateAttributeValue("Search articles..."), "搜索文章…");
	assert.equal(translateAttributeValue("Download file"), "下载文件");
});

// ─── 一个字都不该动的 ─────────────────────────────────────────────

await test("文章标题/正文里的英文不翻译", () => {
	for (const text of [
		"Why move to Astro + EmDash",
		"从 Fastify 到 Astro Server：部署架构的演化",
		"Vue 3 + Fastify + Drizzle/SQLite 的全自研博客",
		"duanap",
	]) {
		assert.equal(translateText(text), null, `不应翻译：${text}`);
	}
});

await test("与界面文案前缀相同的英文词也不翻译", () => {
	for (const text of [
		"Commentary on the migration",
		"Like a rolling stone",
		"Searching for a new CMS",
		"Emails are stored locally",
		"Names of things",
		"March 2026 update", // 不是"月份 + 年份"的归档格式
	]) {
		assert.equal(translateText(text), null, `不应翻译：${text}`);
	}
});

await test("URL 与邮箱不翻译", () => {
	for (const text of [
		"https://docs.emdashcms.com/docs-mcp",
		"hi@example.com",
		"/posts/why-move-to-astro-emdash",
	]) {
		assert.equal(translateText(text), null, `不应翻译：${text}`);
	}
});

await test("中文与数字原样返回 null", () => {
	for (const text of ["评论", "还没有评论", "3 条评论", "2026", "9:27"]) {
		assert.equal(translateText(text), null, `不应翻译：${text}`);
	}
});

await test("不认识的属性值不翻译", () => {
	assert.equal(translateAttributeValue("Toggle navigation"), null);
	assert.equal(translateAttributeValue(""), null);
});

// ─── 报告 ─────────────────────────────────────────────────────────

console.log("\n核心公开 UI 中文兜底验证\n");
console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} 通过`);
if (failures > 0) {
	console.log(`${failures} 项失败`);
	process.exit(1);
}
