import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Gear, IconContext } from "../../../admin/src/lib/icons.js";

describe("Lucide admin icon compatibility", () => {
	it("keeps accessible labels and inherits icon styling from its provider", () => {
		const html = renderToStaticMarkup(
			createElement(IconContext.Provider, {
				value: { color: "rebeccapurple", size: 18 },
				children: createElement(Gear, { alt: "Site settings" }),
			}),
		);
		expect(html).toContain('aria-label="Site settings"');
		expect(html).toContain('stroke="rebeccapurple"');
		expect(html).toContain('width="18"');
		expect(html).toContain("lucide");
	});
});
