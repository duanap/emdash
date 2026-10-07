// @ts-ignore - virtual module
import { patterns, siteOrigin } from "virtual:blog/html-routes";

const routePatterns: unknown = patterns;
const pagePatterns = Array.isArray(routePatterns)
	? routePatterns
			.filter((pattern: unknown): pattern is string => typeof pattern === "string")
			.map((pattern) => new RegExp(pattern))
	: [];
const SITE_ORIGIN = typeof siteOrigin === "string" ? siteOrigin : "";
const HTML_SUFFIX = /\.html$/;
const TRAILING_SLASH = /\/$/;
const WALL_ROUTE = /^\/wall\//;
const HTTP_URL = /^https?:\/\//i;
const aliases: Record<string, string> = {
	"/pages/about": "/about",
	"/pages/friends": "/friends",
	"/articles": "/posts",
	"/user": "/member",
};

export function htmlPageUrl<T extends string | null | undefined>(
	value: T,
	origin = SITE_ORIGIN,
): T | string {
	if (!value || value.startsWith("#") || value.startsWith("//")) return value;
	const absolute = HTTP_URL.test(value);
	if (!absolute && !value.startsWith("/")) return value;
	let parsed: URL;
	try {
		parsed = new URL(value, origin || "http://localhost");
	} catch {
		return value;
	}
	if (absolute && parsed.origin !== origin && parsed.origin !== SITE_ORIGIN) return value;
	const path = parsed.pathname.replace(HTML_SUFFIX, "").replace(TRAILING_SLASH, "") || "/";
	if (path === "/" || (!pagePatterns.some((pattern) => pattern.test(path)) && !aliases[path]))
		return value;
	const canonical = WALL_ROUTE.test(path) ? "/messages" : (aliases[path] ?? path);
	parsed.pathname = `${canonical}.html`;
	return absolute ? parsed.href : parsed.pathname + parsed.search + parsed.hash;
}
