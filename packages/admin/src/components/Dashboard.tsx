import { Badge, Banner, Button, LayerCard, Popover, SkeletonLine } from "@cloudflare/kumo";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import type { AdminManifest } from "../lib/api";
import { fetchCommentCounts } from "../lib/api/comments.js";
import { useCurrentUser } from "../lib/api/current-user.js";
import type { CollectionStats, DashboardStats, RecentItem } from "../lib/api/dashboard";
import { dismissScheduledPolicyRejection, fetchDashboardStats } from "../lib/api/dashboard";
import { fetchTransferCapabilities, TRANSFER_CAPABILITIES_QUERY_KEY } from "../lib/api/transfer.js";
import { FileArrowUp, Plus, Upload, X, Images, Globe, Gear, Shield, Chats } from "../lib/icons.js";
import { usePluginWidget } from "../lib/plugin-context";
import { cn, formatRelativeTime } from "../lib/utils";
import { getCollectionNavIcon } from "./admin-navigation-icons.js";
import { ArrowNext } from "./ArrowIcons";
import {
	ContentStatusIcon,
	CONTENT_STATUS_ICONS,
	type ContentStatusState,
} from "./ContentStatusBadge.js";
import { CoreUpdateBanner } from "./CoreUpdateBanner.js";
import { getMutationError } from "./DialogError.js";
import { MarketplaceMigrationBanner } from "./MarketplaceMigrationBanner.js";
import { RouterLinkButton } from "./RouterLinkButton";
import { SandboxedPluginWidget } from "./SandboxedPluginWidget";
import { resolvePluginWidgetTitle, visibleCollectionEntries } from "./Sidebar.js";

const DASHBOARD_STATUS_STATES: Record<string, ContentStatusState> = {
	published: "published",
	draft: "draft",
	scheduled: "scheduled",
	pending: "pendingChanges",
	pending_changes: "pendingChanges",
	private: "private",
	archived: "archived",
};

const ROLE_ADMIN = 50;
const ROLE_EDITOR = 40;
const ROLE_CONTRIBUTOR = 20;

const SITE_IMPORT_HINT_DISMISSED_KEY = "emdash:dashboard:site-import-hint-dismissed";

export interface DashboardProps {
	manifest: AdminManifest;
}

/**
 * Admin dashboard — quick actions, status, collections, recent activity.
 */
export function Dashboard({ manifest }: DashboardProps) {
	const { t, i18n } = useLingui();
	const { data: user } = useCurrentUser();
	const {
		data: stats,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["dashboard-stats"],
		queryFn: fetchDashboardStats,
		refetchOnWindowFocus: true,
	});
	const hasDashboardData = stats !== undefined;
	const showDashboardData = !isError || hasDashboardData;
	const { data: comments } = useQuery({
		queryKey: ["commentCounts"],
		queryFn: fetchCommentCounts,
		staleTime: 60_000,
		retry: false,
		enabled: (user?.role ?? 0) >= ROLE_EDITOR,
	});

	return (
		<div className="emdash-dashboard mx-auto max-w-7xl space-y-6">
			{manifest.marketplace && (user?.role ?? 0) >= ROLE_ADMIN && <MarketplaceMigrationBanner />}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-3xl font-semibold leading-tight">{t`Dashboard`}</h1>
					<p className="mt-2 text-sm text-kumo-subtle">{t`Your website content and tasks at a glance.`}</p>
				</div>
				<div className="flex items-center gap-3">
					<span className="hidden text-sm text-kumo-subtle xl:inline">
						{new Intl.DateTimeFormat(i18n.locale, { dateStyle: "full" }).format(new Date())}
					</span>
					<CreateContentMenu manifest={manifest} />
				</div>
			</div>

			<CoreUpdateBanner />

			{isError && <DashboardDataError />}

			{showDashboardData && (
				<>
					{stats && (user?.role ?? 0) >= ROLE_ADMIN && <SiteImportHint stats={stats} />}
					{stats && (
						<SchedulerWarning stats={stats} canDismissPolicy={(user?.role ?? 0) >= ROLE_EDITOR} />
					)}
					<CollectionOverview
						manifest={manifest}
						stats={stats}
						pendingComments={comments?.pending}
						canModerate={(user?.role ?? 0) >= ROLE_EDITOR}
						loading={isLoading}
					/>

					{/* Collections + Recent activity */}
					<div className="grid gap-6 xl:grid-cols-2">
						<QuickActions manifest={manifest} />
						<div className="space-y-6">
							<RecentActivity items={stats?.recentItems ?? []} loading={isLoading} />
							<SummaryMetrics
								stats={stats}
								loading={isLoading}
								linkCalendar={(user?.role ?? 0) >= ROLE_CONTRIBUTOR}
							/>
						</div>
					</div>
					<CollectionList
						collections={stats?.collections ?? []}
						manifest={manifest}
						loading={isLoading}
					/>
				</>
			)}

			{/* Plugin widgets */}
			<PluginWidgets manifest={manifest} />
		</div>
	);
}

