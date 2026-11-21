# Parcel: w2-drift-engine

## Goal
Implement the freshness mechanism: intersect each doc's `covers` globs with commits since its `last_verified_sha`, classify the intersecting changes, and compute status transitions — plus the **only** writer permitted to touch machine-owned frontmatter fields.

## Wave
W2

## Branch
feat/w2-drift-engine

## Worktree
C:\Repos\docspine.w2-drift-engine

## Dependencies
- W1 complete (merged); prerequisite `src/git/path-history.ts` provides `readPathHistory` / `classifyPathChange`. Legacy `plumbing.ts` helpers remain available to other callers but are not sufficient for drift counts.
- None in W2 Batch A — accepts narrow typed options (no config file reads; `w2-cli-wiring` maps `DocSpineConfig` → options)

## Allowed Files
- src/drift/compute.ts
- src/drift/tolerance.ts
- src/drift/apply.ts
- scripts/drift.ts (temporary entry until w2-cli-wiring)
- tests/drift/compute.test.ts
- tests/drift/tolerance.test.ts
- tests/drift/apply.test.ts

## Forbidden
- **Do NOT import from `src/llm/**`.** Drift is T0 and carries real authority (it flips statuses); a model must never be able to influence it.
- Do NOT modify `src/git/**`. Consume the prerequisite helpers; if a primitive is missing, STOP and report — do not inline your own `git` shell-outs.
- Do NOT modify `src/contracts/**` or `schemas/**`.
- Do NOT write to any doc file outside `src/drift/apply.ts`. That module is the single audited write path.
- Do NOT touch human-authored prose. `apply.ts` rewrites frontmatter fields only, never the body.
- No new dependencies. Globs use `picomatch` (already locked).

