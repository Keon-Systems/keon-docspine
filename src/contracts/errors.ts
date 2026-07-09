/**
 * Normalized provider-error taxonomy (design spec §19.2). Every adapter
 * obligation to "normalize errors into a small taxonomy... so routing logic
 * never sees vendor error strings" resolves to this shape. This file has no
 * behavior — mapping a specific vendor's error responses onto
 * `ProviderErrorCode` is adapter-implementation work (`w2-adapter-*`
 * parcels).
 */

/**
 * CLOSED UNION — the only vendor-error categories routing logic is allowed
 * to branch on. Verbatim from the design spec (§19.2):
 * `rate_limited | context_exceeded | schema_unrecoverable | network_denied | provider_down`.
 * Adding a member is a contract amendment, not an adapter's decision.
 */
export type ProviderErrorCode =
	| "rate_limited"
	| "context_exceeded"
	| "schema_unrecoverable"
	| "network_denied"
	| "provider_down";

/**
 * A provider/adapter failure, normalized to the closed taxonomy above
 * before it reaches routing logic.
 */
export interface ProviderError {
	code: ProviderErrorCode;
	/** Human-readable, adapter-authored summary — not the raw vendor message. */
	message: string;
	/**
	 * The original vendor error (if any), retained only for logs/diagnostics.
	 * Routing logic MUST NOT inspect this field — that would defeat the point
	 * of normalizing to `code` in the first place (design spec §19.2).
	 */
	cause?: unknown;
}
