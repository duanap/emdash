import { fileURLToPath } from "node:url";

import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig, memoryCache } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

import { htmlPages } from "./integrations/html-pages.mjs";
import { duanapMembersPlugin } from "./member-plugin/index.js";

// 数据库与上传目录都可以用环境变量覆盖：生产上把数据放在仓库之外的固定路径，
// 升级只替换 dist，数据不受影响。默认值保持本地开发的样子。
const databaseUrl = process.env.EMDASH_DATABASE_URL ?? "file:./data.db";
const uploadsDirectory = process.env.EMDASH_UPLOADS_DIR ?? "./uploads";
const siteUrl = process.env.EMDASH_SITE_URL;
const publicUrls = [siteUrl, ...(process.env.EMDASH_PUBLIC_ORIGINS ?? "").split(",")]
	.filter((value) => value?.trim())
	.map((value) => new URL(value.trim()));

export default defineConfig({
	vite: {
		ssr: { noExternal: ["lucide", "lucide-react"] },
		resolve: {
			alias: {
				"@phosphor-icons/react": fileURLToPath(
					new URL("../../packages/admin/src/lib/icons.tsx", import.meta.url),
				),
			},
		},
	},
	site: siteUrl,
	security: {
		allowedDomains: publicUrls.map((url) => ({
			hostname: url.hostname,
			protocol: url.protocol.slice(0, -1),
		})),
	},
	output: "server",
	trailingSlash: "never",
	adapter: node({
		mode: "standalone",
	}),
	// SSR 响应内存缓存。provider 只保存 CDN-Cache-Control max-age>0 的响应
	// （maxAge 由下方 routeRules 提供），带 Set-Cookie 的响应自动跳过；
	// LRU 上限 64 条，防止整页 HTML 缓存吃掉堆内存（进程 MemoryHigh 512M）。
	// 内容无写后失效钩子，60s TTL + 300s SWR 保证编辑后约 1 分钟内可见。
	// 后台/_emdash、登录、会员、搜索、oauth、封面端点刻意不缓存。
	cache: { provider: memoryCache({ max: 64 }) },
	routeRules: {
		"/": { maxAge: 60, swr: 300 },
		"/about": { maxAge: 60, swr: 300 },
		"/friends": { maxAge: 60, swr: 300 },
		"/messages": { maxAge: 60, swr: 300 },
		"/archives": { maxAge: 60, swr: 300 },
		"/archives/[year]": { maxAge: 60, swr: 300 },
		"/archives/[year]/[month]": { maxAge: 60, swr: 300 },
		"/posts": { maxAge: 60, swr: 300 },
		"/posts/[slug]": { maxAge: 60, swr: 300 },
		"/article/[id]": { maxAge: 60, swr: 300 },
		"/life": { maxAge: 60, swr: 300 },
		"/life/[slug]": { maxAge: 60, swr: 300 },
		"/life/tag/[slug]": { maxAge: 60, swr: 300 },
		"/life-detail/[id]": { maxAge: 60, swr: 300 },
		"/category/[slug]": { maxAge: 60, swr: 300 },
		"/tag/[slug]": { maxAge: 60, swr: 300 },
		"/projects": { maxAge: 60, swr: 300 },
		"/projects/[slug]": { maxAge: 60, swr: 300 },
		"/pages/[slug]": { maxAge: 60, swr: 300 },
		"/wall/[slug]": { maxAge: 60, swr: 300 },
		"/rss.xml": { maxAge: 60, swr: 300 },
	},
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
			siteUrl,
			publicPageSuffix: ".html",
			admin: { messageBoardCollection: "wall" },
			database: sqlite({ url: databaseUrl }),
			storage: local({
				directory: uploadsDirectory,
				baseUrl: "/_emdash/api/media/file",
			}),
			// Phase 5 会员体系：Native 插件（同进程，Cookie/页面注入/SSR 直连）
			plugins: [duanapMembersPlugin()],
		}),
		htmlPages(),
	],
	// Fonts come from the system stack defined in src/styles/theme.css
	// (--font-body / --font-mono) instead of a webfont provider: no
	// network fetch at dev/build time, and CJK fallbacks are built in.
	devToolbar: { enabled: false },
});
