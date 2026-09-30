#!/usr/bin/env node
/**
 * Phase 5.1 会员插件（duanap-members）QQ OAuth 状态机验证。
 *
 * 用桩化的 PluginContext 直接调用插件的真实路由处理器，覆盖 start / callback /
 * status / logout 的成功与失败路径；出站 QQ 请求由 http.fetch 桩替代，因此不需要
 * 真实 QQ 互联凭据，也不产生网络流量。
 *
 * 用法（Node >= 22.16）：
 *   node --experimental-strip-types scripts/test-member-oauth.mjs
 */

import assert from "node:assert/strict";

import { createPlugin, SESSION_COOKIE, STATE_COOKIE } from "../member-plugin/index.ts";

const CALLBACK_URL = "http://localhost:4321/_emdash/api/plugins/duanap-members/auth/qq/callback";
const PLUGIN_BASE = "http://localhost:4321/_emdash/api/plugins/duanap-members";

const CONFIGURED_SETTINGS = {
	qqClientId: "TEST-CLIENT-ID",
	qqClientSecret: "TEST-CLIENT-SECRET",
	qqCallbackUrl: CALLBACK_URL,
	siteOrigin: "https://blog.duanap.cn",
};

const AVATAR_HTTP = "http://thirdqq.qlogo.cn/g?b=qq&nk=1&s=100";
const AVATAR_HTTPS = "https://thirdqq.qlogo.cn/g?b=qq&nk=1&s=100";

const results = [];
let failures = 0;

async function test(name, fn) {
	try {
		await fn();
		results.push(`  PASS  ${name}`);
	} catch (error) {
		failures += 1;
		results.push(`  FAIL  ${name}\n        ${error.message.split("\n").join("\n        ")}`);
	}
}

// ─── 桩化宿主 ───────────────────────────────────────────────────────

function createHarness(options = {}) {
	const settings = new Map(Object.entries(options.settings ?? {}));
	const kv = new Map();
	const collections = new Map();

	const httpFetch =
		options.httpFetch ??
		(async (url) => {
			if (url.includes("/oauth2.0/token")) {
				return new Response("access_token=ACCESS-TOKEN-1&expires_in=7776000", { status: 200 });
			}
			if (url.includes("/oauth2.0/me")) {
				return new Response('callback( {"client_id":"TEST-CLIENT-ID","openid":"OPENID-1"} );', {
					status: 200,
				});
			}
			if (url.includes("/user/get_user_info")) {
				return new Response(
					JSON.stringify({ ret: 0, nickname: "测试昵称", figureurl_qq_2: AVATAR_HTTP }),
					{ status: 200 },
				);
			}
			throw new Error(`unexpected outbound request: ${url}`);
		});

	function collection(name) {
		if (!collections.has(name)) collections.set(name, new Map());
		const store = collections.get(name);
		return {
			async get(id) {
				return store.has(id) ? structuredClone(store.get(id)) : null;
			},
			async put(id, data) {
				store.set(id, structuredClone(data));
			},
			async delete(id) {
				return store.delete(id);
			},
			async query(queryOptions = {}) {
				let items = [...store.entries()].map(([id, data]) => ({
					id,
					data: structuredClone(data),
				}));
				if (queryOptions.where) {
					items = items.filter((item) =>
						Object.entries(queryOptions.where).every(
							([key, value]) => (item.data ?? {})[key] === value,
						),
					);
				}
				if (queryOptions.limit) items = items.slice(0, queryOptions.limit);
				return { items, hasMore: false };
			},
		};
	}

	const ctx = {
		pluginId: "duanap-members",
		request: new Request(`${PLUGIN_BASE}/auth/status`),
		settings: { get: async (key) => settings.get(key) },
		kv: {
			get: async (key) => kv.get(key) ?? null,
			set: async (key, value) => {
				kv.set(key, value);
			},
			delete: async (key) => kv.delete(key),
		},
		http: {
			fetch: async (target) => httpFetch(String(target)),
		},
		storage: new Proxy({}, { get: (_target, name) => collection(String(name)) }),
	};

	return {
		ctx,
		kv,
		settings,
		put(collectionName, id, data) {
			return collection(collectionName).put(id, data);
		},
		rows(collectionName) {
			return collections.get(collectionName) ?? new Map();
		},
	};
}

