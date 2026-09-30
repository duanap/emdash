/**
 * 评论/留言的会员点赞按钮。
 *
 * 两处消费方（core 的评论列表、留言墙的卡片）结构不同，但行为一致：
 * 每个目标一个按钮、状态用一次批量请求取回、点击走幂等 toggle、未登录跳登录。
 *
 * 按钮由脚本创建，样式走全局（见 theme.css 的 `.ec-member-like`）。
 */

const ENDPOINT_BASE = "/_emdash/api/plugins/duanap-members";

export interface CommentLikeTarget {
	id: string;
	/** 按钮挂载点；容器可能复用（同一评论的重复卡片） */
	container: HTMLElement;
}

interface Options {
	endpointBase?: string;
	targets: () => CommentLikeTarget[];
}

function payloadOf(json: unknown): Record<string, unknown> | null {
	const outer = json as { data?: { data?: unknown } | unknown } | null;
	const data = (outer?.data as { data?: unknown } | undefined)?.data ?? outer?.data;
	return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
}

function setButtonState(button: HTMLButtonElement, liked: boolean, count: number) {
	button.setAttribute("aria-pressed", liked ? "true" : "false");
	const label = liked ? "取消点赞" : "点赞这条留言";
	button.setAttribute("aria-label", label);
	const counter = button.querySelector<HTMLElement>("[data-ec-member-like-count]");
	if (counter) counter.textContent = String(count);
}

export function installCommentLikes(options: Options): void {
	const endpointBase = options.endpointBase ?? ENDPOINT_BASE;
	const found = options.targets().filter((target) => target.id && target.container);
	if (found.length === 0) return;

	// 同一目标的重复卡片（无缝滚动的副本）共用一个按钮状态
	const buttons = new Map<string, HTMLButtonElement[]>();
	const ids = [...new Set(found.map((target) => target.id))];

	for (const target of found) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "ec-member-like";
		button.dataset.commentId = target.id;
		button.setAttribute("aria-pressed", "false");
		button.setAttribute("aria-label", "点赞这条留言");
		button.append(document.createTextNode("♥ "));
		const counter = document.createElement("span");
		counter.dataset.ecMemberLikeCount = "true";
		counter.textContent = "0";
		button.append(counter);

		button.addEventListener("click", async () => {
			const group = buttons.get(target.id) ?? [];
			const active = button.getAttribute("aria-pressed") === "true";
			for (const sibling of group) sibling.disabled = true;
			try {
				const res = await fetch(`${endpointBase}/activity/toggle`, {
					method: "POST",
					headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
					body: JSON.stringify({
						kind: "like",
						targetType: "comment",
						targetId: target.id,
						action: active ? "remove" : "add",
					}),
				});
				const payload = payloadOf(await res.json());
				if (payload?.ok) {
					for (const sibling of group) {
						setButtonState(sibling, payload.active === true, Number(payload.count ?? 0));
					}
					return;
				}
				if (payload?.reason === "unauthorized") {
					const returnTo = location.pathname + location.search;
					location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
					return;
				}
				for (const sibling of group) sibling.title = "点赞失败，请稍后重试";
			} catch {
				for (const sibling of group) sibling.title = "网络异常，请稍后重试";
			} finally {
				for (const sibling of group) sibling.disabled = false;
			}
		});

		target.container.append(button);
		const group = buttons.get(target.id);
		if (group) group.push(button);
		else buttons.set(target.id, [button]);
	}

	// 一次批量拿回所有按钮的初始状态
	void (async () => {
		try {
			const res = await fetch(
				`${endpointBase}/activity/state?targetType=comment&targetIds=${encodeURIComponent(ids.join(","))}`,
			);
			const payload = payloadOf(await res.json());
			if (!payload?.ok || !Array.isArray(payload.items)) return;
			for (const item of payload.items as Array<Record<string, unknown>>) {
				const group = buttons.get(String(item.targetId));
				if (!group) continue;
				for (const button of group) {
					setButtonState(button, item.liked === true, Number(item.likeCount ?? 0));
				}
			}
		} catch {
			// 状态拿不到就保持 0，不影响阅读
		}
	})();
}
