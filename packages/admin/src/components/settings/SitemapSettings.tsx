import { Banner, Loader } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { fetchSettings } from "../../lib/api/settings.js";
import { SettingRow, SettingsFrame, SettingsSection } from "./SettingsLayout.js";
import { SitemapControls } from "./SitemapControls.js";

export function SitemapSettings() {
	const { t } = useLingui();
	const { data, isLoading, error } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
	return (
		<SettingsFrame
			title={t`Sitemap`}
			description={t`Generate and check the sitemap from published, indexable content.`}
		>
			{isLoading ? (
				<Loader />
			) : error ? (
				<Banner variant="error" title={t`Failed to load settings`} description={error.message} />
			) : (
				<SettingsSection title={t`Generate / update sitemap`}>
					<SettingRow>
						<SitemapControls updatedAt={data?.sitemapUpdatedAt} />
					</SettingRow>
				</SettingsSection>
			)}
		</SettingsFrame>
	);
}
