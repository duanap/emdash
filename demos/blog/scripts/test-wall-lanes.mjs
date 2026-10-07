#!/usr/bin/env node
/**
 * 留言墙轨道切分的验证（src/utils/wall-lanes.ts）。
 *
 * 这段算术决定"滚动时会不会露出空档""副本会不会被读屏读到""每条留言是否只出现一次可读卡片"，
 * 属于纯函数，直接测。
 *
 * 用法（Node >= 22.16）：
 *   node --experimental-strip-types scripts/test-wall-lanes.mjs
 */

import assert from "node:assert/strict";

import { buildLaneTrack, buildWallLanes, WALL_MIN_LANE_CARDS } from "../src/utils/wall-lanes.ts";

const results = [];
let failures = 0;

async function test(name, fn) {
	try {
		await fn();
		results.push(`  PASS  ${name}`);
	} catch (error) {
		failures += 1;
		results.push(`  FAIL  ${name}\n        ${error.message.split("\n").join("\n        ")}`);
	}
}

const letters = (count) =>
	Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));

await test("没有留言时没有轨道", () => {
	assert.deepEqual(buildWallLanes([]), []);
});

await test("单条留言只有一条轨道，可读一份 + 补位", () => {
	const lanes = buildWallLanes(["only"]);
	assert.equal(lanes.length, 1, "空轨道应被丢弃");
	assert.deepEqual(lanes[0].items, ["only"]);
	assert.equal(lanes[0].items.length + lanes[0].padding.length, WALL_MIN_LANE_CARDS);
	assert.deepEqual([...new Set(lanes[0].padding)], ["only"]);
});

await test("按奇偶分到两条轨道，各自铺够最小张数", () => {
	const lanes = buildWallLanes(letters(6));
	assert.equal(lanes.length, 2);
	assert.deepEqual(lanes[0].items, ["A", "C", "E"]);
	assert.deepEqual(lanes[1].items, ["B", "D", "F"]);
	for (const lane of lanes) {
		assert.equal(lane.items.length + lane.padding.length, WALL_MIN_LANE_CARDS);
	}
});

await test("卡片已够多时不补位", () => {
	const lanes = buildWallLanes(letters(12));
	for (const lane of lanes) {
		assert.equal(lane.padding.length, 0, "够宽就不该有补位卡片");
		assert.deepEqual(lane.items, lane.items);
	}
});

await test("轨道两份相同，位移 -50% 才能无缝", () => {
	const [lane] = buildWallLanes(letters(3));
	const track = buildLaneTrack(lane);
	const half = track.length / 2;
	assert.equal(track.length % 2, 0, "轨道长度必须是偶数");
	assert.deepEqual(
		track.slice(0, half).map((card) => card.item),
		track.slice(half).map((card) => card.item),
		"两半内容必须一致",
	);
});

await test("每条留言只有一张可读卡片（补位与副本都不可读）", () => {
	const lanes = buildWallLanes(letters(5));
	for (const lane of lanes) {
		const track = buildLaneTrack(lane);
		const readable = track.filter((card) => card.readable);
		assert.equal(readable.length, lane.items.length);
		assert.deepEqual(
			readable.map((card) => card.item),
			lane.items,
			"可读卡片应与该轨道的留言一一对应",
		);
		// 可读卡片必须是轨道的开头一段，副本紧随其后
		const firstNonReadable = track.findIndex((card) => !card.readable);
		assert.equal(firstNonReadable, lane.items.length);
	}
});

await test("minCards 可调", () => {
	const lanes = buildWallLanes(["x", "y"], 3);
	assert.equal(lanes[0].items.length + lanes[0].padding.length, 3);
	assert.equal(lanes[1].items.length + lanes[1].padding.length, 3);

	const [single] = buildWallLanes(["only"], 2);
	assert.deepEqual(single, { items: ["only"], padding: ["only"] });
});

console.log("\n留言墙轨道切分验证\n");
console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} 通过`);
if (failures > 0) {
	console.log(`${failures} 项失败`);
	process.exit(1);
}
