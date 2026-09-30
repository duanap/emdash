/**
 * Markdown → Portable Text（旧站迁移用）。
 *
 * 旧站正文是手写 Markdown 解析器渲染的，新站正文是 Portable Text。这里只覆盖
 * 博客正文实际用到的语法，输出 EmDash 内置组件认得的形状：
 * - 段落 / h1–h6 / 引用（`style`）
 * - 有序、无序列表（`listItem` + `level`）
 * - 围栏代码块（`_type: "code"`，带 language / filename）
 * - 分隔线（`_type: "break"`）
 * - 独占一行的图片（`_type: "image"`，`asset.url` 指向新站媒体地址）
 * - 行内标记：`**粗**`、`*斜*`、`` `代码` ``、`~~删除~~`、`[链接](url)`
 *
 * `_key` 用「块序号 / 内联序号」确定性生成，迁移可重复执行而结果一致。
 */

export interface PortableSpan {
	_type: "span";
	_key: string;
	text: string;
	marks: string[];
}

export interface PortableBlock {
	_type: string;
	_key: string;
	[key: string]: unknown;
}

interface MarkDef {
	_key: string;
	_type: "link";
	href: string;
}

interface InlineResult {
	children: PortableSpan[];
	markDefs: MarkDef[];
}

const HEADING_STYLES = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
const FENCE_PATTERN = /^(`{3,}|~{3,})\s*([^\s`]*)\s*(.*)$/;
const BULLET_PATTERN = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED_PATTERN = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE_PATTERN = /^(\s*)>\s?(.*)$/;
const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const IMAGE_PATTERN = /^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)$/;
const BREAK_PATTERN = /^(?:-{3,}|\*{3,}|_{3,})$/;

/** 图片地址：绝对地址原样保留，旧站相对地址交给调用方改写 */
export type ImageUrlResolver = (url: string) => string;

function indentLevel(indent: string, unit = 2): number {
	// 旧站缩进用两个空格；tab 也当一级
	const spaces = indent.replace(/\t/g, " ".repeat(unit)).length;
	return Math.max(1, Math.floor(spaces / unit) + 1);
}

/**
 * 行内解析：支持嵌套优先级（代码 → 链接 → 粗体 → 删除线 → 斜体 → 转义）。
 */
