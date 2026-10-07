import assert from "node:assert/strict";

const base = process.env.TEST_SITE_URL ?? "http://127.0.0.1:4330";
const CANONICAL = /<link[^>]*rel="canonical"[^>]*href="([^"]+)"/;
const OG_URL = /<meta[^>]*property="og:url"[^>]*content="([^"]+)"/;
for (const path of ["/about", "/friends", "/messages"]) {
	const legacy = await fetch(base + path, { redirect: "manual" });
	assert.equal(legacy.status, 301, path);
	assert.equal(legacy.headers.get("location"), path + ".html");
	const response = await fetch(base + path + ".html");
	assert.equal(response.status, 200, path);
	const html = await response.text();
	assert.equal(html.match(CANONICAL)?.[1], base + path + ".html", "canonical: " + path);
	assert.equal(html.match(OG_URL)?.[1], base + path + ".html", "og:url: " + path);
	console.log("PASS canonical and legacy redirect: " + path);
}
