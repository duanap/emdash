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

/** 会员评论身份邮箱的形状（模块作用域，避免每次调用重新编译正则） */
const MEMBER_IDENTITY_EMAIL_PATTERN = /^member-[0-9a-f]{16}@members\.duanap\.cn$/;

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

function createHarness(content = {}, comments = {}) {
	const collections = new Map();
	const contentById = new Map(Object.entries(content));
	const commentsById = new Map(Object.entries(comments));

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
		comments: {
			get: async (id) => {
				const comment = commentsById.get(id);
				if (!comment) return null;
				return {
					parentId: null,
					authorName: comment.authorName ?? "会员甲",
					authorEmail: comment.authorEmail ?? "",
					ipHash: null,
					userAgent: null,
					moderationMetadata: null,
					updatedAt: comment.createdAt,
					...comment,
				};
			},
			list: async () => ({ items: [], hasMore: false }),
			count: async () => 0,
		},
		storage: new Proxy({}, { get: (_target, name) => collection(String(name)) }),
	};

	return {
		ctx,
		rows(collectionName) {
			return collections.get(collectionName) ?? new Map();
		},
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
		bio: "",
		createdAt: "2026-09-01T00:00:00.000Z",
		customizedFields: [],
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
	await harness.seedActivity(
		"favorite",
		"posts",
		"p1",
		"2026-09-20T10:00:00.000Z",
		MEMBER.qqOpenid,
	);
	await harness.seedActivity(
		"favorite",
		"projects",
		"pr1",
		"2026-09-25T10:00:00.000Z",
		MEMBER.qqOpenid,
	);
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
	await harness.seedActivity(
		"favorite",
		"posts",
		"p1",
		"2026-09-20T10:00:00.000Z",
		MEMBER.qqOpenid,
	);
	await harness.seedActivity(
		"favorite",
		"posts",
		"draft",
		"2026-09-26T10:00:00.000Z",
		MEMBER.qqOpenid,
	);
	await harness.seedActivity(
		"favorite",
		"life",
		"gone",
		"2026-09-27T10:00:00.000Z",
		MEMBER.qqOpenid,
	);

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

// ─── 资料编辑（Phase 5.4b） ───────────────────────────────────────

async function profile(harness, cookie, body) {
	harness.ctx.request = new Request(`${PLUGIN_BASE}/member/profile`, {
		method: "POST",
		headers: cookie ? { cookie } : {},
	});
	harness.ctx.input = body;
	return plugin.routes["member/profile"].handler(harness.ctx);
}

async function currentMember(harness) {
	const result = await overview(harness, `${SESSION_COOKIE}=sess_a`);
	return result.member;
}

await test("匿名修改资料 → unauthorized", async () => {
	const harness = createHarness();
	assert.deepEqual(await profile(harness, null, { displayName: "谁" }), {
		ok: false,
		reason: "unauthorized",
	});
});

await test("昵称校验：空、纯空格、超 40 字都拒绝，且不落库", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);
	const cookie = `${SESSION_COOKIE}=sess_a`;

	for (const displayName of ["", "   ", "x".repeat(41)]) {
		const result = await profile(harness, cookie, { displayName });
		assert.deepEqual(result, {
			ok: false,
			reason: "invalid_profile",
			errors: ["display_name_invalid"],
		});
	}
	assert.equal((await currentMember(harness)).displayName, "会员甲", "校验失败不应改到资料");
});

await test("头像必须是 https，且长度受限", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);
	const cookie = `${SESSION_COOKIE}=sess_a`;

	for (const avatarUrl of [
		"http://example.com/a.png",
		"not-a-url",
		`https://example.com/${"a".repeat(2100)}`,
	]) {
		const result = await profile(harness, cookie, { avatarUrl });
		assert.deepEqual(result, {
			ok: false,
			reason: "invalid_profile",
			errors: ["avatar_url_invalid"],
		});
	}
	assert.equal((await currentMember(harness)).avatarUrl, MEMBER.avatarUrl, "校验失败不应改到头像");
});

await test("简介超 200 字拒绝", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);
	const result = await profile(harness, `${SESSION_COOKIE}=sess_a`, { bio: "字".repeat(201) });
	assert.deepEqual(result, { ok: false, reason: "invalid_profile", errors: ["bio_too_long"] });
});

await test("成功更新：持久化、记入 customisedFields、overview 可见", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);
	const cookie = `${SESSION_COOKIE}=sess_a`;

	const result = await profile(harness, cookie, {
		displayName: "  自定义昵称  ",
		avatarUrl: "https://example.com/me.png",
		bio: "  写点什么  ",
	});
	assert.equal(result.ok, true);
	assert.deepEqual(result.member, {
		displayName: "自定义昵称",
		avatarUrl: "https://example.com/me.png",
		bio: "写点什么",
	});
	assert.deepEqual(result.customizedFields, ["displayName", "avatarUrl", "bio"]);

	const member = await currentMember(harness);
	assert.equal(member.displayName, "自定义昵称");
	assert.equal(member.avatarUrl, "https://example.com/me.png");
	assert.equal(member.bio, "写点什么");
	assert.deepEqual(member.customizedFields, ["displayName", "avatarUrl", "bio"]);
});

