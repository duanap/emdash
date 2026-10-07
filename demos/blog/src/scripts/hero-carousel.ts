function loadHeroImage(image: HTMLImageElement | null) {
	if (!image || image.getAttribute("src") || !image.dataset.heroSrc) return;
	if (image.dataset.heroSrcset) image.srcset = image.dataset.heroSrcset;
	image.src = image.dataset.heroSrc;
}

export function installHeroImageSizing(root: HTMLElement): () => void {
	const events = new AbortController();
	const slides = [...root.querySelectorAll<HTMLElement>("[data-hero-slide]")];
	function size() {
		const image = root.querySelector<HTMLImageElement>(
			'[data-hero-slide][aria-hidden="false"] img',
		);
		loadHeroImage(image);
		if (image?.naturalWidth && image.naturalHeight) {
			root.style.setProperty(
				"--hero-aspect-ratio",
				`${image.naturalWidth} / ${image.naturalHeight}`,
			);
			const current = slides.findIndex((slide) => slide.getAttribute("aria-hidden") === "false");
			if (slides.length > 1)
				loadHeroImage(slides[(current + 1) % slides.length]?.querySelector("img") ?? null);
		}
	}
	size();
	root.addEventListener("load", size, { capture: true, signal: events.signal });
	root.addEventListener("hero:change", size, { signal: events.signal });
	root.addEventListener(
		"error",
		(event) => {
			const image = event.target;
			if (!(image instanceof HTMLImageElement) || !image.dataset.heroOriginal) return;
			const original = image.dataset.heroOriginal;
			delete image.dataset.heroOriginal;
			image.removeAttribute("srcset");
			image.src = original;
		},
		{ capture: true, signal: events.signal },
	);
	return () => events.abort();
}

export function installHeroCarousel(root: HTMLElement, intervalMs?: number): () => void {
	const configured = intervalMs ?? Number(root.dataset.heroInterval ?? 7000);
	const delay = Number.isFinite(configured) ? Math.max(2000, Math.min(60000, configured)) : 7000;
	const slides = [...root.querySelectorAll<HTMLElement>("[data-hero-slide]")];
	const controls = root.querySelector<HTMLElement>("[data-hero-controls]");
	if (root.dataset.heroInitialized === "true") return () => {};
	const removeImageSizing = installHeroImageSizing(root);
	if (slides.length < 2 || !controls) return removeImageSizing;
	root.dataset.heroInitialized = "true";
	controls.hidden = false;
	const dots = [...root.querySelectorAll<HTMLButtonElement>("[data-hero-dot]")];
	const rotation = root.querySelector<HTMLButtonElement>("[data-hero-rotation]");
	const rotationLabel = root.querySelector<HTMLElement>("[data-hero-rotation-label]");
	const count = root.querySelector<HTMLElement>("[data-hero-count]");
	const announcement = root.querySelector<HTMLElement>("[data-hero-announcement]");
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const events = new AbortController();
	const options = { signal: events.signal };
	let index = 0;
	let paused = motion.matches;
	let hovered = root.matches(":hover");
	let focused = root.contains(document.activeElement);
	let timer: number | undefined;
	let touch: { x: number; y: number; id: number } | undefined;
	let suppressClickUntil = 0;

	function schedule() {
		window.clearTimeout(timer);
		if (paused || hovered || focused || document.visibilityState === "hidden") return;
		timer = window.setTimeout(show, delay, index + 1, false);
	}
	function show(next: number, announce = true) {
		const moveFocus = slides[index]?.contains(document.activeElement);
		index = (next + slides.length) % slides.length;
		slides.forEach((slide, position) => {
			const active = position === index;
			slide.classList.toggle("is-active", active);
			slide.setAttribute("aria-hidden", String(!active));
			slide.toggleAttribute("inert", !active);
		});
		root.dispatchEvent(new Event("hero:change"));
		dots.forEach((dot, position) => dot.setAttribute("aria-current", String(position === index)));
		if (count)
			count.textContent = `${String(index + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
		if (announce && announcement)
			announcement.textContent = `第 ${index + 1} 张，共 ${slides.length} 张：${slides[index]?.dataset.slideTitle ?? ""}`;
		if (moveFocus)
			slides[index]?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
		schedule();
	}
	function updateRotation() {
		rotation?.setAttribute("aria-label", paused ? "开始自动轮播" : "暂停自动轮播");
		if (rotationLabel) rotationLabel.textContent = paused ? "播放" : "暂停";
		schedule();
	}
	root.querySelector("[data-hero-prev]")?.addEventListener("click", () => show(index - 1), options);
	root.querySelector("[data-hero-next]")?.addEventListener("click", () => show(index + 1), options);
	dots.forEach((dot, position) => dot.addEventListener("click", () => show(position), options));
	rotation?.addEventListener(
		"click",
		() => {
			paused = !paused;
			if (!paused) focused = false;
			updateRotation();
		},
		options,
	);
	root.addEventListener(
		"mouseenter",
		() => {
			hovered = true;
			schedule();
		},
		options,
	);
	root.addEventListener(
		"mouseleave",
		() => {
			hovered = false;
			schedule();
		},
		options,
	);
	root.addEventListener(
		"focusin",
		() => {
			focused = true;
			schedule();
		},
		options,
	);
	root.addEventListener(
		"focusout",
		(event) => {
			focused = event.relatedTarget instanceof Node && root.contains(event.relatedTarget);
			schedule();
		},
		options,
	);
	root.addEventListener(
		"keydown",
		(event) => {
			if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
			if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
			event.preventDefault();
			show(index + (event.key === "ArrowRight" ? 1 : -1));
		},
		options,
	);
	root.addEventListener(
		"pointerdown",
		(event) => {
			if (
				event.pointerType === "touch" &&
				!(event.target instanceof Element && event.target.closest("[data-hero-controls]"))
			)
				touch = { x: event.clientX, y: event.clientY, id: event.pointerId };
		},
		options,
	);
	root.addEventListener(
		"pointerup",
		(event) => {
			if (!touch || touch.id !== event.pointerId) return;
			const dx = event.clientX - touch.x;
			const dy = event.clientY - touch.y;
			touch = undefined;
			if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
			suppressClickUntil = Date.now() + 400;
			show(index + (dx < 0 ? 1 : -1));
		},
		options,
	);
	root.addEventListener(
		"pointercancel",
		() => {
			touch = undefined;
		},
		options,
	);
	root.addEventListener(
		"click",
		(event) => {
			if (
				Date.now() >= suppressClickUntil ||
				!(event.target instanceof Element) ||
				!event.target.closest(".hero-slide-link")
			)
				return;
			event.preventDefault();
		},
		{ ...options, capture: true },
	);
	document.addEventListener("visibilitychange", schedule, options);
	motion.addEventListener(
		"change",
		() => {
			if (motion.matches) paused = true;
			updateRotation();
		},
		options,
	);
	function cleanup() {
		window.clearTimeout(timer);
		removeImageSizing();
		events.abort();
		delete root.dataset.heroInitialized;
	}
	document.addEventListener("astro:before-swap", cleanup, { ...options, once: true });
	updateRotation();
	return cleanup;
}
