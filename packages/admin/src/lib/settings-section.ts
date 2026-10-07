export type SettingsSectionName = "site" | "system" | "personal";
const ADMIN_PREFIX_PATTERN = /^\/_emdash\/admin/;

const personalPaths = ["/settings/personal", "/settings/security", "/settings/api-tokens"];
const systemPaths = [
	"/settings/system",
	"/settings/email",
	"/settings/backups",
	"/settings/transfer",
	"/settings/allowed-domains",
	"/settings/media-usage",
	"/users",
	"/content-types",
	"/byline-schema",
	"/plugins-manager",
	"/plugins/registry",
	"/import/wordpress",
];

function matches(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}

export function settingsSection(path: string): SettingsSectionName {
	const pathname = path.replace(ADMIN_PREFIX_PATTERN, "").split("?")[0] ?? path;
	if (personalPaths.some((prefix) => matches(pathname, prefix))) return "personal";
	if (systemPaths.some((prefix) => matches(pathname, prefix)) || pathname === "/settings")
		return "system";
	return "site";
}

export function isSettingsPath(path: string): boolean {
	return ["/settings", "/menus", "/widgets", "/redirects", ...systemPaths].some((prefix) =>
		matches(path, prefix),
	);
}
