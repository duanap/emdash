import type { Kysely } from "kysely";

import type { Database } from "../../database/types.js";
import { setSiteSettings } from "../../settings/index.js";
import type { ApiResult } from "../types.js";

const LOCATIONS = /<loc>([^<]+)<\/loc>/g;
const COLLECTION_PATH = /\/sitemap-([a-z][a-z0-9_]*)\.xml$/;
const URL_ENTRIES = /<url>/g;

export async function handleSitemapGeneration(
	db: Kysely<Database>,
	renderIndex: () => Promise<Response>,
	renderCollection: (collection: string) => Promise<Response>,
): Promise<ApiResult<{ generatedAt: string; collections: number; urls: number }>> {
	try {
		const index = await renderIndex();
		if (!index.ok) throw new Error("Index rendering failed");
		let urls = 0;
		let collections = 0;
		for (const match of (await index.text()).matchAll(LOCATIONS)) {
			const location = new URL(match[1].replaceAll("&amp;", "&"));
			const collection = location.pathname.match(COLLECTION_PATH)?.[1];
			if (!collection) throw new Error("Invalid collection sitemap");
			const response = await renderCollection(collection);
			if (!response.ok) throw new Error("Collection rendering failed");
			urls += [...(await response.text()).matchAll(URL_ENTRIES)].length;
			collections++;
		}
		const generatedAt = new Date().toISOString();
		await setSiteSettings({ sitemapUpdatedAt: generatedAt }, db);
		return { success: true, data: { generatedAt, collections, urls } };
	} catch {
		return {
			success: false,
			error: { code: "SITEMAP_GENERATION_ERROR", message: "Failed to generate sitemap" },
		};
	}
}
