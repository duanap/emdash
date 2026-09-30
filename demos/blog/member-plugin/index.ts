/**
 * duanap-members POC — Phase 5 可行性验证插件（Native 格式）
 *
 * 验证三个能力（全部在同一宿主进程内运行）：
 *   ① 公开路由可读写 Cookie（OAuth 会话的前提）
 *   ② page:fragments 可向所有公开页面注入脚本
 *   ③ 站点页面可直接导入本模块的 SSR 辅助函数（同进程 ctx 捕获）
 * 同时验证声明式存储集合的写入/查询。
 *
 * 部署目标是 Node standalone（无 Workers），模块级 ctx 捕获是安全的。
 */

import { definePlugin, pluginResponse } from "emdash";
import type { PluginDescriptor, PluginContext, ResolvedPlugin } from "emdash";

const PLUGIN_ID = "duanap-members";
const VERSION = "0.1.0";

/** 同进程捕获的插件上下文（Node 单例，见 MIGRATION.md Phase 5 决策） */
let capturedCtx: PluginContext | null = null;

export interface PocMember {
	name: string;
	status: "active";
	createdAt: string;
}

export function duanapMembersPlugin(): PluginDescriptor {
	return {
		id: PLUGIN_ID,
		version: VERSION,
		entrypoint: "/member-plugin/index.ts",
		format: "native",
		capabilities: ["hooks.page-fragments:register"],
		storage: {
			members: { indexes: ["status", "createdAt"] },
		},
	};
}

export function createPlugin(_options: Record<string, never> = {}): ResolvedPlugin {
	return definePlugin({
		id: PLUGIN_ID,
		version: VERSION,
		capabilities: ["hooks.page-fragments:register"],

		storage: {
			members: {
				indexes: ["status", "createdAt"] as const,
			},
		},

		hooks: {
			"plugin:activate": {
				handler: async (_event, ctx) => {
					capturedCtx = ctx;
					ctx.log.info("[duanap-members-poc] activated, ctx captured");
				},
			},

			// 能力②：向每个公开页面注入标记脚本。
			// Base.astro 的 EmDashBodyStart/End 会渲染这些贡献。
			"page:fragments": {
				handler: async (_event, ctx) => {
					// activate 在 dev 下不一定触发；渲染路径兜底捕获
					capturedCtx ??= ctx;
					return {
						kind: "inline-script",
						placement: "body:end",
						code: `document.documentElement.dataset.pocPlugin = "duanap-members";`,
						key: "poc-flag",
					};
				},
			},
		},

		routes: {
			// 能力①：公开路由读 Cookie、写 Set-Cookie（OAuth 形态的最小验证）
			ping: {
				public: true,
				methods: ["GET"],
				request: { body: "none" },
				response: "raw",
				handler: async (ctx) => {
					const cookie = ctx.request.headers.get("cookie") ?? "";
					const hadPoc = /(?:^|;\s*)poc=1(?:;|$)/.test(cookie);
					const members = await ctx.storage.members.count();
					return pluginResponse({
						status: 200,
						headers: {
							"content-type": "application/json; charset=utf-8",
							// 种下 poc=1；再次访问 ping 应显示 hadPocCookie: true
							"set-cookie": "poc=1; Path=/; Max-Age=600; SameSite=Lax",
						},
						body: {
							kind: "text",
							value: JSON.stringify({
								ok: true,
								hadPocCookie: hadPoc,
								members,
							}),
						},
					});
				},
			},

			// 存储写入（公开 POST + JSON）
			"members/add": {
				public: true,
				methods: ["POST"],
				request: { body: "json" },
				handler: async (ctx) => {
					const input = ctx.input as { name?: unknown };
					const name = typeof input?.name === "string" ? input.name.slice(0, 40) : "";
					if (!name) {
						return { success: false, error: { code: "INVALID", message: "name 必填" } };
					}
					const id = `m-${Date.now().toString(36)}`;
					await ctx.storage.members.put(id, {
						name,
						status: "active",
						createdAt: new Date().toISOString(),
					} satisfies PocMember);
					return { success: true, data: { id, name } };
				},
			},

			// 存储查询
			"members/list": {
				public: true,
				methods: ["GET"],
				request: { body: "none" },
				handler: async (ctx) => {
					const result = await ctx.storage.members.query({
						limit: 20,
						orderBy: { createdAt: "desc" },
					});
					return {
						success: true,
						data: result.items.map((item) => ({ id: item.id, ...item.data })),
					};
				},
			},
		},
	});
}

// ─── SSR 辅助函数（能力③：站点页面直接导入） ─────────────────────────

/** 插件 ctx 是否已捕获（激活后为真） */
export function isPocActive(): boolean {
	return capturedCtx !== null;
}

/** 存储中的 POC 会员数；插件未激活时返回 -1 */
export async function getPocMemberCount(): Promise<number> {
	if (!capturedCtx) return -1;
	return capturedCtx.storage.members.count();
}
