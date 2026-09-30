#!/usr/bin/env node
/**
 * Phase 5.4 会员中心验证（公开路由 member/overview）。
 *
 * 页面本身走客户端取数（页面 frontmatter 早于布局渲染，拿不到 hook 捕获的插件
 * 上下文 —— 真机实测过），所以这里测的是这条路由的契约：会话鉴权、资料、计数、
 * 收藏列表的标题/链接解析、内容下线后的不可见计数。
 *
 * 用法（Node >= 22.16）：
 *   node --experimental-strip-types scripts/test-member-center.mjs
 */

import assert from "node:assert/strict";

import { createPlugin, SESSION_COOKIE } from "../member-plugin/index.ts";

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

const plugin = createPlugin();

function createHarness(content = {}) {
	const collections = new Map();
	const contentById = new Map(Object.entries(content));

	function collection(name) {
		if (!collections.has(name)) collections.set(name, new Map());
		const store = collections.get(name);

		// 与宿主同规则：where 里的字段必须已声明索引
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
				let items = Array.from(store.entries(), ([id, data]) => ({ id, data: structuredClone(data) }));
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
				return (await this.query({ where })).items.length;
			},
		};
	}

	const ctx = {
		pluginId: "duanap-members",
		request: new Request(`${PLUGIN_BASE}/member/overview`),
		settings: { get: async () => undefined },
		kv: { get: async () => null, set: async () => {}, delete: async () => {} },
		content: {
			get: async (collectionName, id) => {
				const entry = contentById.get(`${collectionName}:${id}`);
				if (!entry) return null;
				return {
					id,
					type: collectionName,
					status: entry.status,
					slug: entry.slug ?? id,
					data: { title: entry.title ?? id },
				};
			},
		},
		storage: new Proxy({}, { get: (_target, name) => collection(String(name)) }),
	};

	return {
		ctx,
		async seedMember(member, sessionId = "sess_a") {
			await ctx.storage.members.put("mem_a", member);
			await ctx.storage.sessions.put(sessionId, {
				memberId: member.qqOpenid,
				expiresAt: new Date(Date.now() + 3600_000).toISOString(),
				createdAt: new Date().toISOString(),
			});
		},
		async seedActivity(kind, targetType, targetId, createdAt, openid) {
			await ctx.storage.activity.put(`${kind}:${openid}:${targetType}:${targetId}`, {
				kind,
				memberOpenid: openid,
				targetType,
				targetId,
				createdAt,
			});
		},
	};
}

const MEMBER = {
	displayName: "会员甲",
	avatarUrl: "https://thirdqq.qlogo.cn/a.png",
	status: "active",
	qqOpenid: "OPENID-A",
	createdAt: "2026-09-01T00:00:00.000Z",
	updatedAt: "2026-09-01T00:00:00.000Z",
};

function overviewRequest(cookie) {
	return new Request(`${PLUGIN_BASE}/member/overview`, { headers: cookie ? { cookie } : {} });
}

async function overview(harness, cookie) {
	harness.ctx.request = overviewRequest(cookie);
	return plugin.routes["member/overview"].handler(harness.ctx);
}

// ─── 鉴权 ─────────────────────────────────────────────────────────

await test("匿名访问 → unauthorized", async () => {
	const harness = createHarness();
	assert.deepEqual(await overview(harness, null), { ok: false, reason: "unauthorized" });
});

await test("未知会话 → unauthorized", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);
	assert.deepEqual(await overview(harness, `${SESSION_COOKIE}=sess_unknown`), {
		ok: false,
		reason: "unauthorized",
	});
});

await test("停用会员 → unauthorized", async () => {
	const harness = createHarness();
	await harness.seedMember({ ...MEMBER, status: "disabled" });
	assert.deepEqual(await overview(harness, `${SESSION_COOKIE}=sess_a`), {
		ok: false,
		reason: "unauthorized",
	});
});

