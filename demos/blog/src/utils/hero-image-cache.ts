import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const pendingKey = Symbol.for("duanap:hero-image-queue");
// eslint-disable-next-line typescript/no-unsafe-type-assertion -- globalThis singleton shared by SSR chunks
const globals = globalThis as unknown as Record<symbol, { tail: Promise<void> } | undefined>;
const queue = (globals[pendingKey] ??= { tail: Promise.resolve() });

export async function cachedHeroImage(
	directory: string,
	key: string,
	width: number,
	generate: () => Promise<Uint8Array>,
): Promise<Uint8Array> {
	const filename = join(
		directory,
		createHash("sha256").update(`v1:${key}:${width}`).digest("hex") + ".webp",
	);
	async function cached() {
		try {
			if (Date.now() - (await stat(filename)).mtimeMs < 3_600_000) return await readFile(filename);
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
		}
		return null;
	}
	const existing = await cached();
	if (existing) return existing;
	const task = queue.tail.then(async () => {
		const ready = await cached();
		if (ready) return ready;
		const bytes = await generate();
		await mkdir(directory, { recursive: true });
		const temporary = filename + "." + crypto.randomUUID() + ".tmp";
		await writeFile(temporary, bytes);
		await rename(temporary, filename);
		return bytes;
	});
	queue.tail = task.then(
		() => undefined,
		() => undefined,
	);
	return task;
}