await test("缺省字段保持不变（只改简介）", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);
	const cookie = `${SESSION_COOKIE}=sess_a`;

	await profile(harness, cookie, { displayName: "新昵称" });
	await profile(harness, cookie, { bio: "只改简介" });

	const member = await currentMember(harness);
	assert.equal(member.displayName, "新昵称", "省略的字段不应被清空");
	assert.equal(member.avatarUrl, MEMBER.avatarUrl);
	assert.equal(member.bio, "只改简介");
	assert.deepEqual(member.customizedFields, ["displayName", "bio"]);
});

await test("头像可以清空（空串）", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);
	const cookie = `${SESSION_COOKIE}=sess_a`;

	const result = await profile(harness, cookie, { avatarUrl: "" });
	assert.equal(result.ok, true);
	assert.equal(result.member.avatarUrl, "");
	assert.equal((await currentMember(harness)).avatarUrl, "");
});

await test("停用会员不能改资料", async () => {
	const harness = createHarness();
	await harness.seedMember({ ...MEMBER, status: "disabled" });
	assert.deepEqual(await profile(harness, `${SESSION_COOKIE}=sess_a`, { displayName: "想改" }), {
		ok: false,
		reason: "unauthorized",
	});
});

// ─── 会员评论归属（Phase 5.4c） ───────────────────────────────────

async function statusPayload(harness, cookie) {
	harness.ctx.request = new Request(`${PLUGIN_BASE}/auth/status`, {
		headers: cookie ? { cookie } : {},
	});
	return plugin.routes["auth/status"].handler(harness.ctx);
}

async function memberIdentityEmail(harness) {
	const payload = await statusPayload(harness, `${SESSION_COOKIE}=sess_a`);
	return payload.data.commentIdentity.email;
}

function fireCommentCreated(harness, comment, content = {}) {
	const hook = plugin.hooks["comment:afterCreate"];
	assert.ok(hook, "expected a comment:afterCreate hook");
	return hook.handler({ comment, metadata: {}, content }, harness.ctx);
}

await test("auth/status：匿名没有评论身份，会员带派生身份", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);

	const anonymous = await statusPayload(harness, null);
	assert.equal(anonymous.data.commentIdentity, null);

	const authed = await statusPayload(harness, `${SESSION_COOKIE}=sess_a`);
	assert.equal(authed.data.loggedIn, true);
	assert.equal(authed.data.commentIdentity.name, "会员甲");
	assert.match(authed.data.commentIdentity.email, MEMBER_IDENTITY_EMAIL_PATTERN);
});

await test("派生身份稳定且与 openid 一一对应", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);
	const first = await memberIdentityEmail(harness);

	await harness.ctx.storage.members.put("mem_b", { ...MEMBER, qqOpenid: "OPENID-B" });
	await harness.ctx.storage.sessions.put("sess_b", {
		memberId: "OPENID-B",
		expiresAt: new Date(Date.now() + 3600_000).toISOString(),
		createdAt: new Date().toISOString(),
	});
	harness.ctx.request = new Request(`${PLUGIN_BASE}/auth/status`, {
		headers: { cookie: `${SESSION_COOKIE}=sess_b` },
	});
	const second = (await plugin.routes["auth/status"].handler(harness.ctx)).data.commentIdentity
		.email;

	assert.notEqual(first, second);
	assert.equal(await memberIdentityEmail(harness), first, "同一 openid 应得到同一身份");
});

await test("comment:afterCreate：会员身份邮箱的评论被归到会员名下", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);
	const memberRef = await memberIdentityEmail(harness);

	await fireCommentCreated(
		harness,
		{
			id: "c1",
			collection: "posts",
			contentId: "p1",
			authorEmail: memberRef,
			body: "写得不错",
			status: "pending",
			createdAt: "2026-09-28T10:00:00.000Z",
		},
		{ id: "p1", collection: "posts", slug: "hello", title: "第一篇文章" },
	);

	const stored = harness.rows("memberComments").get("c1");
	assert.ok(stored, "应记录归属");
	assert.equal(stored.memberRef, memberRef);
	assert.equal(stored.targetSlug, "hello");
	assert.equal(stored.targetTitle, "第一篇文章");
});