const plugin = createPlugin();

/** 调用真实路由处理器；桩 ctx 只替换 request。 */
async function invoke(routeName, harness, request) {
	harness.ctx.request = request;
	return plugin.routes[routeName].handler(harness.ctx);
}

const statusRequest = (cookie) =>
	new Request(`${PLUGIN_BASE}/auth/status`, { headers: cookie ? { cookie } : {} });

function setCookies(response) {
	return response.headers
		.filter(([key]) => key.toLowerCase() === "set-cookie")
		.map(([, value]) => value);
}

function headerValue(response, name) {
	const found = response.headers.find(([key]) => key.toLowerCase() === name);
	return found ? found[1] : null;
}

function cookieValue(response, name) {
	const row = setCookies(response).find((value) => value.startsWith(`${name}=`));
	return row ? row.slice(name.length + 1).split(";")[0] : null;
}

function bodyText(response) {
	assert.ok(response.body, "expected a response body");
	assert.equal(response.body.kind, "text");
	return response.body.value;
}

function errorCodeFromLocation(response) {
	const location = headerValue(response, "location");
	assert.ok(location, "expected a location header");
	return new URL(location, PLUGIN_BASE).searchParams.get("error");
}

/** 走一遍 start，拿到可复用的 state（cookie 与 KV 均已就绪）。 */
async function startFlow(harness, returnTo = "/posts") {
	const startUrl = `${PLUGIN_BASE}/auth/qq/start?returnTo=${encodeURIComponent(returnTo)}`;
	const response = await invoke("auth/qq/start", harness, new Request(startUrl));
	const state = cookieValue(response, STATE_COOKIE);
	assert.ok(state, "expected a state cookie from auth/qq/start");
	const authorizeUrl = bodyText(response).match(/url=([^"]+)"/)?.[1];
	assert.ok(authorizeUrl, "expected a meta refresh target");
	const authorize = new URL(authorizeUrl.replace(/&amp;/g, "&"));
	return { response, state, authorize };
}

function callbackRequest({ state, cookie = state, code = "TEST-CODE", error = null }) {
	const url = new URL(`${PLUGIN_BASE}/auth/qq/callback`);
	if (error) url.searchParams.set("error", error);
	if (state !== undefined) url.searchParams.set("state", state);
	if (code !== null) url.searchParams.set("code", code);
	return new Request(url, { headers: cookie ? { cookie: `${STATE_COOKIE}=${cookie}` } : {} });
}

/** 完成一次登录，返回会话 id 与响应。 */
async function loginOnce(harness, returnTo = "/") {
	const { state } = await startFlow(harness, returnTo);
	const response = await invoke("auth/qq/callback", harness, callbackRequest({ state }));
	return { response, sessionId: cookieValue(response, SESSION_COOKIE) };
}

// ─── 未配置：全部失败路径都应优雅跳回登录页 ─────────────────────────

await test("未配置时 auth/status 返回 qqConfigured=false", async () => {
	const harness = createHarness();
	const result = await invoke("auth/status", harness, statusRequest());
	assert.equal(result.success, true);
	assert.equal(result.data.qqConfigured, false);
	assert.equal(result.data.loggedIn, false);
});

await test("未配置时 auth/qq/start 302 回登录页并清掉 state cookie", async () => {
	const harness = createHarness();
	const response = await invoke(
		"auth/qq/start",
		harness,
		new Request(`${PLUGIN_BASE}/auth/qq/start`),
	);
	assert.equal(response.status, 302);
	assert.equal(headerValue(response, "location"), "/login?error=not_configured");
	assert.ok(
		setCookies(response).some((value) => value.startsWith(`${STATE_COOKIE}=;`)),
		"expected the state cookie to be cleared",
	);
});

await test("未配置时 auth/qq/callback 302 回登录页", async () => {
	const harness = createHarness();
	const response = await invoke(
		"auth/qq/callback",
		harness,
		new Request(`${PLUGIN_BASE}/auth/qq/callback?state=x&code=y`),
	);
	assert.equal(response.status, 302);
	assert.equal(errorCodeFromLocation(response), "not_configured");
});

await test("callbackUrl 不是本站回调路由时视为未配置", async () => {
	const harness = createHarness({
		settings: { ...CONFIGURED_SETTINGS, qqCallbackUrl: "https://blog.duanap.cn/other" },
	});
	const response = await invoke(
		"auth/qq/start",
		harness,
		new Request(`${PLUGIN_BASE}/auth/qq/start`),
	);
	assert.equal(errorCodeFromLocation(response), "not_configured");
});

// ─── 已配置：start 生成 state 并跳转 QQ ─────────────────────────────

await test("auth/qq/start 返回跳转页 + 一次性 state（cookie 与 KV 双写）", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const { response, state, authorize } = await startFlow(harness);
	assert.equal(response.status, 200);
	assert.match(headerValue(response, "content-type"), /text\/html/);
	assert.equal(authorize.origin, "https://graph.qq.com");
	assert.equal(authorize.searchParams.get("client_id"), "TEST-CLIENT-ID");
	assert.equal(authorize.searchParams.get("redirect_uri"), CALLBACK_URL);
	assert.equal(authorize.searchParams.get("scope"), "get_user_info");
	assert.equal(authorize.searchParams.get("state"), state);
	const cookie = setCookies(response).find((value) => value.startsWith(`${STATE_COOKIE}=`));
	assert.match(cookie, /HttpOnly/);
	assert.match(cookie, /SameSite=Lax/);
	assert.ok(harness.kv.has(`oauth:state:${state}`), "expected the state to be stored in KV");
});

// ─── returnTo 白名单（开放重定向防护） ──────────────────────────────

await test("returnTo 拒绝外站绝对地址，回落到 /", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const { state } = await startFlow(harness, "https://evil.example/steal");
	assert.equal(JSON.parse(harness.kv.get(`oauth:state:${state}`)).returnTo, "/");
});

