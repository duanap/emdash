import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const deploy = fileURLToPath(new URL("./deploy.sh", import.meta.url));
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const WINDOWS_DRIVE = /^([A-Za-z]):/;
const posix = (value) =>
	value.replaceAll("\\", "/").replace(WINDOWS_DRIVE, (_, drive) => `/${drive.toLowerCase()}`);
const syntax = spawnSync(bash, ["-n", posix(deploy)], { encoding: "utf8" });
assert.equal(syntax.status, 0, syntax.stderr);
let passed = 0;
for (const mode of [
	"success",
	"health-failure",
	"build-failure",
	"restart-failure",
	"missing-database",
	"missing-origin",
	"no-build",
]) {
	const root = mkdtempSync(join(tmpdir(), "emdash-deploy-test-"));
	try {
		const app = join(root, "app");
		const demo = join(app, "demos", "blog");
		const mock = join(root, "mock");
		const entry = join(demo, "dist", "server", "entry.mjs");
		for (const path of [dirname(entry), mock, join(demo, "scripts"), join(root, "custom-data")]) {
			assert.ok(
				resolve(path).startsWith(resolve(root) + (process.platform === "win32" ? "\\" : "/")),
			);
			mkdirSync(path, { recursive: true });
		}
		copyFileSync(deploy, join(demo, "scripts", "deploy.sh"));
		writeFileSync(entry, "OLD_VERSION");
		const database = join(root, "custom-data", "actual.db");
		if (mode !== "missing-database") writeFileSync(database, "test database");
		writeFileSync(
			join(root, ".env"),
			`EMDASH_DATABASE_URL='file:${posix(database)}'\n${mode === "missing-origin" ? "" : "EMDASH_SITE_URL=https://blog.example\n"}`,
		);
		function executable(name, body) {
			writeFileSync(join(mock, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
		}
		executable("node", 'printf "%s\\n" "$*" >> "$TEST_ROOT/backup-args"');
		executable("sleep", "exit 0");
		executable(
			"systemctl",
			`if [[ "$*" == restart* && "$TEST_MODE" == restart-failure && ! -f "$TEST_ROOT/restart-failed" ]]; then touch "$TEST_ROOT/restart-failed"; exit 1; fi\nexit 0`,
		);
		executable(
			"pnpm",
			`if [[ "$*" == "exec astro build" ]]; then printf NEW_VERSION > "$APP_DIR/demos/blog/dist/server/entry.mjs"; [[ "$TEST_MODE" != build-failure ]] || exit 1; fi`,
		);
		executable(
			"curl",
			`case "$*" in *dev-bypass*) printf 403;; */posts|*/messages) printf 301;; *) if [[ "$TEST_MODE" == health-failure && ! -f "$TEST_ROOT/health-failed" ]]; then touch "$TEST_ROOT/health-failed"; printf 500; else printf 200; fi;; esac`,
		);
		if (mode === "no-build") {
			mkdirSync(join(demo, "dist.previous", "server"), { recursive: true });
			writeFileSync(join(demo, "dist.previous", "server", "entry.mjs"), "OLDER_VERSION");
		}
		const result = spawnSync(
			bash,
			[
				"-c",
				'export PATH="$MOCK_DIR:$PATH"; bash "$APP_DIR/demos/blog/scripts/deploy.sh"' +
					(mode === "no-build" ? " --no-build" : ""),
			],
			{
				encoding: "utf8",
				timeout: 20_000,
				env: {
					...process.env,
					APP_DIR: posix(app),
					STATE_DIR: posix(root),
					ENV_FILE: posix(join(root, ".env")),
					MOCK_DIR: posix(mock),
					TEST_ROOT: posix(root),
					TEST_MODE: mode,
					EMDASH_DATABASE_URL: "",
					EMDASH_SITE_URL: "",
					SITE_URL: "",
				},
			},
		);
		const success = mode === "success" || mode === "no-build";
		assert.equal(result.status, success ? 0 : 1, result.stdout + result.stderr);
		assert.equal(
			readFileSync(entry, "utf8"),
			mode === "success" ? "NEW_VERSION" : "OLD_VERSION",
			result.stdout + result.stderr,
		);
		if (mode !== "missing-database" && mode !== "missing-origin") {
			assert.ok(
				readFileSync(join(root, "backup-args"), "utf8").includes(`--db ${posix(database)}`),
			);
		}
		if (mode === "success")
			assert.equal(
				readFileSync(join(demo, "dist.previous", "server", "entry.mjs"), "utf8"),
				"OLD_VERSION",
			);
		if (mode === "no-build")
			assert.equal(
				readFileSync(join(demo, "dist.previous", "server", "entry.mjs"), "utf8"),
				"OLDER_VERSION",
			);
		passed++;
		console.log(`PASS ${mode}`);
	} finally {
		assert.ok(
			resolve(root).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/")),
		);
		rmSync(root, { recursive: true, force: true });
	}
}
console.log(`${passed}/${passed} 通过`);
