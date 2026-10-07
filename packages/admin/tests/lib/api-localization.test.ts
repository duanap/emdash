import { i18n } from "@lingui/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiResponseError, throwResponseError } from "../../src/lib/api/client.js";
import { messages } from "../../src/locales/zh-CN/messages.mjs";

beforeEach(() => i18n.loadAndActivate({ locale: "zh-CN", messages }));
afterEach(() => i18n.loadAndActivate({ locale: "en", messages: {} }));

describe("Simplified Chinese API feedback", () => {
	it("localizes permission failures while preserving their code, status, and server details", async () => {
		const details = { permission: "settings:manage" };
		const response = Response.json(
			{ error: { code: "FORBIDDEN", message: "Permission denied by server", details } },
			{ status: 403 },
		);
		const error = await throwResponseError(response, "Untranslated fallback").catch(
			(caught: unknown) => caught,
		);
		expect(error).toBeInstanceOf(ApiResponseError);
		if (!(error instanceof ApiResponseError)) throw new Error("Expected API failure");
		expect(error.message).toBe("你没有执行此操作的权限。");
		expect(error.code).toBe("FORBIDDEN");
		expect(error.status).toBe(403);
		expect(error.details).toEqual(details);
		expect(error.serverMessage).toBe("Permission denied by server");
	});
	it("uses Chinese fallback text when neither an unknown server message nor its fallback has a translation", async () => {
		const response = Response.json(
			{ error: { code: "UNKNOWN_OPERATION_ERROR", message: "An unrecognized server failure" } },
			{ status: 500 },
		);
		await expect(throwResponseError(response, "Unknown English fallback")).rejects.toThrow(
			"请求失败，请重试。",
		);
	});
});
