# Parcel: w2-cli-wiring

## Goal
Ship the `docaudit` CLI — `audit | verify | drift | compile` — as pure wiring over already-merged modules, with CI-meaningful exit codes and both human and `--json` output.

## Wave
W2 (Batch C — SERIALIZED, last W2 parcel before W2 exit)

## Branch
feat/w2-cli-wiring

## Worktree
C:\Repos\docspine.w2-cli-wiring

## Dependencies
- `w2-manifest-compile` (merged) — `compileManifest`, `checkManifestUpToDate`
- `w2-drift-engine` (merged) — `computeDrift`
- `w2-pipeline-audit` (merged) — full `audit` pipeline incl. scoring and coverage gaps
- `w2-config-load` (merged) — `loadConfig`, mapped to each module's narrow typed options
- W1 exit — `runVerify`, `registry`, report canonicalize/hash

## Allowed Files
- src/cli/main.ts
- src/cli/commands/audit.ts
- src/cli/commands/verify.ts
- src/cli/commands/drift.ts
- src/cli/commands/compile.ts
- src/cli/render.ts
- src/cli/exit-codes.ts
- package.json  (ONLY to add the `bin` entry — serialization point, see below)
- tests/cli/exit-codes.test.ts
- tests/cli/render.test.ts
- tests/cli/smoke.test.ts

## Forbidden
- **NO business logic in `src/cli/**`.** Every command is: parse args → call an existing exported function → render → exit. If you need to compute something, the computation belongs in the owning module and its absence is a stop-and-report, not a reason to inline it here.
- Do NOT modify `src/contracts/**`, `schemas/**`, `src/manifest/**`, `src/drift/**`, `src/llm/**`, `src/pipeline/**`, or `src/registry.ts`.
- `package.json` edits are limited to adding the `bin` entry. Do not add dependencies (commander is already locked and installed). Do not touch `scripts`.
- Do not write to the repo's own `docs/manifest.json` during tests — temp copies only.
- No provider/LLM invocation from any command in v1. `audit` runs T0 only and stamps `analysisDepth` accordingly.

## Out of Scope
`drift --apply` (writing status back — explicitly not in v1). Rich `--explain` config diagnostics (`w3-config-validation`). Watch mode, pre-commit hooks, the GitHub App, `docaudit packet <task>` (post-v1, design spec §24).

## Existing Patterns To Follow
- `scripts/spike-verify.ts` — the existing human summary format (repo / sha / docs / claims / status counts / report path). Keep it; `verify` should feel like the spike, promoted.
- `src/pipeline/run-verify.ts` — ajv-validates before returning; commands should not re-validate what their callee already guaranteed.
- `src/report/canonicalize.ts` + `hash.ts` — use them for report emission; do not hand-roll JSON serialization in the CLI.

## Contract

```
docaudit audit   [<repoRoot>] [--json] [--out <path>]
docaudit verify  [<repoRoot>] [--json]
docaudit drift   [<repoRoot>] [--json]
docaudit compile [<repoRoot>] [--check] [--json]
```

`<repoRoot>` defaults to `process.cwd()`. Every command supports `--json` (machine output on stdout, nothing else on stdout) and writes human output to stdout only when `--json` is absent. Diagnostics always go to stderr, so `--json | jq` is always safe.

**Locked exit codes** (`src/cli/exit-codes.ts` — CI depends on these, so they are a contract):

| Code | Meaning | Applies to |
|---|---|---|
| `0` | Clean — no findings, nothing stale, manifest up to date | all |
| `1` | Findings present — broken claims, proposed `stale` transitions, or manifest out of date under `--check` | audit, verify, drift, compile --check |
| `2` | Tool error — bad args, unreadable repo, internal failure | all |

Rationale to preserve: `1` must mean "the repo has documentation problems" and `2` must mean "the tool broke", because a CI gate that cannot distinguish those is worse than no gate. Never exit `1` for a tool failure or `2` for findings.

