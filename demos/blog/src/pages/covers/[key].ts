import { join } from "node:path";

import type { APIRoute } from "astro";
// @ts-ignore - virtual module
import { getConfiguredImageService, imageConfig } from "astro:assets";

import { cachedHeroImage } from "../../utils/hero-image-cache.js";

export const prerender = false;
const WEBP_SUFFIX = /\.webp$/;
const RASTER_KEY = /^[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|avif)$/i;

export const GET: APIRoute = async ({ params, url, locals, logger }) => {
	const key = params.key?.replace(WEBP_SUFFIX, "");
	const width = Number(url.searchParams.get("w") ?? 1600);
	if (
		!params.key?.endsWith(".webp") ||
		!key ||
		!RASTER_KEY.test(key) ||
		![480, 960, 1600, 2560].includes(width)
	)
		return new Response("Invalid image request", { status: 400 });
	const storage = locals.emdash?.storage;
	if (!storage) return new Response("Unavailable", { status: 503 });
	try {
		const directory = join(process.env.EMDASH_UPLOADS_DIR ?? "./uploads", ".carousel-cache");
		const bytes = await cachedHeroImage(directory, key, width, async () => {
			const source = await storage.download(key);
			if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(source.contentType))
				throw new Error("Unsupported cover format");
			const buffer = await new Response(source.body).arrayBuffer();
			if (buffer.byteLength > 16 * 1024 * 1024) throw new Error("Cover exceeds processing limit");
			const service = await getConfiguredImageService();
			if (!("transform" in service)) throw new Error("Image transform unavailable");
			const output = await service.transform(
				new Uint8Array(buffer),
				{ src: key, width, format: "webp", quality: 82, fit: "inside" },
				imageConfig,
				logger,
			);
			if (output.format !== "webp") throw new Error("Cover transform failed");
			return output.data;
		});
		return new Response(new Uint8Array(bytes), {
			headers: {
				"Content-Type": "image/webp",
				"Cache-Control": "public, max-age=3600",
				"X-Content-Type-Options": "nosniff",
			},
		});
	} catch {
		return new Response("Image unavailable", { status: 404 });
	}
};