function SchedulerWarning({
	stats,
	canDismissPolicy,
}: {
	stats: DashboardStats;
	canDismissPolicy: boolean;
}) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const dismissMutation = useMutation({
		mutationFn: ({
			collection,
			id,
			revision,
		}: {
			collection: string;
			id: string;
			revision: string;
		}) => dismissScheduledPolicyRejection(collection, id, revision),
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
		},
	});
	const policyRejected = stats.policyRejectedScheduled ?? 0;
	const policyRejections = stats.policyRejections ?? [];
	const overdueCount = stats.collections.reduce(
		(sum, collection) => sum + (collection.overdueScheduled ?? 0),
		0,
	);
	const schedulerNeedsAttention =
		overdueCount > 0 &&
		stats.schedulerHealth !== undefined &&
		stats.schedulerHealth.status !== "healthy";
	if (policyRejected === 0 && !schedulerNeedsAttention) return null;

	const schedulerDescription = schedulerNeedsAttention
		? stats.schedulerHealth!.status === "unknown"
			? plural(overdueCount, {
					one: "One scheduled item is overdue, but no scheduler run has completed. Run `npx emdash doctor` and verify the deployed Cron Trigger.",
					other:
						"# scheduled items are overdue, but no scheduler run has completed. Run `npx emdash doctor` and verify the deployed Cron Trigger.",
				})
			: plural(overdueCount, {
					one: "One scheduled item is overdue and the scheduler heartbeat is stale. Run `npx emdash doctor` and verify the deployed Cron Trigger.",
					other:
						"# scheduled items are overdue and the scheduler heartbeat is stale. Run `npx emdash doctor` and verify the deployed Cron Trigger.",
				})
		: "";

	return (
		<div className="space-y-3">
			{policyRejected > 0 && (
				<div className="space-y-2">
					<Banner
						variant="alert"
						title={t`Publication policy blocked scheduled content`}
						description={plural(policyRejected, {
							one: "Open the affected entry, resolve the policy reason, and schedule it again. A successful schedule or publish clears this notice.",
							other:
								"Open the affected entries, resolve the policy reasons, and schedule them again. A successful schedule or publish clears each notice.",
						})}
						role="alert"
					/>
					{policyRejections.length > 0 && (
						<ul className="space-y-2">
							{policyRejections.map((rejection) => (
								<li key={`${rejection.collection}:${rejection.id}`}>
									<LayerCard.Secondary className="p-3">
										<Link
											to="/content/$collection/$id"
											params={{ collection: rejection.collection, id: rejection.id }}
											className="font-medium text-kumo-brand hover:underline"
										>
											<bdi dir="ltr">
												{rejection.collection}/{rejection.id}
											</bdi>
										</Link>
										<p className="mt-1 text-sm text-kumo-subtle">{rejection.reason}</p>
										{canDismissPolicy && (
											<Button
												variant="secondary"
												size="sm"
												className="mt-2"
												disabled={dismissMutation.isPending}
												onClick={() =>
													dismissMutation.mutate({
														collection: rejection.collection,
														id: rejection.id,
														revision: rejection._rev,
													})
												}
											>
												{t`Dismiss`}
											</Button>
										)}
									</LayerCard.Secondary>
								</li>
							))}
						</ul>
					)}
					{policyRejected > policyRejections.length && (
						<p className="text-sm text-kumo-subtle">
							{plural(policyRejected - policyRejections.length, {
								one: "One more blocked entry is not shown.",
								other: "# more blocked entries are not shown.",
							})}
						</p>
					)}
					{dismissMutation.isError && (
						<p className="text-sm text-kumo-danger" role="alert">
							{getMutationError(dismissMutation.error) ??
								t`Failed to dismiss scheduled publication rejection`}
						</p>
					)}
				</div>
			)}
			{schedulerNeedsAttention && (
				<Banner
					variant="alert"
					title={t`Scheduled publishing needs attention`}
					description={schedulerDescription}
					role="alert"
				/>
			)}
		</div>
	);
}

