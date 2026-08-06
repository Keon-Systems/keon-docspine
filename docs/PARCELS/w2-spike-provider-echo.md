# Parcel: w2-spike-provider-echo

## Goal
Thin vertical spike for the **provider layer**: build a real `EvidencePacket` from real repo data, route it through a minimal provider registry to a stub provider, validate the `TaskResult` against its schema — proving the T1/T2 contracts and the tier boundary before three provider parcels fork against them.

## Wave
W2 (PDD Phase 2 for the provider track; `w2-provider-router`, `w2-adapter-openai-compat`, and `w2-schema-repair` specs are NOT authored until this merges or files amendments)

## Branch
feat/w2-spike-provider-echo

## Worktree
C:\Repos\docspine.w2-spike-provider-echo

## Dependencies
- W1 complete (merged)
- w2-config-load (merged) — `LlmConfig` shape
- w2-pipeline-audit (merged) — supplies real findings/claims to pack into evidence

## Why this parcel exists
`EvidencePacket`, `TaskRequest`, `TaskResult`, `CapabilitySet`, and `LlmProvider` are frozen contracts that **no running code has ever exercised**. `EvidencePacket` is the highest-fan-in contract in the provider layer: every T1/T2 task consumes it. If its shape is wrong, the blast radius is every provider parcel plus every future task. W1's spike earned its keep by proving `Extractor`/`Checker` before nine parcels forked; this is the same bet on the other half of the system.

## Allowed Files
- src/llm/packet.ts            (EvidencePacket assembly from repo data)
- src/llm/registry.ts          (PROVISIONAL minimal registry — `w2-provider-router` finalizes)
- src/llm/providers/stub.ts    (deterministic in-process provider; no network)
- src/llm/validate-result.ts   (ajv validation of TaskResult against schema)
- scripts/spike-provider.ts    (entry: npx tsx scripts/spike-provider.ts <repo-root>)
- tests/llm/packet.test.ts
- tests/llm/registry.test.ts
- tests/llm/stub-roundtrip.test.ts
- tests/llm/tier-boundary.test.ts

## Forbidden
- **Do NOT write a real network adapter.** No `fetch`, no HTTP, no base URLs dialed. `w2-adapter-openai-compat` owns that. The stub provider is the whole point: it proves the contracts without needing Ollama installed or a key present.
- **Do NOT modify `src/contracts/**` or `schemas/**`.** If a provider contract is wrong, STOP — that discovery is this parcel's most valuable possible output. File a Contract Amendment; do not adapt around the flaw.
- **Do NOT import anything from `src/llm/**` into `src/verify/**`, `src/pipeline/**`, `src/drift/**`, `src/manifest/**`, or `src/report/**`.** The dependency arrow points one way, permanently.
- Do NOT implement schema repair, budgets, health checks, capability probing, or task routing preferences. Those are later parcels. The registry here resolves exactly one provider for one task.
- Do NOT let any T1/T2 output touch a doc status. There must be no code path from `TaskResult` to frontmatter.
- No new dependencies. No CLI framework.

## Out of Scope
Real providers, real prompts, prompt-template versioning, caching, cost accounting, redaction quality. Reviewers should expect a working skeleton that proves shapes, not a functioning analysis feature.

## Existing Patterns To Follow
- `src/registry.ts` (W1) — the data-shaped registry precedent: arrays, no dynamic imports, no decorators, no auto-discovery. Mirror that style in `src/llm/registry.ts`.
- `src/pipeline/run-verify.ts` (W1 spike) — the "thin vertical slice that proves contracts" shape
- `docs/design/llm-native-docs-system.md` §18 (tier table), §19.1 (interfaces), §21 (network gate), §23 (injection boundaries)
- `npm run verify` is the gate

