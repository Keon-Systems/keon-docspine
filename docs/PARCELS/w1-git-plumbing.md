# Parcel: w1-git-plumbing

## Goal
Build reusable, typed git-plumbing helpers — diff-since-SHA, rename-follow, and a material/cosmetic change classifier — as standalone primitives for the future drift engine and report-writer.

## Wave
W1 (Batch 2 — parallel, wide; forks after w1-spike-verify-paths merged, but has no dependency on it beyond contracts — parallel with the spike was already possible per the original dependency graph)

## Branch
feat/w1-git-plumbing

## Worktree
C:\Repos\docspine.w1-git-plumbing

## Dependencies
- w1-contracts-core (merged) — no other dependency

## Allowed Files
- src/git/plumbing.ts
- tests/git/plumbing.test.ts

## Forbidden
- Do NOT modify `src/contracts/**` or `schemas/**`.
- Do NOT modify `src/checkers/paths.ts` — it already contains an ad hoc, narrower rename-detection implementation (`findRenameTarget`, ships with `w1-spike-verify-paths`). **Do not refactor `paths.ts` to use this parcel's helpers** — that's a future wiring parcel's job (tracked as a follow-up, not this parcel's scope); this parcel ships the general-purpose primitive, it does not retrofit existing callers.
- Do NOT modify `src/pipeline/**` or `src/registry.ts` — frozen/serialized.
- No dependency beyond `node:child_process`/`node:*` builtins — this is a thin typed wrapper over the `git` CLI, same discipline as `src/pipeline/walk.ts` and `src/checkers/paths.ts`.

## Out of Scope
Wiring these helpers into the drift engine or report writer (`w2-drift-engine`, future) — that's assembly-wave work, not this parcel's. Multi-hop rename chains (A→B→C) — single-hop only, matching the scope already established by `w1-spike-verify-paths`'s checker.

## Existing Patterns To Follow
- `src/checkers/paths.ts`'s `findRenameTarget` (merged, read-only reference) — same `execFileSync`-over-`git`, typed-output, never-throws discipline. Read its inline comment about why `--follow` doesn't do what its name suggests in this direction (full-history-scan-and-match-client-side, not `--follow`) — this parcel's rename helper should follow the same empirically-verified approach, not the spec's originally-assumed `--follow` mechanism.
- `src/pipeline/run-verify.ts`'s `getGitFacts` (merged, read-only reference) — same "not a git repo → return a sentinel, never throw" discipline for every helper in this parcel.

## Contract

```ts
// src/git/plumbing.ts

/** One file's status in a diff between two refs. */
export interface DiffEntry {
  /** Repo-root-relative POSIX path (no leading "./"), same convention as `Claim.value` for kind:"path". */
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  /** Present only when `status` is `"renamed"`: the path's prior name. */
  renamedFrom?: string;
}

/**
 * Diffs `sinceSha` (exclusive) against the working tree's current HEAD
 * (inclusive), returning one `DiffEntry` per changed path. Returns an empty
 * array (never throws) when `root` is not a git repo, `sinceSha` is not a
 * valid ref in this repo's history, or there are no changes.
 */
export function diffSinceSha(root: string, sinceSha: string): DiffEntry[];

/**
 * Single-hop rename lookup: if `missingPath` was renamed to some other path
 * at any point in `root`'s history, returns the new path. Returns `null` on
 * no match, not-a-git-repo, or any git failure — never throws. This is the
 * general-purpose version of the same logic already inlined in
 * `src/checkers/paths.ts`'s `findRenameTarget` (not refactored to share code
 * in this parcel — see Forbidden).
 */
export function findRename(root: string, missingPath: string): string | null;

/** Design spec §11.1 — the three-way change classification the future drift engine scores against. */
export type ChangeKind = "contract-level" | "material" | "cosmetic";

/**
 * Classifies one `DiffEntry` as `"cosmetic"` (formatting/comment-only diff,
 * or a pure rename with no content change) vs `"material"` (real content
 * change) vs `"contract-level"` (touches a path matched by the caller-supplied
 * `contractPaths` globs — e.g. an exported API surface file, a schema file,
 * a route file — design spec §11.1's highest-priority drift category).
 * Cosmetic-vs-material detection for non-renamed entries is a best-effort
 * heuristic (e.g. whitespace-only diff via `git diff -w --stat` producing
 * zero changed lines) — document the exact heuristic used and its known
 * limitations (e.g. it will not catch a comment-only change as cosmetic;
 * that is an accepted, documented limitation, not a bug to chase in this
 * parcel).
 */
export function classifyChange(
  root: string,
  entry: DiffEntry,
  contractPaths: string[],
): ChangeKind;
```

`contractPaths` matching uses `picomatch` (already a locked dependency), same globbing convention as `DocFrontmatter.covers`.

## Required Tests
- `tests/git/plumbing.test.ts` — using a temp git repo seeded with a small commit history you construct in the test's `before()` hook (do not depend on `fixtures/messy-repo`'s specific history — build a minimal purpose-built repo so this parcel's tests are self-contained and don't collide with that fixture's read-only status): `diffSinceSha` across a few commits with an add/modify/delete/rename each, `findRename` on a renamed file (positive) and a genuinely deleted file (negative — must return `null`, not guess), `classifyChange` returning `"contract-level"` when a `contractPaths` glob matches, `"cosmetic"` for a whitespace-only diff, `"material"` otherwise; every helper called against a non-git-repo temp directory returns its documented empty/null/never-throws behavior.

## Acceptance Criteria
- All three helpers never throw under any of: not-a-git-repo, invalid SHA, no changes, deep history.
- `classifyChange`'s heuristic and its documented limitations are stated in the file's own JSDoc, not just the PR description.

## Verification
- `npx tsc --noEmit && npx biome check . && npx tsx --test` (bare — no `tests/` path arg; requires Node ≥22 active)
- Success: all green.

## Collision Risk
Low. New file (`src/git/plumbing.ts`), touched by no other in-flight parcel. Read-only references to `paths.ts`/`run-verify.ts` (no edits).

## PR Notes
- What changed: git plumbing helpers (diff-since-sha, rename-follow, change classifier) + tests
- Why: `docs/STRATEGY-docspine.md` §4 item 4; design spec §11.1 (drift mechanism), feeds the future `w2-drift-engine`
- Risk: the cosmetic/material heuristic is inherently imprecise — review the documented limitations for honesty, not for completeness (perfect classification is not the bar; honest, bounded imprecision is).
- Verification: run the command above; read the `classifyChange` JSDoc and confirm its stated limitations match what the tests actually exercise

## Stop-and-Report Rule
If the contracts this parcel needs (none beyond what's already merged) turn out to be insufficient, stop and request a Contract Amendment. If a required file is not in Allowed Files, stop and request a spec amendment. If the cosmetic/material heuristic can't be made to work reliably even for the documented limited case, stop and report rather than shipping something that silently misclassifies in a way that isn't documented.