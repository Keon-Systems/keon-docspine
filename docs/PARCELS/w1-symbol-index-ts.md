# Parcel: w1-symbol-index-ts

## Goal
Implement the `SymbolIndex` contract for TypeScript/JavaScript, using the TypeScript compiler API's parser (not the type checker) to index top-level and class/interface-member declarations across a repo.

## Wave
W1 (Batch 2 — parallel, wide; forks after w1-spike-verify-paths merged)

## Branch
feat/w1-symbol-index-ts

## Worktree
C:\Repos\docspine.w1-symbol-index-ts

## Dependencies
- w1-contracts-core (merged) — `src/contracts/plugins.ts` (`SymbolIndex`, `SymbolInfo`)

## Allowed Files
- src/symbol-index/typescript.ts
- tests/symbol-index/typescript.test.ts

## Forbidden
- Do NOT modify `src/contracts/**` or `schemas/**`. Implement `SymbolIndex`/`SymbolInfo` exactly as merged.
- Do NOT modify `src/pipeline/**`, `src/registry.ts`, or `src/checkers/**` — wiring this index into `RepoContext.symbolIndex` and building `w1-check-symbols` against it are separate, later parcels (`w1-registry-wiring`, Batch 3).
- Do NOT use `ts.createProgram`/a full type-checked `Program` or attempt module-resolution against the target repo's own `tsconfig.json`. This index is a pure **parse-and-walk** over each file's AST via `ts.createSourceFile` — deliberately not a type-checked build. Reasons: (1) this tool runs against arbitrary target repos whose `tsconfig.json` may not even be resolvable from where `docaudit` runs, (2) we only need "does a declaration with this name exist," never type information, (3) a full `Program` is drastically slower and more failure-prone across other people's repos. Do not "upgrade" to a full Program for more accuracy — that is out of scope and a real regression risk for arbitrary target repos.
- Do NOT add a new dependency — `typescript` is already a locked dependency (used today only as a dev dependency for `tsc`; this parcel is the first to import `typescript`'s compiler API as a runtime dependency, which is allowed under the existing locked entry, not a new one).

## Out of Scope
Resolving whether a claimed symbol that ISN'T found actually lives in a non-TS/JS source file (e.g. Python) and should therefore be `unverifiable` rather than `broken` — that disambiguation is `w1-check-symbols`'s job (Batch 3, spec written after this parcel merges so it can see the real index shape). This parcel's only obligation is: index TS/JS declarations correctly, and never silently swallow a `.py`/other-language file into the index.

## Existing Patterns To Follow
- `src/pipeline/walk.ts` (merged, read-only reference) — same file-enumeration discipline (`git ls-files` when the root is a git repo, plain recursive walk otherwise, skip `.git`/`node_modules` defensively) — reuse the same approach for enumerating `.ts`/`.tsx`/`.js`/`.jsx` files here (do not import `walk.ts` directly, since it's scoped to `*.md`; write a parallel, symbol-index-scoped enumerator in this file).
- `src/contracts/plugins.ts`'s `SymbolIndex`/`SymbolInfo` JSDoc — re-read the `unverifiable_symbol_language` note on `SymbolIndex.language` before starting; it names the exact convention this index's `language` field feeds into downstream.
- `fixtures/messy-repo/src/**` and `fixtures/messy-repo/src-py/**` — the real declarations this index must find (`computeInvoiceTotal` in `src/billing/invoice.ts`, `processCharge` in `src/payments/charge-processor.ts`, `sendEmail` in `src/notifications/email-sender.ts`, `getSessionTtlMinutes`/`SESSION_TTL_MINUTES` in `src/session/session-store.js` — a plain `.js` file, proving the index must handle JS, not just TS) — and the one it must NOT find (`format_report` in `src-py/report_utils.py`, a Python file entirely outside this index's scope).

## Contract

```ts
export function buildTypeScriptSymbolIndex(repoRoot: string): SymbolIndex;
```

Returns a `SymbolIndex` with `language: "typescript"` whose `has`/`lookup` are backed by an index built by:
1. Enumerating `.ts`, `.tsx`, `.js`, `.jsx` files under `repoRoot` (via `git ls-files` when it's a git repo, else a recursive walk; skip `.git`, `node_modules`, and any directory the walk can't read).
2. For each file, `ts.createSourceFile(path, text, ts.ScriptTarget.Latest, /*setParentNodes*/ true, scriptKindForExtension(path))` — no `Program`, no type checker, no module resolution.
3. Walking the resulting AST for:
   - Top-level `function` declarations → `name`, `kind: "function"`.
   - Top-level `class` declarations → `name` (`kind: "class"`), plus one entry per method/property member dotted as `"ClassName.memberName"` (`kind: "method"` or `"property"`).
   - Top-level `interface` declarations → `name` (`kind: "interface"`), plus one dotted entry per member (`kind: "property"` or `"method"`, matching the interface's own member syntax).
   - Top-level `type` aliases → `name`, `kind: "type"`.
   - Top-level `enum` declarations → `name` (`kind: "enum"`), plus one dotted entry per member (`kind: "enum-member"`).
   - Top-level `const`/`let`/`var` declarations with a simple identifier binding (not destructured — destructured bindings are out of scope for v1) → `name`, `kind: "const"` (regardless of the actual `const`/`let`/`var` keyword — `kind` here describes "a top-level variable binding," not the keyword).
   - Index **every** top-level declaration found, whether or not it is `export`ed — a doc can legitimately reference an internal helper, and this index's job is "does this identifier exist in source," not "is it part of the public API."
4. `SymbolInfo.path` is the repo-root-relative POSIX path (no leading `./`) to the declaring file; `SymbolInfo.line` is the 1-indexed line of the declaration's name identifier (use the source file's `getLineAndCharacterOfPosition`, not manual newline counting).
5. `has(symbol)`/`lookup(symbol)` do an exact-string match against the indexed name (dotted names like `"ClassName.memberName"` match only that exact dotted form — a bare `lookup("memberName")` does NOT also match `"ClassName.memberName"`; that's a deliberate scope line, not an oversight — document it in the JSDoc).

## Required Tests
- `tests/symbol-index/typescript.test.ts` — build the index against `fixtures/messy-repo` (read-only, no seeded git history needed — plain filesystem walk is enough since no rename/history logic is involved here) and assert: `has("computeInvoiceTotal")` true with correct `path`/`line`; `has("processCharge")` true (from the `.ts` file); `has("getSessionTtlMinutes")` and `has("SESSION_TTL_MINUTES")` both true (from the plain `.js` file, proving JS support); `has("format_report")` **false** (it's Python, correctly outside this index's scope — this is the control case that later lets `w1-check-symbols` distinguish "genuinely missing" from "wrong language" using its own logic, not this index's); a class with a method (construct a small inline fixture source string, not necessarily from `fixtures/messy-repo`, since the shared fixture doesn't currently contain a class) → dotted lookup works, bare member-name lookup does not; a destructured top-level const (`const { a, b } = foo()`) → correctly NOT indexed (documented out-of-scope case, not a bug).

## Acceptance Criteria
- Every declaration named in the fixture repo's `src/**`/`src-py/**` behaves exactly as enumerated above.
- No crash on any file in `fixtures/messy-repo` (including the non-TS/JS `src-py/report_utils.py`, which must simply be skipped by the file-enumeration step, never fed to the TS parser).

## Verification
- `npx tsc --noEmit && npx biome check . && npx tsx --test` (bare — no `tests/` path arg; requires Node ≥22 active)
- Success: all green.

## Collision Risk
Low. New file (`src/symbol-index/typescript.ts`), touched by no other in-flight parcel.

## PR Notes
- What changed: TypeScript/JavaScript `SymbolIndex` implementation + tests
- Why: `docs/STRATEGY-docspine.md` §4 item 1, §2 (locked TS-only v1 symbol indexing decision); design spec §5.1 `covers_apis`, §8 Step 3
- Risk: AST-walk completeness — review the "what gets indexed" list against real fixture declarations by eye, not just the test suite, since a silently-missed declaration kind produces false `broken` findings downstream once `w1-check-symbols` lands.
- Verification: run the command above; additionally run the index against DocSpine's own `src/contracts/**` (a real, larger TS codebase already in this repo) and spot-check a handful of exported interfaces/functions resolve correctly, as an informal smoke test beyond the fixture

## Stop-and-Report Rule
If the `SymbolIndex`/`SymbolInfo` contract can't express what's needed, stop and request a Contract Amendment. If a required file is not in Allowed Files, stop and request a spec amendment. If a declaration shape in the fixture or in DocSpine's own source doesn't fit any category above, document the gap in the PR rather than silently skipping it without a trace.