import { Button, Input, InputArea } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

import type { SiteSettings } from "../../lib/api/settings.js";
import { MediaPickerModal } from "../MediaPickerModal.js";

type Slides = NonNullable<SiteSettings["heroSlides"]>;

export function HeroSlidesEditor({
	slides,
	onChange,
}: {
	slides: Slides;
	onChange: (slides: Slides) => void;
}) {
	const { t } = useLingui();
	const [pickerIndex, setPickerIndex] = useState<number | null>(null);
	function update(index: number, patch: Partial<Slides[number]>) {
		onChange(
			slides.map((slide, position) => (position === index ? { ...slide, ...patch } : slide)),
		);
	}
	function move(index: number, offset: number) {
		const next = [...slides];
		const target = index + offset;
		if (target < 0 || target >= next.length) return;
		[next[index], next[target]] = [next[target]!, next[index]!];
		onChange(next);
	}
	return (
		<div className="grid gap-4">
			<p className="text-sm text-kumo-subtle">{t`Upload covers and choose their destination links. When no slides are configured, recent article covers are used.`}</p>
			{slides.map((slide, index) => (
				<details key={index} open={index === 0} className="rounded-lg border border-kumo-line p-4">
					<summary className="cursor-pointer font-medium">
						{t`Slide ${index + 1}`}
						{slide.title ? ` · ${slide.title}` : ""}
					</summary>
					<div className="mt-4 grid gap-3">
						{slide.imageUrl && (
							<img src={slide.imageUrl} alt="" className="h-32 w-full object-contain" />
						)}
						<Input
							label={t`Slide title`}
							value={slide.title}
							required
							maxLength={200}
							onChange={(event) => update(index, { title: event.target.value })}
						/>
						<Input
							label={t`Destination link`}
							dir="ltr"
							value={slide.url}
							required
							maxLength={2048}
							description={t`Use a site path such as /posts or an HTTP(S) URL.`}
							onChange={(event) => update(index, { url: event.target.value })}
						/>
						<InputArea
							label={t`Slide description`}
							value={slide.excerpt ?? ""}
							maxLength={500}
							onChange={(event) => update(index, { excerpt: event.target.value })}
						/>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setPickerIndex(index)}
							>{t`Select slide image`}</Button>
							<Button
								type="button"
								variant="outline"
								disabled={index === 0}
								onClick={() => move(index, -1)}
							>{t`Move up`}</Button>
							<Button
								type="button"
								variant="outline"
								disabled={index === slides.length - 1}
								onClick={() => move(index, 1)}
							>{t`Move down`}</Button>
							<Button
								type="button"
								variant="outline"
								aria-label={t`Remove slide ${index + 1}`}
								onClick={() => {
									setPickerIndex(null);
									onChange(slides.filter((_slide, position) => position !== index));
								}}
							>{t`Remove`}</Button>
						</div>
					</div>
				</details>
			))}
			<Button
				type="button"
				variant="outline"
				disabled={slides.length >= 8}
				onClick={() => onChange([...slides, { title: "", imageUrl: "", url: "/" }])}
			>{t`Add slide`}</Button>
			<MediaPickerModal
				open={pickerIndex !== null}
				onOpenChange={(open) => {
					if (!open) setPickerIndex(null);
				}}
				onSelect={(media) => {
					if (pickerIndex !== null) update(pickerIndex, { imageUrl: media.url });
					setPickerIndex(null);
				}}
				mimeTypeFilter="image/"
				localOnly
				title={t`Select slide image`}
			/>
		</div>
	);
}
