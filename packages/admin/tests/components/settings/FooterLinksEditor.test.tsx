import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { FooterLinksEditor } from "../../../src/components/settings/FooterLinksEditor.js";
import type { SiteSettings } from "../../../src/lib/api/settings.js";
import { render } from "../../utils/render.tsx";

vi.mock("../../../src/components/MediaPickerModal.js", () => ({ MediaPickerModal: () => null }));

function Editor() {
	const [links, setLinks] = React.useState<NonNullable<SiteSettings["footerLinks"]>>([
		{ label: "First registration", url: "https://example.com/first", iconUrl: "/first.svg" },
		{ label: "Second registration", url: "https://example.com/second" },
	]);
	return <FooterLinksEditor links={links} onChange={setLinks} />;
}

describe("footer link editing", () => {
	it("removes an icon while preserving the link text and address", async () => {
		const screen = await render(<Editor />);
		await userEvent.click(screen.getByRole("button", { name: "Remove icon", exact: true }));
		await expect
			.element(screen.getByRole("textbox", { name: "Link text", exact: true }).first())
			.toHaveValue("First registration");
		await expect
			.element(screen.getByRole("textbox", { name: "Link URL", exact: true }).first())
			.toHaveValue("https://example.com/first");
		await expect
			.element(screen.getByRole("button", { name: "Remove icon", exact: true }))
			.not.toBeInTheDocument();
	});
	it("restores a deleted link at its original position with its edited values", async () => {
		const screen = await render(<Editor />);
		await screen
			.getByRole("textbox", { name: "Link text", exact: true })
			.first()
			.fill("Edited registration");
		await userEvent.click(
			screen.getByRole("button", { name: "Delete footer link 1", exact: true }),
		);
		await expect
			.element(screen.getByRole("textbox", { name: "Link text", exact: true }))
			.toHaveValue("Second registration");
		await userEvent.click(screen.getByRole("button", { name: "Undo deletion", exact: true }));
		await expect
			.element(screen.getByRole("textbox", { name: "Link text", exact: true }).first())
			.toHaveValue("Edited registration");
		await expect
			.element(screen.getByRole("textbox", { name: "Link URL", exact: true }).first())
			.toHaveValue("https://example.com/first");
		await expect
			.element(screen.getByRole("button", { name: "Remove icon", exact: true }))
			.toBeInTheDocument();
	});
});