function readSiteImportHintDismissed(): boolean {
	try {
		return window.localStorage.getItem(SITE_IMPORT_HINT_DISMISSED_KEY) === "1";
	} catch {
		return false;
	}
}

function SiteImportHint({ stats }: { stats: DashboardStats }) {
	const { t } = useLingui();
	const [dismissed, setDismissed] = React.useState(readSiteImportHintDismissed);
	// Any content or media rules out an import, so only ask the server when the
	// counts already loaded for the dashboard leave it possible.
	const mayBeEmpty =
		stats.mediaCount === 0 && stats.collections.every((collection) => collection.total === 0);
	const { data: capabilities } = useQuery({
		queryKey: TRANSFER_CAPABILITIES_QUERY_KEY,
		queryFn: fetchTransferCapabilities,
		enabled: !dismissed && mayBeEmpty,
	});

	if (dismissed || !mayBeEmpty || !capabilities?.portableDomain.empty) return null;

	const dismiss = () => {
		setDismissed(true);
		try {
			window.localStorage.setItem(SITE_IMPORT_HINT_DISMISSED_KEY, "1");
		} catch {
			// Without storage the hint stays hidden until the next page load.
		}
	};

	return (
		<Banner
			variant="secondary"
			icon={<FileArrowUp aria-hidden="true" />}
			title={t`Moving from another EmDash site?`}
			description={t`This site has no content yet, so you can import a .emdash package exported from another EmDash site.`}
			action={
				<div className="flex items-center gap-1">
					<RouterLinkButton
						to="/settings/transfer"
						search={{ start: "import" }}
						variant="secondary"
						size="sm"
					>
						{t`Import a site package`}
					</RouterLinkButton>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						shape="square"
						onClick={dismiss}
						aria-label={t`Dismiss import suggestion`}
					>
						<X className="h-4 w-4" aria-hidden="true" />
					</Button>
				</div>
			}
		/>
	);
}

function DashboardDataError() {
	const { t } = useLingui();

	return (
		<Banner
			variant="error"
			title={t`Could not load dashboard data`}
			description={t`Refresh the page or try again.`}
		/>
	);
}

function DashboardCardHeading({ children }: { children: React.ReactNode }) {
	return (
		<LayerCard.Secondary>
			<h2 className="px-3">{children}</h2>
		</LayerCard.Secondary>
	);
}

function DashboardCardInset({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
	return <div className={cn("px-3", className)} {...props} />;
}

// --- Quick actions ---

function CreateContentMenu({ manifest }: { manifest: AdminManifest }) {
	const { t } = useLingui();
	const { data: user } = useCurrentUser();
	if ((user?.role ?? 0) < 20) return null;
	return (
		<Popover>
			<Popover.Trigger asChild>
				<Button variant="primary" icon={<Plus />}>{t`New content`}</Button>
			</Popover.Trigger>
			<Popover.Content className="w-60 p-2" align="end">
				<div className="grid gap-1">
					{visibleCollectionEntries(manifest.collections)
						.filter(([, config]) => config.quickCreate !== false)
						.map(([slug, config]) => (
							<RouterLinkButton
								key={slug}
								to="/content/$collection/new"
								params={{ collection: slug }}
								search={{ locale: undefined }}
								variant="ghost"
								className="justify-start"
							>
								{config.labelSingular ?? config.label}
							</RouterLinkButton>
						))}
				</div>
			</Popover.Content>
		</Popover>
	);
}

function CollectionOverview({
	manifest,
	stats,
	pendingComments,
	canModerate,
	loading,
}: {
	manifest: AdminManifest;
	stats?: DashboardStats;
	pendingComments?: number;
	canModerate: boolean;
	loading: boolean;
}) {
	const { t } = useLingui();
	const visible = new Set(visibleCollectionEntries(manifest.collections).map(([slug]) => slug));
	const priorities = new Map(["posts", "pages", "projects"].map((slug, index) => [slug, index]));
	const collections =
		stats?.collections
			.filter((collection) => visible.has(collection.slug))
			.toSorted((a, b) => (priorities.get(a.slug) ?? 3) - (priorities.get(b.slug) ?? 3))
			.slice(0, 3) ?? [];
	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{loading
				? [1, 2, 3, 4].map((key) => (
						<div key={key} className="rounded-xl border border-kumo-line bg-kumo-base p-5">
							<SkeletonLine />
						</div>
					))
				: collections.map((collection) => {
						const Icon = getCollectionNavIcon(
							collection.slug,
							manifest.collections[collection.slug]?.icon,
						);
						return (
							<Link
								key={collection.slug}
								to="/content/$collection"
								params={{ collection: collection.slug }}
								search={{ locale: undefined }}
								aria-label={t`View ${collection.label}`}
								className="flex items-start gap-4 rounded-xl border border-kumo-line bg-kumo-base p-5 hover:bg-kumo-tint"
							>
								<span className="flex size-11 items-center justify-center rounded-xl bg-kumo-tint text-kumo-brand">
									<Icon className="size-6" />
								</span>
								<div>
									<span className="text-sm text-kumo-subtle">
										{manifest.collections[collection.slug]?.label ?? collection.label}
									</span>
									<p className="mt-1 text-3xl font-semibold tabular-nums">{collection.total}</p>
								</div>
							</Link>
						);
					})}
			{!loading && canModerate && (
				<Link
					to="/comments"
					className="flex items-start gap-4 rounded-xl border border-kumo-line bg-kumo-base p-5 hover:bg-kumo-tint"
				>
					<span className="flex size-11 items-center justify-center rounded-xl bg-kumo-tint text-kumo-brand">
						<Chats className="size-6" />
					</span>
					<div>
						<span className="text-sm text-kumo-subtle">{t`Pending comments`}</span>
						<p className="mt-1 text-3xl font-semibold tabular-nums">{pendingComments ?? "—"}</p>
					</div>
				</Link>
			)}
		</div>
	);
}