await test("returnTo 拒绝协议相对地址 //evil.example", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const { state } = await startFlow(harness, "//evil.example/steal");
	assert.equal(JSON.parse(harness.kv.get(`oauth:state:${state}`)).returnTo, "/");
});

await test("returnTo 允许配置的 siteOrigin 绝对地址并保留路径与查询", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const { state } = await startFlow(harness, "https://blog.duanap.cn/posts?tag=astro");
	assert.equal(JSON.parse(harness.kv.get(`oauth:state:${state}`)).returnTo, "/posts?tag=astro");
});

// ─── callback：成功路径 ────────────────────────────────────────────

await test("callback 成功：建会员 + 建会话 + 302 回 returnTo", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const { state } = await startFlow(harness, "/posts/hello");
	const response = await invoke("auth/qq/callback", harness, callbackRequest({ state }));

	assert.equal(response.status, 302);
	assert.equal(headerValue(response, "location"), "/posts/hello");
	const sessionId = cookieValue(response, SESSION_COOKIE);
	assert.ok(sessionId?.startsWith("sess_"), "expected a new session cookie");

	const members = [...harness.rows("members").values()];
	assert.equal(members.length, 1);
	assert.equal(members[0].qqOpenid, "OPENID-1");
	assert.equal(members[0].displayName, "测试昵称");
	// http 头像必须升级到 https，否则前台会出现混合内容告警
	assert.equal(members[0].avatarUrl, AVATAR_HTTPS);
	assert.equal(members[0].status, "active");

	const session = harness.rows("sessions").get(sessionId);
	assert.ok(session, "expected the session record");
	assert.equal(session.memberId, "OPENID-1");
	const ttl = new Date(session.expiresAt).getTime() - Date.now();
	assert.ok(ttl > 6.9 * 24 * 3600_000 && ttl <= 7 * 24 * 3600_000, `session TTL out of range: ${ttl}`);

	assert.ok(
		setCookies(response).some((value) => value.startsWith(`${STATE_COOKIE}=;`)),
		"expected the state cookie to be cleared after login",
	);
});