await test("过期会话 → unauthorized 且会话被清理", async () => {
	const harness = createHarness();
	await harness.ctx.storage.members.put("mem_a", MEMBER);
	await harness.ctx.storage.sessions.put("sess_expired", {
		memberId: MEMBER.qqOpenid,
		expiresAt: new Date(Date.now() - 1000).toISOString(),
		createdAt: new Date().toISOString(),
	});

	assert.deepEqual(await overview(harness, `${SESSION_COOKIE}=sess_expired`), {
		ok: false,
		reason: "unauthorized",
	});
	assert.equal(await harness.ctx.storage.sessions.get("sess_expired"), null, "过期会话应被清理");
});

// ─── 数据 ─────────────────────────────────────────────────────────

await test("无互动的会员：计数为 0、收藏为空、资料正确", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);
	const result = await overview(harness, `${SESSION_COOKIE}=sess_a`);

	assert.equal(result.ok, true);
	assert.deepEqual(result.member, {
		displayName: "会员甲",
		avatarUrl: "https://thirdqq.qlogo.cn/a.png",
		createdAt: "2026-09-01T00:00:00.000Z",
	});
	assert.deepEqual(result.counts, { likes: 0, favorites: 0 });
	assert.deepEqual(result.favorites, []);
	assert.equal(result.unavailableFavorites, 0);
});

await test("收藏列表：解析标题/链接、按收藏时间倒序，点赞单独计数", async () => {
	const harness = createHarness({
		"posts:p1": { status: "published", slug: "hello", title: "第一篇文章" },
		"projects:pr1": { status: "published", slug: "tool", title: "小工具" },
	});
	await harness.seedMember(MEMBER);
	await harness.seedActivity("favorite", "posts", "p1", "2026-09-20T10:00:00.000Z", MEMBER.qqOpenid);
	await harness.seedActivity("favorite", "projects", "pr1", "2026-09-25T10:00:00.000Z", MEMBER.qqOpenid);
	await harness.seedActivity("like", "posts", "p1", "2026-09-21T10:00:00.000Z", MEMBER.qqOpenid);

	const result = await overview(harness, `${SESSION_COOKIE}=sess_a`);
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

await test("内容下线/未发布：列表隐藏但计入 unavailableFavorites", async () => {
	const harness = createHarness({
		"posts:p1": { status: "published", slug: "hello", title: "第一篇" },
		"posts:draft": { status: "draft", slug: "secret", title: "草稿" },
	});
	await harness.seedMember(MEMBER);
	await harness.seedActivity("favorite", "posts", "p1", "2026-09-20T10:00:00.000Z", MEMBER.qqOpenid);
	await harness.seedActivity("favorite", "posts", "draft", "2026-09-26T10:00:00.000Z", MEMBER.qqOpenid);
	await harness.seedActivity("favorite", "life", "gone", "2026-09-27T10:00:00.000Z", MEMBER.qqOpenid);

	const result = await overview(harness, `${SESSION_COOKIE}=sess_a`);
	assert.equal(result.counts.favorites, 3);
	assert.deepEqual(
		result.favorites.map((item) => item.title),
		["第一篇"],
	);
	assert.equal(result.unavailableFavorites, 2);
});

await test("只返回当前会员的数据（别的 openid 不计入）", async () => {
	const harness = createHarness({
		"posts:p1": { status: "published", slug: "hello", title: "第一篇" },
	});
	await harness.seedMember(MEMBER);
	await harness.seedActivity("favorite", "posts", "p1", "2026-09-20T10:00:00.000Z", "OPENID-OTHER");

	const result = await overview(harness, `${SESSION_COOKIE}=sess_a`);
	assert.equal(result.counts.favorites, 0);
	assert.deepEqual(result.favorites, []);
});

// ─── 报告 ─────────────────────────────────────────────────────────

console.log("\nduanap-members Phase 5.4（会员中心）验证\n");
console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} 通过`);
if (failures > 0) {
	console.log(`${failures} 项失败`);
	process.exit(1);
}
