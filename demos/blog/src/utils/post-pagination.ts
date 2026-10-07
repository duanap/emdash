function link(targetCursor: string | undefined, previous: string[], targetPage: number) {
	const query = new URLSearchParams();
	if (targetCursor) query.set("cursor", targetCursor);
	if (targetPage > 1) query.set("page", String(targetPage));
	previous.forEach((value) => query.append("previous", value));
	return query.size ? `/posts?${query}` : "/posts";
}

export function postPagination(params: URLSearchParams, nextCursor?: string) {
	const cursor = params.get("cursor") || undefined;
	const history = params.getAll("previous").slice(-20);
	const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
	return {
		page,
		next: nextCursor ? link(nextCursor, [...history, cursor ?? ""], page + 1) : undefined,
		previous: history.length
			? link(history.at(-1) || undefined, history.slice(0, -1), Math.max(1, page - 1))
			: undefined,
	};
}
