import { Banner, Input, Loader, Select, useKumoToastManager } from "@cloudflare/kumo";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchSettings, updateSettings, type SiteSettings } from "../../lib/api/settings.js";
import { SaveButton } from "../SaveButton.js";
import { HeroSlidesEditor } from "./HeroSlidesEditor.js";
import { SettingRow, SettingsFrame, SettingsSection } from "./SettingsLayout.js";

type Options = NonNullable<SiteSettings["heroCarousel"]>;
type CarouselData = Pick<SiteSettings, "heroSlides" | "heroCarousel">;
const positions = [
	{ value: "top-start", label: msg`Top start` },
	{ value: "top-center", label: msg`Top center` },
	{ value: "top-end", label: msg`Top end` },
	{ value: "center-start", label: msg`Center start` },
	{ value: "center", label: msg`Center` },
	{ value: "center-end", label: msg`Center end` },
	{ value: "bottom-start", label: msg`Bottom start` },
	{ value: "bottom-center", label: msg`Bottom center` },
	{ value: "bottom-end", label: msg`Bottom end` },
] as const;

export function CarouselSettings() {
	const { t } = useLingui();
	const queries = useQueryClient();
	const toast = useKumoToastManager();
	const { data, isLoading, error } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
	const [form, setForm] = useState<CarouselData>({});
	const [saved, setSaved] = useState("");
	useEffect(() => {
		if (!data) return;
		const next = { heroSlides: data.heroSlides ?? [], heroCarousel: data.heroCarousel ?? {} };
		setForm(next);
		setSaved(JSON.stringify(next));
	}, [data]);
	const mutation = useMutation({
		mutationFn: updateSettings,
		onSuccess: (_result, submitted) => {
			setSaved(JSON.stringify(submitted));
			void queries.invalidateQueries({ queryKey: ["settings"] });
			toast.add({ title: t`Settings saved successfully`, variant: "success" });
		},
	});
	const options = form.heroCarousel ?? {};
	function option<K extends keyof Options>(key: K, value: Options[K]) {
		setForm((previous) => ({
			...previous,
			heroCarousel: { ...previous.heroCarousel, [key]: value },
		}));
	}
	function numeric(
		key: Exclude<keyof Options, "textPosition">,
		label: string,
		fallback: number,
		min: number,
		max: number,
		step = 1,
	) {
		return (
			<Input
				type="number"
				label={label}
				value={options[key] ?? fallback}
				min={min}
				max={max}
				step={step}
				required
				onChange={(event) =>
					option(key, event.target.value === "" ? undefined : Number(event.target.value))
				}
			/>
		);
	}
	const position = options.textPosition ?? "bottom-start";
	const preview = form.heroSlides?.[0];
	return (
		<SettingsFrame
			title={t`Homepage Carousel`}
			description={t`Configure playback, image effects, text, and slides in one place.`}
			actions={
				<SaveButton
					type="submit"
					form="carousel-settings-form"
					isDirty={saved !== JSON.stringify(form)}
					isSaving={mutation.isPending}
				/>
			}
		>
			{isLoading ? (
				<Loader />
			) : error ? (
				<Banner variant="error" title={t`Failed to load settings`} description={error.message} />
			) : (
				<form
					id="carousel-settings-form"
					className="grid gap-8"
					onSubmit={(event) => {
						event.preventDefault();
						mutation.mutate(form);
					}}
				>
					{mutation.error && (
						<Banner
							variant="error"
							title={t`Failed to save settings`}
							description={mutation.error.message}
						/>
					)}
					<SettingsSection
						title={t`Playback and image`}
						description={t`Height 0 follows the image ratio. Custom heights are 160–1200 px; images remain fully visible.`}
					>
						<SettingRow className="grid gap-4 sm:grid-cols-2">
							{numeric("intervalSeconds", t`Slide interval (seconds)`, 7, 2, 60, 0.5)}
							{numeric("blurPx", t`Image blur (px)`, 0, 0, 30)}
							{numeric("overlayOpacity", t`Mask opacity (%)`, 70, 0, 100)}
							{numeric("height", t`Desktop height (px, 0 = auto)`, 0, 0, 1200)}
							{numeric("mobileHeight", t`Mobile height (px, 0 = auto)`, 0, 0, 1200)}
						</SettingRow>
					</SettingsSection>
					<SettingsSection title={t`Text style`}>
						<SettingRow className="grid gap-4 sm:grid-cols-2">
							<Select
								label={t`Text position`}
								value={position}
								renderValue={(value) => t(positions.find((item) => item.value === value)!.label)}
								onValueChange={(value) =>
									option("textPosition", positions.find((item) => item.value === value)?.value)
								}
							>
								{positions.map((item) => (
									<Select.Option key={item.value} value={item.value}>
										{t(item.label)}
									</Select.Option>
								))}
							</Select>
							{numeric("titleSize", t`Desktop title size (px)`, 64, 12, 120)}
							{numeric("mobileTitleSize", t`Mobile title size (px)`, 22, 12, 72)}
							{numeric("descriptionSize", t`Description size (px)`, 17, 12, 40)}
						</SettingRow>
					</SettingsSection>
					{preview?.imageUrl && (
						<SettingsSection
							title={t`Style preview`}
							description={t`Preview uses the first slide. Changes take effect on the site after saving.`}
						>
							<div
								className="relative overflow-hidden"
								style={{ height: Math.min(options.height || 280, 480) }}
							>
								<img
									src={preview.imageUrl}
									alt=""
									className="absolute inset-0 h-full w-full object-contain"
									style={{ filter: `blur(${options.blurPx ?? 0}px)` }}
								/>
								<div
									className="absolute inset-0"
									style={{
										backgroundColor: "#0b1712",
										opacity: (options.overlayOpacity ?? 70) / 100,
									}}
								/>
								<div
									className="relative flex h-full flex-col p-6"
									style={{
										color: "#fffdf7",
										justifyContent: position.startsWith("top")
											? "flex-start"
											: position.startsWith("bottom")
												? "flex-end"
												: "center",
										alignItems: position.endsWith("start")
											? "flex-start"
											: position.endsWith("end")
												? "flex-end"
												: "center",
										textAlign: position.endsWith("start")
											? "start"
											: position.endsWith("end")
												? "end"
												: "center",
									}}
								>
									<strong style={{ fontSize: options.titleSize ?? 64 }}>{preview.title}</strong>
									<p style={{ fontSize: options.descriptionSize ?? 17 }}>{preview.excerpt}</p>
								</div>
							</div>
						</SettingsSection>
					)}
					<SettingsSection
						title={t`Images and links`}
						description={t`Static images are converted to WebP before uploading. Animated images retain their animation.`}
					>
						<SettingRow>
							<HeroSlidesEditor
								slides={form.heroSlides ?? []}
								onChange={(heroSlides) => setForm((previous) => ({ ...previous, heroSlides }))}
							/>
						</SettingRow>
					</SettingsSection>
				</form>
			)}
		</SettingsFrame>
	);
}
