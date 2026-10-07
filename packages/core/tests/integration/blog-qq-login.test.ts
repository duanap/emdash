import type { RouteContext } from "emdash";
import { beforeEach, afterEach, expect, it } from "vitest";

import {
	createPlugin,
	SESSION_COOKIE,
	STATE_COOKIE,
} from "../../../../demos/blog/member-plugin/index.js";
import { OptionsRepository } from "../../src/database/repositories/options.js";
import { PluginStorageRepository } from "../../src/database/repositories/plugin-storage.js";
import { createKVAccess } from "../../src/plugins/context.js";
import { isPluginResponse } from "../../src/plugins/route-wire.js";
import { createSettingsAccess } from "../../src/plugins/settings.js";
import {
	describeEachDialect,
	setupForDialect,
	teardownForDialect,
	type DialectTestContext,
} from "../utils/test-db.js";

describeEachDialect("QQ callback compatibility and origin handoff", (dialect) => {
	let database: DialectTestContext;
	let ctx: RouteContext;
	const plugin = createPlugin();
	beforeEach(async () => {
		database = await setupForDialect(dialect);
		const repo = new OptionsRepository(database.db);
		const settings = createSettingsAccess(repo, plugin.id);
		await settings.set("qqClientId", "test-app");
		await settings.set("qqClientSecret", "test-secret");
		await settings.set("qqCallbackUrl", "https://duanap.cn/oauth/qq/callback");
		await settings.set("siteOrigin", "https://duanap.cn");
		const storage = Object.fromEntries(
			Object.entries(plugin.storage ?? {}).map(([name, config]) => [
				name,
				new PluginStorageRepository(database.db, plugin.id, name, [
					...(config.indexes ?? []),
					...(config.uniqueIndexes ?? []),
				]),
			]),
		);
		ctx = {
			settings,
			storage,
			kv: createKVAccess(repo, plugin.id, settings),
			request: new Request("https://duanap.cn/_emdash/api/plugins/duanap-members/auth/status"),
		} as unknown as RouteContext;
	});
	afterEach(async () => teardownForDialect(database));
	async function response(route: string) {
		const result = await plugin.routes![route]!.handler(ctx);
		if (!isPluginResponse(result)) throw new Error("Expected raw response");
		return { status: result.status, headers: new Headers(result.headers) };
	}
	it("recognizes the already-registered apex callback and starts the provider flow", async () => {
		const status = (await plugin.routes!["auth/status"]!.handler(ctx)) as {
			data: { qqConfigured: boolean };
		};
		expect(status.data.qqConfigured).toBe(true);
		ctx.request = new Request(
			"https://duanap.cn/_emdash/api/plugins/duanap-members/auth/qq/start?returnTo=/posts",
		);
		const start = await response("auth/qq/start");
		const target = new URL(start.headers.get("location")!);
		expect(target.origin).toBe("https://graph.qq.com");
		expect(target.searchParams.get("redirect_uri")).toBe("https://duanap.cn/oauth/qq/callback");
		expect(start.headers.get("set-cookie")).toContain(`${STATE_COOKIE}=`);
		expect(start.headers.get("set-cookie")).not.toContain("Domain=");
		expect(await ctx.kv.get(`oauth:state:${target.searchParams.get("state")}`)).not.toBeNull();
	});
	it("starts OAuth on the registered callback host and preserves the original host", async () => {
		ctx.request = new Request(
			"https://www.duanap.cn/_emdash/api/plugins/duanap-members/auth/qq/start?returnTo=/posts?page=2",
		);
		const start = await response("auth/qq/start");
		const target = new URL(start.headers.get("location")!);
		expect(target.origin).toBe("https://duanap.cn");
		expect(target.searchParams.get("returnTo")).toBe("https://www.duanap.cn/posts?page=2");
		expect(start.headers.get("set-cookie")).toBeNull();
	});
	it("rejects an unsupported callback rather than exposing a usable login button", async () => {
		await ctx.settings.set("qqCallbackUrl", "https://attacker.example/oauth/qq/callback");
		const status = (await plugin.routes!["auth/status"]!.handler(ctx)) as {
			data: { qqConfigured: boolean };
		};
		expect(status.data.qqConfigured).toBe(false);
	});
	it("keeps state/cookie validation on the compatible callback", async () => {
		ctx.request = new Request(
			"https://duanap.cn/_emdash/api/plugins/duanap-members/auth/qq/callback?code=x&state=y",
		);
		expect((await response("auth/qq/callback")).headers.get("location")).toBe(
			"/login?error=state_mismatch",
		);
	});
	it("completes provider exchange and signs in on the original www host", async () => {
		ctx.request = new Request(
			"https://duanap.cn/_emdash/api/plugins/duanap-members/auth/qq/start?returnTo=https%3A%2F%2Fwww.duanap.cn%2Fmember",
		);
		const authorize = new URL((await response("auth/qq/start")).headers.get("location")!);
		const state = authorize.searchParams.get("state")!;
		ctx.http = {
			fetch: async (input: string | URL | Request) => {
				const target = new URL(
					typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
				);
				if (target.pathname === "/oauth2.0/token")
					return new Response("access_token=test-token&expires_in=3600");
				if (target.pathname === "/oauth2.0/me")
					return Response.json({ client_id: "test-app", openid: "test-openid" });
				return Response.json({
					ret: 0,
					nickname: "测试会员",
					figureurl_qq_2: "https://example.com/avatar.png",
				});
			},
		};
		ctx.request = new Request(
			`https://duanap.cn/_emdash/api/plugins/duanap-members/auth/qq/callback?code=test-code&state=${state}`,
			{ headers: { cookie: `${STATE_COOKIE}=${state}` } },
		);
		const callback = await response("auth/qq/callback");
		const bridge = new URL(callback.headers.get("location")!);
		expect(bridge.origin).toBe("https://www.duanap.cn");
		ctx.request = new Request(bridge);
		const completed = await response("auth/qq/complete");
		expect(completed.headers.get("location")).toBe("/member");
		ctx.request = new Request(
			"https://www.duanap.cn/_emdash/api/plugins/duanap-members/auth/status",
			{ headers: { cookie: completed.headers.get("set-cookie")!.split(";")[0]! } },
		);
		const status = (await plugin.routes!["auth/status"]!.handler(ctx)) as {
			data: { loggedIn: boolean; member: { displayName: string } };
		};
		expect(status.data.loggedIn).toBe(true);
		expect(status.data.member.displayName).toBe("测试会员");
	});
	it("consumes an origin-bound ticket once and sets only a host cookie", async () => {
		const ticket = "a".repeat(64);
		await ctx.storage.sessions!.put("session-test", {
			memberId: "openid",
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
		});
		await ctx.kv.set(`oauth:bridge:${ticket}`, {
			sessionId: "session-test",
			origin: "https://www.duanap.cn",
			returnTo: "https://www.duanap.cn/posts",
			expiresAt: Date.now() + 60_000,
		});
		ctx.request = new Request(
			`https://blog.duanap.cn/_emdash/api/plugins/duanap-members/auth/qq/complete?ticket=${ticket}`,
		);
		expect((await response("auth/qq/complete")).headers.get("set-cookie")).toBeNull();
		ctx.request = new Request(
			`https://www.duanap.cn/_emdash/api/plugins/duanap-members/auth/qq/complete?ticket=${ticket}`,
		);
		const complete = await response("auth/qq/complete");
		expect(complete.headers.get("location")).toBe("/posts");
		expect(complete.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=session-test`);
		expect(complete.headers.get("set-cookie")).not.toContain("Domain=");
		expect((await response("auth/qq/complete")).headers.get("set-cookie")).toBeNull();
	});
});
