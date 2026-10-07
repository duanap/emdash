import { Banner, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { fetchSettings, updateSettings, type SiteSettings } from "../../lib/api/settings.js";
import { SaveButton } from "../SaveButton.js";
import { FooterLinksEditor } from "./FooterLinksEditor.js";
import { SettingsFrame } from "./SettingsLayout.js";

export function FooterSettings() {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const toast = useKumoToastManager();
	const { data, isLoading, error } = useQuery({
		queryKey: ["settings"],
		queryFn: fetchSettings,
		staleTime: Infinity,
	});
	const [links, setLinks] = React.useState<NonNullable<SiteSettings["footerLinks"]>>([]);
	const [saved, setSaved] = React.useState("[]");
	React.useEffect(() => {
		if (data) {
			setLinks(data.footerLinks ?? []);
			setSaved(JSON.stringify(data.footerLinks ?? []));
		}
	}, [data]);
	const mutation = useMutation({
		mutationFn: updateSettings,
		onSuccess: (_data, submitted) => {
			setSaved(JSON.stringify(submitted.footerLinks));
			void queryClient.invalidateQueries({ queryKey: ["settings"] });
			toast.add({ title: t`Settings saved successfully`, variant: "success" });
		},
	});
	return (
		<SettingsFrame
			title={t`Registration and footer links`}
			description={t`ICP registration, public security registration, and custom links`}
			actions={
				<SaveButton
					type="submit"
					form="footer-settings-form"
					isDirty={saved !== JSON.stringify(links)}
					isSaving={mutation.isPending}
					disabled={isLoading || Boolean(error)}
				/>
			}
		>
			{isLoading ? (
				<Loader />
			) : error ? (
				<Banner variant="error" title={t`Failed to load settings`} description={error.message} />
			) : (
				<form
					id="footer-settings-form"
					onSubmit={(event) => {
						event.preventDefault();
						mutation.mutate({ footerLinks: links });
					}}
					className="space-y-6"
				>
					{mutation.error && (
						<Banner
							variant="error"
							title={t`Failed to save settings`}
							description={mutation.error.message}
						/>
					)}
					<FooterLinksEditor links={links} onChange={setLinks} />
					<section
						className="rounded-xl border border-kumo-line bg-kumo-base p-5 text-center"
						aria-label={t`Footer preview`}
					>
						<h2 className="font-semibold">{t`Footer preview`}</h2>
						<p className="mt-1 text-sm text-kumo-subtle">{t`Changes appear on the website after saving.`}</p>
						<div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm text-kumo-subtle">
							{links.map((link, index) => (
								<span key={index} className="inline-flex max-w-full items-center gap-1.5 break-all">
									{link.iconUrl && (
										<img src={link.iconUrl} alt="" className="size-5 shrink-0 object-contain" />
									)}
									{link.label || t`Link text`}
								</span>
							))}
						</div>
					</section>
				</form>
			)}
		</SettingsFrame>
	);
}
