import type { MediaValue } from "emdash";

export const DEFAULT_AVATAR = "/defaults/user-avatar.png";
export const DEFAULT_PROJECT_ICON = "/defaults/project-icon.png";
export const DEFAULT_POST_COVER = "/defaults/post-cover.webp";
export const DEFAULT_LIFE_COVER = "/defaults/life-cover.webp";
const SEED_COVER = /^\/covers\/cover-[1-6]\.svg$/;

export function resolveCover(
	image: MediaValue | string | undefined,
	kind: "posts" | "life" | "projects",
): MediaValue | string {
	const src = typeof image === "string" ? image : image?.src;
	if (image && !SEED_COVER.test(src ?? "")) return image;
	if (kind === "life") return DEFAULT_LIFE_COVER;
	if (kind === "projects") return DEFAULT_PROJECT_ICON;
	return DEFAULT_POST_COVER;
}
