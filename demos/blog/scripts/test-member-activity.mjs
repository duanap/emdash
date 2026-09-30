#!/usr/bin/env node
/**
 * Phase 5.3 点赞/收藏验证。
 *
 * 用桩化 PluginContext 直调插件真实路由处理器与 SSR 辅助函数，覆盖匿名/会员、
 * 幂等切换、计数、目标校验、停用与过期会话，以及 page:fragments 的 ctx 捕获路径。
 *
 * 注意：宿主会把请求体解析成 `ctx.input`、把 query 解析进 `ctx.request.url`，
 * 桩里必须自己补上这两件事，否则测的不是真实输入形状。
 *
 * 用法（Node >= 22.16）：
 *   node --experimental-strip-types scripts/test-member-activity.mjs
 */

import assert from "node:assert/strict";

import {
	createPlugin,
	getViewerActivity,
	isMembersPluginActive,
	SESSION_COOKIE,
} from "../member-plugin/index.ts";

const PLUGIN_BASE = "http://localhost:4321/_emdash/api/plugins/duanap-members";

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
	const collections = new Map();
	const contentById = new Map(Object.entries(options.content ?? {}));

	function collection(name) {
		if (!collections.has(name)) collections.set(name, new Map());
		const store = collections.get(name);

		// 宿主会拒绝查询未声明索引的字段；桩里照做，否则这类错误只能在真机上暴露
		function assertIndexed(where) {
			if (!where) return;
			const config = plugin.storage[name] ?? {};
			const indexed = new Set([...(config.indexes ?? []), ...(config.uniqueIndexes ?? [])]);
			for (const field of Object.keys(where)) {
				if (!indexed.has(field)) {
					throw new Error(`Cannot query on non-indexed field '${field}' (${name})`);
				}
			}
		}

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
				assertIndexed(queryOptions.where);
				let items = Array.from(store.entries(), ([id, data]) => ({
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
			async count(where) {
				const result = await this.query({ where });
				return result.items.length;
			},
		};
	}

	const ctx = {
		pluginId: "duanap-members",
		request: new Request(`${PLUGIN_BASE}/activity/state`),
		settings: { get: async () => undefined },
		kv: {
			get: async () => null,
			set: async () => {},
			delete: async () => {},
		},
		content: {
			get: async (collectionName, id) => {
				const entry = contentById.get(`${collectionName}:${id}`);
				if (!entry) return null;
				// 值可以是状态字符串，也可以是 { status, slug, title }
				const { status, slug, title } = typeof entry === "string" ? { status: entry } : entry;
				return {
					id,
					type: collectionName,
					status,
					slug: slug ?? id,
					data: { title: title ?? id },
				};
			},
		},
		storage: new Proxy({}, { get: (_target, name) => collection(String(name)) }),
	};

	return {
		ctx,
		rows(collectionName) {
			return collections.get(collectionName) ?? new Map();
		},
		async seedMember(id, data) {
			await collection("members").put(id, data);
		},
		async seedSession(id, data) {
			await collection("sessions").put(id, data);
		},
	};
}

const plugin = createPlugin();

/** 直调路由处理器；桩里手动补上宿主会做的 input 注入。 */
async function invoke(routeName, harness, request, input) {
	harness.ctx.request = request;
	harness.ctx.input = input;
	return plugin.routes[routeName].handler(harness.ctx);
}

const memberRecord = (overrides = {}) => ({
	displayName: "测试会员",
	avatarUrl: "https://thirdqq.qlogo.cn/x.png",
	status: "active",
	qqOpenid: "OPENID-1",
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	...overrides,
});

const future = () => new Date(Date.now() + 3600_000).toISOString();
const cookieFor = (sessionId) => `${SESSION_COOKIE}=${sessionId}`;

async function seedLoggedIn(harness, { member = memberRecord(), sessionId = "sess_1" } = {}) {
	await harness.seedMember("mem_1", member);
	await harness.seedSession(sessionId, {
		memberId: member.qqOpenid,
		expiresAt: future(),
		createdAt: new Date().toISOString(),
	});
	return sessionId;
}

function stateRequest(cookie, targetType = "posts", targetId = "p1") {
	const url = new URL(`${PLUGIN_BASE}/activity/state`);
	url.searchParams.set("targetType", targetType);
	url.searchParams.set("targetId", targetId);
	return new Request(url, { headers: cookie ? { cookie } : {} });
}

function toggle(harness, cookie, body) {
	const request = new Request(`${PLUGIN_BASE}/activity/toggle`, {
		method: "POST",
		headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
		body: JSON.stringify(body),
	});
	return invoke("activity/toggle", harness, request, body);
}

const likeBody = (targetType, targetId, action = "add") => ({
	kind: "like",
	targetType,
	targetId,
	action,
});

// ─── 路由：匿名与校验 ──────────────────────────────────────────────

await test("匿名 activity/state：计数为 0、未登录、viewer 为空", async () => {
	const harness = createHarness();
	const result = await invoke("activity/state", harness, stateRequest());
	assert.deepEqual(result, {
		ok: true,
		likeCount: 0,
		favoriteCount: 0,
		liked: false,
		favorited: false,
		viewer: null,
	});
});

await test("匿名 activity/toggle → unauthorized", async () => {
	const harness = createHarness();
	const result = await toggle(harness, null, likeBody("posts", "p1"));
	assert.deepEqual(result, { ok: false, reason: "unauthorized" });
	assert.equal(harness.rows("activity").size, 0);
});

await test("未知 kind 或集合 → invalid_target", async () => {
	const harness = createHarness();
	const sessionId = await seedLoggedIn(harness);

	const badKind = await toggle(harness, cookieFor(sessionId), {
		kind: "bookmark",
		targetType: "posts",
		targetId: "p1",
		action: "add",
	});
	assert.deepEqual(badKind, { ok: false, reason: "invalid_target" });

	const badType = await toggle(harness, cookieFor(sessionId), likeBody("pages", "p1"));
	assert.deepEqual(badType, { ok: false, reason: "invalid_target" });

	const emptyId = await toggle(harness, cookieFor(sessionId), likeBody("posts", ""));
	assert.deepEqual(emptyId, { ok: false, reason: "invalid_target" });
});

await test("未发布或不存在的目标 → not_found", async () => {
	const harness = createHarness({ content: { "posts:draft": "draft" } });
	const sessionId = await seedLoggedIn(harness);

	const draft = await toggle(harness, cookieFor(sessionId), likeBody("posts", "draft"));
	assert.deepEqual(draft, { ok: false, reason: "not_found" });

	const missing = await toggle(harness, cookieFor(sessionId), likeBody("posts", "nope"));
	assert.deepEqual(missing, { ok: false, reason: "not_found" });
	assert.equal(harness.rows("activity").size, 0);
});

// ─── 切换与计数 ───────────────────────────────────────────────────

await test("点赞一次 → active/count=1，状态与 SSR 视图同步", async () => {
	const harness = createHarness({ content: { "posts:p1": "published" } });
	const sessionId = await seedLoggedIn(harness);

	const like = await toggle(harness, cookieFor(sessionId), likeBody("posts", "p1"));
	assert.deepEqual(like, { ok: true, kind: "like", active: true, count: 1 });

	const state = await invoke("activity/state", harness, stateRequest(cookieFor(sessionId)));
	assert.equal(state.likeCount, 1);
	assert.equal(state.liked, true);
	assert.equal(state.favorited, false);
	assert.equal(state.viewer.displayName, "测试会员");
});

await test("重复点赞幂等（不产生第二行）", async () => {
	const harness = createHarness({ content: { "posts:p1": "published" } });
	const sessionId = await seedLoggedIn(harness);

	for (let index = 0; index < 3; index += 1) {
		const result = await toggle(harness, cookieFor(sessionId), likeBody("posts", "p1"));
		assert.equal(result.count, 1, `第 ${index + 1} 次点赞后计数应为 1`);
	}
	assert.equal(harness.rows("activity").size, 1);
});

await test("取消点赞 → count=0 且状态回落", async () => {
	const harness = createHarness({ content: { "posts:p1": "published" } });
	const sessionId = await seedLoggedIn(harness);

	await toggle(harness, cookieFor(sessionId), likeBody("posts", "p1"));
	const removed = await toggle(harness, cookieFor(sessionId), likeBody("posts", "p1", "remove"));
	assert.deepEqual(removed, { ok: true, kind: "like", active: false, count: 0 });

	const again = await toggle(harness, cookieFor(sessionId), likeBody("posts", "p1", "remove"));
	assert.equal(again.count, 0, "重复取消应无副作用");

	const state = await invoke("activity/state", harness, stateRequest(cookieFor(sessionId)));
	assert.equal(state.liked, false);
});

await test("收藏与点赞互不影响，同一目标可同时存在", async () => {
	const harness = createHarness({ content: { "life:l1": "published" } });
	const sessionId = await seedLoggedIn(harness);

	const favorite = await toggle(harness, cookieFor(sessionId), {
		kind: "favorite",
		targetType: "life",
		targetId: "l1",
		action: "add",
	});
	assert.deepEqual(favorite, { ok: true, kind: "favorite", active: true, count: 1 });

	const like = await toggle(harness, cookieFor(sessionId), likeBody("life", "l1"));
	assert.deepEqual(like, { ok: true, kind: "like", active: true, count: 1 });

	const state = await invoke(
		"activity/state",
		harness,
		stateRequest(cookieFor(sessionId), "life", "l1"),
	);
	assert.equal(state.likeCount, 1);
	assert.equal(state.favoriteCount, 1);
	assert.equal(state.liked, true);
	assert.equal(state.favorited, true);
});

await test("两个会员各自点赞 → 计数 2，各自状态独立", async () => {
	const harness = createHarness({ content: { "projects:pr1": "published" } });
	await seedLoggedIn(harness);
	await harness.seedMember("mem_2", memberRecord({ qqOpenid: "OPENID-2", displayName: "会员二" }));
	await harness.seedSession("sess_2", {
		memberId: "OPENID-2",
		expiresAt: future(),
		createdAt: new Date().toISOString(),
	});

	const first = await toggle(harness, cookieFor("sess_1"), likeBody("projects", "pr1"));
	const second = await toggle(harness, cookieFor("sess_2"), likeBody("projects", "pr1"));
	assert.equal(first.count, 1);
	assert.equal(second.count, 2);

	const anonymous = await invoke("activity/state", harness, stateRequest(null, "projects", "pr1"));
	assert.equal(anonymous.likeCount, 2);
	assert.equal(anonymous.liked, false);
});

// ─── 会话边界 ─────────────────────────────────────────────────────

await test("停用会员的会话不能点赞（按未登录处理）", async () => {
	const harness = createHarness({ content: { "posts:p1": "published" } });
	const sessionId = await seedLoggedIn(harness, { member: memberRecord({ status: "disabled" }) });
	const result = await toggle(harness, cookieFor(sessionId), likeBody("posts", "p1"));
	assert.deepEqual(result, { ok: false, reason: "unauthorized" });
});

await test("过期会话被清理且不能点赞", async () => {
	const harness = createHarness({ content: { "posts:p1": "published" } });
	await harness.seedMember("mem_1", memberRecord());
	await harness.seedSession("sess_expired", {
		memberId: "OPENID-1",
		expiresAt: new Date(Date.now() - 1000).toISOString(),
		createdAt: new Date().toISOString(),
	});

	const result = await toggle(harness, cookieFor("sess_expired"), likeBody("posts", "p1"));
	assert.deepEqual(result, { ok: false, reason: "unauthorized" });
	assert.equal(harness.rows("sessions").has("sess_expired"), false, "过期会话应被清理");
});

// ─── SSR 辅助 ─────────────────────────────────────────────────────

await test("插件未激活时 SSR 辅助返回 null", async () => {
	assert.equal(isMembersPluginActive(), false);
	assert.equal(await getViewerActivity(stateRequest(), "posts", "p1"), null);
});

await test("page:fragments 捕获 ctx 后，SSR 辅助给会员返回开关状态", async () => {
	const harness = createHarness({ content: { "posts:p1": "published" } });
	const sessionId = await seedLoggedIn(harness);

	await toggle(harness, cookieFor(sessionId), {
		kind: "favorite",
		targetType: "posts",
		targetId: "p1",
		action: "add",
	});

	const hook = plugin.hooks["page:fragments"];
	assert.ok(hook, "expected a page:fragments hook");
	await hook.handler({}, harness.ctx);

	assert.equal(isMembersPluginActive(), true);
	assert.deepEqual(await getViewerActivity(stateRequest(cookieFor(sessionId)), "posts", "p1"), {
		liked: false,
		favorited: true,
	});
	assert.equal(await getViewerActivity(stateRequest(), "posts", "p1"), null, "匿名应为 null");
	assert.equal(await getViewerActivity(stateRequest(cookieFor(sessionId)), "pages", "p1"), null);
});

// ─── 会员中心（Phase 5.4） ────────────────────────────────────────

function overviewRequest(cookie) {
	return new Request(`${PLUGIN_BASE}/member/overview`, { headers: cookie ? { cookie } : {} });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await test("匿名 member/overview → unauthorized", async () => {
	const harness = createHarness();
	const result = await invoke("member/overview", harness, overviewRequest());
	assert.deepEqual(result, { ok: false, reason: "unauthorized" });
});

await test("无互动的会员：计数为 0、收藏为空", async () => {
	const harness = createHarness();
	const sessionId = await seedLoggedIn(harness);
	const result = await invoke("member/overview", harness, overviewRequest(cookieFor(sessionId)));
	assert.equal(result.ok, true);
	assert.deepEqual(result.counts, { likes: 0, favorites: 0 });
	assert.deepEqual(result.favorites, []);
	assert.equal(result.unavailableFavorites, 0);
	assert.equal(result.member.displayName, "测试会员");
});

await test("收藏列表：解析标题与链接、按收藏时间倒序、点赞单独计数", async () => {
	const harness = createHarness({
		content: {
			"posts:p1": { status: "published", slug: "hello", title: "第一篇文章" },
			"projects:pr1": { status: "published", slug: "tool", title: "小工具" },
		},
	});
	const sessionId = await seedLoggedIn(harness);
	const cookie = cookieFor(sessionId);

	await toggle(harness, cookie, {
		kind: "favorite",
		targetType: "posts",
		targetId: "p1",
		action: "add",
	});
	await sleep(5);
	await toggle(harness, cookie, {
		kind: "favorite",
		targetType: "projects",
		targetId: "pr1",
		action: "add",
	});
	await toggle(harness, cookie, likeBody("posts", "p1"));

	const result = await invoke("member/overview", harness, overviewRequest(cookie));
	assert.equal(result.ok, true);
	assert.deepEqual(result.counts, { likes: 1, favorites: 2 });
	assert.deepEqual(
		result.favorites.map((item) => [item.targetType, item.title, item.path]),
		[
			["projects", "小工具", "/projects/tool"],
			["posts", "第一篇文章", "/posts/hello"],
		],
	);
	assert.equal(result.unavailableFavorites, 0);
});

await test("内容下线/未发布的收藏：列表隐藏但计入 unavailableFavorites", async () => {
	const harness = createHarness({
		content: {
			"posts:p1": { status: "published", slug: "hello", title: "第一篇" },
			"posts:draft": { status: "draft", slug: "draft", title: "草稿" },
		},
	});
	const sessionId = await seedLoggedIn(harness);
	const cookie = cookieFor(sessionId);

	await toggle(harness, cookie, {
		kind: "favorite",
		targetType: "posts",
		targetId: "p1",
		action: "add",
	});
	// 直接写存储：模拟"收藏之后内容被下线/删除"
	const put = harness.ctx.storage.activity.put;
	await put("favorite:OPENID-1:posts:draft", {
		kind: "favorite",
		memberOpenid: "OPENID-1",
		targetType: "posts",
		targetId: "draft",
		createdAt: new Date().toISOString(),
	});
	await put("favorite:OPENID-1:life:gone", {
		kind: "favorite",
		memberOpenid: "OPENID-1",
		targetType: "life",
		targetId: "gone",
		createdAt: new Date().toISOString(),
	});

	const result = await invoke("member/overview", harness, overviewRequest(cookie));
	assert.equal(result.counts.favorites, 3);
	assert.deepEqual(
		result.favorites.map((item) => item.title),
		["第一篇"],
	);
	assert.equal(result.unavailableFavorites, 2);
});

// ─── 报告 ─────────────────────────────────────────────────────────

console.log("\nduanap-members Phase 5.3（点赞/收藏）验证\n");
console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} 通过`);
if (failures > 0) {
	console.log(`${failures} 项失败`);
	process.exit(1);
}