function QuickActions({ manifest }: { manifest: AdminManifest }) {
	const { t } = useLingui();
	const { data: user } = useCurrentUser();
	const role = user?.role ?? 0;
	const collections = visibleCollectionEntries(manifest.collections).filter(
		([, config]) => config.quickCreate !== false,
	);
	const preferred = ["posts", "pages"].flatMap((slug) =>
		collections.filter(([name]) => name === slug),
	);
	const prominent = (preferred.length ? preferred : collections).slice(0, 2);
	const cardClass =
		"h-auto min-h-28 w-full flex-col items-start justify-start gap-3 whitespace-normal rounded-xl p-4 text-start";
	const actions = [
		{ to: "/media", label: t`Upload Media`, Icon: Upload, minRole: 20 },
		{ to: "/comments", label: t`Review comments`, Icon: Chats, minRole: 40 },
		{ to: "/settings/sitemap", label: t`Update sitemap`, Icon: Globe, minRole: 50 },
		{ to: "/settings/carousel", label: t`Homepage Carousel`, Icon: Images, minRole: 50 },
		{ to: "/menus", label: t`Website navigation`, Icon: Gear, minRole: 40 },
		{ to: "/settings/footer", label: t`Registration and footer links`, Icon: Shield, minRole: 50 },
	] as const;

	return (
		<section
			className="rounded-xl border border-kumo-line bg-kumo-base p-5"
			aria-label={t`Quick actions`}
		>
			<h2 className="text-lg font-semibold">{t`Quick actions`}</h2>
			<p className="mt-1 text-sm text-kumo-subtle">{t`Create content, review interactions, and maintain your website.`}</p>
			<div className="mt-5 grid gap-3 sm:grid-cols-2">
				{role >= 20 &&
					prominent.map(([slug, config]) => (
						<RouterLinkButton
							key={slug}
							to="/content/$collection/new"
							params={{ collection: slug }}
							search={{ locale: undefined }}
							variant="outline"
							className={cardClass}
							icon={<Plus aria-hidden="true" className="size-6 text-kumo-brand" />}
						>
							{config.labelSingular ?? config.label}
						</RouterLinkButton>
					))}
				{actions
					.filter((action) => role >= action.minRole)
					.map(({ to, label, Icon }) => (
						<RouterLinkButton
							key={to}
							to={to}
							variant="outline"
							className={cardClass}
							icon={<Icon className="size-6 text-kumo-brand" aria-hidden="true" />}
						>
							{label}
						</RouterLinkButton>
					))}
			</div>
		</section>
	);
}

// --- Summary metrics ---