await test("comment:afterCreate：非会员邮箱被忽略", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);

	const outsiders = [
		"guest@example.com",
		"",
		"member-0123456789abcdef@example.com",
		"member-x@members.duanap.cn",
	];
	for (const [index, authorEmail] of outsiders.entries()) {
		await fireCommentCreated(harness, {
			id: `c-outsider-${index}`,
			collection: "posts",
			contentId: "p1",
			authorEmail,
			body: "x",
			status: "pending",
			createdAt: "2026-09-28T10:00:00.000Z",
		});
	}

	assert.equal(harness.rows("memberComments").size, 0, "非派生身份邮箱不应被归属");
});

await test("comment:afterCreate：大小写与首尾空白先归一，再归属", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);
	const memberRef = await memberIdentityEmail(harness);

	await fireCommentCreated(harness, {
		id: "c-normalized",
		collection: "posts",
		contentId: "p1",
		authorEmail: ` ${memberRef.toUpperCase()} `,
		body: "x",
		status: "pending",
		createdAt: "2026-09-28T10:00:00.000Z",
	});

	const stored = harness.rows("memberComments").get("c-normalized");
	assert.ok(stored, "邮箱大小写不应影响归属");
	assert.equal(stored.memberRef, memberRef, "存的是归一后的身份");
});

await test("comment:afterCreate：重复事件幂等", async () => {
	const harness = createHarness();
	await harness.seedMember(MEMBER);
	const memberRef = await memberIdentityEmail(harness);
	const comment = {
		id: "c1",
		collection: "posts",
		contentId: "p1",
		authorEmail: memberRef,
		body: "x",
		status: "pending",
		createdAt: "2026-09-28T10:00:00.000Z",
	};

	await fireCommentCreated(harness, comment, { collection: "posts", id: "p1", slug: "hello" });
	await fireCommentCreated(harness, comment, { collection: "posts", id: "p1", slug: "hello" });

	assert.equal(harness.rows("memberComments").size, 1);
});

await test("我的评论：解析状态与正文、生成目标链接，已删除的评论跳过", async () => {
	const harness = createHarness(
		{},
		{
			c1: {
				collection: "posts",
				contentId: "p1",
				body: "第一条评论",
				status: "pending",
				createdAt: "2026-09-28T10:00:00.000Z",
			},
			c2: {
				collection: "wall",
				contentId: "w1",
				body: "留言墙的评论",
				status: "approved",
				createdAt: "2026-09-29T10:00:00.000Z",
			},
		},
	);
	await harness.seedMember(MEMBER);
	const memberRef = await memberIdentityEmail(harness);
	await harness.ctx.storage.memberComments.put("c1", {
		memberRef,
		collection: "posts",
		contentId: "p1",
		targetTitle: "第一篇文章",
		targetSlug: "hello",
		createdAt: "2026-09-28T10:00:00.000Z",
	});
	await harness.ctx.storage.memberComments.put("c2", {
		memberRef,
		collection: "wall",
		contentId: "w1",
		targetTitle: null,
		targetSlug: null,
		createdAt: "2026-09-29T10:00:00.000Z",
	});
	await harness.ctx.storage.memberComments.put("c3", {
		memberRef,
		collection: "posts",
		contentId: "gone",
		targetTitle: "已删除的文章",
		targetSlug: "gone",
		createdAt: "2026-09-30T10:00:00.000Z",
	});

	const result = await overview(harness, `${SESSION_COOKIE}=sess_a`);
	assert.equal(result.comments.length, 2, "评论已被硬删除时应跳过");
	assert.deepEqual(
		result.comments.map((item) => [item.targetTitle, item.targetPath, item.status]),
		[
			["留言墙", "/messages", "approved"],
			["第一篇文章", "/posts/hello", "pending"],
		],
	);
	assert.equal(result.comments[1].body, "第一条评论");
});

await test("我的评论只包含自己的", async () => {
	const harness = createHarness(
		{},
		{
			c1: {
				collection: "posts",
				contentId: "p1",
				body: "别人的评论",
				status: "approved",
				createdAt: "2026-09-28T10:00:00.000Z",
			},
		},
	);
	await harness.seedMember(MEMBER);
	await harness.ctx.storage.memberComments.put("c1", {
		memberRef: "member-ffffffffffffffff@members.duanap.cn",
		collection: "posts",
		contentId: "p1",
		targetTitle: "第一篇文章",
		targetSlug: "hello",
		createdAt: "2026-09-28T10:00:00.000Z",
	});

	const result = await overview(harness, `${SESSION_COOKIE}=sess_a`);
	assert.deepEqual(result.comments, []);
});

// ─── 报告 ─────────────────────────────────────────────────────────

console.log("\nduanap-members Phase 5.4（会员中心）验证\n");
console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} 通过`);
if (failures > 0) {
	console.log(`${failures} 项失败`);
	process.exit(1);
}
