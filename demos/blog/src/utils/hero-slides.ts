import type { EditProxy, MediaValue } from "emdash";
const INTERNAL_IMAGE = /^\/_emdash\/api\/media\/file\/([A-Za-z0-9._-]+)$/;
const RASTER_KEY = /^[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|avif)$/i;

export interface HeroCarouselOptions {
	intervalSeconds?: number;
	blurPx?: number;
	overlayOpacity?: number;
	textPosition?:
		| "top-start"
		| "top-center"
		| "top-end"
		| "center-start"
		| "center"
		| "center-end"
		| "bottom-start"
		| "bottom-center"
		| "bottom-end";
	titleSize?: number;
	mobileTitleSize?: number;
	descriptionSize?: number;
	height?: number;
	mobileHeight?: number;
}

export function heroImageSources(image: MediaValue | string | undefined) {
	const src = typeof image === "string" ? image : image?.src;
	const key =
		src?.match(INTERNAL_IMAGE)?.[1] ??
		(typeof image === "object" ? image.meta?.storageKey : undefined);
	if (typeof key !== "string" || !RASTER_KEY.test(key)) return null;
	const url = (width: number) => `/covers/${key}.webp?w=${width}`;
	return {
		src: url(1600),
		srcset: [480, 960, 1600, 2560].map((width) => `${url(width)} ${width}w`).join(", "),
	};
}

export interface HeroSlide {
	title: string;
	href: string;
	image?: MediaValue | string;
	excerpt?: string;
	date?: Date;
	readingTime?: number;
	edit?: EditProxy;
}

export function selectHeroSlides(
	custom: Array<{ title: string; imageUrl: string; url: string; excerpt?: string }> | undefined,
	fallback: HeroSlide[],
): HeroSlide[] {
	if (!custom?.length) return fallback;
	return custom.slice(0, 8).map((slide) => ({
		title: slide.title,
		href: slide.url,
		image: slide.imageUrl,
		excerpt: slide.excerpt,
	}));
}
