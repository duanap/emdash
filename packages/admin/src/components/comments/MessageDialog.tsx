import { Button, Dialog, Input, InputArea } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import * as React from "react";

import { DialogError, getMutationError } from "../DialogError.js";

export interface MessageDialogProps {
	open: boolean;
	onClose: () => void;
	onSubmit: (values: { authorName: string; body: string }) => Promise<unknown>;
	initial?: { authorName?: string; body?: string };
	title?: string;
}

/**
 * Create / edit a single message-board entry. Only the author name and the
 * message body are editable — the wall container entry (slug, page content)
 * is never touched from here.
 */
export function MessageDialog({ open, onClose, onSubmit, initial, title }: MessageDialogProps) {
	const { t } = useLingui();
	const [authorName, setAuthorName] = React.useState(initial?.authorName ?? "");
	const [body, setBody] = React.useState(initial?.body ?? "");
	const [pending, setPending] = React.useState(false);
	const [error, setError] = React.useState<unknown>(null);

	React.useEffect(() => {
		if (open) {
			setAuthorName(initial?.authorName ?? "");
			setBody(initial?.body ?? "");
			setError(null);
			setPending(false);
		}
	}, [open, initial?.authorName, initial?.body]);

	const submit = async () => {
		setPending(true);
		setError(null);
		try {
			await onSubmit({ authorName, body });
			onClose();
		} catch (cause) {
			setError(cause);
		} finally {
			setPending(false);
		}
	};

	return (
		<Dialog.Root open={open} onOpenChange={(next) => !next && !pending && onClose()}>
			<Dialog className="p-6" size="sm">
				<Dialog.Title dir="auto" className="text-lg font-semibold">
					{title ?? t`Add message`}
				</Dialog.Title>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void submit();
					}}
				>
					<div className="mt-4 flex flex-col gap-4">
						<label className="flex flex-col gap-2">
							<span className="text-sm font-medium">{t`Author name`}</span>
							<Input
								value={authorName}
								onChange={(event) => setAuthorName(event.target.value)}
								maxLength={100}
								required
							/>
						</label>
						<label className="flex flex-col gap-2">
							<span className="text-sm font-medium">{t`Message`}</span>
							<InputArea
								value={body}
								onChange={(event) => setBody(event.target.value)}
								maxLength={5000}
								rows={5}
								required
							/>
						</label>
						<DialogError message={getMutationError(error)} />
						<div className="mt-2 flex justify-end gap-2">
							<Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
								{t`Cancel`}
							</Button>
							<Button type="submit" variant="primary" disabled={pending}>
								{pending ? t`Saving...` : t`Save`}
							</Button>
						</div>
					</div>
				</form>
			</Dialog>
		</Dialog.Root>
	);
}
