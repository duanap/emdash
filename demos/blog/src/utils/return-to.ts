export function safeReturnTo(value: string | null, origin: string): string {
	if (!value) return "/";
	try {
		const target = new URL(value, origin);
		if (target.origin !== origin || !["http:", "https:"].includes(target.protocol)) return "/";
		return target.pathname + target.search + target.hash;
	} catch {
		return "/";
	}
}
