/**
 * Datetime fields in EmDash resolve to `string | Date` depending on how
 * they were written. Normalize before calling Date methods.
 */
export function toDate(
	value: string | Date | null | undefined,
): Date | undefined {
	if (!value) return undefined;
	return value instanceof Date ? value : new Date(value);
}

export function formatDateZh(
	value: string | Date | null | undefined,
): string | null {
	const date = toDate(value);
	if (!date || Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString("zh-CN", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}
