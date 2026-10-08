import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ASTRO_FILE = /\.astro$/;
const INDEX_ROUTE = /\/index$/;
const REGEX_CHARACTERS = /[.*+?^${}()|[\]\\]/g;
const PARAMETER = /^\[(\.\.\.)?\w+\]$/;

function pageFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		if (entry.name.startsWith("_")) return [];
		const path = join(directory, entry.name);
		return entry.isDirectory() ? pageFiles(path) : ASTRO_FILE.test(entry.name) ? [path] : [];
	});
}

export function htmlPages() {
	let routePatterns = [];
	return {
		name: "blog-html-pages",
		hooks: {
			"astro:config:setup": ({ config, injectRoute, addMiddleware, updateConfig }) => {
				const directory = fileURLToPath(new URL("src/pages/", config.root));
				for (const file of pageFiles(directory)) {
					const route =
						`/${relative(directory, file).split("\\").join("/").replace(ASTRO_FILE, "")}`.replace(
							INDEX_ROUTE,
							"",
						);
					if (route === "") continue;
					injectRoute({ pattern: `${route}.html`, entrypoint: file });
					routePatterns.push(
						`^${route
							.split("/")
							.map((part) =>
								PARAMETER.test(part)
									? part.startsWith("[...")
										? ".+"
										: "[^/]+"
									: part.replace(REGEX_CHARACTERS, "\\$&"),
							)
							.join("/")}/?$`,
					);
				}
				addMiddleware({
					entrypoint: fileURLToPath(new URL("../src/middleware/html-pages.ts", import.meta.url)),
					order: "pre",
				});
				updateConfig({
					vite: {
						plugins: [
							{
								name: "blog-html-route-patterns",
								resolveId: (id) =>
									id === "virtual:blog/html-routes" ? "\0blog-html-routes" : undefined,
								load: (id) =>
									id === "\0blog-html-routes"
										? `export const patterns = ${JSON.stringify(routePatterns)}; export const siteOrigin = ${JSON.stringify(config.site ? new URL(config.site).origin : "")};`
										: undefined,
							},
						],
					},
				});
			},
		},
	};
}
