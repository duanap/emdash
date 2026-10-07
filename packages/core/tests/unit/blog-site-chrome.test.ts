// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installSiteChrome } from "../../../../demos/blog/src/scripts/site-chrome.js";

describe("mobile header search and theme", () => {
	let cleanup: () => void;
	let dark = false;
	let mobile = true;
	let preference: EventTarget;
	beforeEach(() => {
		document.cookie = "theme=; path=/; max-age=0";
		document.documentElement.className = "";
		document.body.innerHTML = `<button data-theme-toggle></button><button class="theme-btn" data-theme="system"></button><button data-mobile-search aria-expanded="false"></button><div id="mobile-search-panel" hidden><input></div><input class="site-search-input"><button id="outside"></button>`;
		dark = false;
		mobile = true;
		preference = new EventTarget();
		Object.defineProperty(preference, "matches", { get: () => dark });
		vi.stubGlobal("matchMedia", (query: string) =>
			query.includes("color-scheme") ? preference : { matches: mobile },
		);
	});
	afterEach(() => {
		cleanup?.();
		vi.unstubAllGlobals();
	});
	const button = () => document.querySelector<HTMLButtonElement>("[data-mobile-search]")!;
	const panel = () => document.getElementById("mobile-search-panel")!;
	it("opens search and focuses its input, then Escape restores focus to the trigger", () => {
		cleanup = installSiteChrome();
		button().click();
		expect(panel().hidden).toBe(false);
		expect(document.activeElement).toBe(panel().querySelector("input"));
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		expect(panel().hidden).toBe(true);
		expect(document.activeElement).toBe(button());
	});
	it("search shortcut uses the mobile panel or desktop input at the active breakpoint", () => {
		cleanup = installSiteChrome();
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
		expect(panel().hidden).toBe(false);
		mobile = false;
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
		expect(document.activeElement).toBe(document.querySelector(".site-search-input"));
	});
	it("clicking outside closes search without hiding it during input interaction", () => {
		cleanup = installSiteChrome();
		button().click();
		panel()
			.querySelector("input")!
			.dispatchEvent(new Event("pointerdown", { bubbles: true }));
		expect(panel().hidden).toBe(false);
		document.getElementById("outside")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
		expect(panel().hidden).toBe(true);
	});
	it("night-mode toggle follows the system initially and persists an explicit choice", () => {
		dark = true;
		cleanup = installSiteChrome();
		const toggle = document.querySelector<HTMLButtonElement>("[data-theme-toggle]")!;
		expect(toggle.getAttribute("aria-pressed")).toBe("true");
		toggle.click();
		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(document.cookie).toContain("theme=light");
		toggle.click();
		expect(document.cookie).toContain("theme=dark");
	});
	it("returning to system mode clears the override and reacts to system changes", () => {
		document.cookie = "theme=dark; path=/";
		cleanup = installSiteChrome();
		document.querySelector<HTMLButtonElement>(".theme-btn")!.click();
		expect(document.cookie).not.toContain("theme=");
		dark = true;
		preference.dispatchEvent(new Event("change"));
		expect(document.querySelector("[data-theme-toggle]")?.getAttribute("aria-pressed")).toBe(
			"true",
		);
	});
	it("restores the header state when scrolling back to the top or restoring a scrolled page", () => {
		const header = document.createElement("header");
		header.className = "site-header";
		header.setAttribute("data-immersive", "true");
		document.body.prepend(header);
		let position = 0;
		Object.defineProperty(window, "scrollY", { configurable: true, get: () => position });
		cleanup = installSiteChrome();
		expect(header.dataset.scrolled).toBe("false");
		position = 120;
		window.dispatchEvent(new Event("scroll"));
		expect(header.dataset.scrolled).toBe("true");
		position = 0;
		window.dispatchEvent(new Event("scroll"));
		expect(header.dataset.scrolled).toBe("false");
		position = 300;
		window.dispatchEvent(new Event("pageshow"));
		expect(header.dataset.scrolled).toBe("true");
	});
});
