import { expect, it } from "vitest";

import { generalSettingsPayload } from "../../src/lib/general-settings.js";

it("keeps scoped identity saves away from domain, reading, and carousel configuration", () => {
	const payload = generalSettingsPayload(
		{
			title: "Updated title",
			url: "https://changed.example",
			postsPerPage: 25,
			heroSlides: [],
			footerLinks: [],
		},
		"identity",
	);
	expect(payload.title).toBe("Updated title");
	expect(payload).not.toHaveProperty("url");
	expect(payload).not.toHaveProperty("postsPerPage");
	expect(payload).not.toHaveProperty("heroSlides");
	expect(payload).not.toHaveProperty("footerLinks");
});

it("keeps legacy general saves from bypassing domain verification", () => {
	const payload = generalSettingsPayload(
		{ title: "Site", url: "https://changed.example", postsPerPage: 25, heroSlides: [] },
		"all",
	);
	expect(payload.title).toBe("Site");
	expect(payload.postsPerPage).toBe(25);
	expect(payload).not.toHaveProperty("url");
	expect(payload).not.toHaveProperty("heroSlides");
});
