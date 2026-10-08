/**
 * Comment moderation API client
 */

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import {
	API_BASE,
	apiFetch,
	parseApiResponse,
	throwResponseError,
	type FindManyResult,
} from "./client.js";
import { fetchContentList } from "./content.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommentStatus = "pending" | "approved" | "spam" | "trash";

export interface AdminComment {
	id: string;
	collection: string;
	contentId: string;
	parentId: string | null;
	authorName: string;
	authorEmail: string;
	authorUserId: string | null;
	body: string;
	status: CommentStatus;
	ipHash: string | null;
	userAgent: string | null;
	moderationMetadata: Record<string, unknown> | null;
	createdAt: string;
	updatedAt: string;
}

export type CommentCounts = Record<CommentStatus, number>;

export type BulkAction = "approve" | "spam" | "trash" | "delete" | "restore";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch comments for the moderation inbox
 */
export async function fetchComments(options?: {
	status?: CommentStatus;
	collection?: string;
	search?: string;
	limit?: number;
	cursor?: string;
}): Promise<FindManyResult<AdminComment>> {
	const params = new URLSearchParams();
	if (options?.status) params.set("status", options.status);
	if (options?.collection) params.set("collection", options.collection);
	if (options?.search) params.set("search", options.search);
	if (options?.limit) params.set("limit", String(options.limit));
	if (options?.cursor) params.set("cursor", options.cursor);

	const url = `${API_BASE}/admin/comments${params.toString() ? `?${params}` : ""}`;
	const response = await apiFetch(url);
	return parseApiResponse<FindManyResult<AdminComment>>(response, "Failed to fetch comments");
}

/**
 * Fetch comment status counts for inbox badges
 */
export async function fetchCommentCounts(): Promise<CommentCounts> {
	const response = await apiFetch(`${API_BASE}/admin/comments/counts`);
	return parseApiResponse<CommentCounts>(response, "Failed to fetch comment counts");
}

/**
 * Fetch a single comment by ID
 */
export async function fetchComment(id: string): Promise<AdminComment> {
	const response = await apiFetch(`${API_BASE}/admin/comments/${id}`);
	return parseApiResponse<AdminComment>(response, "Failed to fetch comment");
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Update a comment's status
 */
export async function updateCommentStatus(
	id: string,
	status: CommentStatus,
): Promise<AdminComment> {
	const response = await apiFetch(`${API_BASE}/admin/comments/${id}/status`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ status }),
	});
	return parseApiResponse<AdminComment>(response, "Failed to update comment status");
}

/**
 * Hard delete a comment (ADMIN only)
 */
export async function deleteComment(id: string): Promise<void> {
	const response = await apiFetch(`${API_BASE}/admin/comments/${id}`, {
		method: "DELETE",
	});
	if (!response.ok) await throwResponseError(response, i18n._(msg`Failed to delete comment`));
}

/**
 * Bulk status change or delete
 */
export async function bulkCommentAction(
	ids: string[],
	action: BulkAction,
): Promise<{ affected: number }> {
	let affected = 0;
	for (let offset = 0; offset < ids.length; offset += 100) {
		const response = await apiFetch(`${API_BASE}/admin/comments/bulk`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ids: ids.slice(offset, offset + 100), action }),
		});
		const result = await parseApiResponse<{ affected: number }>(
			response,
			i18n._(msg`Failed to perform bulk action`),
		);
		affected += result.affected;
	}
	return { affected };
}

/**
 * Create a stored comment directly (admin message-board entries).
 * status defaults to approved on the server.
 */
export async function createAdminComment(input: {
	collection: string;
	contentId: string;
	authorName: string;
	body: string;
	parentId?: string;
}): Promise<AdminComment> {
	const response = await apiFetch(`${API_BASE}/admin/comments`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			...input,
			authorEmail: "wall-admin@duanap.local",
		}),
	});
	return parseApiResponse<AdminComment>(response, i18n._(msg`Failed to create message`));
}

/**
 * Edit an existing stored comment (body / author name).
 */
export async function updateAdminComment(
	id: string,
	fields: { body?: string; authorName?: string },
): Promise<AdminComment> {
	const response = await apiFetch(`${API_BASE}/admin/comments/${id}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(fields),
	});
	return parseApiResponse<AdminComment>(response, i18n._(msg`Failed to update message`));
}

export async function fetchMessageBoardContainer(collection: string, locale?: string) {
	const page = await fetchContentList(collection, {
		limit: 1,
		locale,
		status: "published",
		orderBy: "createdAt",
		order: "asc",
	});
	return page.items[0];
}
