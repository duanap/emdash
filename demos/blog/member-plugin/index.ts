/**
 * duanap-members — 会员体系 Native 插件（5.1 QQ 登录；5.2 留言墙走原生评论；
 * 5.3 点赞/收藏；5.4 会员中心与资料编辑；5.4c 会员评论归属）
 *
 * 在宿主进程内实现旧站 blog-front 的会员域：
 *   - QQ OAuth 登录（state 双校验：Cookie + KV，10 分钟一次性）
 *   - 会员/会话存储（声明式集合，QQ openid 唯一）
 *   - 会话 Cookie（httpOnly / SameSite=Lax / Secure@https / 7 天）
 *   - SSR 辅助函数（站点页面/布局直接导入）
 *
 * 路由（公开，挂 /_emdash/api/plugins/duanap-members/）：
 *   GET  auth/status        登录态 + QQ 配置状态
 *   GET  auth/qq/start      生成 state，HTML 跳转页到 graph.qq.com
 *   GET  auth/qq/callback   code 换 openid/资料，建会员+会话，302 回 returnTo
 *   POST auth/logout        登出
 *   GET  activity/state     点赞/收藏计数 + 当前会员的开关状态（targetIds 支持批量）
 *   POST activity/toggle    点赞/收藏开关（幂等，需会员会话）
 *   GET  member/overview    会员中心数据（资料 + 计数 + 收藏列表）
 *   POST member/profile     修改展示资料（昵称/头像/简介，需会员会话）
 *
 * 会员评论归属：登录会员评论时用派生身份邮箱（member-<hash>@members.duanap.cn），
 * comment:afterCreate 钩子据此把评论记进会员名下，会员中心「我的评论」按此展示。
 *
 * 配置（管理后台 → 插件设置）：qqClientId / qqClientSecret(secret) /
 * qqCallbackUrl / siteOrigin（returnTo 白名单基址，生产 https://blog.duanap.cn）
 */

import { definePlugin, pluginResponse } from "emdash";
import type { PluginDescriptor, PluginContext, ResolvedPlugin } from "emdash";

import { isQqSiteOrigin, qqReturnTarget } from "./qq-navigation.js";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMember(value: unknown): value is Member {
	return (
		isRecord(value) &&
		typeof value.displayName === "string" &&
		typeof value.avatarUrl === "string" &&
		(value.status === "active" || value.status === "disabled") &&
		typeof value.qqOpenid === "string" &&
		typeof value.createdAt === "string" &&
		typeof value.updatedAt === "string" &&
		(value.bio === undefined || typeof value.bio === "string") &&
		(value.customizedFields === undefined ||
			(Array.isArray(value.customizedFields) &&
				value.customizedFields.every(
					(field: unknown) => field === "displayName" || field === "avatarUrl" || field === "bio",
				)))
	);
}

function isSession(value: unknown): value is Session {
	return (
		isRecord(value) &&
		typeof value.memberId === "string" &&
		typeof value.expiresAt === "string" &&
		(value.createdAt === undefined || typeof value.createdAt === "string") &&
		Number.isFinite(Date.parse(value.expiresAt))
	);
}

function isActivityRecord(value: unknown): value is ActivityRecord {
	return (
		isRecord(value) &&
		(value.kind === "like" || value.kind === "favorite") &&
		typeof value.memberOpenid === "string" &&
		typeof value.targetType === "string" &&
		typeof value.targetId === "string" &&
		typeof value.createdAt === "string"
	);
}

function isMemberCommentRecord(value: unknown): value is MemberCommentRecord {
	return (
		isRecord(value) &&
		typeof value.memberRef === "string" &&
		typeof value.collection === "string" &&
		typeof value.contentId === "string" &&
		typeof value.createdAt === "string" &&
		(value.targetTitle === null || typeof value.targetTitle === "string") &&
		(value.targetSlug === null || typeof value.targetSlug === "string")
	);
}

const PLUGIN_ID = "duanap-members";
const VERSION = "0.3.1";

