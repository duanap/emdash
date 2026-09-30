/**
 * duanap-members — 会员体系 Native 插件（Phase 5.1：QQ 登录）
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
 *
 * 配置（管理后台 → 插件设置）：qqClientId / qqClientSecret(secret) /
 * qqCallbackUrl / siteOrigin（returnTo 白名单基址，生产 https://blog.duanap.cn）
 */

import { definePlugin, pluginResponse } from "emdash";
import type { PluginDescriptor, PluginContext, ResolvedPlugin, RouteContext } from "emdash";

const PLUGIN_ID = "duanap-members";
const VERSION = "0.2.0";

export const SESSION_COOKIE = "dm_session";
export const STATE_COOKIE = "dm_state";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
/** QQ /oauth2.0/me 可能仍返回 JSONP 包装 */
const QQ_JSONP_PATTERN = /^[^(]*\(\s*(\{[\s\S]*\})\s*\)\s*;?$/;

// ─── 类型 ───────────────────────────────────────────────────────────

export interface Member {
	displayName: string;
	avatarUrl: string;
	status: "active" | "disabled";
	qqOpenid: string;
	createdAt: string;
	updatedAt: string;
}

interface Session {
	memberId: string;
	expiresAt: string;
	createdAt: string;
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
		capabilities: ["network:request", "hooks.page-fragments:register"],
		allowedHosts: ["graph.qq.com"],
		storage: {
			members: { indexes: ["status"], uniqueIndexes: ["qqOpenid"] },
			sessions: { indexes: ["memberId"] },
		},
	};
}

// ─── 插件实现 ───────────────────────────────────────────────────────