## Contract
```ts
buildEvidencePacket(input: {
  task: TaskKind;
  docs: ParsedDoc[];
  findings?: ClaimFinding[];
  symbolSlices?: EvidencePacketSymbolSlice[];
  diffHunks?: EvidencePacketDiffHunk[];
  redactSource: boolean;
}): EvidencePacket;

packetHash(packet: EvidencePacket): string;   // stable content hash, cache/audit key

resolveProvider(cfg: LlmConfig, task: TaskKind): { provider: LlmProvider } | { error: ProviderError };
runTask(provider: LlmProvider, req: TaskRequest): Promise<TaskResult | ProviderError>;
```
Locked decisions:
1. **`allowNetworkProviders: false` means network adapters are never constructed.** In this spike, prove the shape of that gate: `resolveProvider` must refuse to return a provider whose config `type` is a network type when the flag is false, and it must do so *before* instantiation. Test it. (Design spec §21 — misconfiguration cannot leak because the code path does not exist.)
2. **`redactSource: true` strips source bodies and diff hunk contents**, retaining paths, symbol *names*, and doc prose. Assert via test that a known source string present in the unredacted packet is absent from the redacted one. This is the exfiltration control; a test is the only honest proof it works.
3. **`packetHash` is stable and content-addressed** — reuse `src/report/canonicalize.ts` for ordering rather than hand-rolling. Two identical packets hash identically; reordering `docs[]` does not change the hash.
4. **The stub provider is deterministic**: given a packet and a schema, it returns a fixed schema-valid response derived from the packet (e.g. echoes doc ids in the required shape). No randomness, no clock. It exists so the whole T1 path is testable in CI with no network and no credentials, forever.
5. **`TaskResult.advisory` is the literal `true`.** `tests/contracts/tier-invariant.test.ts` already guards the type; this parcel adds the *runtime* half — assert every `TaskResult` leaving `runTask` carries `advisory: true`, including on the error path shape.
6. **Errors are normalized `ProviderError`, never thrown vendor strings.** The stub must be able to simulate each `ProviderErrorCode` on demand so later adapters have a reference for the taxonomy.
7. **No prompt text is a deliverable.** Templates are coordinator/spike work per STRATEGY §6.6; if the stub needs a nominal prompt string, keep it minimal and clearly marked provisional.

## Required Tests
- `buildEvidencePacket` produces a schema-valid `EvidencePacket` (ajv against `schemas/evidence-packet.schema.json`) from real fixture docs
- Redaction: known source-body substring present unredacted, absent redacted
- `packetHash` stability: identical packets → identical hash; `docs[]` reordered → identical hash; one char changed → different hash
- Network gate: `allowNetworkProviders: false` + a network-typed provider config → `ProviderError`, provider never constructed
- Stub round-trip: `runTask` → schema-valid `TaskResult`, `advisory === true`
- Each `ProviderErrorCode` simulable and normalized
- **Tier boundary test** (`tier-boundary.test.ts`): assert by source inspection that no file under `src/pipeline`, `src/drift`, `src/manifest`, `src/report`, or `src/verify` imports from `src/llm/`. This test outlives the spike and guards the architecture permanently.

## Acceptance Criteria
- `npm run verify` green
- `npx tsx scripts/spike-provider.ts <fixture>` builds a packet, runs the stub, prints the validated result and the packet hash
- Contracts survived contact with reality — OR amendments were filed. Both are success; silent workarounds are failure.
- Zero network calls anywhere in the parcel (grep for `fetch`/`http`)

## Verification
- `npm run verify`
- `pwsh fixtures/messy-repo/setup-fixture-git.ps1 -Target $env:TEMP\ds-prov`
- `npx tsx scripts/spike-provider.ts $env:TEMP\ds-prov`
- `grep -rn "fetch(\|node:http\|https:" src/llm/` → no hits

## Collision Risk
Medium — creates `src/llm/**` including a provisional registry (a declared serialization point once `w2-provider-router` lands). Mitigated by sequencing: this parcel runs SOLO in the provider track.

## PR Notes
- What changed: evidence packet assembly, provisional provider registry, deterministic stub provider, tier-boundary guard test
- Why: PDD Phase 2 for the provider track — validate the highest-fan-in contract before three parcels fork against it
- Risk: any friction discovered here and worked around instead of amended will surface as three broken parcels; the redaction and network-gate tests are the security-relevant ones
- Verification: commands above; confirm the tier-boundary test actually fails if you deliberately add a forbidden import

## Stop-and-Report Rule
If `EvidencePacket`, `TaskRequest`, `TaskResult`, `CapabilitySet`, or `LlmProvider` cannot express what the provider layer needs, STOP and request a Contract Amendment — that discovery is this parcel's purpose. If redaction cannot be implemented without knowing packet-content categories not present in the contract, stop and report. If a required file is not in Allowed Files, stop and request a spec amendment.
