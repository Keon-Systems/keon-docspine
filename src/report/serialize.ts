/** Shared deterministic JSON serialization. Array order belongs to the caller. */
function sortKeysDeep(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeysDeep);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [
					key,
					sortKeysDeep((value as Record<string, unknown>)[key]),
				]),
		);
	}
	return value;
}

/** Sort object keys recursively without dropping JSON keys or reordering arrays. */
export function stableStringify(value: unknown, space?: number): string {
	return JSON.stringify(sortKeysDeep(value), null, space);
}
