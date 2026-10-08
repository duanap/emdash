import type { SiteSettingsUpdate } from "./api/settings.js";

export type GeneralSettingsSection = "all" | "identity" | "reading";

export function generalSettingsPayload(
	settings: SiteSettingsUpdate,
	section: GeneralSettingsSection,
): SiteSettingsUpdate {
	const identity = {
		title: settings.title,
		tagline: settings.tagline,
		logo: settings.logo,
		favicon: settings.favicon,
	};
	const reading = {
		postsPerPage: settings.postsPerPage,
		dateFormat: settings.dateFormat,
		timezone: settings.timezone,
	};
	if (section === "identity") return identity;
	if (section === "reading") return reading;
	const general = { ...settings };
	delete general.url;
	delete general.heroSlides;
	delete general.heroCarousel;
	return general;
}
