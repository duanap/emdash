import { describe, expect, it } from "vitest";

import { selectHeroSlides } from "../../../../demos/blog/src/utils/hero-slides.js";
import { postPagination } from "../../../../demos/blog/src/utils/post-pagination.js";
import { settingsUpdateBody } from "../../src/api/schemas/settings.js";

describe("custom homepage carousel and post pagination", () => {
	const fallback = [{ title: "Article", href: "/posts/article", readingTime: 2 }];
	it("uses uploaded covers and custom links in their saved order", () => {
		const custom = [
			{ title: "Project", imageUrl: "/_emdash/api/media/file/cover.png", url: "/projects" },
			{ title: "External", imageUrl: "https://images.example/x.png", url: "https://example.com" },
		];
		expect(
			selectHeroSlides(custom, fallback).map((slide) => [slide.title, slide.href, slide.image]),
		).toEqual(custom.map((slide) => [slide.title, slide.url, slide.imageUrl]));
		expect(selectHeroSlides([], fallback)).toBe(fallback);
	});
	it("keeps cursor history for previous and next links without using it as a redirect", () => {
		const first = postPagination(new URLSearchParams(), "cursor-one");
		const second = postPagination(
			new URL(first.next!, "https://example.com").searchParams,
			"cursor-two",
		);
		expect(second.previous).toBe("/posts");
		const third = postPagination(new URL(second.next!, "https://example.com").searchParams);
		expect(new URL(third.previous!, "https://example.com").searchParams.get("cursor")).toBe(
			"cursor-one",
		);
		expect(third.next).toBeUndefined();
	});
	for (const url of [
		"javascript:alert(1)",
		"//evil.example/",
		"/\\evil.example/",
		"data:text/html,x",
	]) {
		it(`rejects unsafe slide destinations: ${url}`, () => {
			expect(
				settingsUpdateBody.safeParse({
					heroSlides: [{ title: "Slide", imageUrl: "/_emdash/api/media/file/cover.png", url }],
				}).success,
			).toBe(false);
		});
	}
});
