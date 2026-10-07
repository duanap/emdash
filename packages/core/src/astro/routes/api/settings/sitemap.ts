export const prerender = false;
import type { APIRoute } from "astro";

import { requirePerm } from "#api/authorize.js";
import { apiError, unwrapResult } from "#api/error.js";
import { handleSitemapGeneration } from "#api/handlers/sitemap.js";

import { GET as generateCollection } from "../../sitemap-[collection].xml.js";
import { GET as generateIndex } from "../../sitemap.xml.js";
export const POST: APIRoute = async (context) => {
	const { emdash, user } = context.locals;
	if (!emdash?.db) return apiError("NOT_CONFIGURED", "EmDash is not initialized", 500);
	const denied = requirePerm(user, "settings:manage");
	if (denied) return denied;
	return unwrapResult(
		await handleSitemapGeneration(
			emdash.db,
			async () => generateIndex(context),
			async (collection) => generateCollection({ ...context, params: { collection } }),
		),
	);
};
