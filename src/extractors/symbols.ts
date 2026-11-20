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
import { maskFencedCodeBlocks } from "./fences.js";

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
 * Common file extensions that appear in root-level filenames without a `/`
 * (e.g. `AGENTS.md`, `package.json`, `tsconfig.json`, `biome.json`,
 * `manifest.json.routes`). Without this guard, dotted filenames match
 * `SYMBOL_RE` and flood real repos with false `symbol_not_found` findings.
 */
const FILENAME_EXT_RE =
	/\.(?:md|json|ya?ml|toml|ts|tsx|js|jsx|mjs|cjs|py|sh|ps1|txt|lock|env|ini|cfg|conf|css|scss|html|xml|svg|png|jpg|jpeg|gif|webp|sql|graphql|proto|dockerfile)(?:\.|$)/i;

/**
 * Structural signal that a single (non-dotted, non-call) identifier is a code
 * symbol rather than a prose word, CLI subcommand, package name, or schema
 * enum value (e.g. `draft`, `stale`, `main`, `ajv`, `biome`, `audit`, `PATH`).
 * Matches:
 *   - camelCase (`getInvoicePdf`, `runVerify`, `brokenClaimRatio`)
 *   - PascalCase (`AuditReport`, `SymbolIndex`, `ClaimFinding`)
 *   - snake_case (`format_report`, `last_verified_sha`, `detect_duplicates`)
 *   - `$`-prefixed identifiers (`$schema`)
 *
 * Excludes bare all-lowercase words (`draft`, `biome`, `audit`, `tsc`) and
 * bare ALL_CAPS words without underscores (`PATH`, `HEAD`, `JSON`, `YAML`,
 * `CLI`, `PR`, `SHA`) which overwhelmingly denote env vars or acronyms in docs.
 */
const SINGLE_IDENT_CODE_SHAPE_RE =
	/(?:[a-z][A-Z]|^[A-Z][a-zA-Z0-9]*[a-z]|_|^\$)/;

/**
 * Normalizes a backtick span's inner text into a symbol claim value, or
 * returns `null` when it doesn't look like a symbol. Per the `Claim.value`
 * normalization rule in `contracts/claims.ts`, symbols get NO path-style
 * normalization: the literal identifier as written, whitespace-trimmed,
 * with only a trailing `()` stripped. See `tests/extractors/symbols.test.ts`
 * for the precision cases this heuristic guards against (path-shaped spans,
 * root filenames, bare lowercase prose/CLI words, shell flags, pure numbers,
 * dotted identifiers, call-paren stripping).
 */
function normalizeCandidate(candidateRaw: string): string | null {
	const t = candidateRaw.trim();
	if (!t) return null;
	if (t.includes("/")) return null; // path-shaped, not a symbol — paths.ts's claim
	if (!SYMBOL_RE.test(t)) return null;

	const hasCallParens = t.endsWith("()");
	const ident = hasCallParens ? t.slice(0, -2) : t;

	if (FILENAME_EXT_RE.test(ident)) return null;
	if (!hasCallParens && !ident.includes(".")) {
		if (!SINGLE_IDENT_CODE_SHAPE_RE.test(ident)) return null;
	}

	return ident;
}

export const symbolExtractor: Extractor = {
	id: "extract-symbols",
	kind: "symbol",

	extract(doc: ParsedDoc): Claim[] {
		const claims: Claim[] = [];

		// Mask fenced code blocks to same-length whitespace (preserves line
		// structure) before scanning — see file header for why.
		const maskedBody = maskFencedCodeBlocks(doc.body);
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
