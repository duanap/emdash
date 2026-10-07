/**
 * Admin comment inbox
 *
 * GET /_emdash/api/admin/comments - List comments (filterable by status, collection, search)
 */

import type { APIRoute } from "astro";

import { requirePerm } from "#api/authorize.js";
import { handleError, requireDb, unwrapResult } from "#api/error.js";
import { handleAdminCommentCreate, handleCommentInbox } from "#api/handlers/comments.js";
import { isParseError, parseBody, parseQuery } from "#api/parse.js";
import { adminCommentCreateBody, commentListQuery } from "#api/schemas.js";

export const prerender = false;

/**
 * List comments for moderation inbox
 */
export const GET: APIRoute = async ({ url, locals }) => {
	const { emdash, user } = locals;

	const dbErr = requireDb(emdash?.db);
	if (dbErr) return dbErr;

	const denied = requirePerm(user, "comments:moderate");
	if (denied) return denied;

	try {
		const query = parseQuery(url, commentListQuery);
		if (isParseError(query)) return query;

		const result = await handleCommentInbox(emdash.db, {
			status: query.status,
			collection: query.collection,
			search: query.search,
			limit: query.limit,
			cursor: query.cursor,
		});

		return unwrapResult(result);
	} catch (error) {
		return handleError(error, "Failed to list comments", "COMMENT_INBOX_ERROR");
	}
};

/**
 * Create a stored comment directly (admin-authored message board entries).
 * The comment is created as approved so it shows immediately; callers may
 * pass status "pending" to stage it instead.
 */
export const POST: APIRoute = async ({ request, locals }) => {
	const { emdash, user } = locals;

	const dbErr = requireDb(emdash?.db);
	if (dbErr) return dbErr;

	const denied = requirePerm(user, "comments:moderate");
	if (denied) return denied;

	try {
		const body = await parseBody(request, adminCommentCreateBody);
		if (isParseError(body)) return body;

		const result = await handleAdminCommentCreate(emdash.db, body);

		return unwrapResult(result, 201);
	} catch (error) {
		return handleError(error, "Failed to create comment", "COMMENT_CREATE_ERROR");
	}
};