export const SESSION_COOKIE = "dm_session";
export const STATE_COOKIE = "dm_state";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const BRIDGE_TICKET = /^[a-f0-9]{64}$/;
/** QQ /oauth2.0/me 可能仍返回 JSONP 包装 */
const QQ_JSONP_PATTERN = /^[^(]*\(\s*(\{[\s\S]*\})\s*\)\s*;?$/;

// ─── 类型 ───────────────────────────────────────────────────────────

export type MemberProfileField = "displayName" | "avatarUrl" | "bio";

export interface Member {
	displayName: string;
	avatarUrl: string;
	status: "active" | "disabled";
	qqOpenid: string;
	createdAt: string;
	updatedAt: string;
	/** 个人简介（会员中心可编辑） */
	bio?: string;
	/** 用户手动改过的字段；QQ 登录不再覆盖这些字段 */
	customizedFields?: MemberProfileField[];
}

interface Session {
	memberId: string;
	expiresAt: string;
	createdAt?: string;
}

interface QqConfig {
	clientId: string;
	clientSecret: string;
	callbackUrl: string;
	siteOrigin: string;
}

/** 同进程捕获的插件上下文（Node standalone 部署，单例安全） */
let capturedCtx: PluginContext | null = null;

// ─── Descriptor（astro.config.mjs 注册用） ──────────────────────────

export function duanapMembersPlugin(): PluginDescriptor {
	return {
		id: PLUGIN_ID,
		version: VERSION,
		entrypoint: "/member-plugin/index.ts",
		format: "native",
		capabilities: [
			"network:request",
			"content:read",
			"comments:read",
			// comment:afterCreate 事件会带上内容作者，宿主要求该能力否则跳过钩子
			"users:read",
			"hooks.page-fragments:register",
		],
		allowedHosts: ["graph.qq.com"],
		storage: {
			members: { indexes: ["status"], uniqueIndexes: ["qqOpenid"] },
			sessions: { indexes: ["memberId"] },
			// 点赞与收藏共用一张表：kind 区分，记录 id 为 kind:openid:type:id，
			// 主键即唯一约束，重复点赞天然幂等（无需复合唯一索引）
			activity: { indexes: ["targetId", "targetType", "kind", "memberOpenid", "createdAt"] },
			// 会员评论归属：id 为评论 id，memberRef 为派生身份邮箱
			memberComments: { indexes: ["memberRef"] },
		},
	};
}

// ─── 插件实现 ───────────────────────────────────────────────────────

export function createPlugin(_options: Record<string, never> = {}): ResolvedPlugin {
	return definePlugin({
		id: PLUGIN_ID,
		version: VERSION,
		capabilities: [
			"network:request",
			"content:read",
			"comments:read",
			// comment:afterCreate 事件会带上内容作者，宿主要求该能力否则跳过钩子
			"users:read",
			"hooks.page-fragments:register",
		],
		allowedHosts: ["graph.qq.com"],

		storage: {
			members: { indexes: ["status"] as const, uniqueIndexes: ["qqOpenid"] as const },
			sessions: { indexes: ["memberId"] as const },
			activity: {
				indexes: ["targetId", "targetType", "kind", "memberOpenid", "createdAt"] as const,
			},
			memberComments: { indexes: ["memberRef"] as const },
		},

		admin: {
			settingsSchema: {
				qqClientId: { type: "string", label: "QQ 互联 Client ID" },
				qqClientSecret: { type: "secret", label: "QQ 互联 Client Secret" },
				qqCallbackUrl: {
					type: "string",
					label: "QQ 回调地址",
					description:
						"填到 QQ 互联的 redirect_uri，如 https://blog.duanap.cn/_emdash/api/plugins/duanap-members/auth/qq/callback",
				},
				siteOrigin: {
					type: "string",
					label: "站点 Origin（returnTo 白名单）",
					description: "如 https://blog.duanap.cn；本地开发留空即允许 localhost",
				},
			},
		},

		hooks: {
			"plugin:activate": {
				handler: async (_event, ctx) => {
					capturedCtx = ctx;
				},
			},
			// 会员用派生身份邮箱评论 → 归到该会员名下（见「我的评论」）
			"comment:afterCreate": {
				handler: async (event, ctx) => {
					const authorEmail = event.comment?.authorEmail?.trim().toLowerCase() ?? "";
					if (!MEMBER_IDENTITY_PATTERN.test(authorEmail)) return;
					await ctx.storage.memberComments.put(event.comment.id, {
						memberRef: authorEmail,
						collection: event.comment.collection,
						contentId: event.comment.contentId,
						targetTitle: event.content?.title ?? null,
						targetSlug: event.content?.slug ?? null,
						createdAt: event.comment.createdAt,
					} satisfies MemberCommentRecord);
				},
			},

			// dev 下 activate 不保证触发；渲染路径兜底捕获
			"page:fragments": {
				handler: async (_event, ctx) => {
					capturedCtx ??= ctx;
					return null;
				},
			},
		},

		routes: {
			"auth/status": {
				public: true,
				methods: ["GET"],
				request: { body: "none" },
				handler: async (ctx) => {
					const config = await readQqConfig(ctx);
					const entry = await resolveMemberEntry(ctx.storage, ctx.request);
					return {
						success: true,
						data: {
							loggedIn: entry !== null,
							member: entry
								? {
										displayName: entry.member.displayName,
										avatarUrl: entry.member.avatarUrl,
									}
								: null,
							// 会员评论时使用的身份（页面据此预填评论表单，邮箱不公开）
							commentIdentity: entry
								? {
										name: entry.member.displayName,
										email: await memberIdentityEmail(entry.member.qqOpenid),
									}
								: null,
							qqConfigured: config !== null,
						},
					};
				},
			},

			"auth/qq/start": {
				public: true,
				methods: ["GET"],
				request: { body: "none" },
				response: "raw",
				handler: async (ctx) => {
					const config = await readQqConfig(ctx);
					const url = new URL(ctx.request.url);
					const returnTo = qqReturnTarget(url.searchParams.get("returnTo"), url);

					if (!config) {
						// 未配置：跳回登录页带错误码（同源 302 合规）
						return redirectResponse(loginUrlWith(url, "error=not_configured"), [
							clearCookieHeader(STATE_COOKIE),
						]);
					}

					const callback = new URL(config.callbackUrl);
					if (url.origin !== callback.origin) {
						const start = new URL(
							"/_emdash/api/plugins/duanap-members/auth/qq/start",
							callback.origin,
						);
						start.searchParams.set("returnTo", returnTo);
						return redirectResponse(start.href, []);
					}

					// state：32 字节随机 + KV 存储一次性值 + Cookie 双校验
					const state = randomToken();
					await ctx.kv.set(
						`oauth:state:${state}`,
						JSON.stringify({
							returnTo,
							expiresAt: new Date(Date.now() + STATE_TTL_MS).toISOString(),
						}),
					);

					const authorizeUrl = new URL("https://graph.qq.com/oauth2.0/authorize");
					authorizeUrl.searchParams.set("response_type", "code");
					authorizeUrl.searchParams.set("client_id", config.clientId);
					authorizeUrl.searchParams.set("redirect_uri", config.callbackUrl);
					authorizeUrl.searchParams.set("scope", "get_user_info");
					authorizeUrl.searchParams.set("state", state);

					// trusted 插件的 raw 路由允许跨域 Location（见 changeset
					// trusted-plugin-route-cookies），直接 302 到 QQ 授权页。
					return redirectResponse(authorizeUrl.toString(), [stateCookieHeader(ctx.request, state)]);
				},
			},

			"auth/qq/callback": {
				public: true,
				methods: ["GET"],
				request: { body: "none" },
				response: "raw",
				handler: async (ctx) => {
					const url = new URL(ctx.request.url);
					const config = await readQqConfig(ctx);
					if (!config)
						return redirectResponse(loginUrlWith(url, "error=not_configured"), [
							clearCookieHeader(STATE_COOKIE),
						]);

					const stateParam = url.searchParams.get("state") ?? "";
					const code = url.searchParams.get("code") ?? "";
					const oauthError = url.searchParams.get("error") ?? url.searchParams.get("msg");

					const fail = (reason: string) =>
						redirectResponse(loginUrlWith(url, `error=${reason}`), [
							clearCookieHeader(STATE_COOKIE),
						]);

					if (oauthError) return fail("denied");
					if (!stateParam || !code) return fail("invalid_response");

					// 双校验：query.state == cookie.state，且 KV 中一次性取出未过期
					const cookieState = readCookie(ctx.request.headers.get("cookie"), STATE_COOKIE);
					if (!cookieState || cookieState !== stateParam) return fail("state_mismatch");

					const storedRaw = await ctx.kv.get<string>(`oauth:state:${stateParam}`);
					await ctx.kv.delete(`oauth:state:${stateParam}`); // 一次性
					if (!storedRaw) return fail("state_expired");
					let stored: { returnTo: string; expiresAt: string };
					try {
						const parsed: unknown = JSON.parse(storedRaw);
						if (
							!isRecord(parsed) ||
							typeof parsed.returnTo !== "string" ||
							typeof parsed.expiresAt !== "string" ||
							!Number.isFinite(Date.parse(parsed.expiresAt))
						)
							return fail("state_corrupt");
						stored = { returnTo: parsed.returnTo, expiresAt: parsed.expiresAt };
					} catch {
						return fail("state_corrupt");
					}
					if (new Date(stored.expiresAt).getTime() < Date.now()) return fail("state_expired");

					// 换 openid + 资料
					let profile: { subject: string; nickname: string; avatarUrl: string };
					try {
						profile = await fetchQqProfile(ctx, config, code);
					} catch {
						return fail("provider_failed");
					}

					const member = await upsertMember(ctx, profile);
					if (!member) return fail("member_disabled");

					// 建会话 + 种 cookie，回 returnTo（同源）
					const session = await createSession(ctx, member);
					const target = new URL(qqReturnTarget(stored.returnTo, url));
					if (target.origin !== url.origin) {
						const ticket = randomToken();
						await ctx.kv.set(`oauth:bridge:${ticket}`, {
							sessionId: session.id,
							origin: target.origin,
							returnTo: target.href,
							expiresAt: Date.now() + 60_000,
						});
						const complete = new URL(
							"/_emdash/api/plugins/duanap-members/auth/qq/complete",
							target.origin,
						);
						complete.searchParams.set("ticket", ticket);
						return redirectResponse(complete.href, [clearCookieHeader(STATE_COOKIE)]);
					}
					return redirectResponse(target.pathname + target.search + target.hash, [
						sessionCookieHeader(ctx.request, session.id),
						clearCookieHeader(STATE_COOKIE),
					]);
				},
			},

			"auth/qq/complete": {
				public: true,
				methods: ["GET"],
				request: { body: "none" },
				response: "raw",
				handler: async (ctx) => {
					const url = new URL(ctx.request.url);
					const ticket = url.searchParams.get("ticket") ?? "";
					const fail = () => redirectResponse(loginUrlWith(url, "error=state_expired"), []);
					if (!BRIDGE_TICKET.test(ticket) || !isQqSiteOrigin(url.origin)) return fail();
					const key = `oauth:bridge:${ticket}`;
					const entry = await ctx.kv.getVersioned<{
						sessionId: string;
						origin: string;
						returnTo: string;
						expiresAt: number;
					}>(key);
					if (!entry || entry.value.origin !== url.origin || entry.value.expiresAt <= Date.now())
						return fail();
					const consumed = await ctx.kv.compareAndDelete(key, entry.revision);
					if (!consumed.applied) return fail();
					const session = await ctx.storage.sessions.get(entry.value.sessionId);
					if (
						!session ||
						typeof session !== "object" ||
						!("expiresAt" in session) ||
						typeof session.expiresAt !== "string" ||
						!(new Date(session.expiresAt).getTime() > Date.now())
					)
						return fail();
					const target = new URL(qqReturnTarget(entry.value.returnTo, url));
					if (target.origin !== url.origin) return fail();
					return redirectResponse(target.pathname + target.search + target.hash, [
						sessionCookieHeader(ctx.request, entry.value.sessionId),
					]);
				},
			},

			"auth/logout": {
				public: true,
				methods: ["POST"],
				request: { body: "none" },
				response: "raw",
				handler: async (ctx) => {
					const sessionId = readCookie(ctx.request.headers.get("cookie"), SESSION_COOKIE);
					if (sessionId) {
						await ctx.storage.sessions.delete(sessionId);
					}
					// JSON 信封清不了 Cookie，登出也走 raw
					return rawJson(200, { success: true, data: { loggedOut: true } }, [
						clearCookieHeader(SESSION_COOKIE),
					]);
				},
			},

			"activity/state": {
				public: true,
				methods: ["GET"],
				request: { body: "none" },
				handler: async (ctx) => {
					const url = new URL(ctx.request.url);
					const targetType = url.searchParams.get("targetType") ?? "";
					const targetId = url.searchParams.get("targetId") ?? "";
					const targetIds = url.searchParams.get("targetIds");

					// 批量：评论列表用它一次取回所有按钮状态（避免每个评论一次请求）
					if (targetIds) {
						const ids = targetIds
							.split(",")
							.map((value) => value.trim())
							.filter((value) => value.length > 0)
							.slice(0, BATCH_TARGET_LIMIT);
						if (ids.length === 0 || !ACTIVITY_TARGET_TYPES.has(targetType)) {
							return { ok: false, reason: "invalid_target" };
						}
						const member = await resolveMemberRecord(ctx.storage, ctx.request);
						const items = await Promise.all(
							ids.map(async (id) => {
								const state = await readActivityState(ctx, targetType, id, member);
								return {
									targetId: id,
									likeCount: state.likeCount,
									liked: state.liked,
								};
							}),
						);
						return { ok: true, items };
					}

					if (!isActivityTarget(targetType, targetId)) {
						return { ok: false, reason: "invalid_target" };
					}
					const member = await resolveMemberRecord(ctx.storage, ctx.request);
					return {
						ok: true,
						...decorateActivityState(
							await readActivityState(ctx, targetType, targetId, member),
							member,
						),
					};
				},
			},

			"activity/toggle": {
				public: true,
				methods: ["POST"],
				request: { body: "json" },
				handler: async (ctx) => {
					const input = isRecord(ctx.input) ? ctx.input : {};
					const kind: ActivityKind | null =
						input.kind === "favorite" ? "favorite" : input.kind === "like" ? "like" : null;
					const targetType = typeof input.targetType === "string" ? input.targetType : "";
					const targetId = typeof input.targetId === "string" ? input.targetId : "";
					const action = input.action === "remove" ? "remove" : "add";

					if (!kind || !isActivityTarget(targetType, targetId)) {
						return { ok: false, reason: "invalid_target" };
					}
					if (targetType === COMMENT_TARGET_TYPE && kind !== "like") {
						return { ok: false, reason: "invalid_target" };
					}

					const member = await resolveMemberRecord(ctx.storage, ctx.request);
					if (!member) return { ok: false, reason: "unauthorized" };

					if (!(await isPublishedTarget(ctx, targetType, targetId))) {
						return { ok: false, reason: "not_found" };
					}

					const result = await toggleActivity(ctx, kind, targetType, targetId, member, action);
					return { ok: true, kind, active: result.active, count: result.count };
				},
			},

			"member/profile": {
				public: true,
				methods: ["POST"],
				request: { body: "json" },
				handler: async (ctx) => {
					const entry = await resolveMemberEntry(ctx.storage, ctx.request);
					if (!entry) return { ok: false, reason: "unauthorized" };

					const input = isRecord(ctx.input) ? ctx.input : {};
					const validated = validateProfileUpdate(input);
					if (!validated.ok) {
						return { ok: false, reason: "invalid_profile", errors: validated.errors };
					}

					const customized = new Set(entry.member.customizedFields ?? []);
					for (const field of validated.changed) customized.add(field);

					const member: Member = {
						...entry.member,
						...validated.values,
						customizedFields: [...customized],
						updatedAt: new Date().toISOString(),
					};
					await ctx.storage.members.put(entry.id, member);

					return {
						ok: true,
						member: {
							displayName: member.displayName,
							avatarUrl: member.avatarUrl,
							bio: member.bio ?? "",
						},
						customizedFields: member.customizedFields,
					};
				},
			},

			"member/overview": {
				public: true,
				methods: ["GET"],
				request: { body: "none" },
				handler: async (ctx) => {
					const member = await resolveMemberRecord(ctx.storage, ctx.request);
					if (!member) return { ok: false, reason: "unauthorized" };
					const cursor = new URL(ctx.request.url).searchParams.get("favoritesCursor") ?? undefined;
					return { ok: true, ...(await readMemberOverview(ctx, member, cursor)) };
				},
			},
		},
	});
}

// ─── QQ OAuth（移植自旧站 qq-oauth.ts，出站走 ctx.http.fetch） ──────

async function readQqConfig(ctx: PluginContext): Promise<QqConfig | null> {
	const [clientId, clientSecret, callbackUrl, siteOrigin] = await Promise.all([
		ctx.settings.get<string>("qqClientId"),
		ctx.settings.get<string>("qqClientSecret"),
		ctx.settings.get<string>("qqCallbackUrl"),
		ctx.settings.get<string>("siteOrigin"),
	]);
	if (!clientId?.trim() || !clientSecret?.trim() || !callbackUrl?.trim()) return null;
	let callback: URL;
	try {
		callback = new URL(callbackUrl.trim());
	} catch {
		return null;
	}
	// 回调必须 https（本地开发例外），且指向本站插件回调路由
	if (
		!(
			callback.protocol === "https:" ||
			(callback.protocol === "http:" && ["localhost", "127.0.0.1"].includes(callback.hostname))
		)
	)
		return null;
	if (
		!isQqSiteOrigin(callback.origin) ||
		callback.username ||
		callback.password ||
		callback.search ||
		callback.hash
	)
		return null;
	if (
		!["/_emdash/api/plugins/duanap-members/auth/qq/callback", "/oauth/qq/callback"].includes(
			callback.pathname,
		)
	)
		return null;
	return {
		clientId: clientId.trim(),
		clientSecret: clientSecret.trim(),
		callbackUrl: callback.href,
		siteOrigin: (siteOrigin ?? "").trim(),
	};
}

async function qqFetch(ctx: PluginContext, target: URL): Promise<Response> {
	if (!ctx.http) throw new Error("network:request capability is unavailable");
	const response = await ctx.http.fetch(target.toString());
	if (!response.ok) throw new Error(`QQ HTTP ${response.status}`);
	return response;
}

function parseTokenResponse(value: string): Record<string, string> {
	const trimmed = value.trim();
	if (trimmed.startsWith("{")) {
		const parsed: unknown = JSON.parse(trimmed);
		if (!isRecord(parsed)) throw new Error("Invalid token response");
		return Object.fromEntries(
			Object.entries(parsed).map(([key, tokenValue]) => [
				key,
				typeof tokenValue === "string"
					? tokenValue
					: typeof tokenValue === "number" || typeof tokenValue === "boolean"
						? String(tokenValue)
						: "",
			]),
		);
	}
	return Object.fromEntries(new URLSearchParams(trimmed).entries());
}

function normalizeAvatar(value: unknown): string {
	const source = typeof value === "string" ? value.trim() : "";
	if (!source) return "";
	try {
		const url = new URL(source);
		if (url.protocol === "http:") url.protocol = "https:";
		return url.protocol === "https:" ? url.toString() : "";
	} catch {
		return "";
	}
}

async function fetchQqProfile(
	ctx: PluginContext,
	config: QqConfig,
	code: string,
): Promise<{ subject: string; nickname: string; avatarUrl: string }> {
	const tokenUrl = new URL("https://graph.qq.com/oauth2.0/token");
	tokenUrl.search = new URLSearchParams({
		grant_type: "authorization_code",
		client_id: config.clientId,
		client_secret: config.clientSecret,
		code,
		redirect_uri: config.callbackUrl,
		fmt: "json",
	}).toString();
	const token = parseTokenResponse(await (await qqFetch(ctx, tokenUrl)).text());
	const accessToken = token.access_token;
	if (!accessToken) throw new Error("no access_token");

	const meUrl = new URL("https://graph.qq.com/oauth2.0/me");
	meUrl.searchParams.set("access_token", accessToken);
	meUrl.searchParams.set("fmt", "json");
	const meText = (await (await qqFetch(ctx, meUrl)).text()).trim();
	// QQ 可能仍回 JSONP 包装；两种都兼容
	const jsonp = meText.match(QQ_JSONP_PATTERN);
	const meJson: unknown = JSON.parse(jsonp?.[1] ?? meText);
	const subject = isRecord(meJson) && typeof meJson.openid === "string" ? meJson.openid.trim() : "";
	if (!subject) throw new Error("no openid");

	const profileUrl = new URL("https://graph.qq.com/user/get_user_info");
	profileUrl.search = new URLSearchParams({
		access_token: accessToken,
		oauth_consumer_key: config.clientId,
		openid: subject,
		format: "json",
	}).toString();
	const profile: unknown = await (await qqFetch(ctx, profileUrl)).json();
	if (!isRecord(profile)) throw new Error("Invalid profile response");
	if (Number(profile.ret) !== 0) throw new Error(`profile ret=${String(profile.ret)}`);
	const nickname = typeof profile.nickname === "string" ? profile.nickname.trim().slice(0, 40) : "";
	return {
		subject,
		nickname: nickname || "QQ 用户",
		avatarUrl: normalizeAvatar(
			profile.figureurl_qq_2 ??
				profile.figureurl_2 ??
				profile.figureurl_qq_1 ??
				profile.figureurl_1,
		),
	};
}

// ─── 会员/会话存储 ──────────────────────────────────────────────────

async function upsertMember(
	ctx: PluginContext,
	profile: { subject: string; nickname: string; avatarUrl: string },
): Promise<Member | null> {
	const existing = await ctx.storage.members.query({
		where: { qqOpenid: profile.subject },
		limit: 1,
	});
	const now = new Date().toISOString();
	if (existing.items.length > 0) {
		const record = existing.items[0];
		const member = record.data;
		if (!isMember(member)) return null;
		if (member.status === "disabled") return null;
		// 昵称/头像默认跟随 QQ 资料，但用户手动改过的字段不再被覆盖
		const customized = new Set(member.customizedFields ?? []);
		const updated: Member = {
			...member,
			displayName: customized.has("displayName")
				? member.displayName
				: profile.nickname || member.displayName,
			avatarUrl: customized.has("avatarUrl")
				? member.avatarUrl
				: profile.avatarUrl || member.avatarUrl,
			updatedAt: now,
		};
		await ctx.storage.members.put(record.id, updated);
		return updated;
	}
	const id = `mem_${randomToken(12)}`;
	const member: Member = {
		displayName: profile.nickname,
		avatarUrl: profile.avatarUrl,
		status: "active",
		qqOpenid: profile.subject,
		createdAt: now,
		updatedAt: now,
	};
	await ctx.storage.members.put(id, member);
	return member;
}

async function createSession(
	ctx: PluginContext,
	member: Member,
): Promise<{ id: string; expiresAt: string }> {
	// 会话以 qqOpenid 锚定会员（一身份一会员模型）
	const id = `sess_${randomToken(24)}`;
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
	await ctx.storage.sessions.put(id, {
		memberId: member.qqOpenid,
		expiresAt,
		createdAt: new Date().toISOString(),
	} satisfies Session);
	return { id, expiresAt };
}

// ─── 请求侧辅助 ────────────────────────────────────────────────────

/** Cookie 会话 → 会员记录（含存储 id 与 openid；点赞/收藏按 openid 归属） */
async function resolveMemberEntry(
	storage: PluginContext["storage"],
	request: Request,
): Promise<{ id: string; member: Member } | null> {
	const sessionId = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
	if (!sessionId) return null;
	const session = await storage.sessions.get(sessionId);
	if (!isSession(session)) return null;
	if (new Date(session.expiresAt).getTime() < Date.now()) {
		await storage.sessions.delete(sessionId).catch(() => {});
		return null;
	}
	const found = await storage.members.query({
		where: { qqOpenid: session.memberId },
		limit: 1,
	});
	if (found.items.length === 0) return null;
	const record = found.items[0];
	const member = record.data;
	if (!isMember(member)) return null;
	if (member.status !== "active") return null;
	return { id: record.id, member };
}

async function resolveMemberRecord(
	storage: PluginContext["storage"],
	request: Request,
): Promise<Member | null> {
	return (await resolveMemberEntry(storage, request))?.member ?? null;
}

async function resolveMemberFromCookie(
	storage: PluginContext["storage"],
	request: Request,
): Promise<PublicMember | null> {
	const member = await resolveMemberRecord(storage, request);
	if (!member) return null;
	return { displayName: member.displayName, avatarUrl: member.avatarUrl };
}

function readCookie(header: string | null, name: string): string | null {
	if (!header) return null;
	const row = header.split("; ").find((c) => c.startsWith(`${name}=`));
	return row ? row.slice(name.length + 1) : null;
}

function isSecure(request: Request): boolean {
	const url = new URL(request.url);
	if (url.protocol === "https:") return true;
	// 反代场景：上游是 https
	const forwarded = request.headers.get("x-forwarded-proto");
	return forwarded?.split(",")[0]?.trim() === "https";
}

function stateCookieHeader(request: Request, state: string): string {
	return `${STATE_COOKIE}=${state}; Path=/; Max-Age=${Math.floor(STATE_TTL_MS / 1000)}; SameSite=Lax; HttpOnly${isSecure(request) ? "; Secure" : ""}`;
}

function sessionCookieHeader(request: Request, sessionId: string): string {
	return `${SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax; HttpOnly${isSecure(request) ? "; Secure" : ""}`;
}

function clearCookieHeader(name: string): string {
	return `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function randomToken(bytes = 32): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	let hex = "";
	for (const b of arr) hex += b.toString(16).padStart(2, "0");
	return hex;
}

function loginUrlWith(requestUrl: URL, query: string): string {
	const base = new URL("/login", requestUrl.origin);
	base.search = query;
	return base.pathname + base.search;
}

function redirectResponse(location: string, cookies: string[]) {
	// HeadersInit 数组形式：多 Set-Cookie 逐条保留（对象形式会被合并）
	const headers: Array<[string, string]> = [["location", location]];
	for (const cookie of cookies) headers.push(["set-cookie", cookie]);
	return pluginResponse({ status: 302, headers });
}

function rawJson(status: number, payload: unknown, cookies: string[]) {
	const headers: Array<[string, string]> = [["content-type", "application/json; charset=utf-8"]];
	for (const cookie of cookies) headers.push(["set-cookie", cookie]);
	return pluginResponse({
		status,
		headers,
		body: { kind: "text", value: JSON.stringify(payload) },
	});
}

// ─── 点赞/收藏（Phase 5.3，语义对齐旧站 member_likes/member_favorites） ──

export type ActivityKind = "like" | "favorite";

interface ActivityRecord {
	kind: ActivityKind;
	memberOpenid: string;
	targetType: string;
	targetId: string;
	createdAt: string;
}

export interface ActivityState {
	likeCount: number;
	favoriteCount: number;
	liked: boolean;
	favorited: boolean;
}

/** 可点赞/收藏的目标（旧站 article/life/project 对应这三个集合；评论单独用 comment） */
const ACTIVITY_TARGET_TYPES = new Set(["posts", "life", "projects", "comment"]);

/** 评论目标只允许点赞（旧站也没有"收藏评论"） */
const COMMENT_TARGET_TYPE = "comment";
const BATCH_TARGET_LIMIT = 50;

function isActivityTarget(targetType: string, targetId: string): boolean {
	return ACTIVITY_TARGET_TYPES.has(targetType) && targetId.length > 0 && targetId.length <= 64;
}

/** 记录 id 做成确定性主键：重复点赞是 upsert，取消是 delete，无需复合唯一索引 */
function activityRecordId(
	kind: ActivityKind,
	openid: string,
	targetType: string,
	targetId: string,
): string {
	return `${kind}:${openid}:${targetType}:${targetId}`;
}

async function isPublishedTarget(
	ctx: PluginContext,
	targetType: string,
	targetId: string,
): Promise<boolean> {
	// 评论目标：确认评论还在（评论可能已被删除）
	if (targetType === COMMENT_TARGET_TYPE) {
		if (!ctx.comments) return false;
		return (await ctx.comments.get(targetId)) !== null;
	}
	if (!ctx.content) return true;
	const item = await ctx.content.get(targetType, targetId);
	return item?.status === "published";
}

async function readActivityState(
	ctx: PluginContext,
	targetType: string,
	targetId: string,
	member: Member | null,
): Promise<ActivityState> {
	const [likeCount, favoriteCount] = await Promise.all([
		ctx.storage.activity.count({ targetType, targetId, kind: "like" }),
		ctx.storage.activity.count({ targetType, targetId, kind: "favorite" }),
	]);

	let liked = false;
	let favorited = false;
	if (member) {
		const [like, favorite] = await Promise.all([
			ctx.storage.activity.get(activityRecordId("like", member.qqOpenid, targetType, targetId)),
			ctx.storage.activity.get(activityRecordId("favorite", member.qqOpenid, targetType, targetId)),
		]);
		liked = like !== null;
		favorited = favorite !== null;
	}

	return { likeCount, favoriteCount, liked, favorited };
}

function decorateActivityState(state: ActivityState, member: Member | null) {
	return {
		...state,
		viewer: member ? { displayName: member.displayName, avatarUrl: member.avatarUrl } : null,
	};
}

async function toggleActivity(
	ctx: PluginContext,
	kind: ActivityKind,
	targetType: string,
	targetId: string,
	member: Member,
	action: "add" | "remove",
): Promise<{ active: boolean; count: number }> {
	const id = activityRecordId(kind, member.qqOpenid, targetType, targetId);
	if (action === "add") {
		await ctx.storage.activity.put(id, {
			kind,
			memberOpenid: member.qqOpenid,
			targetType,
			targetId,
			createdAt: new Date().toISOString(),
		});
	} else {
		await ctx.storage.activity.delete(id);
	}
	const count = await ctx.storage.activity.count({ targetType, targetId, kind });
	return { active: action === "add", count };
}

// ─── 会员中心（Phase 5.4） ─────────────────────────────────────────

export interface MemberFavoriteItem {
	targetType: string;
	targetId: string;
	title: string;
	path: string;
	createdAt: string;
}

export interface MemberCommentItem {
	id: string;
	body: string;
	status: string;
	collection: string;
	targetTitle: string;
	targetPath: string;
	createdAt: string;
}

export interface MemberOverview {
	comments: MemberCommentItem[];
	member: {
		displayName: string;
		avatarUrl: string;
		bio: string;
		createdAt: string;
		customizedFields: MemberProfileField[];
	};
	counts: { likes: number; favorites: number };
	favorites: MemberFavoriteItem[];
	favoritesCursor?: string;
	/** 本页中内容已下线或删除的收藏条数（列表里不会出现） */
	unavailableFavorites: number;
}

/** 每个集合的详情页前缀（与 seed 的 urlPattern 对应） */
const ACTIVITY_PATHS: Record<string, string> = {
	posts: "/posts/",
	life: "/life/",
	projects: "/projects/",
};

/** 会员评论身份：邮箱由 openid 派生，稳定且不暴露 openid 本身 */
const MEMBER_IDENTITY_DOMAIN = "members.duanap.cn";
const MEMBER_IDENTITY_PATTERN = /^member-[0-9a-f]{16}@members\.duanap\.cn$/;

interface MemberCommentRecord {
	memberRef: string;
	collection: string;
	contentId: string;
	targetTitle: string | null;
	targetSlug: string | null;
	createdAt: string;
}

async function memberIdentityEmail(openid: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(openid));
	const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
	return `member-${hex.slice(0, 16)}@${MEMBER_IDENTITY_DOMAIN}`;
}

const DISPLAY_NAME_MAX = 40;
const AVATAR_URL_MAX = 2048;
const BIO_MAX = 200;

/** 与旧站一致：只接受 https 头像；空串表示清空 */
function safeAvatar(value: string): string {
	if (!value) return "";
	try {
		const url = new URL(value);
		return url.protocol === "https:" ? url.toString() : "";
	} catch {
		return "";
	}
}

/**
 * 校验资料更新。字段缺省表示不改（与旧站 PATCH 语义一致）；
 * 返回稳定错误码，中文文案由页面映射。
 */
function validateProfileUpdate(
	input: Record<string, unknown>,
):
	| { ok: true; values: Partial<Member>; changed: MemberProfileField[] }
	| { ok: false; errors: string[] } {
	const errors: string[] = [];
	const values: Partial<Member> = {};
	const changed: MemberProfileField[] = [];

	if (input.displayName !== undefined) {
		const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
		if (!displayName || displayName.length > DISPLAY_NAME_MAX) {
			errors.push("display_name_invalid");
		} else {
			values.displayName = displayName;
			changed.push("displayName");
		}
	}

	if (input.avatarUrl !== undefined) {
		const raw = typeof input.avatarUrl === "string" ? input.avatarUrl.trim() : "";
		const avatarUrl = safeAvatar(raw);
		if (raw && (!avatarUrl || avatarUrl.length > AVATAR_URL_MAX)) {
			errors.push("avatar_url_invalid");
		} else {
			values.avatarUrl = avatarUrl;
			changed.push("avatarUrl");
		}
	}

	if (input.bio !== undefined) {
		const bio = typeof input.bio === "string" ? input.bio.trim() : "";
		if (bio.length > BIO_MAX) {
			errors.push("bio_too_long");
		} else {
			values.bio = bio;
			changed.push("bio");
		}
	}

	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, values, changed };
}

async function readMemberOverview(
	ctx: PluginContext,
	member: Member,
	cursor?: string,
): Promise<MemberOverview> {
	const [likeCount, favoriteCount, rows] = await Promise.all([
		ctx.storage.activity.count({ memberOpenid: member.qqOpenid, kind: "like" }),
		ctx.storage.activity.count({ memberOpenid: member.qqOpenid, kind: "favorite" }),
		ctx.storage.activity.query({
			where: { memberOpenid: member.qqOpenid, kind: "favorite" },
			orderBy: { createdAt: "desc" },
			limit: 20,
			cursor,
		}),
	]);
	const favorites = rows.items.map((row) => row.data).filter(isActivityRecord);

	const items: MemberFavoriteItem[] = [];
	for (const favorite of favorites) {
		const item = ctx.content ? await ctx.content.get(favorite.targetType, favorite.targetId) : null;
		// 与旧站一致：内容已下线/删除就不展示（但计数仍如实反映会员的操作）
		if (!item || item.status !== "published" || !item.slug) continue;
		const title = typeof item.data?.title === "string" ? item.data.title : item.slug;
		items.push({
			targetType: favorite.targetType,
			targetId: favorite.targetId,
			title,
			path: `${ACTIVITY_PATHS[favorite.targetType] ?? "/"}${item.slug}`,
			createdAt: favorite.createdAt,
		});
	}
	items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

	return {
		comments: await readMemberComments(ctx, member),
		member: {
			displayName: member.displayName,
			avatarUrl: member.avatarUrl,
			bio: member.bio ?? "",
			createdAt: member.createdAt,
			customizedFields: member.customizedFields ?? [],
		},
		counts: { likes: likeCount, favorites: favoriteCount },
		favorites: items,
		favoritesCursor: rows.cursor,
		unavailableFavorites: favorites.length - items.length,
	};
}

/** 每个集合对应的前台路径前缀；留言墙是单页，没有按 slug 的详情页 */
const COMMENT_TARGET_PATHS: Record<string, string> = {
	posts: "/posts/",
	life: "/life/",
	projects: "/projects/",
	pages: "/pages/",
	wall: "/messages",
};

const SINGLE_PAGE_COMMENT_TARGETS = new Set(["wall"]);
const COMMENT_TARGET_LABELS: Record<string, string> = {
	wall: "留言墙",
};

/** 会员中心最多展示的评论条数（避免一次渲染打太多评论查询） */
const MEMBER_COMMENT_LIMIT = 20;

async function readMemberComments(
	ctx: PluginContext,
	member: Member,
): Promise<MemberCommentItem[]> {
	if (!ctx.comments) return [];
	const memberRef = await memberIdentityEmail(member.qqOpenid);
	const records = await ctx.storage.memberComments.query({
		where: { memberRef },
		limit: MEMBER_COMMENT_LIMIT,
	});

	const items: MemberCommentItem[] = [];
	for (const record of records.items) {
		const attribution = record.data;
		if (!isMemberCommentRecord(attribution)) continue;
		// 以评论当前状态为准（可能已被审核、隐藏或清理）
		const comment = await ctx.comments.get(record.id);
		if (!comment) continue;
		const prefix = COMMENT_TARGET_PATHS[attribution.collection] ?? "/";
		const singlePage = SINGLE_PAGE_COMMENT_TARGETS.has(attribution.collection);
		items.push({
			id: comment.id,
			body: comment.body,
			status: comment.status,
			collection: attribution.collection,
			targetTitle:
				attribution.targetTitle ??
				COMMENT_TARGET_LABELS[attribution.collection] ??
				attribution.targetSlug ??
				attribution.collection,
			targetPath:
				singlePage || !attribution.targetSlug ? prefix : `${prefix}${attribution.targetSlug}`,
			createdAt: comment.createdAt,
		});
	}
	items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
	return items;
}

// ─── SSR 辅助（站点页面/布局直接导入） ──────────────────────────────

export interface PublicMember {
	displayName: string;
	avatarUrl: string;
}

/**
 * 从请求（Cookie 会话）解析当前会员。供 Astro 页面 SSR 使用；
 * 插件未激活（同进程 ctx 尚未捕获）返回 null。查询含过期清理。
 */
export async function getMemberFromRequest(request: Request): Promise<PublicMember | null> {
	if (!capturedCtx) return null;
	return resolveMemberFromCookie(capturedCtx.storage, request);
}

/**
 * 站点页面 SSR：当前访客的点赞/收藏开关状态。
 *
 * **匿名访客返回 null 且不产生任何查询**（页面热点路径不为未登录用户付费）；
 * 计数由客户端调 `activity/state` 拉取。插件未激活同样返回 null。
 */
export async function getViewerActivity(
	request: Request,
	targetType: string,
	targetId: string,
): Promise<{ liked: boolean; favorited: boolean } | null> {
	if (!capturedCtx || !isActivityTarget(targetType, targetId)) return null;
	const member = await resolveMemberRecord(capturedCtx.storage, request);
	if (!member) return null;
	const state = await readActivityState(capturedCtx, targetType, targetId, member);
	return { liked: state.liked, favorited: state.favorited };
}

/** 会员插件是否已激活（ctx 已捕获） */
export function isMembersPluginActive(): boolean {
	return capturedCtx !== null;
}
