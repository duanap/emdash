import { defineMiddleware } from "astro:middleware";

import { htmlPageUrl } from "../utils/public-page-url.js";

const URL_ELEMENT = /(<(?:loc|link)>)([^<]+)(<\/(?:loc|link)>)/g;
const URL_ATTRIBUTE = /(\bhref=)(["'])([^"']+)\2/g;

export const onRequest = defineMiddleware(async (context, next) => {
	const { url } = context;
	const target = htmlPageUrl(url.pathname + url.search, url.origin);
	if (target !== url.pathname + url.search && context.request.method === "GET")
		return context.redirect(target, 301);
	const response = await next();
	const location = response.headers.get("location");
	if (location) {
		const canonical = htmlPageUrl(location, url.origin);
		if (canonical !== location) {
			const rewritten = new Response(response.body, response);
			rewritten.headers.set("location", canonical);
			return rewritten;
		}
	}
	if (response.headers.get("content-type")?.includes("xml")) {
		const body = (await response.text())
			.replace(
				URL_ELEMENT,
				(_match, start: string, value: string, end: string) =>
					`${start}${htmlPageUrl(value, url.origin)}${end}`,
			)
			.replace(
				URL_ATTRIBUTE,
				(_match, prefix: string, quote: string, value: string) =>
					`${prefix}${quote}${htmlPageUrl(value, url.origin)}${quote}`,
			);
		const headers = new Headers(response.headers);
		headers.delete("content-length");
		return new Response(body, { status: response.status, headers });
	}
	return response;
});
