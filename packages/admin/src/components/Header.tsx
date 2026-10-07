import { Button, LinkButton, Popover } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { apiFetch } from "../lib/api/client";
import { useCurrentUser } from "../lib/api/current-user";
import { SignOut, Shield, Gear, ArrowSquareOut, MagnifyingGlass, Key } from "../lib/icons.js";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

export type { CurrentUser } from "../lib/api/current-user";
const IS_APPLE_PLATFORM =
	typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

async function handleLogout() {
	// Clear the public-site toolbar-bootstrap flag (see Shell.tsx).
	try {
		localStorage.removeItem("emdash-editor");
		localStorage.removeItem("emdash-toolbar-labels");
	} catch {
		// ignore — flag is best-effort
	}
	const res = await apiFetch("/_emdash/api/auth/logout?redirect=/_emdash/admin/login", {
		method: "POST",
		credentials: "same-origin",
	});
	if (res.redirected) {
		window.location.href = res.url;
	} else {
		window.location.href = "/_emdash/admin/login";
	}
}

/**
 * Admin header with mobile menu toggle and user actions.
 * Uses useSidebar() hook from kumo Sidebar.Provider context.
 */
export function Header({ onSearch }: { onSearch?: () => void } = {}) {
	const { t } = useLingui();
	const [userMenuOpen, setUserMenuOpen] = React.useState(false);

	const { data: user } = useCurrentUser();

	// Get display name and initials
	const displayName = user?.name || user?.email || t`User`;
	const initialsSource = user?.name || user?.email || "U";
	const initials = (initialsSource[0] ?? "U").toUpperCase();

	return (
		// h-[58px] is mirrored by ADMIN_HEADER_HEIGHT_PX in ContentEditor.tsx
		// (the settings sheet offsets its body by it) — change both together.
		<header className="sticky top-0 z-10 flex h-[58px] shrink-0 items-center gap-3 border-b bg-kumo-base px-4 sm:px-6">
			{/* The desktop trigger lives in the sidebar footer; mobile keeps it here so the closed sheet can reopen. */}
			<Sidebar.Trigger className="cursor-pointer md:hidden rtl:rotate-180" />
			<Button
				variant="outline"
				size="sm"
				onClick={onSearch}
				className="me-auto min-w-0 flex-1 justify-start gap-2 sm:max-w-96"
				aria-label={t`Search content and features`}
			>
				<MagnifyingGlass aria-hidden="true" className="size-4 shrink-0" />
				<span className="truncate text-kumo-subtle">{t`Search content and features…`}</span>
				<kbd className="ms-auto hidden shrink-0 rounded bg-kumo-tint px-1.5 text-xs text-kumo-subtle sm:inline">
					{IS_APPLE_PLATFORM ? "⌘ K" : "Ctrl K"}
				</kbd>
			</Button>

			{/* Right side actions */}
			<div className="flex items-center gap-2">
				{/* View site link */}
				<LinkButton variant="ghost" size="sm" href="/" external className="hidden sm:inline-flex">
					<ArrowSquareOut className="h-4 w-4 me-1" />
					{t`View Site`}
				</LinkButton>

				{/* Theme toggle */}
				<ThemeToggle />

				{/* User menu */}
				<Popover open={userMenuOpen} onOpenChange={setUserMenuOpen}>
					<Popover.Trigger asChild>
						<Button variant="ghost" size="sm" className="gap-2">
							{user?.avatarUrl ? (
								<img src={user.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
							) : (
								<div className="h-5 w-5 rounded-full bg-kumo-brand/10 flex items-center justify-center text-[10px] font-medium">
									{initials}
								</div>
							)}
							<span className="hidden sm:inline max-w-[120px] truncate">{displayName}</span>
						</Button>
					</Popover.Trigger>

					<Popover.Content className="w-56 p-2" align="end">
						{/* User info */}
						<div className="px-3 py-2 border-b mb-1">
							<div className="font-medium truncate">{user?.name || t`User`}</div>
							<div className="text-xs text-kumo-subtle truncate">{user?.email}</div>
						</div>
						<div className="grid gap-1">
							<Link
								to="/settings/security"
								onClick={() => setUserMenuOpen(false)}
								className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-kumo-tint"
							>
								<Shield className="h-4 w-4" />
								{t`Security Settings`}
							</Link>
							<Link
								to="/settings/personal"
								onClick={() => setUserMenuOpen(false)}
								className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-kumo-tint"
							>
								<Gear className="h-4 w-4" />
								{t`Personal settings`}
							</Link>
							<Link
								to="/settings/api-tokens"
								onClick={() => setUserMenuOpen(false)}
								className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-kumo-tint"
							>
								<Key className="size-4" />
								{t`API Tokens`}
							</Link>
							<hr className="my-1" />
							<Button
								variant="ghost"
								onClick={handleLogout}
								className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-kumo-danger hover:bg-kumo-danger/10 w-full text-start cursor-pointer"
							>
								<SignOut className="h-4 w-4" />
								{t`Log out`}
							</Button>
						</div>
					</Popover.Content>
				</Popover>
			</div>
		</header>
	);
}
