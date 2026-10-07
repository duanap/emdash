const PUBLIC_ORIGINS = new Set([
	"https://duanap.cn",
	"https://www.duanap.cn",
	"https://blog.duanap.cn",
]);

export function isQqSiteOrigin(origin: string): boolean {
	try {
		const url = new URL(origin);
		return (
			PUBLIC_ORIGINS.has(url.origin) ||
			(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
		);
	} catch {
		return false;
	}
}

export function qqReturnTarget(value: string | null, requestUrl: URL): string {
	const fallback = new URL("/", requestUrl.origin).href;
	if (!value || !isQqSiteOrigin(requestUrl.origin)) return fallback;
	try {
		if (value.startsWith("//") || value.includes("\\")) return fallback;
		const target = new URL(value, requestUrl.origin);
		if (!isQqSiteOrigin(target.origin) || target.username || target.password) return fallback;
		return target.href;
	} catch {
		return fallback;
	}
}
