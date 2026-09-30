/**
 * 留言墙的轨道切分。
 *
 * 旧站把留言按奇偶分成两条轨道做无缝滚动。这里把三件事分开，模板只负责渲染：
 * - `items`：该轨道里每条留言出现一次，是**可读、可交互**的那一份；
 * - `padding`：卡片太少时补的副本，只为把轨道铺够宽，对读屏隐藏、不挂交互；
 * - `buildLaneTrack`：把「一份 + 副本」拼成两半相同的轨道，动画位移 -50% 才能无缝。
 */

/** 单条轨道至少铺这么多张，保证滚动时不会露出空档 */
export const WALL_MIN_LANE_CARDS = 6;

export interface WallLane<T> {
	/** 可读的一份，每条留言一次 */
	items: T[];
	/** 仅为铺宽而重复的副本 */
	padding: T[];
}

export interface WallLaneCard<T> {
	item: T;
	/** 只有第一半是可读、可交互的；其余是滚动副本 */
	readable: boolean;
}

/** 留言按奇偶分到两条轨道；空轨道丢弃（只有一条留言时就是单轨） */
export function buildWallLanes<T>(items: readonly T[], minCards = WALL_MIN_LANE_CARDS): WallLane<T>[] {
	const split: T[][] = [[], []];
	items.forEach((item, index) => {
		split[index % 2]!.push(item);
	});

	return split
		.filter((lane) => lane.length > 0)
		.map((lane) => {
			const padding: T[] = [];
			while (lane.length + padding.length < minCards) padding.push(...lane);
			return { items: [...lane], padding };
		});
}

/**
 * 轨道渲染顺序：把「一份 + 补位」拼两遍，动画位移 -50% 正好循环到起点。
 * `readable` 只对第一半为 true —— 副本不该再被读屏或键盘访问一次。
 */
export function buildLaneTrack<T>(lane: WallLane<T>): WallLaneCard<T>[] {
	const half = [...lane.items, ...lane.padding];
	return [...half, ...half].map((item, index) => ({
		item,
		readable: index < lane.items.length,
	}));
}
