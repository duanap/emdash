/**
 * 旧站数字 URL → 新站 slug 的 301 映射。
 *
 * 由 `scripts/migrate-old-site.mjs` 在迁移时写入 `src/data/legacy-redirects.json`
 * （键是旧路径，值是站点内路径）。迁移前该文件是空对象，站点照常构建。
 *
 * 只有确实存在映射时才跳转，否则保持 404 —— 错误地把不存在的旧地址跳到首页会污染收录。
 */

import legacyRedirects from "../data/legacy-redirects.json";

const redirects = legacyRedirects as Record<string, string>;

/** 查旧路径对应的新路径；没有映射时返回 null */
export function lookupLegacyRedirect(pathname: string): string | null {
	return redirects[pathname] ?? null;
}

export function hasLegacyRedirects(): boolean {
	return Object.keys(redirects).length > 0;
}
