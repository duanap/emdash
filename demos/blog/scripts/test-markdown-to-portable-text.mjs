#!/usr/bin/env node
/**
 * Markdown → Portable Text 的验证（scripts/lib/markdown-to-portable-text.ts）。
 *
 * 这是迁移里最容易出错的一块：正文一旦转换错了，新站上就是一篇坏文章。
 * 所以逐个语法都测，并且对照 EmDash 内置组件认得的形状断言。
 *
 * 用法（Node >= 22.16）：
 *   node --experimental-strip-types scripts/test-markdown-to-portable-text.mjs
 */

import assert from "node:assert/strict";

import { markdownToPortableText } from "./lib/markdown-to-portable-text.ts";

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

/** 只取文本，方便断言 */
const texts = (blocks) => blocks.map((block) => block.children?.map((child) => child.text).join("") ?? "");

await test("空输入产出空数组", () => {
	assert.deepEqual(markdownToPortableText(""), []);
	assert.deepEqual(markdownToPortableText("\n\n  \n"), []);
});

await test("段落：连续行合成一段，空行分段", () => {
	const blocks = markdownToPortableText("第一行\n第二行\n\n第二段");
	assert.equal(blocks.length, 2);
	assert.equal(blocks[0]._type, "block");
	assert.equal(blocks[0].style, "normal");
	assert.equal(texts(blocks)[0], "第一行\n第二行");
	assert.equal(texts(blocks)[1], "第二段");
});

await test("标题 h1–h6 映射到 style", () => {
	const blocks = markdownToPortableText("# 一\n\n### 三\n\n###### 六");
	assert.deepEqual(
		blocks.map((block) => block.style),
		["h1", "h3", "h6"],
	);
	// 七个 # 不是标题
	assert.equal(markdownToPortableText("####### 七")[0].style, "normal");
});

await test("无序列表：listItem=bullet，缩进换算 level", () => {
	const blocks = markdownToPortableText("- 一\n- 二\n  - 二点一\n    - 二点一点一\n* 三");
	assert.deepEqual(
		blocks.map((block) => [block.listItem, block.level]),
		[
			["bullet", 1],
			["bullet", 1],
			["bullet", 2],
			["bullet", 3],
			["bullet", 1],
		],
	);
	assert.deepEqual(texts(blocks), ["一", "二", "二点一", "二点一点一", "三"]);
});

await test("有序列表：listItem=number 且支持 1) 写法", () => {
	const blocks = markdownToPortableText("1. 甲\n2. 乙\n   1) 乙一");
	assert.deepEqual(
		blocks.map((block) => [block.listItem, block.level]),
		[
			["number", 1],
			["number", 1],
			["number", 2],
		],
	);
});

await test("围栏代码块：保留原样、带 language 与 filename", () => {
	const blocks = markdownToPortableText("```ts title=demo.ts\nconst a = 1;\n```");
	assert.equal(blocks.length, 1);
	assert.equal(blocks[0]._type, "code");
	assert.equal(blocks[0].code, "const a = 1;");
	assert.equal(blocks[0].language, "ts");
	assert.equal(blocks[0].filename, "title=demo.ts");
});

await test("围栏代码块里的 Markdown 不被解析，且未闭合也收尾", () => {
	const blocks = markdownToPortableText("```\n# 不是标题\n**不是粗体**\n```\n\n```md\n没闭合");
	assert.equal(blocks[0]._type, "code");
	assert.equal(blocks[0].code, "# 不是标题\n**不是粗体**");
	assert.equal(blocks[1]._type, "code");
	assert.equal(blocks[1].code, "没闭合");
});

await test("引用：style=blockquote", () => {
	const blocks = markdownToPortableText("> 引用一行\n> 引用两行");
	assert.equal(blocks.length, 2);
	assert.deepEqual(
		blocks.map((block) => block.style),
		["blockquote", "blockquote"],
	);
});

await test("分隔线 → break", () => {
	assert.deepEqual(
		markdownToPortableText("前\n\n---\n\n后").map((block) => block._type),
		["block", "break", "block"],
	);
});

