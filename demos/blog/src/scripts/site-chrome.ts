export function installSiteChrome() {
	const events = new AbortController();
	const options = { signal: events.signal };
	const root = document.documentElement;
	const header = document.querySelector<HTMLElement>(".site-header[data-immersive]");
	function updateHeader() {
		if (header) header.dataset.scrolled = String(window.scrollY > 0);
	}
	updateHeader();
	if (header) {
		window.addEventListener("scroll", updateHeader, { ...options, passive: true });
		window.addEventListener("pageshow", updateHeader, options);
	}
	const themeButtons = document.querySelectorAll<HTMLButtonElement>(".theme-btn");
	const toggle = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
	const darkPreference = window.matchMedia("(prefers-color-scheme: dark)");
	const searchButton = document.querySelector<HTMLButtonElement>("[data-mobile-search]");
	const panel = document.getElementById("mobile-search-panel");
	const mobileInput = panel?.querySelector<HTMLInputElement>("input");
	function dark() {
		return (
			root.classList.contains("dark") ||
			(!root.classList.contains("light") && darkPreference.matches)
		);
	}
	function updateToggle() {
		toggle?.setAttribute("aria-pressed", String(dark()));
		toggle?.setAttribute("aria-label", dark() ? "切换到浅色模式" : "切换到夜间模式");
	}
	function setTheme(theme: string) {
		root.classList.remove("light", "dark");
		if (theme === "light" || theme === "dark") root.classList.add(theme);
		const secure = location.protocol === "https:" ? "; Secure" : "";
		document.cookie = `theme=${theme === "system" ? "" : theme}; path=/; max-age=${theme === "system" ? 0 : 31536000}; SameSite=Lax${secure}`;
		themeButtons.forEach((button) => {
			const active = button.dataset.theme === theme;
			button.classList.toggle("active", active);
			button.setAttribute("aria-pressed", String(active));
		});
		updateToggle();
	}
	const stored = document.cookie
		.split("; ")
		.find((cookie) => cookie.startsWith("theme="))
		?.slice(6);
	setTheme(stored === "light" || stored === "dark" ? stored : "system");
	themeButtons.forEach((button) =>
		button.addEventListener("click", () => setTheme(button.dataset.theme ?? "system"), options),
	);
	toggle?.addEventListener("click", () => setTheme(dark() ? "light" : "dark"), options);
	darkPreference.addEventListener("change", updateToggle, options);
	function closeSearch(restoreFocus = false) {
		if (!panel || panel.hidden) return;
		panel.hidden = true;
		searchButton?.setAttribute("aria-expanded", "false");
		if (restoreFocus) searchButton?.focus();
	}
	function openSearch() {
		if (!panel) return;
		panel.hidden = false;
		searchButton?.setAttribute("aria-expanded", "true");
		mobileInput?.focus();
	}
	searchButton?.addEventListener(
		"click",
		() => {
			if (panel?.hidden) openSearch();
			else closeSearch();
		},
		options,
	);
	document.addEventListener(
		"keydown",
		(event) => {
			if (event.key === "Escape") closeSearch(true);
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				if (window.matchMedia("(max-width: 640px)").matches) openSearch();
				else document.querySelector<HTMLInputElement>(".site-search-input")?.focus();
			}
		},
		options,
	);
	document.addEventListener(
		"pointerdown",
		(event) => {
			if (
				event.target instanceof Node &&
				!panel?.contains(event.target) &&
				!searchButton?.contains(event.target)
			)
				closeSearch();
		},
		options,
	);
	return () => events.abort();
}
