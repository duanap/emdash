import type { RouteContext } from "emdash";
import { afterEach, beforeEach, expect, it } from "vitest";

import { createPlugin, SESSION_COOKIE } from "../../../../demos/blog/member-plugin/index.js";
import { PluginStorageRepository } from "../../src/database/repositories/plugin-storage.js";
import {
	describeEachDialect,
	setupForDialect,
	teardownForDialect,
	type DialectTestContext,
} from "../utils/test-db.js";

describeEachDialect("member overview", (dialect) => {
	let database: DialectTestContext;
	const plugin = createPlugin();
	let ctx: RouteContext;
	beforeEach(async () => {
		database = await setupForDialect(dialect);
		const storage = Object.fromEntries(
			Object.entries(plugin.storage ?? {}).map(([name, config]) => [
				name,
				new PluginStorageRepository(database.db, plugin.id, name, [
					...(config.indexes ?? []),
					...(config.uniqueIndexes ?? []),
				]),
			]),
		);
		await storage.members.put("member-a", {
			displayName: "会员甲",
			avatarUrl: "",
			status: "active",
			qqOpenid: "OPENID-A",
			createdAt: "2026-09-01T00:00:00Z",
			updatedAt: "2026-09-01T00:00:00Z",
		});
		await storage.sessions.put("session-a", {
			memberId: "OPENID-A",
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
		});
		ctx = {
			storage,
			request: new Request("http://localhost/member/overview", {
				headers: { cookie: `${SESSION_COOKIE}=session-a` },
			}),
			content: {
				get: async (_collection: string, id: string) => ({
					status: "published",
					slug: id,
					data: { title: id },
				}),
			},
		} as unknown as RouteContext;
	});
	afterEach(async () => {
		await teardownForDialect(database);
	});
	async function add(kind: "like" | "favorite", id: string, date: string, openid = "OPENID-A") {
		await ctx.storage.activity.put(`${kind}:${openid}:posts:${id}`, {
			kind,
			memberOpenid: openid,
			targetType: "posts",
			targetId: id,
			createdAt: date,
		});
	}
	it("counts every interaction and pages newer favorites beyond the first 100 likes", async () => {
		for (let i = 0; i < 105; i++) await add("like", `like-${i}`, "2026-09-01T00:00:00Z");
		for (let i = 0; i < 25; i++)
			await add("favorite", `favorite-${i}`, new Date(Date.UTC(2026, 8, 1 + i)).toISOString());
		await add("favorite", "other-member", "2026-10-01T00:00:00Z", "OPENID-B");
		const handler = plugin.routes["member/overview"].handler;
		const first = (await handler(ctx)) as {
			ok: boolean;
			counts: { likes: number; favorites: number };
			favorites: { targetId: string }[];
			favoritesCursor?: string;
		};
		expect(first.counts).toEqual({ likes: 105, favorites: 25 });
		expect(first.favorites).toHaveLength(20);
		expect(first.favorites[0].targetId).toBe("favorite-24");
		expect(first.favoritesCursor).toBeTruthy();
		ctx.request = new Request(
			`http://localhost/member/overview?favoritesCursor=${encodeURIComponent(first.favoritesCursor!)}`,
			{ headers: { cookie: `${SESSION_COOKIE}=session-a` } },
		);
		const second = (await handler(ctx)) as typeof first;
		expect(second.favorites).toHaveLength(5);
		expect(second.favoritesCursor).toBeUndefined();
		const ids = [...first.favorites, ...second.favorites].map((item) => item.targetId);
		expect(new Set(ids).size).toBe(25);
		expect(ids).not.toContain("other-member");
	});
	it("does not lose favorites with identical dates at a page boundary", async () => {
		for (let i = 0; i < 25; i++) await add("favorite", `same-${i}`, "2026-09-01T00:00:00Z");
		const handler = plugin.routes["member/overview"].handler;
		const first = (await handler(ctx)) as {
			favorites: { targetId: string }[];
			favoritesCursor: string;
		};
		ctx.request = new Request(
			`http://localhost/member/overview?favoritesCursor=${encodeURIComponent(first.favoritesCursor)}`,
			{ headers: { cookie: `${SESSION_COOKIE}=session-a` } },
		);
		const second = (await handler(ctx)) as typeof first;
		expect(
			new Set([...first.favorites, ...second.favorites].map((item) => item.targetId)).size,
		).toBe(25);
	});
});
