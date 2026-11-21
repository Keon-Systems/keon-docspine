# Parcel: w2-manifest-compile

## Goal
Compile `docs/manifest.json` and `docs/INDEX.md` from frontmatter + config — the single file an agent loads to navigate a repo. Deterministic, byte-stable, never hand-edited.

## Wave
W2

## Branch
feat/w2-manifest-compile

## Worktree
C:\Repos\docspine.w2-manifest-compile

## Dependencies
- W1 complete (merged) — frontmatter validation, doc walking
- None in W2 Batch A — accepts narrow typed options (no config file reads; `w2-cli-wiring` maps `DocSpineConfig` → options)

## Shared serializer prerequisite (TASK-03 scope amendment)

Before the compiler, land a distinct prerequisite commit extracting the existing
recursive object-key sorter from `src/report/hash.ts` into
`src/report/serialize.ts` as `stableStringify`. It must retain every JSON key
(including `__proto__`), preserve array order, and preserve existing report
hash bytes (regression-tested in `tests/report/hash.test.ts`). Both report
hashing and manifest serialization use this one shared serializer.
`canonicalizeReport` remains report-only and unchanged. Manifest-specific
array ordering belongs to the compiler; explicit context packet order is retained.
This prerequisite supersedes the serializer stop rule and read-only restriction
below; it does not authorize any contract or schema changes.

## Allowed Files
- src/manifest/compile.ts
- src/manifest/tokens.ts
- src/manifest/index-md.ts
- scripts/compile.ts (temporary entry until w2-cli-wiring)
- tests/manifest/compile.test.ts
- tests/manifest/tokens.test.ts
- tests/manifest/index-md.test.ts

## Forbidden
- **Do NOT import from `src/llm/**`.** Manifest compilation is T0 — a model must never influence what an agent is told is canonical.
- Do NOT modify `src/contracts/**` or `schemas/**`. `Manifest`, `ManifestDocEntry`, `ManifestRoute`, `ManifestSubsystem`, `ManifestConflict` already exist; satisfy them.
- Do NOT add a tokenizer dependency. See locked decision 3.
- Do NOT route to unpromoted drafts. See locked decision 2.
- Do NOT write `docs/manifest.json` into THIS repo as part of the parcel. Dogfooding is `w3-dogfood-docs`; a committed manifest here would immediately drift while W2 is in flight.
- No CLI framework, no new dependencies.

## Out of Scope
Drift status (consumed if already present in frontmatter, never computed here), contradiction detection, the stale queue's contents beyond echoing docs already marked `stale`, per-subsystem manifest sharding for monorepos (design spec §15.11, post-v1).

## Existing Patterns To Follow
- `src/frontmatter/validate.ts` — the source of validated `DocFrontmatter`
- `src/report/serialize.ts` — use the shared stable JSON serializer. Manifest-specific ordering stays in the compiler, not in the report canonicalizer.
- `docs/design/llm-native-docs-system.md` §5.2 (manifest example), §3.2, §7.1
- `npm run verify` is the gate