await test("callback 成功后 auth/status 反映登录态", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const { sessionId } = await loginOnce(harness);
	const status = await invoke(
		"auth/status",
		harness,
		statusRequest(`${SESSION_COOKIE}=${sessionId}`),
	);
	assert.equal(status.data.loggedIn, true);
	assert.deepEqual(status.data.member, { displayName: "测试昵称", avatarUrl: AVATAR_HTTPS });
});

await test("同一 openid 二次登录更新资料且不产生第二个会员", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	await loginOnce(harness);
	const memberIdBefore = [...harness.rows("members").keys()][0];

	harness.ctx.http = {
		fetch: async (target) => {
			const url = String(target);
			if (url.includes("/oauth2.0/token")) {
				return new Response("access_token=ACCESS-TOKEN-2", { status: 200 });
			}
			if (url.includes("/oauth2.0/me")) {
				return new Response('callback( {"openid":"OPENID-1"} );', { status: 200 });
			}
			return new Response(
				JSON.stringify({
					ret: 0,
					nickname: "新昵称",
					figureurl_qq_2: "https://thirdqq.qlogo.cn/new.png",
				}),
				{ status: 200 },
			);
		},
	};

	await loginOnce(harness);

	const members = [...harness.rows("members").entries()];
	assert.equal(members.length, 1, "expected the member to be updated, not duplicated");
	assert.equal(members[0][0], memberIdBefore);
	assert.equal(members[0][1].displayName, "新昵称");
	assert.equal(members[0][1].avatarUrl, "https://thirdqq.qlogo.cn/new.png");
});

// ─── callback：失败路径 ────────────────────────────────────────────

await test("callback 缺 code/state → invalid_response", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const response = await invoke(
		"auth/qq/callback",
		harness,
		callbackRequest({ state: undefined, code: null }),
	);
	assert.equal(errorCodeFromLocation(response), "invalid_response");
});

await test("callback state 与 cookie 不一致 → state_mismatch", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const { state } = await startFlow(harness);
	const response = await invoke(
		"auth/qq/callback",
		harness,
		callbackRequest({ state, cookie: "tampered-state" }),
	);
	assert.equal(errorCodeFromLocation(response), "state_mismatch");
});

await test("callback state 未在 KV 中（伪造/过期）→ state_expired", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const response = await invoke(
		"auth/qq/callback",
		harness,
		callbackRequest({ state: "never-issued", cookie: "never-issued" }),
	);
	assert.equal(errorCodeFromLocation(response), "state_expired");
});

await test("callback state 一次性：重放同一 state → state_expired", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const { state } = await startFlow(harness, "/");
	const first = await invoke("auth/qq/callback", harness, callbackRequest({ state }));
	assert.equal(first.status, 302);
	assert.equal(headerValue(first, "location"), "/");

	const replay = await invoke("auth/qq/callback", harness, callbackRequest({ state }));
	assert.equal(errorCodeFromLocation(replay), "state_expired");
	assert.equal(harness.rows("members").size, 1, "replay must not create a second member");
});

await test("callback 收到 QQ 拒绝授权 → denied", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const response = await invoke(
		"auth/qq/callback",
		harness,
		callbackRequest({ state: undefined, code: null, error: "access_denied" }),
	);
	assert.equal(errorCodeFromLocation(response), "denied");
});

await test("callback 换 token 失败 → provider_failed", async () => {
	const harness = createHarness({
		settings: CONFIGURED_SETTINGS,
		httpFetch: async () => new Response("error=100019", { status: 200 }),
	});
	const { state } = await startFlow(harness);
	const response = await invoke("auth/qq/callback", harness, callbackRequest({ state }));
	assert.equal(errorCodeFromLocation(response), "provider_failed");
	assert.equal(harness.rows("members").size, 0);
});

await test("get_user_info ret != 0 → provider_failed", async () => {
	const harness = createHarness({
		settings: CONFIGURED_SETTINGS,
		httpFetch: async (url) => {
			if (url.includes("/oauth2.0/token")) return new Response("access_token=T", { status: 200 });
			if (url.includes("/oauth2.0/me")) {
				return new Response('callback( {"openid":"OPENID-9"} );', { status: 200 });
			}
			return new Response(JSON.stringify({ ret: 100030, msg: "no permission" }), { status: 200 });
		},
	});
	const { state } = await startFlow(harness);
	const response = await invoke("auth/qq/callback", harness, callbackRequest({ state }));
	assert.equal(errorCodeFromLocation(response), "provider_failed");
});

