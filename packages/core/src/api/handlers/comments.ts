/**
 * Comment handlers — business logic for comment API routes.
 *
 * Standalone functions that return ApiResult<T>. Routes are thin wrappers.
 */

import type { Kysely } from "kysely";

import { CommentRepository } from "../../database/repositories/comment.js";
import type { Comment, CommentStatus, PublicComment } from "../../database/repositories/comment.js";
import { InvalidCursorError } from "../../database/repositories/types.js";
import type { Database } from "../../database/types.js";
import type { ApiResult } from "../types.js";

// ---------------------------------------------------------------------------
// Public: List approved comments for content
// ---------------------------------------------------------------------------

export async function handleCommentList(
	db: Kysely<Database>,
	collection: string,
	contentId: string,
	options: { limit?: number; cursor?: string; threaded?: boolean } = {},
): Promise<ApiResult<{ items: PublicComment[]; nextCursor?: string; total: number }>> {
	try {
		const repo = new CommentRepository(db);

		// Get total approved count
		const total = await repo.countByContent(collection, contentId, "approved");

		let publicItems: PublicComment[];
		let nextCursor: string | undefined;

		if (options.threaded) {
			// Threaded mode: fetch all approved comments (capped) so threading
			// doesn't lose children that would fall on later pages.
			const MAX_THREADED = 500;
			const result = await repo.findByContent(collection, contentId, {
				status: "approved",
				limit: MAX_THREADED,
			});
			const threaded = CommentRepository.assembleThreads(result.items);
			publicItems = threaded.map((c) => CommentRepository.toPublicComment(c));
			// No cursor for threaded mode — all comments returned at once
		} else {
			const result = await repo.findByContent(collection, contentId, {
				status: "approved",
				limit: options.limit,
				cursor: options.cursor,
			});
			publicItems = result.items.map((c) => CommentRepository.toPublicComment(c));
			nextCursor = result.nextCursor;
		}

		return {
			success: true,
			data: {
				items: publicItems,
				nextCursor,
				total,
			},
		};
	} catch (error) {
		if (error instanceof InvalidCursorError) {
			return {
				success: false,
				error: { code: "INVALID_CURSOR", message: error.message },
			};
		}
		console.error("Comment list error:", error);
		return {
			success: false,
			error: {
				code: "COMMENT_LIST_ERROR",
				message: "Failed to list comments",
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Admin: Moderation inbox
// ---------------------------------------------------------------------------

export async function handleCommentInbox(
	db: Kysely<Database>,
	options: {
		status?: CommentStatus;
		collection?: string;
		search?: string;
		limit?: number;
		cursor?: string;
	} = {},
): Promise<ApiResult<{ items: Comment[]; nextCursor?: string }>> {
	try {
		const repo = new CommentRepository(db);
		const status = options.status ?? "pending";

		const result = await repo.findByStatus(status, {
			collection: options.collection,
			search: options.search,
			limit: options.limit,
			cursor: options.cursor,
		});

		return {
			success: true,
			data: {
				items: result.items,
				nextCursor: result.nextCursor,
			},
		};
	} catch (error) {
		if (error instanceof InvalidCursorError) {
			return {
				success: false,
				error: { code: "INVALID_CURSOR", message: error.message },
			};
		}
		console.error("Comment inbox error:", error);
		return {
			success: false,
			error: {
				code: "COMMENT_INBOX_ERROR",
				message: "Failed to list comments",
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Admin: Status counts for inbox badges
// ---------------------------------------------------------------------------

export async function handleCommentCounts(
	db: Kysely<Database>,
): Promise<ApiResult<Record<CommentStatus, number>>> {
	try {
		const repo = new CommentRepository(db);
		const counts = await repo.countByStatus();
		return { success: true, data: counts };
	} catch (error) {
		console.error("Comment counts error:", error);
		return {
			success: false,
			error: {
				code: "COMMENT_COUNTS_ERROR",
				message: "Failed to get comment counts",
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Admin: Get single comment detail
// ---------------------------------------------------------------------------

export async function handleCommentGet(
	db: Kysely<Database>,
	id: string,
): Promise<ApiResult<Comment>> {
	try {
		const repo = new CommentRepository(db);
		const comment = await repo.findById(id);

		if (!comment) {
			return {
				success: false,
				error: { code: "NOT_FOUND", message: `Comment not found: ${id}` },
			};
		}

		return { success: true, data: comment };
	} catch (error) {
		console.error("Comment get error:", error);
		return {
			success: false,
			error: {
				code: "COMMENT_GET_ERROR",
				message: "Failed to get comment",
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Admin: Change comment status
// ---------------------------------------------------------------------------

export async function handleCommentStatusChange(
	db: Kysely<Database>,
	id: string,
	status: CommentStatus,
): Promise<ApiResult<Comment>> {
	try {
		const repo = new CommentRepository(db);
		const updated = await repo.updateStatus(id, status);

		if (!updated) {
			return {
				success: false,
				error: { code: "NOT_FOUND", message: `Comment not found: ${id}` },
			};
		}

		return { success: true, data: updated };
	} catch (error) {
		console.error("Comment status change error:", error);
		return {
			success: false,
			error: {
				code: "COMMENT_STATUS_ERROR",
				message: "Failed to update comment status",
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Admin: Hard delete comment
// ---------------------------------------------------------------------------

export async function handleCommentDelete(
	db: Kysely<Database>,
	id: string,
): Promise<ApiResult<{ deleted: true }>> {
	try {
		const repo = new CommentRepository(db);
		const deleted = await repo.delete(id);

		if (!deleted) {
			return {
				success: false,
				error: { code: "NOT_FOUND", message: `Comment not found: ${id}` },
			};
		}

		return { success: true, data: { deleted: true } };
	} catch (error) {
		console.error("Comment delete error:", error);
		return {
			success: false,
			error: {
				code: "COMMENT_DELETE_ERROR",
				message: "Failed to delete comment",
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Admin: Bulk operations
// ---------------------------------------------------------------------------

export async function handleCommentBulk(
	db: Kysely<Database>,
	ids: string[],
	action: "approve" | "spam" | "trash" | "delete" | "restore",
): Promise<ApiResult<{ affected: number }>> {
	try {
		const repo = new CommentRepository(db);

		let affected: number;
		if (action === "delete") {
			affected = await repo.bulkDelete(ids);
		} else {
			const statusMap: Record<string, CommentStatus> = {
				approve: "approved",
				spam: "spam",
				trash: "trash",
				restore: "pending",
			};
			affected = await repo.bulkUpdateStatus(ids, statusMap[action]);
		}

		return { success: true, data: { affected } };
	} catch (error) {
		console.error("Comment bulk error:", error);
		return {
			success: false,
			error: {
				code: "COMMENT_BULK_ERROR",
				message: "Failed to perform bulk operation",
			},
		};
	}
}

/**
 * Hash an IP address for storage (never store cleartext IPs).
 *
 * Uses full SHA-256 with a site-specific salt to prevent rainbow-table
 * recovery of IPs. The salt must be provided by the caller — typically
 * via `resolveSecretsCached(db).ipSalt` from `#config/secrets.js`. The
 * salt is generated and persisted on first need so it's stable across
 * requests within a deployment but unique per install.
 */
export async function hashIp(ip: string, salt: string): Promise<string> {
	const data = `ip:${salt}:${ip}`;
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
	return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Admin: Create a stored comment directly (message board entries, edits)
// ---------------------------------------------------------------------------

export interface AdminCommentCreateInput {
	collection: string;
	contentId: string;
	authorName: string;
	authorEmail: string;
	body: string;
	parentId?: string | null;
	/** Defaults to approved: admin-authored entries publish immediately. */
	status?: CommentStatus;
}

export async function handleAdminCommentCreate(
	db: Kysely<Database>,
	input: AdminCommentCreateInput,
): Promise<ApiResult<Comment>> {
	try {
		const repo = new CommentRepository(db);
		const comment = await repo.create({
			collection: input.collection,
			contentId: input.contentId,
			parentId: input.parentId ?? null,
			authorName: input.authorName,
			authorEmail: input.authorEmail,
			authorUserId: null,
			body: input.body,
			status: input.status ?? "approved",
			moderationMetadata: { source: "admin" },
		});
		return { success: true, data: comment };
	} catch (error) {
		console.error("Admin comment create error:", error);
		return {
			success: false,
			error: {
				code: "COMMENT_CREATE_ERROR",
				message: "Failed to create comment",
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Admin: Edit stored comment fields (body / author)
// ---------------------------------------------------------------------------

export async function handleAdminCommentUpdate(
	db: Kysely<Database>,
	id: string,
	fields: { body?: string; authorName?: string; authorEmail?: string },
): Promise<ApiResult<Comment>> {
	try {
		const repo = new CommentRepository(db);
		const updated = await repo.updateFields(id, fields);
		if (!updated) {
			return {
				success: false,
				error: { code: "NOT_FOUND", message: `Comment not found: ${id}` },
			};
		}
		return { success: true, data: updated };
	} catch (error) {
		console.error("Admin comment update error:", error);
		return {
			success: false,
			error: {
				code: "COMMENT_UPDATE_ERROR",
				message: "Failed to update comment",
			},
		};
	}
}
