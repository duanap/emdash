/**
 * Single comment admin endpoints
 *
 * GET    /_emdash/api/admin/comments/:id - Get comment detail
 * DELETE /_emdash/api/admin/comments/:id - Hard delete (ADMIN only)
 */

import type { APIRoute } from "astro";

import { requirePerm } from "#api/authorize.js";
import { apiError, handleError, requireDb, unwrapResult } from "#api/error.js";
import {
	handleAdminCommentUpdate,
	handleCommentGet,
	handleCommentDelete,
} from "#api/handlers/comments.js";
import { isParseError, parseBody } from "#api/parse.js";
import { adminCommentUpdateBody } from "#api/schemas.js";

export const prerender = false;

/**
 * Get single comment detail (includes moderation_metadata)
 */
export const GET: APIRoute = async ({ params, locals }) => {
	const { emdash, user } = locals;
	const { id } = params;

	if (!id) {
		return apiError("VALIDATION_ERROR", "Comment ID required", 400);
	}

	const dbErr = requireDb(emdash?.db);
	if (dbErr) return dbErr;

	const denied = requirePerm(user, "comments:moderate");
	if (denied) return denied;

	try {
		const result = await handleCommentGet(emdash.db, id);
		return unwrapResult(result);
	} catch (error) {
		return handleError(error, "Failed to get comment", "COMMENT_GET_ERROR");
	}
};

/**
 * Hard delete a comment (ADMIN only)
 */
export const DELETE: APIRoute = async ({ params, locals }) => {
	const { emdash, user } = locals;
	const { id } = params;

	if (!id) {
		return apiError("VALIDATION_ERROR", "Comment ID required", 400);
	}

	const dbErr = requireDb(emdash?.db);
	if (dbErr) return dbErr;

	const denied = requirePerm(user, "comments:delete");
	if (denied) return denied;

	try {
		const result = await handleCommentDelete(emdash.db, id);
		return unwrapResult(result);
	} catch (error) {
		return handleError(error, "Failed to delete comment", "COMMENT_DELETE_ERROR");
	}
};

/**
 * Edit stored comment fields (body / author). Admin edits do not re-run
 * moderation hooks — the content is already trusted by an editor.
 */
export const PATCH: APIRoute = async ({ params, request, locals }) => {
	const { emdash, user } = locals;
	const { id } = params;

	if (!id) {
		return apiError("VALIDATION_ERROR", "Comment ID required", 400);
	}

	const dbErr = requireDb(emdash?.db);
	if (dbErr) return dbErr;

	const denied = requirePerm(user, "comments:moderate");
	if (denied) return denied;

	try {
		const body = await parseBody(request, adminCommentUpdateBody);
		if (isParseError(body)) return body;

		const result = await handleAdminCommentUpdate(emdash.db, id, {
			body: body.body,
			authorName: body.authorName,
			authorEmail: body.authorEmail,
		});

		return unwrapResult(result);
	} catch (error) {
		return handleError(error, "Failed to update comment", "COMMENT_UPDATE_ERROR");
	}
};
