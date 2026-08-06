# Parcel: w2-config-load

## Goal
Add `.docaudit/config.yaml` loading — schema, typed loader, defaults, actionable errors — so `manifest-compile`, `pipeline-audit`, `drift-engine`, and the provider layer all read one validated config shape instead of each inventing its own.

## Wave
W2 (first parcel; four downstream parcels depend on it)

## Branch
feat/w2-config-load

## Worktree
C:\Repos\docspine.w2-config-load

## Dependencies
- W1 complete (merged)

## COORDINATOR DECISION REQUIRED BEFORE DISPATCH
The design spec (§25) specifies **YAML** config. The locked dependency set has no YAML parser. Options:
- **(A, recommended)** File amendment **ca-007**: add `js-yaml` + `@types/js-yaml` as explicit deps. It is already in the tree transitively via `gray-matter`, so net install cost is ~zero, and it keeps us aligned with the design spec and with what buyers expect a config file to look like.
- **(B)** v1 config is JSON (`config.json`), zero new deps, diverges from spec §25.
Do not let the agent choose. Coordinator picks; spec is written assuming **(A)**.

## Allowed Files
- src/config/schema.ts
- src/config/load.ts
- src/config/defaults.ts
- schemas/config.schema.json
- tests/config/load.test.ts
- tests/config/defaults.test.ts
- fixtures/config/*.yaml (valid + invalid samples for tests)
- package.json, package-lock.json (ONLY for the ca-007 dep addition)
- docs/PARCELS/index.md (record ca-007 in the amendment table)

## Forbidden
- Do NOT modify `src/contracts/**` or existing `schemas/*.schema.json`. Config is a new contract, not a change to a frozen one.
- Do NOT read config anywhere outside `src/config/**`. No parcel calls `fs` for config directly; they call the loader.
- Do NOT import anything from `src/llm/**` or reference provider runtime behavior — this parcel defines the *shape* of the `llm:` config block, it does not act on it.
- Do NOT add dependencies beyond the ca-007 pair.
- No CLI wiring (`w2-cli-wiring` owns that).

## Out of Scope
Enforcing any config value. Budgets, network gating, drift tolerances, and routing are *consumed* by later parcels; this parcel only parses, validates, and defaults them. Rich `--explain` diagnostics are `w3-config-validation`.

## Existing Patterns To Follow
- `src/frontmatter/validate.ts` — the established ajv-against-published-schema validation pattern; mirror its error-shaping style
- `docs/design/llm-native-docs-system.md` §25 (config example), §11.2 (drift tolerances), §7.3 (context packets)
- `npm run verify` is the gate (see AGENTS.md "Working in this repo")

## Contract
```ts
// src/config/schema.ts — types only; validated by schemas/config.schema.json
export interface DocSpineConfig {
  ignore: string[];                       // globs excluded from doc inventory
  driftDefaults: Record<DocKind, DriftTolerance>;
  routes: ManifestRoute[];                // reuse the FROZEN contract type
  contextPackets: Record<string, string[]>;
  scratchExpiryDays: number;              // default 45
  llm: LlmConfig;                         // shape only, not behavior
}
export interface LlmConfig {
  defaultProvider: string | null;
  fallbackProvider: string | null;
  allowNetworkProviders: boolean;         // default FALSE — safe default
  redactSourceBeforeRemoteCalls: boolean; // default TRUE — safe default
  cacheDir: string;
  budgets: { perRunUsd: number | null; perMonthUsd: number | null };
  providers: Record<string, ProviderConfig>;
  routing: Record<string, { prefer: string[]; onNoProvider: "skip_and_log" | "fail" }>;
}
export function loadConfig(repoRoot: string): { config: DocSpineConfig; errors: string[]; source: "file" | "defaults" };
```
Locked decisions so the agent never guesses:
1. **Missing config file is legal**, not an error — return full defaults with `source: "defaults"`. DocSpine must work on a repo with zero setup.
2. **Safe defaults are restrictive**: `allowNetworkProviders: false`, `redactSourceBeforeRemoteCalls: true`. A missing or malformed config never widens permissions.
3. **Invalid config never silently degrades to defaults.** Return the parsed-and-defaulted config *plus* a non-empty `errors[]`; callers decide. Silent fallback to defaults is the exact class of lie this project exists to prevent.
4. `routes` reuses the frozen `ManifestRoute` type from `src/contracts/manifest.ts`. Do not define a parallel route shape.
5. Loader is **pure w.r.t. the filesystem read only** — no network, no env-var interpolation beyond `auth: env:NAME` recorded verbatim as a string (resolution is the provider layer's job, not the loader's).

## Required Tests
- Missing file → full defaults, `errors` empty, `source: "defaults"`
- Valid full config (fixture) → parses, all fields typed
- Invalid config (bad enum, wrong type, unknown provider `type`) → errors non-empty AND config still usable with defaults filled
- `allowNetworkProviders` absent → resolves `false`; explicitly `true` → `true` (proves the safe default is not sticky)
- `auth: env:ANTHROPIC_API_KEY` → stored as the literal string, never resolved

## Acceptance Criteria
- `npm run verify` green
- `schemas/config.schema.json` is draft 2020-12 and ajv-compilable
- ca-007 recorded in `docs/PARCELS/index.md` amendment table with rationale
- No consumer of config exists yet and none is added

## Verification
- `npm run verify`
- Manual: delete `.docaudit/config.yaml` in a scratch repo, confirm loader returns defaults with no errors

## Collision Risk
Medium — touches `package.json` + lockfile (serialization points) for ca-007, and `docs/PARCELS/index.md`. Mitigated by running SOLO as the first W2 parcel; nothing else in flight.

## PR Notes
- What changed: config schema, loader, defaults, ca-007 dependency addition
- Why: four W2 parcels need one validated config shape; without this each invents its own
- Risk: config shape is a new frozen contract — downstream parcels build on it, so field naming and default semantics get review focus
- Verification: `npm run verify` + the missing-file default path

## Stop-and-Report Rule
If the coordinator decision above is unresolved, STOP — do not pick YAML vs JSON. If a config field in design spec §25 cannot be typed without inventing semantics not in the spec, stop and report. If a required file is not in Allowed Files, stop and request a spec amendment.
