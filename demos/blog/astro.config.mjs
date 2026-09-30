import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { duanapMembersPlugin } from "./member-plugin/index.js";

// 数据库与上传目录都可以用环境变量覆盖：生产上把数据放在仓库之外的固定路径，
// 升级只替换 dist，数据不受影响。默认值保持本地开发的样子。
const databaseUrl = process.env.EMDASH_DATABASE_URL ?? "file:./data.db";
const uploadsDirectory = process.env.EMDASH_UPLOADS_DIR ?? "./uploads";

export default defineConfig({
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	// 专用路由取代 /pages/{slug} 入口；301 旧地址避免重复内容
	redirects: {
		"/pages/about": "/about",
		"/pages/friends": "/friends",
		// 旧站的列表入口与会员中心（详情页的数字 ID 由 /article/[id] 等路由处理）
		"/articles": "/posts",
		"/user": "/member",
	},
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: databaseUrl }),
			storage: local({
				directory: uploadsDirectory,
				baseUrl: "/_emdash/api/media/file",
			}),
			// Phase 5 会员体系：Native 插件（同进程，Cookie/页面注入/SSR 直连）
			plugins: [duanapMembersPlugin()],
		}),
	],
	// Fonts come from the system stack defined in src/styles/theme.css
	// (--font-body / --font-mono) instead of a webfont provider: no
	// network fetch at dev/build time, and CJK fallbacks are built in.
	devToolbar: { enabled: false },
});
