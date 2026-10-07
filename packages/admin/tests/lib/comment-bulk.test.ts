import { afterEach, expect, it, vi } from "vitest";

import { bulkCommentAction } from "../../src/lib/api/comments.js";

afterEach(() => vi.restoreAllMocks());

it("restores more than one server batch without losing selected comments", async () => {
	const stored = new Map(Array.from({ length: 251 }, (_, i) => [`comment-${i}`, "trash"]));
	vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
		if (typeof init?.body !== "string") throw new TypeError("Expected JSON request body");
		const input = JSON.parse(init.body) as { ids: string[]; action: string };
		if (input.ids.length > 100)
			return Response.json(
				{ error: { code: "VALIDATION_ERROR", message: "Too many IDs" } },
				{ status: 400 },
			);
		for (const id of input.ids)
			stored.set(id, input.action === "restore" ? "pending" : input.action);
		return Response.json({ success: true, data: { affected: input.ids.length } });
	});
	expect(await bulkCommentAction([...stored.keys()], "restore")).toEqual({ affected: 251 });
	expect([...stored.values()].every((status) => status === "pending")).toBe(true);
});

it("stops on a failed batch and surfaces its error", async () => {
	let calls = 0;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
		calls++;
		if (typeof init?.body !== "string") throw new TypeError("Expected JSON request body");
		const input = JSON.parse(init.body) as { ids: string[] };
		return calls === 2
			? Response.json(
					{ error: { code: "FORBIDDEN", message: "Permission denied" } },
					{ status: 403 },
				)
			: Response.json({ success: true, data: { affected: input.ids.length } });
	});
	await expect(
		bulkCommentAction(
			Array.from({ length: 251 }, (_, i) => `comment-${i}`),
			"delete",
		),
	).rejects.toMatchObject({ status: 403 });
	expect(calls).toBe(2);
});