export function createPlugin(_options: Record<string, never> = {}): ResolvedPlugin {
	return definePlugin({
		id: PLUGIN_ID,
		version: VERSION,
		capabilities: ["network:request", "hooks.page-fragments:register"],
		allowedHosts: ["graph.qq.com"],

		storage: {
			members: { indexes: ["status"] as const, uniqueIndexes: ["qqOpenid"] as const },
			sessions: { indexes: ["memberId"] as const },
		},

		admin: {
			settingsSchema: {
				qqClientId: { type: "string", label: "QQ 互联 Client ID" },
				qqClientSecret: { type: "secret", label: "QQ 互联 Client Secret" },
				qqCallbackUrl: {
					type: "string",
					label: "QQ 回调地址",
					description: "填到 QQ 互联的 redirect_uri，如 https://blog.duanap.cn/_emdash/api/plugins/duanap-members/auth/qq/callback",
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
					const member = await resolveMemberFromRequest(ctx);
					return {
						success: true,
						data: {
							loggedIn: member !== null,
							member: member
								? {
										displayName: member.displayName,
										avatarUrl: member.avatarUrl,
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
					const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"), config);

					if (!config) {
						// 未配置：跳回登录页带错误码（同源 302 合规）
						return redirectResponse(
							loginUrlWith(url, "error=not_configured"),
							[
								clearCookieHeader(STATE_COOKIE),
							],
						);
					}

					// state：32 字节随机 + KV 存储一次性值 + Cookie 双校验
					const state = randomToken();
					await ctx.kv.set(`oauth:state:${state}`, JSON.stringify({
						returnTo,
						expiresAt: new Date(Date.now() + STATE_TTL_MS).toISOString(),
					}));

					const authorizeUrl = new URL("https://graph.qq.com/oauth2.0/authorize");
					authorizeUrl.searchParams.set("response_type", "code");
					authorizeUrl.searchParams.set("client_id", config.clientId);
					authorizeUrl.searchParams.set("redirect_uri", config.callbackUrl);
					authorizeUrl.searchParams.set("scope", "get_user_info");
					authorizeUrl.searchParams.set("state", state);

					// trusted 插件的 raw 路由允许跨域 Location（见 changeset
					// trusted-plugin-route-cookies），直接 302 到 QQ 授权页。
					return redirectResponse(authorizeUrl.toString(), [
						stateCookieHeader(ctx.request, state),
					]);
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
					if (!config) return redirectResponse(loginUrlWith(url, "error=not_configured"), [clearCookieHeader(STATE_COOKIE)]);

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
						stored = JSON.parse(storedRaw) as { returnTo: string; expiresAt: string };
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
					return redirectResponse(stored.returnTo, [
						sessionCookieHeader(ctx.request, session.id),
						clearCookieHeader(STATE_COOKIE),
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
	if (!clientId || !clientSecret || !callbackUrl) return null;
	let callback: URL;
	try {
		callback = new URL(callbackUrl);
	} catch {
		return null;
	}
	// 回调必须 https（本地开发例外），且指向本站插件回调路由
	if (
		!(callback.protocol === "https:" ||
			(callback.protocol === "http:" && ["localhost", "127.0.0.1"].includes(callback.hostname)))
	) return null;
	if (!callback.pathname.endsWith("/auth/qq/callback")) return null;
	return {
		clientId,
		clientSecret,
		callbackUrl: callbackUrl,
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
		const parsed = JSON.parse(trimmed) as Record<string, unknown>;
		return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v ?? "")]));
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
	const meJson = JSON.parse(jsonp?.[1] ?? meText) as { openid?: unknown };
	const subject = typeof meJson.openid === "string" ? meJson.openid.trim() : "";
	if (!subject) throw new Error("no openid");

	const profileUrl = new URL("https://graph.qq.com/user/get_user_info");
	profileUrl.search = new URLSearchParams({
		access_token: accessToken,
		oauth_consumer_key: config.clientId,
		openid: subject,
		format: "json",
	}).toString();
	const profile = (await (await qqFetch(ctx, profileUrl)).json()) as Record<string, unknown>;
	if (Number(profile.ret) !== 0) throw new Error(`profile ret=${String(profile.ret)}`);
	const nickname = typeof profile.nickname === "string" ? profile.nickname.trim().slice(0, 40) : "";
	return {
		subject,
		nickname: nickname || "QQ 用户",
		avatarUrl: normalizeAvatar(
			profile.figureurl_qq_2 ?? profile.figureurl_2 ?? profile.figureurl_qq_1 ?? profile.figureurl_1,
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
		const record = existing.items[0]!;
		const member = record.data as Member;
		if (member.status === "disabled") return null;
		// 昵称/头像跟随 QQ 资料
		const updated: Member = {
			...member,
			displayName: profile.nickname || member.displayName,
			avatarUrl: profile.avatarUrl || member.avatarUrl,
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

/** 路由侧：从当前请求（Cookie 会话）解析会员 */
async function resolveMemberFromRequest(ctx: RouteContext): Promise<PublicMember | null> {
	return resolveMemberFromCookie(ctx.storage, ctx.request);
}

async function resolveMemberFromCookie(
	storage: PluginContext["storage"],
	request: Request,
): Promise<PublicMember | null> {
	const sessionId = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
	if (!sessionId) return null;
	const session = (await storage.sessions.get(sessionId)) as Session | null;
	if (!session) return null;
	if (new Date(session.expiresAt).getTime() < Date.now()) {
		await storage.sessions.delete(sessionId).catch(() => {});
		return null;
	}
	const found = await storage.members.query({
		where: { qqOpenid: session.memberId },
		limit: 1,
	});
	if (found.items.length === 0) return null;
	const member = found.items[0]!.data as Member;
	if (member.status !== "active") return null;
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

function sanitizeReturnTo(value: string | null, config: QqConfig | null): string {
	const fallback = "/";
	if (!value) return fallback;
	try {
		const target = new URL(value, "https://example.invalid");
		// 仅允许同源路径（相对或同 origin 绝对），拒绝外站跳转
		if (target.origin !== "https://example.invalid") {
			const allowed = config?.siteOrigin ? new URL(config.siteOrigin).origin : null;
			if (!allowed || target.origin !== allowed) return fallback;
			return target.pathname + target.search;
		}
		if (!target.pathname.startsWith("/") || target.pathname.startsWith("//")) return fallback;
		return target.pathname + target.search;
	} catch {
		return fallback;
	}
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
	const headers: Array<[string, string]> = [
		["content-type", "application/json; charset=utf-8"],
	];
	for (const cookie of cookies) headers.push(["set-cookie", cookie]);
	return pluginResponse({
		status,
		headers,
		body: { kind: "text", value: JSON.stringify(payload) },
	});
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

/** 会员插件是否已激活（ctx 已捕获） */
export function isMembersPluginActive(): boolean {
	return capturedCtx !== null;
}
