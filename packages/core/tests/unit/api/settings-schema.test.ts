import { describe, expect, it } from "vitest";

import { settingsUpdateBody, siteSettingsSchema } from "../../../src/api/schemas/settings.js";

describe("settings schemas", () => {
	for (const url of [
		"javascript:alert(1)",
		"data:text/html,test",
		"//evil.example/",
		"/relative",
	]) {
		it(`rejects unsafe footer destinations: ${url}`, () => {
			expect(
				settingsUpdateBody.safeParse({ footerLinks: [{ label: "Notice", url }] }).success,
			).toBe(false);
		});
	}
	it("rejects script-bearing icons while accepting uploaded media URLs", () => {
		const notice = { label: "Notice", url: "https://example.com" };
		expect(
			settingsUpdateBody.safeParse({
				footerLinks: [{ ...notice, iconUrl: "/_emdash/api/media/file/icon.png" }],
			}).success,
		).toBe(true);
		for (const iconUrl of ["javascript:alert(1)", "//evil.example/x", "/\\evil.example/x"]) {
			expect(settingsUpdateBody.safeParse({ footerLinks: [{ ...notice, iconUrl }] }).success).toBe(
				false,
			);
		}
	});
	it("accepts null media references as deletion requests", () => {
		expect(
			settingsUpdateBody.parse({
				logo: null,
				favicon: null,
				seo: { defaultOgImage: null },
			}),
		).toEqual({ logo: null, favicon: null, seo: { defaultOgImage: null } });
	});

	it("does not expose deletion sentinels in settings responses", () => {
		expect(siteSettingsSchema.safeParse({ logo: null }).success).toBe(false);
		expect(siteSettingsSchema.safeParse({ favicon: null }).success).toBe(false);
		expect(siteSettingsSchema.safeParse({ seo: { defaultOgImage: null } }).success).toBe(false);
	});
});
