/**
 * Site settings APIs
 */

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { API_BASE, apiFetch, parseApiResponse } from "./client.js";

export interface SiteSettings {
	// Identity
	title: string;
	tagline?: string;
	logo?: { mediaId: string; alt?: string; url?: string };
	favicon?: { mediaId: string; url?: string };
	footerLinks?: Array<{ label: string; url: string; iconUrl?: string }>;
	heroSlides?: Array<{ title: string; imageUrl: string; url: string; excerpt?: string }>;
	heroCarousel?: {
		intervalSeconds?: number;
		blurPx?: number;
		overlayOpacity?: number;
		textPosition?:
			| "top-start"
			| "top-center"
			| "top-end"
			| "center-start"
			| "center"
			| "center-end"
			| "bottom-start"
			| "bottom-center"
			| "bottom-end";
		titleSize?: number;
		mobileTitleSize?: number;
		descriptionSize?: number;
		height?: number;
		mobileHeight?: number;
	};
	sitemapUpdatedAt?: string;

	// URLs
	url?: string;

	// Display
	postsPerPage: number;
	dateFormat: string;
	timezone: string;

	// Social
	social?: {
		twitter?: string;
		github?: string;
		facebook?: string;
		instagram?: string;
		linkedin?: string;
		youtube?: string;
	};

	// SEO
	seo?: {
		titleSeparator?: string;
		defaultOgImage?: { mediaId: string; alt?: string; url?: string };
		robotsTxt?: string;
		googleVerification?: string;
		bingVerification?: string;
	};
}
export interface SiteSettingsUpdate extends Omit<
	Partial<SiteSettings>,
	"logo" | "favicon" | "seo"
> {
	logo?: SiteSettings["logo"] | null;
	favicon?: SiteSettings["favicon"] | null;
	seo?: Omit<NonNullable<SiteSettings["seo"]>, "defaultOgImage"> & {
		defaultOgImage?: NonNullable<SiteSettings["seo"]>["defaultOgImage"] | null;
	};
}

/**
 * Fetch site settings
 */
export async function fetchSettings(): Promise<Partial<SiteSettings>> {
	const response = await apiFetch(`${API_BASE}/settings`);
	return parseApiResponse<Partial<SiteSettings>>(response, i18n._(msg`Failed to fetch settings`));
}

export async function generateSitemap(): Promise<{
	generatedAt: string;
	collections: number;
	urls: number;
}> {
	const response = await apiFetch(`${API_BASE}/settings/sitemap`, { method: "POST" });
	return parseApiResponse(response, i18n._(msg`Failed to generate sitemap`));
}

/**
 * Update site settings
 */
export async function updateSettings(settings: SiteSettingsUpdate): Promise<Partial<SiteSettings>> {
	const response = await apiFetch(`${API_BASE}/settings`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(settings),
	});
	return parseApiResponse<Partial<SiteSettings>>(response, i18n._(msg`Failed to update settings`));
}
