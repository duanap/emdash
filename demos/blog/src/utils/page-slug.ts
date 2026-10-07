import { decodeSlug } from "emdash";

const HTML_SUFFIX = /\.html$/;

/**
 * 从路由参数解析内容 slug：htmlPages 集成给每个页面注入了 `{route}.html`
 * 路由（同一 entrypoint），参数会带着 `.html` 后缀进来，这里统一剥掉，
 * 再做 EmDash 的 slug 解码。
 */
export function pageSlug(raw: string | undefined): string | undefined {
	if (!raw) return undefined;
	return decodeSlug(raw.replace(HTML_SUFFIX, ""));
}
