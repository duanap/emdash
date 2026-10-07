import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
const FILE_EXTENSION = /\.[^.]+$/;

export async function prepareWebpUpload(file: File, signal?: AbortSignal): Promise<File> {
	signal?.throwIfAborted();
	if (!["image/jpeg", "image/png", "image/bmp", "image/avif", "image/svg+xml"].includes(file.type))
		return file;
	// APNG frames would be lost by the browser canvas encoder.
	if (file.type === "image/png") {
		const bytes = new Uint8Array(await file.arrayBuffer());
		const view = new DataView(bytes.buffer);
		for (let offset = 8; offset + 12 <= bytes.length;) {
			const length = view.getUint32(offset);
			const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
			if (type === "acTL") return file;
			if (type === "IDAT") break;
			offset += length + 12;
		}
	}
	const objectUrl = URL.createObjectURL(file);
	const image = new Image();
	try {
		await new Promise<void>((resolve, reject) => {
			const abort = () => reject(signal?.reason);
			image.onload = () => {
				signal?.removeEventListener("abort", abort);
				resolve();
			};
			image.onerror = () => {
				signal?.removeEventListener("abort", abort);
				reject(new Error(i18n._(msg`Could not read the image for WebP conversion`)));
			};
			signal?.addEventListener("abort", abort, { once: true });
			if (signal?.aborted) {
				abort();
				return;
			}
			image.src = objectUrl;
		});
		signal?.throwIfAborted();
		const scale = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight));
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
		canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
		const context = canvas.getContext("2d");
		if (!context) throw new Error(i18n._(msg`WebP conversion is unavailable in this browser`));
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/webp", 0.85),
		);
		signal?.throwIfAborted();
		if (!blob || blob.type !== "image/webp")
			throw new Error(i18n._(msg`WebP conversion is unavailable in this browser`));
		return new File([blob], file.name.replace(FILE_EXTENSION, "") + ".webp", {
			type: "image/webp",
			lastModified: file.lastModified,
		});
	} finally {
		image.onload = null;
		image.onerror = null;
		URL.revokeObjectURL(objectUrl);
	}
}
