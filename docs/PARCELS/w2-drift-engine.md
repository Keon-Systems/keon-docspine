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
- W1 complete (merged) — `src/git/plumbing.ts` provides `diffSinceSha`/`findRename`/`classifyChange`
- w2-config-load (merged) — for `driftDefaults` tolerance tiers

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
- Do NOT modify `src/git/plumbing.ts`. If a primitive is missing, STOP and report — do not inline your own `git` shell-outs.
- Do NOT modify `src/contracts/**` or `schemas/**`.
- Do NOT write to any doc file outside `src/drift/apply.ts`. That module is the single audited write path.
- Do NOT touch human-authored prose. `apply.ts` rewrites frontmatter fields only, never the body.
- No new dependencies. Globs use `picomatch` (already locked).

## Out of Scope
Scratch expiry (`w3-*`), the PR bot, the stale queue as a persisted artifact, and re-verification (promoting `stale` → `verified` is a human/T3 act, not this parcel's).

## Existing Patterns To Follow
- `src/git/plumbing.ts` — `classifyChange` already distinguishes material from cosmetic; consume it, do not reimplement
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
export function computeDrift(repoRoot: string, docs: ParsedDoc[], cfg: DocSpineConfig, git: GitFacts): Promise<DocDrift[]>;
export function applyDrift(repoRoot: string, drifts: DocDrift[]): Promise<{ updated: string[]; skipped: string[] }>;
```
Locked decisions:
1. **Compute and apply are separate.** `computeDrift` is pure analysis and mutates nothing. `applyDrift` is opt-in (CLI `--write`, default OFF). Reading state must never silently rewrite the repo.
2. **Change classification** (design spec §11.1), in precedence order:
   - **Contract-level** → immediate `stale`, regardless of tolerance: a `covers_apis` symbol added/removed/re-signatured, or a change to a file the doc names in `covers_apis`. Detect via the existing `SymbolIndex` at both SHAs where feasible; if the old SHA cannot be indexed, set `contractLevelChange: false` and say so in `reason` — never guess.
   - **Material** → increments `materialCommits`.
   - **Cosmetic** (formatting, comment-only, pure rename) → ignored entirely, per `classifyChange`.
3. **Tolerance thresholds** — `strict`: any material change → `stale`. `normal`: ≥10 material commits OR ≥30% of covered files touched. `loose`: ≥30 material commits AND ≥50% of covered files touched. Per-doc frontmatter `drift_tolerance` wins; absent, fall back to `config.driftDefaults[kind]`.
4. **`last_verified_sha: null` (never verified) is NOT drift.** Such a doc is `draft`, not `stale` — `recommendedStatus: null`. Conflating "unverified" with "went stale" would misreport a fresh repo as rotten.
5. **Unreachable SHA** (history rewritten, shallow clone) → `recommendedStatus: null`, `reason` states the SHA is unreachable. Degrade loudly, never fabricate a drift count.
6. **`applyDrift` only ever moves `verified` → `stale`.** It never promotes, never sets `verified`, never writes `last_verified_sha`. Promotion is T3 (deterministic checks + human approval). This restriction is the parcel's most important line.
7. `reason` must cite the numbers that drove the decision, so a human reading a stale queue never has to re-run the tool to understand why.

## Required Tests
- Fixture has ≥3 seeded commits touching a covered path (`setup-fixture-git.ps1`) — assert material counts against that known history
- `strict` flips on one material commit; `normal` does not
- Cosmetic-only change → no drift (uses a formatting-only commit)
- `last_verified_sha: null` → `recommendedStatus: null`, never `stale`
- Unreachable SHA → `null` + explanatory reason, no throw
- `applyDrift` rewrites only frontmatter, byte-identical body (assert body hash unchanged)
- `applyDrift` refuses to set `verified` even if a `DocDrift` were hand-crafted to request it
- Percentage thresholds tested at boundary (29%/30%/31%)

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
If contract-level change detection cannot be done deterministically with the existing `SymbolIndex`, STOP and report rather than approximating — a false `stale` erodes trust as fast as a false `verified`. If `src/git/plumbing.ts` lacks a needed primitive, stop and report. If a tolerance threshold above is ambiguous against real data, stop and report.