function SummaryMetrics({
	stats,
	loading,
	linkCalendar,
}: {
	stats?: DashboardStats;
	loading: boolean;
	/** Link the Scheduled count to the calendar, for roles that can open it. */
	linkCalendar: boolean;
}) {
	if (loading) {
		return (
			<div className="grid gap-4 sm:grid-cols-3">
				{[1, 2, 3].map((i) => (
					<LayerCard key={i}>
						<LayerCard.Secondary>
							<DashboardCardInset>
								<SkeletonLine minWidth={45} maxWidth={70} />
							</DashboardCardInset>
						</LayerCard.Secondary>
						<LayerCard.Primary className="text-3xl font-semibold leading-none">
							<DashboardCardInset>
								<SkeletonLine minWidth={20} maxWidth={35} />
							</DashboardCardInset>
						</LayerCard.Primary>
					</LayerCard>
				))}
			</div>
		);
	}

	if (!stats) return null;

	const totalDrafts = stats.collections.reduce((sum, c) => sum + c.draft, 0);
	const totalScheduled = stats.collections.reduce((sum, c) => sum + c.scheduled, 0);
	const hasScheduledContent = totalScheduled > 0;

	const metrics: Array<{ label: string; value: number; calendar?: boolean }> = [
		{
			label: plural(totalDrafts, { one: "Draft", other: "Drafts" }),
			value: totalDrafts,
		},
		...(hasScheduledContent
			? [
					{
						label: plural(totalScheduled, { one: "Scheduled", other: "Scheduled" }),
						value: totalScheduled,
						calendar: linkCalendar,
					},
				]
			: []),
		{
			label: plural(stats.mediaCount, { one: "Media file", other: "Media files" }),
			value: stats.mediaCount,
		},
		{
			label: plural(stats.userCount, { one: "User", other: "Users" }),
			value: stats.userCount,
		},
	];

	return (
		<div
			className={
				hasScheduledContent
					? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
					: "grid gap-4 sm:grid-cols-3"
			}
		>
			{metrics.map((metric) => (
				<LayerCard key={metric.label} data-testid="dashboard-metric">
					<DashboardCardHeading>
						{metric.calendar ? (
							<Link
								to="/calendar"
								className="group inline-flex items-center gap-1 rounded-sm hover:text-kumo-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-brand"
							>
								{metric.label}
								<ArrowNext
									aria-hidden="true"
									className="size-3.5 opacity-60 transition-opacity group-hover:opacity-100 motion-reduce:transition-none"
								/>
							</Link>
						) : (
							metric.label
						)}
					</DashboardCardHeading>
					<LayerCard.Primary className="text-3xl font-semibold leading-none tabular-nums">
						<DashboardCardInset data-testid="dashboard-metric-value">
							{metric.value}
						</DashboardCardInset>
					</LayerCard.Primary>
				</LayerCard>
			))}
		</div>
	);
}

function SkeletonRows({ count }: { count: number }) {
	return (
		<DashboardCardInset className="space-y-3">
			{Array.from({ length: count }, (_, i) => (
				<SkeletonLine key={i} blockHeight={40} minWidth={65} maxWidth={95} />
			))}
		</DashboardCardInset>
	);
}

// --- Collection list with counts ---

function CollectionList({
	collections,
	manifest,
	loading,
}: {
	collections: CollectionStats[];
	manifest: AdminManifest;
	loading: boolean;
}) {
	const { t } = useLingui();

	return (
		<LayerCard className="h-full">
			<DashboardCardHeading>{t`Content`}</DashboardCardHeading>
			<LayerCard.Primary className="flex-1">
				{loading ? (
					<SkeletonRows count={3} />
				) : collections.length === 0 ? (
					<p className="px-3 text-sm leading-6 text-pretty text-kumo-subtle">
						{t`No collections configured`}
					</p>
				) : (
					<div className="space-y-1">
						{collections.map((col) => {
							const config = manifest.collections[col.slug];
							return (
								<Link
									key={col.slug}
									to="/content/$collection"
									params={{ collection: col.slug }}
									search={{ locale: undefined }}
									className="group flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-kumo-tint"
								>
									<span className="text-base font-medium leading-5">
										{config?.label ?? col.label}
									</span>
									<span className="flex shrink-0 items-center gap-2">
										<CountBadge
											icon={CONTENT_STATUS_ICONS.published}
											count={col.published}
											variant="success"
											label={t`Published`}
										/>
										<CountBadge
											icon={CONTENT_STATUS_ICONS.draft}
											count={col.draft}
											variant="warning"
											label={t`Drafts`}
										/>
										<ArrowNext
											className="h-3.5 w-3.5 text-kumo-subtle opacity-0 transition-opacity group-hover:opacity-100"
											aria-hidden="true"
										/>
									</span>
								</Link>
							);
						})}
					</div>
				)}
			</LayerCard.Primary>
		</LayerCard>
	);
}