function parseInline(text: string, keyPrefix: string, resolveImageUrl: ImageUrlResolver): InlineResult {
	const children: PortableSpan[] = [];
	const markDefs: MarkDef[] = [];
	let buffer = "";
	let spanIndex = 0;

	const flush = (marks: string[] = []) => {
		if (buffer.length === 0) return;
		children.push({
			_type: "span",
			_key: `${keyPrefix}s${spanIndex++}`,
			text: buffer,
			marks,
		});
		buffer = "";
	};

	const pushText = (value: string, marks: string[] = []) => {
		flush();
		if (!value) return;
		children.push({
			_type: "span",
			_key: `${keyPrefix}s${spanIndex++}`,
			text: value,
			marks,
		});
	};

	let index = 0;
	while (index < text.length) {
		const rest = text.slice(index);
		const char = text[index]!;

		// 转义
		if (char === "\\" && index + 1 < text.length) {
			buffer += text[index + 1];
			index += 2;
			continue;
		}

		// 行内代码（内部不再解析）
		if (char === "`") {
			const match = /^(`+)([\s\S]*?)\1/.exec(rest);
			if (match) {
				pushText(match[2]!, ["code"]);
				index += match[0].length;
				continue;
			}
		}

		// 链接
		if (char === "[") {
			const match = /^\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/.exec(rest);
			if (match) {
				// 先冲掉缓冲区，否则链接文本会排到前面的文字之前
				flush();
				const href = match[2]!;
				const key = `${keyPrefix}m${markDefs.length}`;
				markDefs.push({ _key: key, _type: "link", href: resolveImageUrl(href) });
				// 链接文本本身可能还带粗体等标记
				const inner = parseInline(match[1]!, `${keyPrefix}l${markDefs.length}_`, resolveImageUrl);
				for (const child of inner.children) {
					children.push({ ...child, marks: [...child.marks, key] });
				}
				markDefs.push(...inner.markDefs);
				index += match[0].length;
				continue;
			}
		}

		// 独占一行的图片落到这里说明是行内图片：保留为链接形式，避免丢内容
		if (rest.startsWith("![")) {
			const match = /^!\[([^\]]*)\]\((\S+?)\)/.exec(rest);
			if (match) {
				const href = resolveImageUrl(match[2]!);
				const key = `${keyPrefix}m${markDefs.length}`;
				markDefs.push({ _key: key, _type: "link", href });
				pushText(match[1] || match[2]!, [key]);
				index += match[0].length;
				continue;
			}
		}

		// 粗体 / 斜体
		if (rest.startsWith("**") || rest.startsWith("__")) {
			const token = rest.slice(0, 2);
			const end = rest.indexOf(token, 2);
			if (end > 2) {
				pushText(rest.slice(2, end), ["strong"]);
				index += end + 2;
				continue;
			}
		}
		if (char === "*" || char === "_") {
			const end = rest.indexOf(char, 1);
			if (end > 1) {
				pushText(rest.slice(1, end), ["em"]);
				index += end + 1;
				continue;
			}
		}

		// 删除线
		if (rest.startsWith("~~")) {
			const end = rest.indexOf("~~", 2);
			if (end > 2) {
				pushText(rest.slice(2, end), ["strike-through"]);
				index += end + 2;
				continue;
			}
		}

		buffer += char;
		index += 1;
	}

	flush();
	if (children.length === 0) {
		children.push({ _type: "span", _key: `${keyPrefix}s0`, text: "", marks: [] });
	}
	return { children, markDefs };
}

export interface MarkdownToPortableTextOptions {
	/** 改写正文里出现的地址（旧站媒体路径 → 新站媒体地址） */
	resolveImageUrl?: ImageUrlResolver;
}

/** 把 Markdown 正文转成 Portable Text 块数组 */
export function markdownToPortableText(
	markdown: string,
	options: MarkdownToPortableTextOptions = {},
): PortableBlock[] {
	const resolveImageUrl = options.resolveImageUrl ?? ((url: string) => url);
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
	const blocks: PortableBlock[] = [];
	let blockIndex = 0;

	const pushBlock = (block: Omit<PortableBlock, "_key">) => {
		blocks.push({ ...block, _key: `b${blockIndex++}` } as PortableBlock);
	};

	const pushInlineBlock = (text: string, extra: Record<string, unknown> = {}) => {
		const keyPrefix = `b${blockIndex}`;
		const { children, markDefs } = parseInline(text, keyPrefix, resolveImageUrl);
		pushBlock({
			_type: "block",
			style: "normal",
			markDefs,
			children,
			...extra,
		});
	};

	let paragraph: string[] = [];
	const flushParagraph = () => {
		if (paragraph.length === 0) return;
		pushInlineBlock(paragraph.join("\n"));
		paragraph = [];
	};

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index]!;
		const trimmed = line.trim();

		// 围栏代码块
		const fence = FENCE_PATTERN.exec(trimmed);
		if (fence) {
			flushParagraph();
			const marker = fence[1]!;
			const language = fence[2] ?? "";
			const info = (fence[3] ?? "").trim();
			const code: string[] = [];
			index += 1;
			while (index < lines.length && !lines[index]!.trim().startsWith(marker)) {
				code.push(lines[index]!);
				index += 1;
			}
			// 未闭合的围栏也按代码块收尾，不吞掉后面的内容
			pushBlock({
				_type: "code",
				code: code.join("\n"),
				...(language ? { language } : {}),
				...(info ? { filename: info } : {}),
			});
			continue;
		}

		// 空行：段落结束
		if (trimmed === "") {
			flushParagraph();
			continue;
		}

		// 分隔线
		if (BREAK_PATTERN.test(trimmed)) {
			flushParagraph();
			pushBlock({ _type: "break" });
			continue;
		}

		// 标题
		const heading = HEADING_PATTERN.exec(trimmed);
		if (heading) {
			flushParagraph();
			const level = heading[1]!.length;
			const keyPrefix = `b${blockIndex}`;
			const { children, markDefs } = parseInline(heading[2]!, keyPrefix, resolveImageUrl);
			pushBlock({ _type: "block", style: HEADING_STYLES[level - 1], markDefs, children });
			continue;
		}

		// 独占一行的图片
		const image = IMAGE_PATTERN.exec(trimmed);
		if (image) {
			flushParagraph();
			pushBlock({
				_type: "image",
				asset: { _type: "reference", _ref: "", url: resolveImageUrl(image[2]!) },
				...(image[1] ? { alt: image[1] } : {}),
				...(image[3] ? { caption: image[3] } : {}),
			});
			continue;
		}

		// 引用
		const quote = QUOTE_PATTERN.exec(line);
		if (quote) {
			flushParagraph();
			const keyPrefix = `b${blockIndex}`;
			const { children, markDefs } = parseInline(quote[2]!, keyPrefix, resolveImageUrl);
			pushBlock({ _type: "block", style: "blockquote", markDefs, children });
			continue;
		}

		// 列表
		const bullet = BULLET_PATTERN.exec(line);
		const ordered = bullet ? null : ORDERED_PATTERN.exec(line);
		if (bullet ?? ordered) {
			flushParagraph();
			const indent = (bullet ?? ordered)![1]!;
			const content = (bullet ?? ordered)![3]!;
			pushInlineBlock(content, {
				listItem: bullet ? "bullet" : "number",
				level: indentLevel(indent),
			});
			continue;
		}

		// 普通段落行
		paragraph.push(trimmed);
	}

	flushParagraph();
	return blocks;
}
