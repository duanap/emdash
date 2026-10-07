import { afterEach, expect, it, vi } from "vitest";

import { fetchMessageBoardContainer } from "../../src/lib/api/comments.js";

afterEach(() => vi.restoreAllMocks());

it("adds messages to the oldest published container in the active locale", async () => {
	const entries = [
		{ id: "visible-board", status: "published", locale: "zh-CN", createdAt: "2026-01-01" },
		{ id: "new-unused-board", status: "published", locale: "zh-CN", createdAt: "2026-02-01" },
		{ id: "new-draft", status: "draft", locale: "zh-CN", createdAt: "2026-03-01" },
		{ id: "other-locale", status: "published", locale: "en", createdAt: "2025-01-01" },
	];
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		const value = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		const url = new URL(value, window.location.origin);
		const status = url.searchParams.get("status");
		const locale = url.searchParams.get("locale") ?? "en";
		const items = entries
			.filter((entry) => (!status || entry.status === status) && entry.locale === locale)
			.toSorted((a, b) =>
				url.searchParams.get("order") === "asc"
					? a.createdAt.localeCompare(b.createdAt)
					: b.createdAt.localeCompare(a.createdAt),
			)
			.slice(0, Number(url.searchParams.get("limit") ?? 50));
		return Response.json({ success: true, data: { items } });
	});
	expect((await fetchMessageBoardContainer("wall", "zh-CN"))?.id).toBe("visible-board");
});