## Contract
```ts
export interface CompileManifestOptions {
  routes?: ManifestRoute[];
  contextPackets?: Record<string, string[]>;
  ignore?: string[];
}
export function compileManifest(repoRoot: string, opts?: CompileManifestOptions): Promise<{
  manifest: Manifest;
  indexMd: string;
  errors: string[];       // e.g. subsystem referenced but not declared
}>;
export function estimateTokens(text: string): number;
```
Locked decisions:
1. **`trustRulesDigest` is embedded verbatim** from a single constant in `src/manifest/compile.ts`, so an agent that loads only the manifest still receives the trust rules. It must stay semantically identical to `AGENTS.md`'s trust rules — add a test asserting the digest's key clauses appear in `AGENTS.md`, so the two can never silently diverge.
2. **Only `status: verified` docs are listed as canonical for a subsystem.** `draft` and `stale` docs appear in `manifest.docs` with their true status (so an agent can see they exist and why they're untrusted) but are NOT referenced from `subsystems[x].canon` and are NOT emitted in `routes`. Routing to a draft is how noise buries canon.
3. **`tokensEstimate` is a deterministic approximation, not a real tokenizer**: `ceil(chars / 4)`. Document the ±20% error in the function's JSDoc. It exists for context *budgeting*, not billing — and adding a tokenizer dep for a budgeting hint fails the dependency-policy test.
4. **`kind: history` and `kind: scratch` are excluded from `routes` and from all `contextPackets`**, unconditionally, regardless of config. If a config packet names a history/scratch doc, that is an `errors[]` entry, not an honored request. The config cannot override the taxonomy's load-bearing fence.
5. **`generatedAtSha` = current HEAD.** If not a git repo, use `"unknown"` and add an `errors[]` note — agents check this field's distance from HEAD to downgrade trust (design spec §11.5), so it must never be fabricated.
6. **Byte-stable output.** Same inputs at same SHA → identical bytes. No timestamps anywhere inside the manifest body. The read-only `checkManifestUpToDate` in `src/manifest/artifacts.ts` compares both artifacts byte-for-byte against fresh output rendered with the stored generation SHA. The stored SHA must be HEAD or a provable ancestor, so committing the outputs does not by itself invalidate them; its distance from HEAD still informs agent trust. Changed manifest inputs that change the output still fail the check.
7. **`conflicts` is populated only from doc-declared contradictions** (e.g. two docs both claiming canon for the same subsystem+topic, or a `superseded_by` cycle). LLM-detected contradictions are T1 and arrive later via a different path.
8. `INDEX.md` is a rendered *view* of the manifest — generated from the same in-memory `Manifest`, never independently computed, so the two cannot disagree.

## Required Tests
- Fixture repo compiles: every valid-frontmatter doc appears in `manifest.docs`
- A `draft` doc appears in `docs` but never in `subsystems[].canon` or `routes`
- `history`/`scratch` docs excluded from routes and packets even when config names them → `errors[]` entry present
- Malformed-frontmatter doc (defect #11) does not abort compilation; it is reported
- Byte-stability: two compiles → identical `manifest.json` bytes
- `trustRulesDigest` key clauses are present in `AGENTS.md` (divergence guard)
- Manifest validates against `schemas/manifest.schema.json` via ajv
- Non-git directory → `generatedAtSha: "unknown"` + error note, no throw
- `INDEX.md` doc count matches `manifest.docs` count

## Acceptance Criteria
- `npm run verify` green
- `npx tsx scripts/compile.ts <fixture>` writes a schema-valid manifest + INDEX.md into the *target* repo, not this one
- Two consecutive compiles produce identical bytes

## Verification
- `npm run verify`
- `pwsh fixtures/messy-repo/setup-fixture-git.ps1 -Target $env:TEMP\ds-manifest`
- `npx tsx scripts/compile.ts $env:TEMP\ds-manifest` twice → `fc` the two outputs, identical
- Confirm no `docs/manifest.json` appears in this repo's `git status`

## Collision Risk
Low — new `src/manifest/**`. Shares `src/report/canonicalize.ts` read-only. Do not extend the canonicalizer; if it cannot serialize a manifest, stop and report.

## PR Notes
- What changed: manifest + INDEX compilation, deterministic token estimation
- Why: routing is the agent-facing win and it lands before doc quality is good (design spec §27.2 — "a mediocre doc you can find beats a great doc you can't")
- Risk: decision 2 (draft/stale never routed) and decision 4 (taxonomy fence beats config) are the load-bearing ones; call out any deviation explicitly
- Verification: commands above, especially the byte-stability check

## Stop-and-Report Rule
If satisfying `Manifest` requires a contract change, STOP and request a Contract Amendment. If `src/report/canonicalize.ts` cannot serialize the manifest deterministically, stop and report rather than adding a second canonicalizer. If config and taxonomy conflict in a case not covered by decision 4, stop and report.
