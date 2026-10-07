import { describe, expect, it } from "vitest";

import { isItemActive } from "../../src/components/Sidebar.js";
import { generalSettingsPayload } from "../../src/lib/general-settings.js";
import { settingsSection } from "../../src/lib/settings-section.js";

describe("split settings navigation and saves", () => {
	it("keeps personal credentials out of system and website navigation", () => {
		expect(settingsSection("/_emdash/admin/settings/api-tokens")).toBe("personal");
		expect(isItemActive("/settings/site", "/settings/api-tokens")).toBe(false);
		expect(isItemActive("/settings/system", "/settings/api-tokens")).toBe(false);
	});
	it("keeps the website entry active on its related pages", () => {
		for (const path of ["/menus/main", "/settings/footer", "/settings/sitemap", "/widgets"]) {
			expect(isItemActive("/settings/site", path)).toBe(true);
		}
		expect(isItemActive("/settings/site", "/menus-other")).toBe(false);
		expect(isItemActive("/settings/system", "/content-types/posts")).toBe(true);
	});
	it("does not overwrite reading, footer, or SEO settings when saving identity", () => {
		const settings = {
			title: "Updated site",
			postsPerPage: 20,
			footerLinks: [{ label: "备案", url: "https://example.com" }],
			seo: { robotsTxt: "Keep existing" },
			heroCarousel: { intervalSeconds: 5 },
		};
		const submitted = generalSettingsPayload(settings, "identity");
		expect(submitted.title).toBe("Updated site");
		for (const key of ["postsPerPage", "footerLinks", "seo", "heroCarousel"])
			expect(submitted).not.toHaveProperty(key);
	});
	it("does not overwrite identity or other settings when saving reading preferences", () => {
		const submitted = generalSettingsPayload(
			{
				title: "Existing site",
				postsPerPage: 25,
				timezone: "Asia/Shanghai",
				logo: { mediaId: "logo" },
				social: { github: "https://github.com/example" },
			},
			"reading",
		);
		expect(submitted.postsPerPage).toBe(25);
		expect(submitted.timezone).toBe("Asia/Shanghai");
		for (const key of ["title", "logo", "social"]) expect(submitted).not.toHaveProperty(key);
	});
});
