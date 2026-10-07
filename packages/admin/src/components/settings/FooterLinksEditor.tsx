import { Button, Input } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

import type { SiteSettings } from "../../lib/api/settings.js";
import { Shield, Globe, LinkSimple, Trash } from "../../lib/icons.js";
import { MediaPickerModal } from "../MediaPickerModal.js";

type FooterLinks = NonNullable<SiteSettings["footerLinks"]>;
const ICP_HOST_PATTERN = /beian\.miit\.gov\.cn/;
const POLICE_HOST_PATTERN = /beian\.(?:mps\.gov|gov)\.cn/;

export function FooterLinksEditor({
	links,
	onChange,
}: {
	links: FooterLinks;
	onChange: (links: FooterLinks) => void;
}) {
	const { t } = useLingui();
	const [pickerIndex, setPickerIndex] = useState<number | null>(null);
	const [removed, setRemoved] = useState<{ link: FooterLinks[number]; index: number } | null>(null);
	function update(index: number, patch: Partial<FooterLinks[number]>) {
		onChange(links.map((link, position) => (position === index ? { ...link, ...patch } : link)));
	}
	return (
		<div className="grid gap-4">
			<p className="text-sm text-kumo-subtle">{t`Add registration notices or other footer links. Icons can be uploaded or selected from the media library.`}</p>
			<div className="grid gap-5 xl:grid-cols-2">
				{links.map((link, index) => {
					const icp = ICP_HOST_PATTERN.test(link.url) || link.label.includes("ICP备");
					const police = POLICE_HOST_PATTERN.test(link.url) || link.label.includes("公网安备");
					const title = icp
						? t`ICP registration`
						: police
							? t`Public security registration`
							: t`Custom footer link`;
					const Icon = icp ? Globe : police ? Shield : LinkSimple;
					return (
						<section
							key={index}
							className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-base"
						>
							<header className="flex items-center gap-4 border-b border-kumo-line p-5">
								<span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-kumo-tint text-kumo-brand">
									{link.iconUrl ? (
										<img src={link.iconUrl} alt="" className="size-9 object-contain" />
									) : (
										<Icon className="size-6" />
									)}
								</span>
								<h3 className="text-lg font-semibold">{title}</h3>
							</header>
							<div className="grid gap-5 p-5">
								<Input
									label={t`Link text`}
									value={link.label}
									required
									maxLength={200}
									onChange={(event) => update(index, { label: event.target.value })}
								/>
								<Input
									label={t`Link URL`}
									type="url"
									value={link.url}
									required
									onChange={(event) => update(index, { url: event.target.value })}
								/>
								<div className="flex flex-wrap items-center gap-3">
									{link.iconUrl && (
										<img src={link.iconUrl} alt="" className="size-8 object-contain" />
									)}
									<Button
										type="button"
										variant="outline"
										onClick={() => setPickerIndex(index)}
									>{t`Select icon`}</Button>
									{link.iconUrl && (
										<Button
											type="button"
											variant="outline"
											onClick={() => update(index, { iconUrl: undefined })}
										>{t`Remove icon`}</Button>
									)}
									<Button
										type="button"
										variant="outline"
										aria-label={t`Delete footer link ${index + 1}`}
										icon={<Trash />}
										className="ms-auto text-kumo-danger"
										onClick={() => {
											setPickerIndex(null);
											setRemoved({ link, index });
											onChange(links.filter((_link, position) => position !== index));
										}}
									>{t`Delete this link`}</Button>
								</div>
							</div>
						</section>
					);
				})}
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="button"
					variant="outline"
					disabled={links.length >= 20}
					onClick={() => onChange([...links, { label: "", url: "https://beian.miit.gov.cn/" }])}
				>{t`Add ICP registration`}</Button>
				<Button
					type="button"
					variant="outline"
					disabled={links.length >= 20}
					onClick={() => onChange([...links, { label: "", url: "https://beian.mps.gov.cn/" }])}
				>{t`Add public security registration`}</Button>
				<Button
					type="button"
					variant="outline"
					disabled={links.length >= 20}
					onClick={() => onChange([...links, { label: "", url: "" }])}
				>{t`Add custom link`}</Button>
				{removed && (
					<Button
						type="button"
						variant="ghost"
						onClick={() => {
							const next = [...links];
							next.splice(removed.index, 0, removed.link);
							onChange(next);
							setRemoved(null);
						}}
						disabled={links.length >= 20}
					>{t`Undo deletion`}</Button>
				)}
			</div>
			<MediaPickerModal
				open={pickerIndex !== null}
				onOpenChange={(open) => {
					if (!open) setPickerIndex(null);
				}}
				onSelect={(media) => {
					if (pickerIndex !== null) update(pickerIndex, { iconUrl: media.url });
					setPickerIndex(null);
				}}
				mimeTypeFilter="image/"
				localOnly
				title={t`Select icon`}
			/>
		</div>
	);
}
