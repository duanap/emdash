import { Button } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";

import { generateSitemap } from "../../lib/api/settings.js";

export function SitemapControls({ updatedAt }: { updatedAt?: string }) {
	const { t, i18n } = useLingui();
	const mutation = useMutation({ mutationFn: generateSitemap });
	const timestamp = mutation.data?.generatedAt ?? updatedAt;
	return (
		<div className="grid gap-3">
			<p className="text-sm text-kumo-subtle">{t`Generate and check the sitemap from published, indexable content.`}</p>
			<Button
				type="button"
				variant="outline"
				disabled={mutation.isPending}
				onClick={() => mutation.mutate()}
			>
				{mutation.isPending ? t`Generating sitemap…` : t`Generate / update sitemap`}
			</Button>
			{timestamp && (
				<p className="text-sm text-kumo-subtle">{t`Last generated: ${new Date(timestamp).toLocaleString(i18n.locale)}`}</p>
			)}
			{mutation.data && (
				<p
					className="text-sm text-kumo-subtle"
					role="status"
				>{t`Sitemap generated: ${mutation.data.collections} collections, ${mutation.data.urls} URLs.`}</p>
			)}
			{mutation.error && (
				<p className="text-sm text-kumo-danger" role="alert">
					{mutation.error.message}
				</p>
			)}
		</div>
	);
}
