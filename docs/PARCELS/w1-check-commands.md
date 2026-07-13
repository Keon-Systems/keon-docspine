# Parcel: w1-check-commands

## Goal
Implement the `command`-kind `Checker`: verify `npm run <script>` / `npm test` command claims against the target repo's `package.json`, via allowlist lookup only — never execution.

## Wave
W1 (Batch 2 — parallel, wide; forks after w1-spike-verify-paths merged)

## Branch
feat/w1-check-commands

## Worktree
C:\Repos\docspine.w1-check-commands

## Dependencies
- w1-contracts-core (merged)
- w1-spike-verify-paths (merged) — read as a worked example
- No hard dependency on `w1-extract-commands` merging first — this parcel's tests construct synthetic `Claim` objects directly (see Contract's value/raw convention, shared with that parcel's spec) rather than requiring the real extractor to exist yet. Parallel-safe.

## Allowed Files
- src/checkers/commands.ts
- tests/checkers/commands.test.ts
- fixtures for this parcel's own tests: none beyond what already exists in `fixtures/messy-repo/package.json` (read-only) — do not add files under `fixtures/**`.

## Forbidden
- Do NOT modify `src/contracts/**` or `schemas/**`.
- Do NOT modify `src/checkers/paths.ts`, `src/registry.ts`, or anything under `src/pipeline/**` — frozen/serialized. Registering this checker is `w1-registry-wiring`'s job.
- Do NOT execute any command, ever — not the claimed command, not `--help`, not anything. This checker's entire verification mechanism is a static `package.json` `scripts` key lookup (design spec §8 Step 3: "dry-run/allowlist smoke tests... never arbitrary execution"). No `child_process` import of any kind in this file.
- Do NOT modify `fixtures/messy-repo/**` — read-only, coordinator sign-off required for any change (see `fixtures/README.md`).

## Out of Scope
Non-npm shell commands (docker, curl, arbitrary binaries) — v1 scope is npm-script existence only, matching the design spec's own named example ("package.json script existence") and fixture defect #4. Anything else is reported `unverifiable`, not silently passed or guessed at.

## Existing Patterns To Follow
- `src/checkers/paths.ts` (merged) — same `Checker` shape, same "never crash, report `unverifiable` on anything this checker can't determine" discipline (e.g. missing `package.json` is not a crash, it's an `unverifiable` finding for every command claim in the batch).
- `fixtures/messy-repo/EXPECTED-FINDINGS.md` — defect #4 (`docs/canon/billing.md`, `npm run build:prod`, expected `broken`, detail substring `npm_script_not_found:build:prod`), defect #13 (`docs/canon/all-claim-kinds-valid.md`, `npm run test`, expected `ok`, detail substring `npm_script_exists:test`).
- `fixtures/messy-repo/package.json` — the closed script set (`build`, `test`, `lint`) this checker validates against for the fixture repo.
- `docs/PARCELS/w1-extract-commands.md` — the sibling extractor parcel's spec, which defines the shared `Claim.raw`/`Claim.value` convention this checker consumes (read it for the exact shapes, even though you don't depend on that parcel merging first).

## Contract

```ts
export const commandChecker: Checker = {
  id: "check-commands",
  kind: "command",
  async check(claims: Claim[], ctx: RepoContext): Promise<ClaimFinding[]> { ... }
};
```

**Checking rule:** read `<ctx.root>/package.json` once per `check()` call (not per-claim). If it doesn't exist or fails to parse as JSON, every claim in this batch gets `status: "unverifiable"`, `detail: "unverifiable_no_package_json"` — never throw.

For each claim, re-derive the invocation shape from `claim.raw` (do not trust `claim.value` alone to disambiguate shape — re-matching `raw` decouples this checker from the extractor's exact internal convention, per the parcel-boundary discipline in this codebase):
- `raw` matches `^npm run (\S+)` → script name is the captured group. Look it up in `package.json`'s `scripts` object. Present → `status: "ok"`, `detail: "npm_script_exists:<name>"`. Absent → `status: "broken"`, `detail: "npm_script_not_found:<name>"`.
- `raw` matches `^npm test$` (bare, no `run`) → script name is literally `"test"`, same lookup/status rule as above.
- Anything else → `status: "unverifiable"`, `detail: "unverifiable_command_shape: only npm run <script> and npm test forms are checked in v1"`.

Never execute, spawn, or shell out to anything — this is a pure `JSON.parse` + object-key lookup against `package.json`'s `scripts` field, nothing else.

## Required Tests
- `tests/checkers/commands.test.ts` — using a temp directory with a synthetic `package.json` (do not depend on `fixtures/messy-repo` being seeded with git history — a plain temp dir with just a `package.json` is enough, no git needed for this checker): a claim for an existing script → `ok` with the right detail; a claim for a missing script → `broken` with the right detail; a bare `npm test` claim against a `package.json` that has a `test` script → `ok`; a non-npm raw line (e.g. `docker build .`) → `unverifiable`; a target directory with **no** `package.json` at all → every claim `unverifiable_no_package_json`, no throw.

## Acceptance Criteria
- Defects #4 and #13's command-kind claims (constructed as synthetic `Claim` fixtures per the extractor's documented convention) resolve to the exact status/detail pairs in `EXPECTED-FINDINGS.md`.
- No code path executes a subprocess.

## Verification
- `npx tsc --noEmit && npx biome check . && npx tsx --test` (bare — no `tests/` path arg; requires Node ≥22 active)
- Success: all green.

## Collision Risk
Low. Sole file (`src/checkers/commands.ts`). Does not touch `src/registry.ts`.

## PR Notes
- What changed: command checker + tests
- Why: `docs/STRATEGY-docspine.md` §4 item 1; design spec §8 Step 3
- Risk: this checker never executes anything — grep the diff for any `child_process`/`exec`/`spawn` import and reject the PR immediately if present. That is the one non-negotiable review gate for this parcel.
- Verification: run the command above; confirm by reading the file that zero subprocess APIs are imported

## Stop-and-Report Rule
If the `Checker`/`ClaimFinding` contract can't express what's needed, stop and request a Contract Amendment. If a required file is not in Allowed Files, stop and request a spec amendment. If the `raw`-based shape-detection regex needs to change to match a real fixture command this spec didn't anticipate, document the exact new shape in the PR rather than broadening the regex speculatively.