`compile` without `--check` writes `docs/manifest.json` and `docs/INDEX.md` and exits `0`. With `--check` it writes nothing and exits `1` when either artifact differs from a fresh compile — this is the design spec §12 blocking check.

`audit` writes `.docaudit/reports/audit-<sha>.json` (overridable with `--out`) and prints the wedge summary (design spec §17): doc count, broken-claim ratio, coverage gaps, contradiction candidates.

**`bin` entry** (the only permitted `package.json` change):

```json
"bin": { "docaudit": "./src/cli/main.ts" }
```

`main.ts` must carry a `#!/usr/bin/env node` shebang. v1 runs via `tsx`; a compiled `dist/` entrypoint is a W3 packaging concern, so document the `npx tsx src/cli/main.ts` invocation in the README section this parcel updates. If pointing `bin` at a `.ts` file proves unworkable on Windows, STOP and report rather than adding a build step.

## Required Tests
- `tests/cli/exit-codes.test.ts` — the highest-value test here. Spawn the CLI as a child process against temp fixtures and assert the exact code for each of: clean repo → `0`; repo with broken claims → `1`; nonexistent path → `2`; `compile --check` on a hand-edited manifest → `1`; `compile --check` on a fresh one → `0`. Assert `2` is *never* returned for a repo that merely has findings.
- `tests/cli/render.test.ts` — `--json` emits parseable JSON on stdout with **zero** non-JSON bytes; human mode emits no JSON. Round-trip: `JSON.parse(stdout)` succeeds for all four commands.
- `tests/cli/smoke.test.ts` — all four commands run end-to-end against a seeded temp fixture copy without throwing; `compile` then `compile --check` in sequence exits `0` (proving byte-stability holds through the CLI, not just in the unit test).

## Acceptance Criteria
- `npm run verify` green.
- All four commands work against the seeded fixture.
- Exit codes match the locked table, proven by child-process tests.
- `--json` output is machine-clean for every command.
- Zero business logic in `src/cli/**` — a reviewer should be able to read every command file in under a minute.
- README's "Try the verifier" section updated to use real CLI invocations instead of the spike script.

## Verification
```
npm run verify
pwsh fixtures/messy-repo/setup-fixture-git.ps1 -Target $env:TEMP\ds-cli
npx tsx src/cli/main.ts audit   $env:TEMP\ds-cli
npx tsx src/cli/main.ts verify  $env:TEMP\ds-cli --json
npx tsx src/cli/main.ts drift   $env:TEMP\ds-cli
npx tsx src/cli/main.ts compile $env:TEMP\ds-cli
npx tsx src/cli/main.ts compile $env:TEMP\ds-cli --check
```
Success: verify green; `audit` prints the wedge summary; `--json` pipes cleanly to `jq`; the final `compile --check` exits `0` immediately after `compile`.

## Collision Risk
**Medium-high — this is why the parcel is serialized.** It is the only W2 parcel touching `package.json` (a declared serialization point) and it imports from four other parcels' modules. Dispatch it alone, after every Batch A/B parcel has merged and `npm run verify` is green on `main`.

## PR Notes
- What changed: four CLI commands, locked exit codes, dual human/JSON rendering, `bin` entry, README invocation update
- Why: W2 exit requires all four commands functional against the fixture *and* a real repo (STRATEGY §5 W2)
- Risk: exit-code semantics are a public contract the future CI gate and PR bot depend on; changing them later breaks consumers silently
- Verification: the command block above, plus confirm no business logic crept into `src/cli/**`

## Stop-and-Report Rule
STOP and report if: a command needs a computation that no merged module exposes (that is a gap in the owning parcel, not license to inline it here); `bin` pointing at a `.ts` entrypoint fails on Windows; you need a `package.json` change beyond `bin`; or you need to modify another parcel's module to make wiring work. Wiring parcels that grow logic are how layering dies — if this PR's diff contains an algorithm, it is the wrong PR.
