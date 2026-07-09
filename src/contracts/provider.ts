/**
 * Provider abstraction layer (design spec Part II, §19.1). One narrow
 * interface every LLM vendor adapter implements; adapters are the only
 * code that knows a vendor's wire format. This file has no behavior — no
 * adapter, no router, no adapter-side schema repair. Those are `w2-*`
 * parcels (`docs/PARCELS/index.md`).
 *
 * Load-bearing invariant (design spec §18, `docs/STRATEGY-docspine.md` §6.1):
 * **trust attaches to the execution tier, never to the model.** `TaskResult`
 * encodes this at the type level: `advisory` is the literal type `true`,
 * not `boolean` — no T1/T2 output can ever be typed as authoritative, so no
 * downstream consumer can accidentally treat a model's opinion as a status
 * mutation. See `tests/contracts/tier-invariant.test.ts`.
 *
 * The published JSON Schemas for the wire-facing shapes here live at
 * `schemas/evidence-packet.schema.json` and `schemas/task-result.schema.json`.
 */

import type { Claim } from "./claims.js";
import type { DocFrontmatter } from "./frontmatter.js";

/**
 * §19.4 — the closed set of LLM-assisted task kinds this system defines.
 * Every task in this union is mapped to a tier (T1 or T2; never T0/T3 — see
 * class doc above) in the design spec's task table. Adding a task kind is a
 * contract amendment, because it also requires a tier assignment.
 */
export type TaskKind =
	| "classify_docs"
	| "detect_duplicates"
	| "detect_contradictions"
	| "summarize_stale_docs"
	| "cleanup_recommendations"
	| "draft_missing_docs"
	| "doc_rewrite_draft"
	| "context_packet_generation"
	| "pr_review_comments";

/**
 * Opaque JSON Schema document (any draft the caller and adapter agree on;
 * v1 targets draft 2020-12 throughout this repo — `docs/STRATEGY-docspine.md`
 * §2). Not modeled field-by-field here: this contract only requires that
 * `TaskRequest.schema` be a plain JSON-serializable object; ajv validates
 * the schema itself and the model's output against it at the point of use.
 */
export type JsonSchema = Record<string, unknown>;

/**
 * One doc's evidence, pre-gathered by T0 tooling for inclusion in an
 * `EvidencePacket`.
 */
export interface EvidencePacketDoc {
	docId: string;
	path: string;
	frontmatter: DocFrontmatter | null;
	/**
	 * Full prose body. Present for local/on-box providers; omitted when this
	 * packet was built under `redact_source_before_remote_calls: true`
	 * (design spec §21) for a remote-bound call — redaction strips prose down
	 * to what `claims` and `frontmatter` already convey.
	 */
	body?: string;
}

/** One symbol-index slice included as evidence for a task (design spec §19.1). */
export interface EvidencePacketSymbolSlice {
	symbol: string;
	path: string;
	line: number;
	/** Source snippet around the symbol's definition. Omitted under remote-call redaction, same rule as `EvidencePacketDoc.body`. */
	snippet?: string;
}

/** One diff hunk included as evidence for a task (design spec §19.1). */
export interface EvidencePacketDiffHunk {
	path: string;
	/** Unified-diff hunk text. Omitted under remote-call redaction, same rule as `EvidencePacketDoc.body`. */
	hunk?: string;
	/**
	 * A structural summary retained even when `hunk` is redacted (e.g.
	 * `"12 lines changed in function fooBar"` — design spec §21). Present
	 * whenever `hunk` is absent; optional otherwise.
	 */
	summary?: string;
}

/**
 * Pre-gathered evidence a T0 tool assembles for one task; the model reasons
 * over this and nothing else — **models never inspect the repo directly**
 * (design spec §19.1, the single most important structural decision in
 * Part II). `redacted` records whether source-bearing fields were stripped
 * for a remote-bound call (design spec §21); it is informational for the
 * egress audit log (§22.3), not something a provider adapter branches on.
 */
