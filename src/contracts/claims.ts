/**
 * Claim and finding shapes (design spec §8, Step 2–3; parcel spec `claims.ts`
 * contract block). A `Claim` is a single mechanically-extracted assertion a
 * doc makes about code ("this path exists", "this symbol exists", "this
 * command runs", "this link resolves"). A `ClaimFinding` is the verdict a
 * `Checker` (see `plugins.ts`) reaches about one claim.
 *
 * This file has no behavior — it is the shared vocabulary extractors and
 * checkers exchange. See `docs/design/llm-native-docs-system.md` §8 for the
 * audit algorithm these shapes feed.
 */

/** The four claim kinds a doc can make that this system mechanically checks. */
export type ClaimKind = "path" | "symbol" | "command" | "link";

/**
 * A single extracted, checkable assertion from a doc.
 */
export interface Claim {
	/** Which extractor produced this claim, and which family of checker must consume it. */
	kind: ClaimKind;
	/**
	 * CANONICAL — value semantics for kind:"path": value MUST be normalized by
	 * the extractor to a repo-root-relative POSIX path with no leading "./";
	 * relative Markdown links are resolved against `ParsedDoc.path` before
	 * normalization; `raw` preserves the original matched text. Checkers never
	 * re-normalize — they trust the extractor's normalization and compare
	 * `value` as-is. The same repo-root-relative POSIX convention (no leading
	 * "./") applies to kind:"link" values that resolve to an in-repo path.
	 * For kind:"symbol" and kind:"command", `value` is the literal identifier
	 * or command string as written (whitespace-trimmed), with no path-style
	 * normalization applied.
	 */
	value: string;
	/**
	 * CANONICAL — the id of the doc this claim was extracted from: the doc's
	 * frontmatter `id` field if the doc has valid frontmatter with an `id`,
	 * otherwise the doc's path relative to the repo root (POSIX, no leading
	 * "./"). This always matches the `id` of the `ParsedDoc` the claim came
	 * from — see `plugins.ts`.
	 */
	docId: string;
	/**
	 * CANONICAL — 1-indexed line number within the doc's full source file
	 * (including frontmatter, if present) where the claim's matched text
	 * begins. Line 1 is the first line of the file on disk. This is the
	 * number a human or agent would see in an editor's gutter, so findings
	 * can be reported as `file:line` without re-deriving an offset.
	 */
	line: number;
	/**
	 * The original matched text exactly as it appeared in the source doc,
	 * before any normalization. Preserved for diagnostics and for reproducing
	 * "what did the doc actually say" in a finding or PR comment.
	 */
	raw: string;
}

/**
 * The closed set of verdicts a checker can reach about a claim.
 *
 * CLOSED UNION — do not add members. Sub-reasons (e.g. the fixture-repo's
 * "a Python symbol claim can't be checked by the TS-only v1 symbol index")
 * are expressed as a substring of `ClaimFinding.detail`
 * (e.g. `"unverifiable_symbol_language"`), never as a new status. Adding a
 * status here is a contract amendment, not a checker's decision to make.
 */
export type FindingStatus = "ok" | "broken" | "moved" | "unverifiable";

/**
 * The verdict a `Checker` reaches about one `Claim`.
 */
export interface ClaimFinding {
	/** The claim this finding is about. */
	claim: Claim;
	/** See `FindingStatus` — closed union; refine with `detail`, never with a new status. */
	status: FindingStatus;
	/**
	 * Free-text sub-reason, present whenever a bare status is ambiguous on its
	 * own (e.g. why something is `unverifiable`, or what specifically broke).
	 * Machine-consumers may pattern-match substrings (e.g.
	 * `detail?.includes("unverifiable_symbol_language")`) but must never treat
	 * `detail` values as a second enum — they are diagnostic text, not a
	 * contract.
	 */
	detail?: string;
	/**
	 * Populated only when `status` is `"moved"`: the claim's new resolved
	 * location (same normalization rules as `Claim.value` for kind:"path").
	 */
	movedTo?: string;
}
