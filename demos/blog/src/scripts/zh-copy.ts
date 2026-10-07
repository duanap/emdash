/**
 * 核心公开 UI 的中文文案兜底。
 *
 * EmDash core 的公开组件（评论表单/评论列表/搜索与归档 widget）字符串硬编码英文、
 * 也没有 locale 入口，这里在 DOM 层把已知文案换成中文，只作用于 core 输出的容器。
 * 上游提供 i18n 后应整体移除（背景见 demos/blog/MIGRATION.md）。
 *
 * 只翻译"界面文案"：精确匹配的固定字符串、属性值，以及 core 自己格式化的
 * 英文日期/数量。正文、标题、作者名等一律不碰，避免误伤内容。
 */

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

/** core 输出的容器范围：只在这里做替换 */
export const ZH_COPY_SCOPE = ".ec-comments, .ec-comment-form, .widget-search, .widget-archives";

const EXACT_TEXT: Record<string, string> = {
	Name: "昵称",
	Email: "邮箱",
	Comment: "评论",
	"Post Comment": "发表评论",
	Search: "搜索",
	Like: "赞",
	Reply: "回复",
	"No comments yet": "还没有评论",
	"Comment submitted!": "评论已提交，感谢参与。",
	"Comment submitted for review": "评论已提交，等待审核。",
	"Comment published": "评论已发布。",
	"Failed to submit comment.": "评论提交失败，请稍后重试。",
	"Network error. Please try again.": "网络异常，请稍后重试。",
};

const EXACT_ATTRIBUTE: Record<string, string> = {
	"Site member": "本站会员",
	Search: "搜索",
	"Download file": "下载文件",
	"YouTube video": "YouTube 视频",
	"Vimeo video": "Vimeo 视频",
	"Search...": "搜索…",
	"Search posts...": "搜索文章…",
	"Search articles...": "搜索文章…",
};

const COMMENT_COUNT_PATTERN = /^(\d+) Comments?$/;
const ARCHIVE_MONTH_PATTERN = new RegExp(`^(${MONTHS.join("|")}) (\\d{4})$`);
/** core 用 toLocaleDateString("en-US", …) 渲染的评论时间：September 30, 2026 at 9:27 PM */
const COMMENT_DATE_PATTERN =
	/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4}) at (\d{1,2}):(\d{2}) (AM|PM)$/;

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

/** 纯文本翻译：返回中文，或 null 表示这条不该动 */
export function translateText(text: string): string | null {
	const exact = EXACT_TEXT[text];
	if (exact) return exact;

	const commentCount = COMMENT_COUNT_PATTERN.exec(text);
	if (commentCount) return `${commentCount[1]} 条评论`;

	const archiveMonth = ARCHIVE_MONTH_PATTERN.exec(text);
	if (archiveMonth) return `${archiveMonth[2]} 年 ${MONTHS.indexOf(archiveMonth[1]) + 1} 月`;

	const date = COMMENT_DATE_PATTERN.exec(text);
	if (date) {
		const month = MONTHS.indexOf(date[1]) + 1;
		const hour24 = (Number(date[4]) % 12) + (date[6] === "PM" ? 12 : 0);
		return `${date[3]}年${month}月${Number(date[2])}日 ${pad(hour24)}:${date[5]}`;
	}

	return null;
}

/** 属性翻译（aria-label / title / placeholder） */
export function translateAttributeValue(value: string): string | null {
	return EXACT_ATTRIBUTE[value] ?? null;
}

const ATTRIBUTE_NAMES = ["aria-label", "title", "placeholder"];

/** 在给定容器内应用翻译（可重复调用；已翻译的内容会原样保留） */
export function applyZhCopy(root: ParentNode): void {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let node = walker.nextNode();
	while (node) {
		const next = walker.nextNode();
		const raw = node.nodeValue;
		const text = raw?.trim();
		if (text) {
			const zh = translateText(text);
			if (zh && raw !== zh) node.nodeValue = zh;
		}
		node = next;
	}

	for (const name of ATTRIBUTE_NAMES) {
		for (const el of root.querySelectorAll(`[${name}]`)) {
			const value = el.getAttribute(name);
			if (!value) continue;
			const zh = translateAttributeValue(value);
			if (zh && zh !== value) el.setAttribute(name, zh);
		}
	}
}

/**
 * 安装兜底：立即翻译一次，并监听后续变化（core 的脚本会在提交后写入状态文案）。
 */
export function installZhCopy(document: Document): void {
	const translateAll = () => {
		for (const el of document.querySelectorAll(ZH_COPY_SCOPE)) applyZhCopy(el);
	};

	translateAll();

	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			const target =
				mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
			const container = target?.closest(ZH_COPY_SCOPE);
			if (container) applyZhCopy(container);
		}
	});
	observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}
