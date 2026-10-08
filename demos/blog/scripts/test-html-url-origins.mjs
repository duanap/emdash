import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import ts from "typescript";

import { htmlPages } from "../integrations/html-pages.mjs";

let virtualPlugin;
htmlPages().hooks["astro:config:setup"]({
	config: { root: new URL("../", import.meta.url), site: "https://blog.duanap.cn/" },
	injectRoute() {},
	addMiddleware() {},
	updateConfig(config) {
		virtualPlugin = config.vite.plugins[0];
	},
});
const virtualModule = virtualPlugin.load(virtualPlugin.resolveId("virtual:blog/html-routes"));
const source = readFileSync(new URL("../src/utils/public-page-url.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText;
const moduleCode = compiled.replace(
	'import { patterns, siteOrigin } from "virtual:blog/html-routes";',
	virtualModule,
);
const { htmlPageUrl } = await import(
	"data:text/javascript;base64," + Buffer.from(moduleCode).toString("base64")
);
const article = "https://blog.duanap.cn/posts/example?tag=astro#code";
for (const origin of ["https://blog.duanap.cn", "https://duanap.cn", "https://www.duanap.cn"]) {
	assert.equal(
		htmlPageUrl(article, origin),
		"https://blog.duanap.cn/posts/example.html?tag=astro#code",
	);
	assert.equal(
		htmlPageUrl("https://external.example/posts/example", origin),
		"https://external.example/posts/example",
	);
}
assert.equal(
	htmlPageUrl("/_emdash/api/media/file/example.png"),
	"/_emdash/api/media/file/example.png",
);
console.log(
	"PASS configured site URLs retain .html through all public hostnames and leave external links and resources unchanged",
);
