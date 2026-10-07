import { Combobox, Loader, inputVariants } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { fetchManifest } from "../lib/api.js";
import { useCurrentUser } from "../lib/api/current-user.js";
import {
	Gear,
	ShareNetwork,
	MagnifyingGlass,
	Shield,
	Globe,
	Key,
	Envelope,
	DownloadSimple,
	ArrowsLeftRight,
	CaretDown,
	Images,
	Users,
} from "../lib/icons.js";
import type { SettingsSectionName } from "../lib/settings-section.js";
import { SUPPORTED_LOCALES } from "../locales/index.js";
import { useLocale } from "../locales/useLocale.js";
import { SettingsNavRow, SettingsSection } from "./settings/SettingsLayout.js";
import { BYLINE_SCHEMA_NAV_ITEM } from "./Sidebar.js";

export function Settings({ section = "all" }: { section?: SettingsSectionName | "all" }) {
	const { t } = useLingui();
	const { data: currentUser, isLoading: userLoading } = useCurrentUser();
	const { data: manifest } = useQuery({ queryKey: ["manifest"], queryFn: fetchManifest });
	const { locale, setLocale } = useLocale();
	const role = currentUser?.role ?? 0;
	const isAdmin = role >= 50;
	const isEditor = role >= 40;
	const passkey = manifest?.authMode === "passkey";
	const showSite = section === "all" || section === "site";
	const showSystem = section === "all" || section === "system";
	const showPersonal = section === "all" || section === "personal";
	const selectedLocale = SUPPORTED_LOCALES.find((option) => option.code === locale) ?? null;
	const title =
		section === "site"
			? t`Website settings`
			: section === "system"
				? t`System settings`
				: section === "personal"
					? t`Personal settings`
					: t`Settings`;
	if (userLoading) return <Loader />;
	return (
		<div className="mx-auto max-w-5xl space-y-8 pb-6">
			<header>
				<h1 className="text-3xl font-semibold text-balance">{title}</h1>
			</header>
			{showSite && isEditor && (
				<>
					{isAdmin && (
						<SettingsSection title={t`Site information`}>
							<SettingsNavRow
								to="/settings/identity"
								icon={<Globe />}
								title={t`Site Identity`}
								description={t`Site title, description, address, logo, and favicon`}
							/>
							<SettingsNavRow
								to="/settings/reading"
								icon={<Gear />}
								title={t`Reading`}
								description={t`Pagination, date format, and timezone`}
							/>
							<SettingsNavRow
								to="/settings/seo"
								icon={<MagnifyingGlass />}
								title={t`Search engine settings`}
								description={t`Search engine optimization and verification`}
							/>
							<SettingsNavRow
								to="/settings/sitemap"
								icon={<Globe />}
								title={t`Sitemap`}
								description={t`Generate and check the sitemap from published, indexable content.`}
							/>
						</SettingsSection>
					)}
					<SettingsSection title={t`Website appearance`}>
						{isAdmin && (
							<SettingsNavRow
								to="/settings/carousel"
								icon={<Images />}
								title={t`Homepage Carousel`}
								description={t`Upload carousel images and configure their links`}
							/>
						)}
						<SettingsNavRow
							to="/menus"
							icon={<Gear />}
							title={t`Website navigation`}
							description={t`Manage navigation menus and link hierarchy`}
						/>
						<SettingsNavRow
							to="/widgets"
							icon={<Images />}
							title={t`Page areas`}
							description={t`Manage widgets in sidebar and footer areas`}
						/>
						{isAdmin && (
							<SettingsNavRow
								to="/settings/footer"
								icon={<Shield />}
								title={t`Registration and footer links`}
								description={t`ICP registration, public security registration, and custom links`}
							/>
						)}
						{isAdmin && (
							<SettingsNavRow
								to="/settings/social"
								icon={<ShareNetwork />}
								title={t`Social Links`}
								description={t`Social media profile links`}
							/>
						)}
						{isAdmin && (
							<SettingsNavRow
								to="/redirects"
								icon={<ArrowsLeftRight />}
								title={t`Redirects`}
								description={t`Redirect old addresses to their new locations`}
							/>
						)}
					</SettingsSection>
				</>
			)}
			{showSystem && isAdmin && (
				<>
					<SettingsSection title={t`Accounts and content models`}>
						<SettingsNavRow
							to="/users"
							icon={<Users />}
							title={t`Admin users`}
							description={t`Manage accounts, invitations, and roles`}
						/>
						<SettingsNavRow
							to="/content-types"
							icon={<Gear />}
							title={t`Content Types`}
							description={t`Manage collections, fields, and relations`}
						/>
						<SettingsNavRow
							to={BYLINE_SCHEMA_NAV_ITEM.to}
							icon={<Users />}
							title={t`Byline Schema`}
							description={t`Configure custom fields for author credits`}
						/>
						{passkey && (
							<SettingsNavRow
								to="/settings/allowed-domains"
								icon={<Globe />}
								title={t`Self-Signup Domains`}
								description={t`Allow users from specific domains to sign up`}
							/>
						)}
					</SettingsSection>
					<SettingsSection title={t`Services and extensions`}>
						<SettingsNavRow
							to="/plugins-manager"
							icon={<Gear />}
							title={t`Plugins`}
							description={t`Manage installed plugins, permissions, and settings`}
						/>
						{manifest?.registry && (
							<SettingsNavRow
								to="/plugins/registry"
								icon={<Globe />}
								title={t`Plugin registry`}
								description={t`Browse available plugins`}
							/>
						)}
						<SettingsNavRow
							to="/settings/email"
							icon={<Envelope />}
							title={t`Email`}
							description={t`View email provider status and send test emails`}
						/>
						<SettingsNavRow
							to="/settings/media-usage"
							icon={<Images />}
							title={t`Media usage tracking`}
							description={t`Track where media is used across your content`}
						/>
					</SettingsSection>
					<SettingsSection title={t`Backups and migration`}>
						<SettingsNavRow
							to="/settings/backups"
							icon={<DownloadSimple />}
							title={t`Backups`}
							description={t`Download backups and schedule automatic backups to storage`}
						/>
						<SettingsNavRow
							to="/settings/transfer"
							icon={<ArrowsLeftRight />}
							title={t`Transfer`}
							description={t`Move this site to another EmDash installation, or import a site package`}
						/>
						<SettingsNavRow
							to="/import/wordpress"
							icon={<DownloadSimple />}
							title={t`WordPress Import`}
							description={t`Import content from WordPress`}
						/>
					</SettingsSection>
				</>
			)}
			{showPersonal && (
				<SettingsSection title={t`Personal preferences and access`}>
					{passkey && (
						<SettingsNavRow
							to="/settings/security"
							icon={<Shield />}
							title={t`Security`}
							description={t`Manage your passkeys and authentication`}
						/>
					)}
					<SettingsNavRow
						to="/settings/api-tokens"
						icon={<Key />}
						title={t`API Tokens`}
						description={t`Create personal access tokens for programmatic API access`}
					/>
					<div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="font-medium">{t`Language`}</p>
							<p className="text-sm text-kumo-subtle">{t`Choose your preferred admin language`}</p>
						</div>
						<Combobox
							items={SUPPORTED_LOCALES}
							value={selectedLocale}
							isItemEqualToValue={(option, value) => option.code === value.code}
							itemToStringValue={(option) => option.label}
							onValueChange={(option) => option && setLocale(option.code)}
						>
							<Combobox.Trigger
								aria-label={t`Language`}
								className={`${inputVariants()} relative flex w-full items-center pe-8 text-start sm:w-48`}
							>
								<Combobox.Value>{(option) => option?.label ?? t`Select`}</Combobox.Value>
								<Combobox.Icon className="absolute end-2 top-1/2 -translate-y-1/2">
									<CaretDown />
								</Combobox.Icon>
							</Combobox.Trigger>
							<Combobox.Content>
								<Combobox.Input aria-label={t`Search`} placeholder={t`Search`} />
								<Combobox.Empty>{t`No results found`}</Combobox.Empty>
								<Combobox.List>
									{(option) => (
										<Combobox.Item key={option.code} value={option}>
											{option.label}
										</Combobox.Item>
									)}
								</Combobox.List>
							</Combobox.Content>
						</Combobox>
					</div>
				</SettingsSection>
			)}
			{((section === "site" && !isEditor) || (section === "system" && !isAdmin)) && (
				<p role="alert">{t`Access denied`}</p>
			)}
		</div>
	);
}

export default Settings;
