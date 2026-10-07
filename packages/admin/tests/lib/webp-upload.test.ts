import { expect, it } from "vitest";

import { prepareWebpUpload } from "../../src/lib/webp-upload.js";

it("encodes a real PNG as WebP while retaining its aspect ratio and alpha", async () => {
	const source = document.createElement("canvas");
	source.width = 3200;
	source.height = 1600;
	source.getContext("2d")!.fillRect(0, 0, 100, 100);
	const blob = await new Promise<Blob>((resolve) =>
		source.toBlob((value) => resolve(value!), "image/png"),
	);
	const output = await prepareWebpUpload(new File([blob], "cover.png", { type: "image/png" }));
	expect(output.type).toBe("image/webp");
	expect(output.name).toBe("cover.webp");
	const bitmap = await createImageBitmap(output);
	expect([bitmap.width, bitmap.height]).toEqual([2560, 1280]);
	const canvas = document.createElement("canvas");
	canvas.width = 2560;
	canvas.height = 1280;
	const context = canvas.getContext("2d")!;
	context.drawImage(bitmap, 0, 0);
	expect(context.getImageData(200, 200, 1, 1).data[3]).toBe(0);
	bitmap.close();
});
it("keeps animation and non-image files untouched and honors cancellation", async () => {
	for (const type of ["image/gif", "image/webp", "application/pdf"]) {
		const file = new File(["data"], "file", { type });
		expect(await prepareWebpUpload(file)).toBe(file);
	}
	const controller = new AbortController();
	controller.abort();
	await expect(
		prepareWebpUpload(new File([], "x.png", { type: "image/png" }), controller.signal),
	).rejects.toThrow();
});
