import assert from "node:assert/strict";

import { resolveCover } from "../src/utils/default-images.ts";

for (const kind of ["posts", "life", "projects"]) {
	const fallback = resolveCover(undefined, kind);
	assert.ok(fallback.startsWith("/defaults/"));
	for (let index = 1; index <= 6; index++) {
		assert.equal(resolveCover({ id: "", src: `/covers/cover-${index}.svg` }, kind), fallback);
	}
	for (const image of [
		{ id: "uploaded-media-id" },
		{ id: "", src: "https://images.example/custom.jpg", alt: "Custom cover" },
		{ id: "", src: "/covers/custom.svg" },
		"/uploads/custom.jpg",
	]) {
		assert.equal(resolveCover(image, kind), image);
	}
}
assert.notEqual(resolveCover(undefined, "posts"), resolveCover(undefined, "life"));
assert.notEqual(resolveCover(undefined, "projects"), resolveCover(undefined, "posts"));
console.log(
	"Default cover selection: missing/seed covers replaced; custom media preserved in all three collections.",
);
