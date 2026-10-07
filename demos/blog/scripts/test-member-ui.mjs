import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { safeReturnTo } from "../src/utils/return-to.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
function scriptFrom(file, marker) {
	const source = readFileSync(`${root}${file}`, "utf8");
	const scripts = Array.from(source.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
	return stripTypeScriptTypes(
		scripts.find((script) => script.includes(marker)).replace(/^\s*import .*;$/gm, ""),
	);
}
const loginScript = `${safeReturnTo.toString()}\n${scriptFrom("src/pages/login.astro", "async function render")}`;
const navScript = scriptFrom("src/layouts/Base.astro", 'getElementById("nav-member")');
const likesScript = stripTypeScriptTypes(
	readFileSync(`${root}src/scripts/comment-likes.ts`, "utf8").replace(/^export /gm, ""),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
let passed = 0;
async function test(name, run) {
	const page = await browser.newPage();
	try {
		await page.route("https://blog.example/**", (route) =>
			route.fulfill({
				contentType: "text/html",
				body: '<div id="login-card" data-plugin-base="/api"></div><div id="nav-member" data-plugin-base="/api"></div>',
			}),
		);
		await run(page);
		passed++;
		console.log(`PASS ${name}`);
	} finally {
		await page.close();
	}
}
try {
	for (const input of [
		'"><svg onload="window.auditXss=1">',
		"javascript:window.auditXss=1",
		"//evil.example/",
		"https://evil.example/",
	]) {
		await test(`登录页安全处理 returnTo：${input}`, async (page) => {
			await page.goto(`https://blog.example/login?returnTo=${encodeURIComponent(input)}`);
			await page.evaluate(() => {
				window.fetch = async () => ({
					json: async () => ({
						data: {
							data: {
								loggedIn: true,
								member: {
									displayName: '<svg onload="window.auditXss=1">',
									avatarUrl: 'https://images.example/" onerror="window.auditXss=1',
								},
								qqConfigured: true,
							},
						},
					}),
				});
			});
			await page.addScriptTag({ content: loginScript });
			await page.waitForSelector("#logout-btn");
			assert.equal(await page.locator(".name").textContent(), '<svg onload="window.auditXss=1">');
			assert.equal(
				await page.locator(".btn.ghost").getAttribute("href"),
				input.startsWith('">') ? safeReturnTo(input, "https://blog.example") : "/",
			);
			assert.equal(await page.locator("#login-card svg, #login-card [onerror]").count(), 0);
			assert.equal(await page.evaluate(() => window.auditXss), undefined);
		});
	}
	await test("会员导航将昵称当作纯文本", async (page) => {
		await page.goto("https://blog.example/");
		await page.evaluate(() => {
			window.fetch = async () => ({
				json: async () => ({
					data: {
						data: {
							loggedIn: true,
							member: {
								displayName: '<svg onload="window.auditXss=1">',
								avatarUrl: 'https://images.example/" onerror="window.auditXss=1',
							},
						},
					},
				}),
			});
		});
		await page.addScriptTag({ content: navScript });
		await page.waitForSelector(".nav-member-name");
		assert.equal(
			await page.locator(".nav-member-name").textContent(),
			'<svg onload="window.auditXss=1">',
		);
		assert.equal(await page.locator("#nav-member svg, #nav-member [onerror]").count(), 0);
	});
	for (const failFirst of [false, true]) {
		await test(`121 条评论加载与取消点赞，首批失败=${failFirst}`, async (page) => {
			await page.goto("https://blog.example/");
			await page.evaluate(
				({ failFirst: failBatch }) => {
					window.batchSizes = [];
					window.fetch = async (address, options) => {
						if (options?.method === "POST") {
							window.lastAction = JSON.parse(options.body).action;
							return { json: async () => ({ data: { ok: true, active: false, count: 6 } }) };
						}
						const ids = new URL(address, location.origin).searchParams.get("targetIds").split(",");
						window.batchSizes.push(ids.length);
						if (failBatch && window.batchSizes.length === 1) throw new Error("offline");
						return {
							json: async () => ({
								data: {
									ok: true,
									items: ids.map((targetId) => ({ targetId, liked: true, likeCount: 7 })),
								},
							}),
						};
					};
					for (let i = 0; i < 121; i++) {
						const container = document.createElement("div");
						container.id = `comment-${i}`;
						document.body.append(container);
					}
				},
				{ failFirst },
			);
			await page.addScriptTag({
				content: `${likesScript}\ninstallCommentLikes({targets: () => Array.from({length:121}, (_,i) => ({id: 'c-'+i, container: document.getElementById('comment-'+i)}))});`,
			});
			await page.waitForFunction(
				() =>
					document.querySelector("#comment-120 button")?.getAttribute("aria-pressed") === "true",
			);
			assert.deepEqual(await page.evaluate(() => window.batchSizes), [50, 50, 21]);
			assert.equal(await page.locator("#comment-120 span").textContent(), "7");
			await page.locator("#comment-120 button").click();
			await page.waitForFunction(() => window.lastAction === "remove");
			assert.equal(await page.locator("#comment-120 button").getAttribute("aria-pressed"), "false");
		});
	}
	await test("收藏可连续加载三页，取消收藏后刷新游标", async (page) => {
		await page.goto("https://blog.example/member");
		await page.evaluate(() => {
			const memberRoot = document.createElement("div");
			memberRoot.id = "member-center";
			memberRoot.dataset.endpointBase = "/api";
			document.body.append(memberRoot);
			window.removedFavorite = false;
			window.fetch = async (address, options) => {
				if (options?.method === "POST") {
					window.removedFavorite = true;
					return { json: async () => ({ data: { ok: true } }) };
				}
				const cursor = new URL(address, location.origin).searchParams.get("favoritesCursor");
				const start = cursor === "second" ? 20 : cursor === "third" ? 40 : 0;
				return {
					json: async () => ({
						data: {
							ok: true,
							member: { displayName: "测试会员", avatarUrl: "", bio: "" },
							counts: { likes: 105, favorites: window.removedFavorite ? 44 : 45 },
							favorites: Array.from({ length: start === 40 ? 5 : 20 }, (_, index) => ({
								targetType: "posts",
								targetId: `p-${start + index}`,
								title: `收藏 ${start + index}`,
								path: `/posts/p-${start + index}`,
								createdAt: "2026-09-01",
							})),
							favoritesCursor: start === 0 ? "second" : start === 20 ? "third" : undefined,
							unavailableFavorites: 0,
							comments: [],
						},
					}),
				};
			};
		});
		await page.addScriptTag({
			content: scriptFrom("src/pages/member.astro", "function buildFavorites"),
		});
		await page.waitForSelector(".favorite-row");
		await page.getByRole("button", { name: "加载更多收藏" }).click();
		await page.waitForFunction(() => document.querySelectorAll(".favorite-row").length === 40);
		await page.getByRole("button", { name: "加载更多收藏" }).click();
		await page.waitForFunction(() => document.querySelectorAll(".favorite-row").length === 45);
		assert.equal(await page.getByRole("button", { name: "加载更多收藏" }).count(), 0);
		await page.getByRole("button", { name: "取消收藏" }).last().click();
		await page.waitForFunction(() => document.querySelectorAll(".favorite-row").length === 20);
		assert.equal(await page.locator('[data-count="44"]').textContent(), "44");
		assert.equal(await page.getByRole("button", { name: "加载更多收藏" }).count(), 1);
	});
	console.log(`${passed}/${passed} 通过`);
} finally {
	await browser.close();
}