await test("独占一行的图片 → image 块，地址走解析器", () => {
	const blocks = markdownToPortableText('![封面](/uploads/a.png "标题")', {
		resolveImageUrl: (url) => `/media/${url.replace("/uploads/", "")}`,
	});
	assert.equal(blocks.length, 1);
	assert.equal(blocks[0]._type, "image");
	assert.equal(blocks[0].asset.url, "/media/a.png");
	assert.equal(blocks[0].alt, "封面");
	assert.equal(blocks[0].caption, "标题");
});

await test("行内图片降级成链接，不丢内容", () => {
	const blocks = markdownToPortableText("看图 ![图](/uploads/b.png) 结束");
	assert.equal(blocks.length, 1);
	assert.equal(blocks[0].markDefs.length, 1);
	assert.equal(blocks[0].markDefs[0].href, "/uploads/b.png");
	assert.deepEqual(
		blocks[0].children.map((child) => child.text),
		["看图 ", "图", " 结束"],
	);
	const imageSpan = blocks[0].children.find((child) => child.text === "图");
	assert.deepEqual(imageSpan.marks, [blocks[0].markDefs[0]._key]);
});

await test("行内标记：粗体 / 斜体 / 代码 / 删除线", () => {
	const [block] = markdownToPortableText("**粗** 与 *斜* 与 `代码` 与 ~~删~~");
	const marks = block.children.map((child) => [child.text, child.marks]);
	assert.deepEqual(marks, [
		["粗", ["strong"]],
		[" 与 ", []],
		["斜", ["em"]],
		[" 与 ", []],
		["代码", ["code"]],
		[" 与 ", []],
		["删", ["strike-through"]],
	]);
});

await test("链接：markDefs 带 href，链接文本继承标记", () => {
	const [block] = markdownToPortableText("见 [**文档**](https://example.com/a?b=1)");
	assert.deepEqual(block.markDefs, [
		{ _key: "b0m0", _type: "link", href: "https://example.com/a?b=1" },
	]);
	assert.deepEqual(block.children.at(-1), {
		_type: "span",
		_key: "b0l1_s0",
		text: "文档",
		marks: ["strong", "b0m0"],
	});
});

await test("表格行等复杂文本不会崩，且保留原文", () => {
	const blocks = markdownToPortableText("| a | b |\n| - | - |\n| 1 | 2 |");
	assert.equal(blocks.length, 1);
	assert.equal(texts(blocks)[0], "| a | b |\n| - | - |\n| 1 | 2 |");
});

await test("转义字符按字面量输出", () => {
	const [block] = markdownToPortableText("星号 \\* 不是斜体");
	assert.equal(block.children.map((child) => child.text).join(""), "星号 * 不是斜体");
	assert.deepEqual(block.children[0].marks, []);
});

await test("CRLF 与 tab 缩进都能处理", () => {
	const blocks = markdownToPortableText("段落一\r\n\r\n- 一\r\n\t- 一之一");
	assert.equal(texts(blocks)[0], "段落一");
	assert.deepEqual(
		blocks.slice(1).map((block) => block.level),
		[1, 2],
	);
});

await test("每个块的 _key 唯一且确定（迁移可重复执行）", () => {
	const markdown = "# 标题\n\n段落\n\n- 一\n- 二\n\n```js\nlet a;\n```";
	const first = markdownToPortableText(markdown);
	const second = markdownToPortableText(markdown);
	assert.deepEqual(first, second);
	const keys = first.map((block) => block._key);
	assert.equal(new Set(keys).size, keys.length);
});

await test("空段落不会产生空块", () => {
	const blocks = markdownToPortableText("段落\n\n\n\n下一段");
	assert.equal(blocks.length, 2);
});

console.log("\nMarkdown → Portable Text 验证\n");
console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} 通过`);
if (failures > 0) {
	console.log(`${failures} 项失败`);
	process.exit(1);
}
