/**
 * Symbol claim extractor (design spec §8 Step 2). Pure function of
 * `ParsedDoc` — no filesystem or network access, per `Extractor`'s
 * contract. Recognizes `kind:"symbol"` claims from backtick-fenced inline
 * spans in prose that look like a code identifier, per the split with the
 * sibling `paths.ts` extractor (`docs/PARCELS/w1-extract-symbols.md`
 * Contract section):
 *
 *   - optional dotted segments (`SessionService.SetAsync`)
 *   - optional trailing call parens, stripped from the claim `value`
 *     (`getInvoicePdf()` -> value `getInvoicePdf`)
 *   - letters/digits/`_`/`$`, where each dotted segment must *start* with a
 *     letter/`_`/`$` (never a digit or `-`). That single rule is what
 *     rejects pure numbers (`42`) and shell-flag-looking tokens (`--prod`,
 *     `-x`) without a separate special case for either.
 *
 * Spans containing "/" are path-shaped, not symbols — that's `paths.ts`'s
 * claim to make, not ours.
 *
 * Content inside fenced code blocks (``` ... ```) is masked out entirely
 * before scanning, same as `paths.ts`: a symbol claim only ever comes from
 * an inline backtick span in prose, never from inside a fenced block
 * (that's `w1-extract-commands`'s territory).
 */
import type { Claim, Extractor, ParsedDoc } from "../contracts/index.js";

const FENCE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;

/**
 * A dotted identifier: each segment starts with a letter/`_`/`$` and
 * continues with letters/digits/`_`/`$`, with an optional trailing `()`
 * (empty call parens only — a span with real arguments inside the parens
 * won't match this, which is an intentional narrow call: extraction, not
 * language-aware parsing, per the parcel's Out of Scope note).
 */
const SYMBOL_RE =
	/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*(?:\(\))?$/;

/**
 * Normalizes a backtick span's inner text into a symbol claim value, or
 * returns `null` when it doesn't look like a symbol. Per the `Claim.value`
 * normalization rule in `contracts/claims.ts`, symbols get NO path-style
 * normalization: the literal identifier as written, whitespace-trimmed,
 * with only a trailing `()` stripped. See `tests/extractors/symbols.test.ts`
 * for the precision cases this heuristic guards against (path-shaped spans,
 * shell flags, pure numbers, dotted identifiers, call-paren stripping).
 */
function normalizeCandidate(candidateRaw: string): string | null {
	const t = candidateRaw.trim();
	if (!t) return null;
	if (t.includes("/")) return null; // path-shaped, not a symbol — paths.ts's claim
	if (!SYMBOL_RE.test(t)) return null;
	return t.endsWith("()") ? t.slice(0, -2) : t;
}

export const symbolExtractor: Extractor = {
	id: "extract-symbols",
	kind: "symbol",

	extract(doc: ParsedDoc): Claim[] {
		const claims: Claim[] = [];

		// Mask fenced code blocks to same-length whitespace (preserves line
		// structure) before scanning — see file header for why.
		const maskedBody = doc.body.replace(FENCE_RE, (m) =>
			m.replace(/[^\n]/g, " "),
		);
		const lines = maskedBody.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			// Relative to doc.body; the pipeline adds the frontmatter offset
			// (see parse-doc.ts's ParseDocResult.bodyLineOffset) before a claim
			// leaves the pipeline — see this file's header / the parcel spec's
			// CANONICAL line-numbering convention.
			const lineNo = i + 1;

			for (const m of line.matchAll(INLINE_CODE_RE)) {
				const inner = m[1] ?? "";
				const value = normalizeCandidate(inner);
				if (value) {
					claims.push({
						kind: "symbol",
						value,
						docId: doc.id,
						line: lineNo,
						raw: m[0],
					});
				}
			}
		}

		return claims;
	},
};
