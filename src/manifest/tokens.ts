/** Deterministic ceil(chars / 4) approximation (±20% typical error).
 * Context budgeting only, never a tokenizer or billing measurement.
 * chars means JavaScript UTF-16 string length.
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}
