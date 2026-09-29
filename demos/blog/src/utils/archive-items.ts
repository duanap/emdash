import { getEmDashCollection } from "emdash";

export type ArchiveItem = {
	title: string;
	href: string;
	date: Date;
	kind: "post" | "life";
};

/**
 * Fetch all published posts + life records (newest first) and merge
 * them into one archive stream. Ordering happens in the DB; the merge
 * and sort are cheap on a personal-blog scale.
 */
export async function getArchiveItems() {
	const [postsResult, lifeResult] = await Promise.all([
		getEmDashCollection("posts", {
			orderBy: { published_at: "desc" },
			limit: 500,
		}),
		getEmDashCollection("life", {
			orderBy: { record_date: "desc" },
			limit: 500,
		}),
	]);

	const items: ArchiveItem[] = [
		...postsResult.entries.map((p) => ({
			title: p.data.title ?? "未命名",
			href: `/posts/${p.id}`,
			date: p.data.publishedAt ?? p.data.updatedAt,
			kind: "post" as const,
		})),
		...lifeResult.entries.map((r) => ({
			title: r.data.title ?? "未命名",
			href: `/life/${r.id}`,
			date: new Date(
				(r.data.record_date ?? r.data.publishedAt ?? r.data.updatedAt) as
					| string
					| Date,
			),
			kind: "life" as const,
		})),
	]
		.filter((item) => item.date && !Number.isNaN(item.date.getTime()))
		.sort((a, b) => b.date.getTime() - a.date.getTime());

	return {
		items,
		postCount: postsResult.entries.length,
		lifeCount: lifeResult.entries.length,
	};
}

export const MONTH_LABELS = [
	"一月",
	"二月",
	"三月",
	"四月",
	"五月",
	"六月",
	"七月",
	"八月",
	"九月",
	"十月",
	"十一月",
	"十二月",
];