await test("被停用的会员不能登录 → member_disabled", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	await harness.put("members", "mem_disabled", {
		displayName: "封禁用户",
		avatarUrl: "",
		status: "disabled",
		qqOpenid: "OPENID-1",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
	const { state } = await startFlow(harness);
	const response = await invoke("auth/qq/callback", harness, callbackRequest({ state }));
	assert.equal(errorCodeFromLocation(response), "member_disabled");
	assert.equal(harness.rows("sessions").size, 0, "disabled member must not get a session");
});

// ─── 会话解析与登出 ────────────────────────────────────────────────

await test("无 Cookie / 未知会话的 auth/status 都是未登录", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const anonymous = await invoke("auth/status", harness, statusRequest());
	assert.equal(anonymous.data.loggedIn, false);

	const unknown = await invoke(
		"auth/status",
		harness,
		statusRequest(`${SESSION_COOKIE}=sess_unknown`),
	);
	assert.equal(unknown.data.loggedIn, false);
});

await test("过期会话既不解出会员，也会被清掉", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	await harness.put("members", "mem_1", {
		displayName: "会员一",
		avatarUrl: "",
		status: "active",
		qqOpenid: "OPENID-1",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
	await harness.put("sessions", "sess_expired", {
		memberId: "OPENID-1",
		expiresAt: new Date(Date.now() - 1000).toISOString(),
		createdAt: new Date().toISOString(),
	});

	const status = await invoke(
		"auth/status",
		harness,
		statusRequest(`${SESSION_COOKIE}=sess_expired`),
	);
	assert.equal(status.data.loggedIn, false);
	assert.equal(harness.rows("sessions").has("sess_expired"), false, "expired session should be pruned");
});

await test("会员被停用后既有会话立即失效", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	await harness.put("members", "mem_1", {
		displayName: "会员一",
		avatarUrl: "",
		status: "disabled",
		qqOpenid: "OPENID-1",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
	await harness.put("sessions", "sess_1", {
		memberId: "OPENID-1",
		expiresAt: new Date(Date.now() + 3600_000).toISOString(),
		createdAt: new Date().toISOString(),
	});
	const status = await invoke("auth/status", harness, statusRequest(`${SESSION_COOKIE}=sess_1`));
	assert.equal(status.data.loggedIn, false);
});

await test("auth/logout 删除会话并清 Cookie", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	await harness.put("sessions", "sess_logout", {
		memberId: "OPENID-1",
		expiresAt: new Date(Date.now() + 3600_000).toISOString(),
		createdAt: new Date().toISOString(),
	});
	const response = await invoke(
		"auth/logout",
		harness,
		new Request(`${PLUGIN_BASE}/auth/logout`, {
			method: "POST",
			headers: { cookie: `${SESSION_COOKIE}=sess_logout` },
		}),
	);
	assert.equal(response.status, 200);
	assert.deepEqual(JSON.parse(bodyText(response)), { success: true, data: { loggedOut: true } });
	assert.ok(
		setCookies(response).some((value) => value.startsWith(`${SESSION_COOKIE}=;`)),
		"expected the session cookie to be cleared",
	);
	assert.equal(harness.rows("sessions").has("sess_logout"), false);
});

await test("auth/logout 无 Cookie 也返回成功（幂等）", async () => {
	const harness = createHarness({ settings: CONFIGURED_SETTINGS });
	const response = await invoke(
		"auth/logout",
		harness,
		new Request(`${PLUGIN_BASE}/auth/logout`, { method: "POST" }),
	);
	assert.equal(response.status, 200);
});

// ─── 报告 ─────────────────────────────────────────────────────────

console.log("\nduanap-members Phase 5.1 验证\n");
console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} 通过`);
if (failures > 0) {
	console.log(`${failures} 项失败`);
	process.exit(1);
}