export interface EvidencePacket {
	task: TaskKind;
	docs: EvidencePacketDoc[];
	claims: Claim[];
	symbolSlices: EvidencePacketSymbolSlice[];
	diffHunks: EvidencePacketDiffHunk[];
	/** `true` when `docs[].body`, `symbolSlices[].snippet`, and `diffHunks[].hunk` were stripped per `redact_source_before_remote_calls`; local providers always receive `false`. */
	redacted: boolean;
}

/** A single LLM-assisted call, always evidence-in / JSON-out (design spec §19.1). */
export interface TaskRequest {
	task: TaskKind;
	/** Required output shape, always — every T1/T2 call is schema-validated (design spec §20, §23.3). */
	schema: JsonSchema;
	evidence: EvidencePacket;
	budget: {
		maxInputTokens: number;
		maxOutputTokens: number;
		/** Absolute USD ceiling for this one call; omitted means "governed only by the router's run/month ceilings" (design spec §22.1). */
		maxUsd?: number;
	};
	determinismHints: {
		/** Always `0` — v1 makes no provision for non-zero temperature; the literal type documents that this is a fixed policy, not a per-call tuning knob. */
		temperature: 0;
		/** Passed through to providers that support it; best-effort only (design spec §22.4 — reproducibility is not guaranteed outside T0/T3). */
		seed?: number;
	};
}

/**
 * The result of one `LlmProvider.complete` call.
 *
 * `advisory: true` is intentionally the literal type `true`, not `boolean`
 * — see the tier-invariant note in this file's class doc. Every field here
 * describes the call, not a decision the system is authorized to act on
 * unattended.
 */
export interface TaskResult {
	/** Schema-validated (or schema-repaired — design spec §20) output; shape matches the `schema` from the originating `TaskRequest`. */
	output: unknown;
	provider: string;
	model: string;
	modelVersion?: string;
	usage: {
		inputTokens: number;
		outputTokens: number;
		costUsd?: number;
	};
	/** Count of deterministic re-prompt-with-validator-errors attempts used to reach a schema-valid `output` (design spec §20; max 2 before the task fails advisory-soft). */
	schemaRepairAttempts: number;
	/** Hardcoded. The type system says it for us — see class doc. */
	advisory: true;
}

/** Discovered (and cached) provider capabilities (design spec §19.3). */
export interface CapabilitySet {
	/** Best structured-output mechanism this provider+model actually honors, in the adapter's order of preference (design spec §19.2). */
	jsonSchema: "native" | "json_mode" | "prompt-and-parse";
	/** Context length actually honored by canary probe — "advertised != usable" (design spec §19.3). */
	maxUsableContext: number;
	/** Whether an embeddings endpoint was probed and found available. */
	embeddings: boolean;
	latencyMsPer1kTokens?: number;
	costUsdPer1kTokens?: number;
}

/** Result of a provider health canary (design spec §22.2). */
export interface HealthStatus {
	healthy: boolean;
	/** Consecutive failed canaries; a router uses this to mark a provider unhealthy and route around it. */
	consecutiveFailures: number;
	/** ISO-8601 timestamp of this check. */
	lastCheckedAt: string;
	/** Present on failure; free text, never a vendor error string verbatim (see `errors.ts` for the normalized taxonomy adapters must map to instead). */
	detail?: string;
}

/**
 * One narrow interface every vendor adapter implements (design spec §19.1).
 * Deliberately minimal: no streaming, no chat-session state, no
 * vendor-specific features leak through.
 */
export interface LlmProvider {
	/** Config key identifying this provider instance (e.g. `"local-ollama"`). */
	id: string;
	/** Discovered, then cached per provider+model (design spec §19.3). */
	capabilities(): Promise<CapabilitySet>;
	complete(req: TaskRequest): Promise<TaskResult>;
	/** Optional capability — absent entirely (not a function that rejects) when the provider has no embeddings endpoint. */
	embed?(texts: string[]): Promise<number[][]>;
	health(): Promise<HealthStatus>;
}
