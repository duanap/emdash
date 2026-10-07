import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config.js";

const resolvedConfig = await baseConfig;

export default defineConfig({
	...resolvedConfig,
	test: {
		...resolvedConfig.test,
		include: ["test/encryption-verification-workflow.test.ts"],
		exclude: resolvedConfig.test.exclude.filter(
			(pattern) => pattern !== "test/encryption-verification-workflow.test.ts",
		),
	},
});
