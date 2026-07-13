# Parcel: w1-extract-commands

## Goal
Implement the `command`-kind `Extractor`: pull shell commands out of fenced code blocks in a doc's prose body.

## Wave
W1 (Batch 2 — parallel, wide; forks after w1-spike-verify-paths merged)

## Branch
feat/w1-extract-commands

## Worktree
C:\Repos\docspine.w1-extract-commands

## Dependencies
- w1-contracts-core (merged)
- w1-spike-verify-paths (merged) — read as a worked example, not a dependency to wire against

## Allowed Files
- src/extractors/commands.ts
- tests/extractors/commands.test.ts

## Forbidden
- Do NOT modify `src/contracts/**` or `schemas/**`. If the `Extractor`/`Claim` contract can't express what you need, STOP and request a Contract Amendment.
- Do NOT modify `src/extractors/paths.ts`, `src/registry.ts`, or anything under `src/pipeline/**` — frozen/serialized. Registering this extractor is `w1-registry-wiring`'s job.
- Do NOT build a command checker — that's `w1-check-commands`.
- No filesystem or network access, no actual command execution of any kind, ever, at extraction time or otherwise. This extractor only reads text and produces `Claim` objects; it never runs anything (design spec §8 Step 3: dry-run/allowlist smoke tests happen at check time, and even then never arbitrary execution).

## Out of Scope
Whether the command's target actually exists (npm script presence, binary existence) — that's `w1-check-commands`'s job. Shell-syntax parsing beyond "does this look like an invocation this system knows how to check" (see Contract) — full shell grammar parsing is not required.

## Existing Patterns To Follow
- `src/extractors/paths.ts` (merged) — same file shape and the same **line-numbering convention** (see Contract below).
- `fixtures/messy-repo/EXPECTED-FINDINGS.md` — defect #4 (`docs/canon/billing.md`, fenced ```` ```bash\nnpm run build:prod\n``` ````, expected `command` claim `broken`, detail substring `npm_script_not_found:build:prod`), defect #13 control-negative (`docs/canon/all-claim-kinds-valid.md`, fenced ```` ```bash\nnpm run test\n``` ````, expected `ok`).
- `fixtures/messy-repo/package.json` — the closed set of scripts (`build`, `test`, `lint`) a downstream checker will validate npm-script claims against; you don't read this file yourself (pure extractor), but knowing its shape explains why the extraction target is "the script name," not the whole command line.

## Contract

```ts
export const commandExtractor: Extractor = {
  id: "extract-commands",
  kind: "command",
  extract(doc: ParsedDoc): Claim[] { ... }
};
```

**Extraction rule:** scan **fenced code blocks** only (` ``` ... ``` `, any info-string or none — `bash`, `sh`, `shell`, `console`, or blank are all in scope; a fenced block whose info string names a non-shell language, e.g. ` ```ts ` or ` ```json `, is NOT scanned — it's source-code-sample territory, not a command claim). This is the inverse of `paths.ts`/`symbols.ts`, which mask fenced blocks *out*; this extractor is the one thing that reads *inside* them. Inline single-backtick spans are NOT command claims (that's `w1-extract-symbols`'s or `w1-extract-paths`'s territory depending on shape) — only fenced-block content counts.

Within an in-scope fenced block, extract one claim per non-empty, non-comment line (a line starting with `#` after trim is a shell comment, skip it) that looks like an invocation the system can mechanically check — in v1 scope that means specifically **`npm run <script>`, `npm test`, `npm <script-alias>` forms** (design spec §8 Step 3's "package.json script existence" case). `Claim.value` is the **script name only** (e.g. `npm run build:prod` → value `build:prod`; `npm test` → value `test`, matching `w1-check-commands`'s `package.json` `scripts` key convention). Lines that don't match a recognizable `npm ...` invocation shape still produce a claim (so a checker can mark them `unverifiable` rather than silently dropping them) — `Claim.value` for those is the trimmed raw line text, unmodified.

`Claim.raw` is the original line text exactly as written (untrimmed content, trimmed only of the newline). `Claim.docId` is `doc.id`.

**CANONICAL line-numbering convention:** same as every other extractor (ca-004, `docs/PARCELS/index.md`) — `Claim.line` is 1-indexed relative to `doc.body`'s own first line; the pipeline adds the frontmatter offset later. See `src/extractors/paths.ts` for the reference implementation of this convention.

## Required Tests
- `tests/extractors/commands.test.ts` — an `npm run <script>` line inside a ` ```bash ` fence (value = script name), a bare `npm test` line (value `test`), a non-npm shell line inside a fence (still produces a claim, raw text as value, for the checker to mark unverifiable), a comment line inside a fence (`# ...` — zero claims), content inside a ` ```ts ` (non-shell) fenced block (zero claims), an inline single-backtick span that looks command-like (e.g. `` `npm run build` `` outside any fence — zero claims, since only fenced blocks count), correct line numbers across a multi-fence multi-line doc body.

## Acceptance Criteria
- Defects #4 and #13's command-kind fixture lines each produce exactly one `Claim` with the documented `value`.
- No claims are produced from non-shell-language fenced blocks or from inline backtick spans.

## Verification
- `npx tsc --noEmit && npx biome check . && npx tsx --test` (bare — no `tests/` path arg; requires Node ≥22 active)
- Success: all green.

## Collision Risk
Low. Sole file (`src/extractors/commands.ts`) not touched by any other in-flight Batch 2 parcel. Does not touch `src/registry.ts`.

## PR Notes
- What changed: command extractor + tests
- Why: `docs/STRATEGY-docspine.md` §4 item 1; design spec §8 Step 2-3
- Risk: scope of "looks like an invocation this system can check" — too narrow misses real command claims a human would consider checkable; too broad produces junk claims for `w1-check-commands` to sort through. This parcel intentionally scopes to `npm run`/`npm test` forms only, matching the fixture's defect #4/#13 and the design spec's explicit "package.json script existence" example; anything else becomes an `unverifiable`-shaped raw-line claim rather than being silently dropped or over-interpreted.
- Verification: run the command above; spot-check `billing.md` and `all-claim-kinds-valid.md` by eye against extractor output

## Stop-and-Report Rule
If the `Claim`/`Extractor` contract can't express what's needed, stop and request a Contract Amendment. If a required file is not in Allowed Files, stop and request a spec amendment. If you find a command shape in the fixtures this spec doesn't cover, extract it as a raw-line `unverifiable`-bound claim (per the fallback rule above) rather than inventing new extraction categories, and flag it in the PR.