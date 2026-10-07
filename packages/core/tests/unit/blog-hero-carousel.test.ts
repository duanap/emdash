// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installHeroCarousel } from "../../../../demos/blog/src/scripts/hero-carousel.js";

describe("homepage hero carousel", () => {
	let reduced = false;
	let visibility = "visible";
	let motion: EventTarget;
	let cleanups: Array<() => void>;
	beforeEach(() => {
		vi.useFakeTimers();
		document.body.innerHTML = "";
		reduced = false;
		visibility = "visible";
		cleanups = [];
		motion = new EventTarget();
		Object.defineProperty(motion, "matches", { get: () => reduced });
		vi.stubGlobal("matchMedia", () => motion);
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			get: () => visibility,
		});
	});
	afterEach(() => {
		cleanups.forEach((cleanup) => cleanup());
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
	function fixture(length = 3, delay?: number) {
		const root = document.createElement("section");
		if (delay) root.dataset.heroInterval = String(delay);
		root.innerHTML =
			Array.from(
				{ length },
				(_, index) => `
			<article data-hero-slide data-slide-title="文章 ${index + 1}" aria-hidden="${index !== 0}" ${index !== 0 ? "inert" : ""}>
				<a class="hero-slide-link" href="/posts/${index + 1}">文章 ${index + 1}</a>
			</article>`,
			).join("") +
			`
			<div data-hero-controls hidden>
				${Array.from({ length }, (_, i) => `<button data-hero-dot="${i}" type="button"></button>`).join("")}
				<button data-hero-prev type="button">上一张</button>
				<button data-hero-next type="button">下一张</button>
				<button data-hero-rotation type="button"><span data-hero-rotation-label></span></button>
			</div><span data-hero-count></span><p data-hero-announcement></p>`;
		document.body.append(root);
		cleanups.push(installHeroCarousel(root));
		return root;
	}
	function current(root: HTMLElement) {
		return root.querySelector('[data-hero-slide][aria-hidden="false"] a')?.getAttribute("href");
	}
	function click(root: HTMLElement, selector: string) {
		root.querySelector<HTMLButtonElement>(selector)!.click();
	}
	it("next, previous and dots select the requested article and wrap", () => {
		const root = fixture();
		expect(root.querySelector<HTMLElement>("[data-hero-controls]")?.hidden).toBe(false);
		expect(current(root)).toBe("/posts/1");
		click(root, "[data-hero-next]");
		expect(current(root)).toBe("/posts/2");
		expect(root.querySelector("[data-hero-announcement]")?.textContent).toContain("文章 2");
		click(root, "[data-hero-dot='0']");
		click(root, "[data-hero-prev]");
		expect(current(root)).toBe("/posts/3");
		expect(root.querySelectorAll("[data-hero-slide][inert]")).toHaveLength(2);
	});
	it("automatically advances without announcing unsolicited changes", () => {
		const root = fixture();
		vi.advanceTimersByTime(7000);
		expect(current(root)).toBe("/posts/2");
		expect(root.querySelector("[data-hero-announcement]")?.textContent).toBe("");
	});
	it("uses the saved playback speed", () => {
		const root = fixture(3, 3500);
		vi.advanceTimersByTime(3499);
		expect(current(root)).toBe("/posts/1");
		vi.advanceTimersByTime(1);
		expect(current(root)).toBe("/posts/2");
	});
	it("loads only the visible image and its upcoming slide", () => {
		const root = fixture(4);
		root.querySelectorAll("article").forEach((slide, index) => {
			const image = document.createElement("img");
			image.dataset.heroSrc = `/covers/${index}.webp`;
			Object.defineProperties(image, {
				naturalWidth: { value: 1600 },
				naturalHeight: { value: 900 },
			});
			slide.prepend(image);
		});
		root.dispatchEvent(new Event("hero:change"));
		expect(root.querySelectorAll("img[src]")).toHaveLength(2);
		click(root, "[data-hero-next]");
		expect(root.querySelectorAll("img[src]")).toHaveLength(3);
	});
	it("hover pauses and leaving the image resumes", () => {
		const root = fixture();
		root.dispatchEvent(new Event("mouseenter"));
		vi.advanceTimersByTime(21000);
		expect(current(root)).toBe("/posts/1");
		root.dispatchEvent(new Event("mouseleave"));
		vi.advanceTimersByTime(7000);
		expect(current(root)).toBe("/posts/2");
	});
	it("keyboard focus pauses and arrow navigation keeps focus on the visible article", () => {
		const root = fixture();
		root.querySelector<HTMLAnchorElement>("a")!.focus();
		vi.advanceTimersByTime(14000);
		expect(current(root)).toBe("/posts/1");
		root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		expect(current(root)).toBe("/posts/2");
		expect(document.activeElement?.getAttribute("href")).toBe("/posts/2");
		root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", ctrlKey: true }));
		expect(current(root)).toBe("/posts/2");
	});
	it("pause remains paused after hover ends until the visitor presses play", () => {
		const root = fixture();
		click(root, "[data-hero-rotation]");
		root.dispatchEvent(new Event("mouseleave"));
		vi.advanceTimersByTime(21000);
		expect(current(root)).toBe("/posts/1");
		expect(root.querySelector("[data-hero-rotation-label]")?.textContent).toBe("播放");
		click(root, "[data-hero-rotation]");
		vi.advanceTimersByTime(7000);
		expect(current(root)).toBe("/posts/2");
	});
	it("background tabs do not rotate", () => {
		const root = fixture();
		visibility = "hidden";
		document.dispatchEvent(new Event("visibilitychange"));
		vi.advanceTimersByTime(21000);
		expect(current(root)).toBe("/posts/1");
		visibility = "visible";
		document.dispatchEvent(new Event("visibilitychange"));
		vi.advanceTimersByTime(7000);
		expect(current(root)).toBe("/posts/2");
	});
	it("reduced-motion preference starts paused and remains manually navigable", () => {
		reduced = true;
		const root = fixture();
		vi.advanceTimersByTime(21000);
		expect(current(root)).toBe("/posts/1");
		expect(root.querySelector("[data-hero-rotation-label]")?.textContent).toBe("播放");
		click(root, "[data-hero-next]");
		expect(current(root)).toBe("/posts/2");
	});
	it("changing to reduced motion stops a running carousel", () => {
		const root = fixture();
		reduced = true;
		motion.dispatchEvent(new Event("change"));
		vi.advanceTimersByTime(14000);
		expect(current(root)).toBe("/posts/1");
	});
	function pointer(root: HTMLElement, type: string, x: number, y: number) {
		const event = new Event(type, { bubbles: true });
		Object.assign(event, { pointerType: "touch", pointerId: 1, clientX: x, clientY: y });
		root.dispatchEvent(event);
	}
	it("horizontal touch swipes change article without accidentally opening it", () => {
		const root = fixture();
		pointer(root, "pointerdown", 200, 80);
		pointer(root, "pointerup", 100, 85);
		expect(current(root)).toBe("/posts/2");
		const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
		root.querySelector('[aria-hidden="false"] a')!.dispatchEvent(clickEvent);
		expect(clickEvent.defaultPrevented).toBe(true);
	});
	it("vertical scrolling does not change the article", () => {
		const root = fixture();
		pointer(root, "pointerdown", 200, 80);
		pointer(root, "pointerup", 195, 180);
		expect(current(root)).toBe("/posts/1");
	});
	it("a drag over a navigation button does not double-advance", () => {
		const root = fixture();
		const next = root.querySelector<HTMLButtonElement>("[data-hero-next]")!;
		pointer(next, "pointerdown", 200, 80);
		pointer(next, "pointerup", 100, 85);
		next.click();
		expect(current(root)).toBe("/posts/2");
	});
	it("a single image stays readable without unnecessary controls or a timer", () => {
		const root = fixture(1);
		expect(root.querySelector<HTMLElement>("[data-hero-controls]")?.hidden).toBe(true);
		vi.advanceTimersByTime(21000);
		expect(current(root)).toBe("/posts/1");
	});
	it("sizes the frame from the active image and ignores inactive image loads", () => {
		const root = fixture(2);
		const images = Array.from(root.querySelectorAll("[data-hero-slide]"), (slide, index) => {
			const image = document.createElement("img");
			Object.defineProperty(image, "naturalWidth", { value: index === 0 ? 1600 : 900 });
			Object.defineProperty(image, "naturalHeight", { value: 900 });
			slide.append(image);
			return image;
		});
		images[0]!.dispatchEvent(new Event("load"));
		expect(root.style.getPropertyValue("--hero-aspect-ratio")).toBe("1600 / 900");
		images[1]!.dispatchEvent(new Event("load"));
		expect(root.style.getPropertyValue("--hero-aspect-ratio")).toBe("1600 / 900");
		click(root, "[data-hero-next]");
		expect(root.style.getPropertyValue("--hero-aspect-ratio")).toBe("900 / 900");
	});
	it("uses the natural dimensions for a single static slide", () => {
		const root = fixture(1);
		const image = document.createElement("img");
		Object.defineProperty(image, "naturalWidth", { value: 800 });
		Object.defineProperty(image, "naturalHeight", { value: 1200 });
		root.querySelector("[data-hero-slide]")!.append(image);
		image.dispatchEvent(new Event("load"));
		expect(root.style.getPropertyValue("--hero-aspect-ratio")).toBe("800 / 1200");
	});
	it("cleanup removes timers and handlers before navigation", () => {
		const root = fixture();
		document.dispatchEvent(new Event("astro:before-swap"));
		click(root, "[data-hero-next]");
		vi.advanceTimersByTime(21000);
		expect(current(root)).toBe("/posts/1");
	});
});
