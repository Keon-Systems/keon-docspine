# Parcel: w2-provider-router

## Goal
Build the provider registry and task router (design spec §19.4, §21, §22) so that the tier model is structurally enforced: T1/T2 calls are advisory by construction, `allow_network_providers: false` makes network adapters *unconstructable*, and a run with zero healthy providers still completes.

## Wave
W2 (Batch A — parallel)

## Branch
feat/w2-provider-router

## Worktree
C:\Repos\docspine.w2-provider-router

## Dependencies
- W1 exit (merged): `src/contracts/provider.ts`, `src/contracts/errors.ts`

## Allowed Files
- src/llm/router.ts
- src/llm/registry.ts
- src/llm/budgets.ts
- src/llm/types.ts
- tests/llm/router.test.ts
- tests/llm/registry.test.ts
- tests/llm/budgets.test.ts
- tests/llm/tier-separation.test.ts
- tests/llm/fake-provider.ts

## Forbidden
- **NO vendor adapters.** `w2-adapter-openai-compat` owns those. This parcel ships zero network code; tests use `tests/llm/fake-provider.ts`, an in-repo `LlmProvider` implementation.
- **NO tool-calling code paths, ever.** Models receive an `EvidencePacket` and return JSON (design spec §19.1). If you find yourself designing a filesystem or fetch affordance for a model, STOP — that decision is load-bearing for both prompt-injection safety (§23.1) and weak-local-model viability.
- **`src/llm/**` must never import from `src/frontmatter/**`, `src/drift/**`, `src/manifest/**`, or any module that writes doc status.** Directory-boundary enforcement of tier separation (STRATEGY §6.1). A test asserts this.
- Do NOT modify `src/contracts/**` or `schemas/**`.
- Do NOT read config files. The router accepts a typed `RouterConfig` **parameter**; loading and validating `.docaudit/config.yaml` is `w3-config-validation`.
- No schema repair (that's `w2-schema-repair`) — the router calls a repair hook if provided, but does not implement one.
- No embeddings implementation, no lexical similarity (`w2-lexical-similarity`).

## Out of Scope
Adapters, prompt templates, prompt-template versioning, the egress audit log and provider audit JSONL (`w3-audit-log`), result caching (`w3-cache-packet-hash`), capability *probing* over the network (this parcel consumes `CapabilitySet`; probing arrives with the adapter). Making the 7B smart is not parcel work at all (STRATEGY §6.6).

## Existing Patterns To Follow
- `src/contracts/provider.ts` — read its class doc in full before writing a line. `TaskResult.advisory` is the literal type `true`; `determinismHints.temperature` is the literal `0`. Both encode policy at the type level. Preserve that.
- `src/contracts/errors.ts` — the normalized `ProviderErrorCode` taxonomy. Router logic must branch on those codes only, never on vendor strings.
- `src/pipeline/run-verify.ts` — completes rather than crashing on missing inputs; the router's zero-provider behavior follows the same philosophy.

## Contract

```ts
export interface ProviderConfig {
  id: string;
  /** Adapter family. v1 constructs only local/in-repo kinds unless network is allowed. */
  type: "openai-compatible" | "anthropic-compatible" | "gemini" | "bedrock" | "custom";
  enabled: boolean;
  /** Absent/loopback base_url => local. Any other host => network-classified. */
  baseUrl?: string;
  allowedTasks: TaskKind[];
  models: Partial<Record<TaskKind, string>>;
  pinnedCapabilities?: Partial<CapabilitySet>;
}

export interface RouterConfig {
  defaultProvider: string | null;
  fallbackProvider: string | null;          // explicit; never inferred
  allowNetworkProviders: boolean;           // hard gate
  redactSourceBeforeRemoteCalls: boolean;
  budgets: { perRunUsd?: number; perMonthUsd?: number };
  providers: ProviderConfig[];
  /** Ordered preference per task; unhealthy/disabled/not-permitted entries are skipped. */
  routing: Partial<Record<TaskKind, { prefer: string[]; onNoProvider: "skip_and_log" }>>;
}

export type RouteOutcome =
  | { kind: "dispatched"; result: TaskResult }
  | { kind: "skipped"; reason: "no_provider" | "budget_exhausted" | "task_not_permitted"; detail: string };

export function buildRegistry(cfg: RouterConfig, factories: AdapterFactories): ProviderRegistry;
export function routeTask(registry: ProviderRegistry, req: TaskRequest): Promise<RouteOutcome>;
```

**Locked behaviors:**

1. **The network gate is structural, not conditional.** When `allowNetworkProviders` is `false`, `buildRegistry` must **not invoke the adapter factory** for any network-classified provider. Not "construct then refuse to call" — never constructed. A provider is network-classified when `baseUrl` is present and its host is not `localhost`/`127.0.0.1`/`::1`, or when `type` requires a hosted endpoint and no loopback `baseUrl` is given.
2. **`routeTask` never throws.** Every failure path returns a `skipped` outcome. Zero healthy providers, all providers disabled, empty config, budget exhausted — all `skipped`, all logged, none fatal. T0 must never wait on or fail because of a model.
3. **`skipped` never fabricates output.** No default object, no empty-but-plausible result. Absence is reported as absence.
4. **Budgets are enforced pre-call**, by the router before dispatch and (later) by the adapter before the wire call. Overflow is tier-aware: T1 tasks shed (`skipped`), T2 tasks are reported as deferred via `skipped` with a distinguishable detail. Never surprise-bill.
5. **`allowedTasks` is a data-flow control, not just routing.** A task absent from a provider's `allowedTasks` yields `task_not_permitted` — this is how "hosted may classify but never draft" is expressed (design spec §21).

## Required Tests
- `tests/llm/registry.test.ts` — **the load-bearing test of this parcel:** with `allowNetworkProviders: false` and a network provider configured, assert the adapter factory for it was **never called** (spy factory recording invocations). Not "the call failed" — never constructed. Also: loopback `baseUrl` is treated as local and *is* constructed; `enabled: false` is never constructed.
- `tests/llm/router.test.ts` — preference order honored; unhealthy provider skipped for the next in `prefer`; task absent from `allowedTasks` → `task_not_permitted`; **zero providers configured → `skipped: no_provider`, no throw**; fake provider returning a normalized `provider_down` error → falls through to next preference, then `skipped`.
- `tests/llm/budgets.test.ts` — per-run ceiling blocks dispatch *before* the provider is called (assert the fake provider's `complete` was not invoked); T1 vs T2 overflow details are distinguishable.
- `tests/llm/tier-separation.test.ts` — static import-boundary assertion: read every file under `src/llm/`, parse its import specifiers, and fail if any resolves into `src/frontmatter/`, `src/drift/`, `src/manifest/`, or `src/pipeline/`. This makes STRATEGY §6.1 mechanically checked instead of a convention someone remembers.
- **Advisory-invariant test:** every `dispatched` outcome's `result.advisory` is `true`, and no code path in `src/llm/**` writes a `DocStatus`. Grep-level assertion is acceptable and appropriate here.

## Acceptance Criteria
- `npm run verify` green.
- A `RouterConfig` with `allowNetworkProviders: false` plus hosted providers configured yields a registry containing only local providers, proven by factory-invocation spy.
- `routeTask` returns `skipped` (never throws) across all five failure modes above.
- No file under `src/llm/**` imports a doc-status-writing module.

## Verification
```
npm run verify
npx tsx -e "import {buildRegistry,routeTask} from './src/llm/router.ts'; /* empty config smoke */ const reg=buildRegistry({defaultProvider:null,fallbackProvider:null,allowNetworkProviders:false,redactSourceBeforeRemoteCalls:true,budgets:{},providers:[],routing:{}},{}); routeTask(reg,{task:'classify_docs',schema:{},evidence:{task:'classify_docs',docs:[],claims:[],symbolSlices:[],diffHunks:[],redacted:false},budget:{maxInputTokens:1000,maxOutputTokens:500},determinismHints:{temperature:0}}).then(o=>console.log('zero-provider outcome:',JSON.stringify(o)))"
```
Success: verify green; the smoke test prints a `skipped`/`no_provider` outcome rather than throwing.

## Collision Risk
Low-to-medium. Sole owner of `src/llm/**` and `tests/llm/**`, but it establishes the shape `w2-adapter-openai-compat` and `w2-schema-repair` build against — so `AdapterFactories` and the repair-hook signature are effectively mini-contracts. Define both explicitly in `src/llm/types.ts` with JSDoc, and treat changes to them after merge as amendment-worthy.

## PR Notes
- What changed: provider registry with structural network gate, task router with non-throwing degradation, pre-call budgets, tier-separation import test
- Why: the tier model must be load-bearing from day one — retrofitting "which outputs are advisory" onto a system that already trusts model output is a rewrite (design spec §27 item 6)
- Risk: a network gate that merely *declines to call* instead of *declining to construct* is a silent privacy failure in an air-gapped deployment. Review `registry.test.ts` first.
- Verification: the commands above

## Stop-and-Report Rule
STOP and report if: the frozen provider contracts cannot express a needed shape; you need a network call to make a test pass; you conclude tool calling is required; or the import-boundary test cannot be written without restructuring modules outside this parcel's Allowed Files. Never relax `TaskResult.advisory` from the literal `true` — that type is the tier model's enforcement mechanism, and widening it is the single most damaging change possible in this codebase.
