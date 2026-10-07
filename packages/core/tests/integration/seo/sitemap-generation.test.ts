import { Role } from "@emdash-cms/auth";
import type { APIContext } from "astro";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../../../src/astro/routes/api/settings/sitemap.js";
import { GET } from "../../../src/astro/routes/sitemap-[collection].xml.js";
import { createDatabase } from "../../../src/database/connection.js";
import { runMigrations } from "../../../src/database/migrations/runner.js";
import { ContentRepository } from "../../../src/database/repositories/content.js";
import type { Database } from "../../../src/database/types.js";
import { SchemaRegistry } from "../../../src/schema/registry.js";
import { getSiteSettingsWithDb } from "../../../src/settings/index.js";

describe("admin sitemap generation", () => {
	let db: Kysely<Database>;
	let repo: ContentRepository;
	beforeEach(async () => {
		db = createDatabase({ url: ":memory:" });
		await runMigrations(db);
		const registry = new SchemaRegistry(db);
		await registry.createCollection({ slug: "posts", label: "Posts", labelSingular: "Post" });
		await registry.createField("posts", { slug: "title", label: "Title", type: "string" });
		await db
			.updateTable("_emdash_collections")
			.set({ has_seo: 1, url_pattern: "/posts/{slug}" })
			.where("slug", "=", "posts")
			.execute();
		repo = new ContentRepository(db);
	});
	afterEach(async () => {
		await db.destroy();
	});
	function context(
		user: { id: string; role: number } | null = { id: "admin", role: Role.ADMIN },
	): APIContext {
		return {
			locals: { emdash: { db, config: undefined }, user },
			params: {},
			url: new URL("https://example.com/_emdash/api/settings/sitemap"),
		} as unknown as APIContext;
	}
	it("generates current published URLs and excludes drafts on subsequent updates", async () => {
		await repo.create({
			type: "posts",
			slug: "first",
			data: { title: "First" },
			status: "published",
		});
		await repo.create({ type: "posts", slug: "draft", data: { title: "Draft" }, status: "draft" });
		const first = await POST(context());
		expect(first.status).toBe(200);
		expect((await first.json()).data).toMatchObject({ collections: 1, urls: 1 });
		await repo.create({
			type: "posts",
			slug: "second",
			data: { title: "Second" },
			status: "published",
		});
		const result = await (await POST(context())).json();
		expect(result.data.urls).toBe(2);
		expect((await getSiteSettingsWithDb(db)).sitemapUpdatedAt).toBe(result.data.generatedAt);
		const child = await GET({ ...context(), params: { collection: "posts" } });
		const xml = await child.text();
		expect(xml).toContain("/posts/second");
		expect(xml).not.toContain("/posts/draft");
		expect(child.headers.get("Cache-Control")).toContain("must-revalidate");
	});
	it("rejects anonymous users and authors without changing generation metadata", async () => {
		expect((await POST(context(null))).status).toBe(401);
		expect((await POST(context({ id: "author", role: Role.AUTHOR }))).status).toBe(403);
		expect((await getSiteSettingsWithDb(db)).sitemapUpdatedAt).toBeUndefined();
	});
});