## Out of Scope
Scratch expiry (`w3-*`), the PR bot, the stale queue as a persisted artifact, re-verification (promoting `stale` → `verified` is a human/T3 act, not this parcel's), and historical `covers_apis` signature comparison (tracked follow-up on the parcel board; MUST be reported as unevaluated, not as no API change).

## Existing Patterns To Follow
- `src/git/path-history.ts` — consume `readPathHistory` and `classifyPathChange`. Do not use net-tree `diffSinceSha` or the legacy `git diff -w` classifier for commit counts: net-reverted edits and language-semantic whitespace must not disappear. The new helper leaves all path events material unless an explicit contract glob wins; it makes no unproven cosmetic inference.
- `src/frontmatter/machine-fields.ts` — the machine-owned field list and protection logic already exist. `apply.ts` is the sanctioned writer that this module's rules describe; align with it rather than defining a second notion of "machine-owned"
- `docs/design/llm-native-docs-system.md` §11.1–11.3
- `npm run verify` is the gate

## Contract
```ts
export interface DocDrift {
  docId: string;
  lastVerifiedSha: string | null;
  materialCommits: number;
  cosmeticCommits: number;
  contractLevelChange: boolean;
  coveredFilesTouched: number;
  coveredFilesTotal: number;
  tolerance: DriftTolerance;
  recommendedStatus: DocStatus | null;   // null = no transition warranted
  reason: string;                        // human-readable, cited to counts
}
export interface DriftOptions {
  driftDefaults?: Partial<Record<DocKind, DriftTolerance>>;
  contractPaths?: string[];
}
export function computeDrift(repoRoot: string, docs: ParsedDoc[], opts: DriftOptions, git: GitFacts): Promise<DocDrift[]>;
export function applyDrift(repoRoot: string, drifts: DocDrift[]): Promise<{ updated: string[]; skipped: string[] }>;
```
Locked decisions:
1. **Compute and apply are separate.** `computeDrift` is pure analysis and mutates nothing. `applyDrift` is opt-in (CLI `--write`, default OFF). Reading state must never silently rewrite the repo.
2. **Initial v1 path-based change classification**, in precedence order:
   - Intersect each commit's path events with the doc's `covers` globs, checking BOTH endpoints of renames (use POSIX paths and `picomatch` with `dot: true`). Only covered events contribute. Count unique covered path names across events, including both covered rename endpoints and deleted names. `coveredFilesTotal` is the size of the union of covered baseline-tree paths (`readPathHistory`'s `baselinePaths`) and those touched names. This preserves deletions, includes additions and transient paths, and always contains the numerator. With an empty union, the touched fraction is zero. Report counts as unevaluated if the inventory is unavailable.
   - **Contract-level** → immediate `stale`, regardless of tolerance: a covered event also matches explicit `opts.contractPaths` globs on either endpoint. Use `classifyPathChange` on covered events. `contractLevelChange: false` means no explicit covered contract-path match, NOT proof of no API change.
   - **Material** → increments `materialCommits` once per commit with at least one covered material/contract-level event (never once per path). Contract-level events also contribute to material counts.
   - **Cosmetic** → no initial-v1 path events are proven cosmetic, so `cosmeticCommits: 0`. Whitespace, comments, and pure renames remain material: indentation, string spaces, Markdown breaks, import paths, and file modes can change behavior. Do not revive the legacy optimistic whitespace heuristic.
   - **Historical `covers_apis` signature comparison is UNEVALUATED** in initial v1. The existing `SymbolIndex` is current-tree-only, not a historical index. Say this explicitly in `reason` whenever `covers_apis` is nonempty, even if explicit contract-path detection found nothing. Never infer "no API change" or guess a contract change from unresolved symbols. The board tracks the historical-signatures follow-up; no frozen shape is extended here.
   - **Merge policy:** consume `readPathHistory`'s `all-commits-first-parent-diff`: all reachable commits in baseline-exclusive..HEAD-inclusive history, each diffed against its first parent. Side-branch edits and integration may both count; conflict-resolution changes are included. This is a conservative integration-event count, not unique patches. Empty commits contribute zero path events. Preserve this policy in reasons/PR notes; do not silently switch to net diff or simplified path logs.
3. **Tolerance thresholds** — `strict`: any material change → `stale`. `normal`: ≥10 material commits OR ≥30% of covered files touched. `loose`: ≥30 material commits AND ≥50% of covered files touched. Per-doc frontmatter `drift_tolerance` wins; absent, fall back to `opts.driftDefaults?.[kind]` (then built-in defaults).
4. **`last_verified_sha: null` (never verified) is NOT drift.** Such a doc is `draft`, not `stale` — `recommendedStatus: null`. Conflating "unverified" with "went stale" would misreport a fresh repo as rotten.
5. **Unavailable history** → `recommendedStatus: null`; include the typed `readPathHistory` failure reason and actionable message in `reason`. Invalid/non-commit SHA, missing/ambiguous object, non-ancestor, shallow history, Git failure, and malformed output are NOT successful empty history. The frozen numeric fields use `0` only as unevaluated placeholders on failure; explicitly say counts are unevaluated, never present them as measured zero. Successful `commits: []` really means no history changes; a nonempty range can also contain only empty commits. Do not promote either outcome.
6. **`applyDrift` only ever moves `verified` → `stale`.** It never promotes, never sets `verified`, never writes `last_verified_sha`. Promotion is T3 (deterministic checks + human approval). This restriction is the parcel's most important line.
7. `reason` must cite the numbers that drove the decision, so a human reading a stale queue never has to re-run the tool to understand why.

## Required Tests
- Fixture has ≥3 seeded commits touching a covered path (`setup-fixture-git.ps1`) — assert material counts against that known history
- `strict` flips on one material commit; `normal` does not
- Whitespace-only, comment-only, and pure-rename path events remain material in initial v1; empty commits do not cause drift
- Material edit followed by whitespace and net-reverted edits are counted per commit, not hidden by net-tree differences
- Merge/conflict-resolution fixture follows all-commits/first-parent-diff policy; assert the documented integration counts
- Covered/contract glob matching checks both rename endpoints; uncovered contract paths do not affect the doc
- Nonempty `covers_apis` always makes historical signature comparison explicitly unevaluated in `reason`, never "no API change"
- `last_verified_sha: null` → `recommendedStatus: null`, never `stale`
- Invalid, unavailable, non-ancestor, and shallow baselines → `null` + typed explanatory reason with unevaluated counts; distinguish from successful no-change
- `applyDrift` rewrites only frontmatter, byte-identical body (assert body hash unchanged)
- `applyDrift` refuses to set `verified` even if a `DocDrift` were hand-crafted to request it
- Percentage thresholds tested at boundary (29%/30%/31%); test final-covered-file deletion, additions, rename endpoints, and the zero-total case.

## Acceptance Criteria
- `npm run verify` green
- `npx tsx scripts/drift.ts <fixture>` reports drift without writing; `--write` applies and reports what it touched
- Zero writes occur without `--write` (assert in test, not by inspection)

## Verification
- `npm run verify`
- `pwsh fixtures/messy-repo/setup-fixture-git.ps1 -Target $env:TEMP\ds-drift`
- `npx tsx scripts/drift.ts $env:TEMP\ds-drift` → read-only; then `--write` → confirm only frontmatter changed via `git diff`

## Collision Risk
Low-medium — new `src/drift/**` tree. Shares `src/frontmatter/machine-fields.ts` as a read-only consumer. Coordinate with `w2-pipeline-audit` only if both need a shared doc-loading helper; prefer duplication over coupling in this wave.

## PR Notes
- What changed: drift computation, tolerance tiers, the sanctioned frontmatter writer
- Why: freshness anchored to SHAs is the core thesis (design spec P7); without this DocSpine is just a link checker
- Risk: `applyDrift` is the only code that mutates docs — review it as if it were a signing key
- Verification: commands above; confirm the never-promote invariant has a test

## Stop-and-Report Rule
Initial v1 is explicitly limited to covered-path/explicit-contract-glob detection; historical API signatures remain unevaluated and tracked as a follow-up. Do not approximate them with the current-tree `SymbolIndex`. If `src/git/path-history.ts` lacks a needed primitive, STOP and report. If a tolerance threshold above is ambiguous against real data, stop and report. A false `stale` erodes trust as fast as a false `verified`.
