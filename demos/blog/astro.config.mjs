import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

export default defineConfig({
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	// 专用路由取代 /pages/{slug} 入口；301 旧地址避免重复内容
	redirects: {
		"/pages/about": "/about",
		"/pages/friends": "/friends",
	},
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: "file:./data.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
		}),
	],
	// Fonts come from the system stack defined in src/styles/theme.css
	// (--font-body / --font-mono) instead of a webfont provider: no
	// network fetch at dev/build time, and CJK fallbacks are built in.
	devToolbar: { enabled: false },
});