function CountBadge({
	icon: Icon,
	count,
	variant,
	label,
}: {
	icon: React.ElementType;
	count: number;
	variant: "success" | "warning";
	label: string;
}) {
	if (count === 0) return null;
	return (
		<Badge variant={variant} className="gap-1 tabular-nums">
			<Icon className="h-3 w-3" aria-hidden="true" />
			<span className="sr-only">{label}</span>
			{count}
		</Badge>
	);
}

// --- Recent activity ---

function RecentActivity({ items, loading }: { items: RecentItem[]; loading: boolean }) {
	const { t, i18n } = useLingui();

	return (
		<LayerCard className="h-full">
			<DashboardCardHeading>{t`Recent Activity`}</DashboardCardHeading>
			<LayerCard.Primary className="flex-1">
				{loading ? (
					<SkeletonRows count={5} />
				) : items.length === 0 ? (
					<p className="px-3 text-sm leading-6 text-pretty text-kumo-subtle">
						{t`No recent activity`}
					</p>
				) : (
					<div className="space-y-1">
						{items.map((item) => (
							<Link
								key={`${item.collection}-${item.id}`}
								to="/content/$collection/$id"
								params={{ collection: item.collection, id: item.id }}
								className="group flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-kumo-tint"
							>
								<div className="flex min-w-0 items-center gap-2">
									<StatusDot status={item.status} />
									<span className="truncate text-base font-medium leading-5">
										{item.title || item.slug || t`Untitled`}
									</span>
									<span className="hidden shrink-0 text-xs font-normal leading-5 text-kumo-subtle sm:inline">
										{item.collectionLabel}
									</span>
								</div>
								<span
									data-testid="activity-time"
									className="shrink-0 text-xs font-normal leading-5 text-kumo-subtle tabular-nums"
								>
									{formatRelativeTime(item.updatedAt, i18n.locale)}
								</span>
							</Link>
						))}
					</div>
				)}
			</LayerCard.Primary>
		</LayerCard>
	);
}

function StatusDot({ status }: { status: string }) {
	const { t } = useLingui();
	const state = Object.hasOwn(DASHBOARD_STATUS_STATES, status)
		? DASHBOARD_STATUS_STATES[status]
		: undefined;

	return state ? (
		<ContentStatusIcon state={state} className="shrink-0" />
	) : (
		<span
			className="h-3.5 w-3.5 shrink-0 rounded-full bg-kumo-fill"
			role="img"
			aria-label={t`Status: ${status}`}
		/>
	);
}

// --- Plugin widgets ---

function PluginWidgets({ manifest }: { manifest: AdminManifest }) {
	const widgets: Array<{
		id: string;
		pluginId: string;
		title?: string;
		size?: "full" | "half" | "third";
	}> = [];

	for (const [pluginId, plugin] of Object.entries(manifest.plugins || {})) {
		if (plugin.enabled === false) continue;

		if ("dashboardWidgets" in plugin && Array.isArray(plugin.dashboardWidgets)) {
			for (const widget of plugin.dashboardWidgets) {
				widgets.push({
					id: widget.id,
					pluginId,
					title: widget.title,
					size: widget.size,
				});
			}
		}
	}

	if (widgets.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-6 lg:grid-cols-2">
			{widgets.map((widget) => (
				<PluginWidgetCard key={`${widget.pluginId}:${widget.id}`} widget={widget} />
			))}
		</div>
	);
}

function PluginWidgetCard({
	widget,
}: {
	widget: { id: string; pluginId: string; title?: string; size?: string };
}) {
	const { i18n } = useLingui();
	const WidgetComponent = usePluginWidget(widget.pluginId, widget.id);
	const title = resolvePluginWidgetTitle(widget.title, widget.id, (id) => i18n._(id));

	return (
		<LayerCard className="h-full">
			<DashboardCardHeading>{title}</DashboardCardHeading>
			<LayerCard.Primary className="flex-1">
				<DashboardCardInset>
					{WidgetComponent ? (
						<WidgetComponent />
					) : (
						<SandboxedPluginWidget pluginId={widget.pluginId} widgetId={widget.id} />
					)}
				</DashboardCardInset>
			</LayerCard.Primary>
		</LayerCard>
	);
}
