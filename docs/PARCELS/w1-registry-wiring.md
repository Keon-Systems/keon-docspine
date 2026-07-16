# Parcel: w1-registry-wiring

## Goal
Replace the provisional `src/registry.ts` (path-only spike) with the final
W1 registry wiring all merged extractors and checkers. Also extends the
`Registry` interface in `src/pipeline/run-verify.ts` with an optional
`symbolIndexBuilder` field so the pipeline can populate `ctx.symbolIndex`
without hard-coding knowledge of the TS backend.

This is the last W1 parcel. Once it merges, the W1 exit criteria are met
and W2 is unblocked.

## Wave
W1 (Batch 4 — single, serialized; dispatched after all W1 extractors/checkers merged)

## Branch
feat/w1-registry-wiring

## Worktree
C:\Repos\docspine.w1-registry-wiring

## Dependencies
All of the following must be merged before this parcel is dispatched:
- w1-extract-symbols, w1-extract-commands, w1-extract-links (extractors)
- w1-check-symbols, w1-check-commands, w1-check-links (checkers)
- w1-symbol-index-ts (SymbolIndex builder)
- w1-frontmatter-validate, w1-git-plumbing, w1-report-writer (pipeline support)

## Allowed Files
- src/registry.ts (rewrite)
- src/pipeline/run-verify.ts (minimal targeted change — see below)

## Forbidden
- Do NOT modify `src/contracts/**` or `schemas/**`.
- Do NOT modify any extractor, checker, or symbol-index source file.
- Do NOT add new dependencies to `package.json`.

## Changes

### src/registry.ts (rewrite)
Replace the provisional (path-only) registry with the full W1 registry:

```ts
import { commandChecker } from "./checkers/commands.js";
import { linkChecker } from "./checkers/links.js";
import { pathChecker } from "./checkers/paths.js";
import { symbolChecker } from "./checkers/symbols.js";
import { commandExtractor } from "./extractors/commands.js";
import { linkExtractor } from "./extractors/links.js";
import { pathExtractor } from "./extractors/paths.js";
import { symbolExtractor } from "./extractors/symbols.js";
import { buildTypeScriptSymbolIndex } from "./symbol-index/typescript.js";
import type { Registry } from "./pipeline/run-verify.js";

export const registry: Registry = {
    extractors: [pathExtractor, symbolExtractor, commandExtractor, linkExtractor],
    checkers: [pathChecker, symbolChecker, commandChecker, linkChecker],
    symbolIndexBuilder: buildTypeScriptSymbolIndex,
};
```

### src/pipeline/run-verify.ts (targeted change)
Extend the `Registry` interface with the optional builder and use it:

```ts
// In the Registry interface:
symbolIndexBuilder?: (root: string) => SymbolIndex;

// In runVerify, after building git facts and before walking docs:
if (registry.symbolIndexBuilder) {
    ctx.symbolIndex = registry.symbolIndexBuilder(absRoot);
}
```

The `SymbolIndex` type import is already re-exported via `contracts/index.js`,
so no new import path is needed — add `SymbolIndex` to the existing contracts
import.

## Why touch run-verify.ts
The `Registry` interface lives in `run-verify.ts` (the pipeline's public
surface). Adding `symbolIndexBuilder` there is the minimal change that lets
the registry own what index to build without the pipeline hard-coding any
specific backend. The actual build call in `runVerify` is 3 lines.

`w2-pipeline-audit` will later extend `run-verify.ts` more substantially;
this change is deliberately minimal and non-overlapping with what W2 will do.

## Acceptance Criteria
- `npx tsc --noEmit` clean.
- `npx biome check .` clean.
- `npx tsx --test` — all existing tests pass; no test regressions.
- The full pipeline (`runVerify`) now produces symbol findings: a run against
  `fixtures/messy-repo` should yield `ok` for `computeInvoiceTotal`,
  `unverifiable` for `format_report`, and `broken` for `getInvoicePdf`.

## Verification
- `npx tsc --noEmit && npx biome check . && npx tsx --test`
- Success: all green.

## Collision Risk
Low but serialized by design. `src/registry.ts` is the only file in the repo
owned exclusively by this parcel at merge time. The `run-verify.ts` change is
3 lines in a targeted location far from anything W2 will change.

## W1 Exit Criteria (coordinator check after merge)
- All 14 W1 parcels merged.
- `npx tsc --noEmit && npx biome check . && npx tsx --test` clean on `main`.
- `src/registry.ts` contains all four extractor/checker pairs.
- W2 parcels unblocked.

## Stop-and-Report Rule
If any W1 extractor or checker has a naming inconsistency with what this
spec expects (e.g., exported name differs from the import path), stop and
report rather than silently adjusting the import.
