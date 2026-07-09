/**
 * Fixture objects proving every contract type in `src/contracts/**` is
 * satisfiable. `schema-satisfaction.test.ts` validates the JSON-serializable
 * fixtures below against the published schemas in `schemas/`;
 * `tier-invariant.test.ts` uses `taskResultFixture` for its runtime assert.
 *
 * This file has zero behavior of its own — every value here is a literal
 * object, not a generator or a builder, per the parcel's "types, schemas,
 * fixtures, and tests ONLY" scope.
 */

import type {
	AuditReport,
	CapabilitySet,
	Checker,
	Claim,
	ClaimFinding,
	ContradictionCandidate,
	CoverageGap,
	DocFinding,
	DocFrontmatter,
	DocScore,
	EvidencePacket,
	EvidencePacketDiffHunk,
	EvidencePacketDoc,
	EvidencePacketSymbolSlice,
	Extractor,
	GitFacts,
	HealthStatus,
	LlmProvider,
	Manifest,
	ManifestConflict,
	ManifestDocEntry,
	ManifestRoute,
	ManifestSubsystem,
	ParsedDoc,
	ProviderError,
	RepoContext,
	SymbolIndex,
	SymbolInfo,
	TaskRequest,
	TaskResult,
} from "../../src/contracts/index.js";

// ---------------------------------------------------------------------------
// claims.ts
// ---------------------------------------------------------------------------

export const claimFixture: Claim = {
	kind: "path",
	value: "src/session/redis-client.ts",
	docId: "sessions-architecture",
	line: 42,
	raw: "`src/session/redis-client.ts`",
};

export const claimFindingOkFixture: ClaimFinding = {
	claim: claimFixture,
	status: "ok",
};

export const claimFindingMovedFixture: ClaimFinding = {
	claim: { ...claimFixture, value: "src/session/legacy-client.ts" },
	status: "moved",
	detail: "path renamed; detected via git log --follow",
	movedTo: "src/session/redis-client.ts",
};

export const claimFindingUnverifiableFixture: ClaimFinding = {
	claim: {
		kind: "symbol",
		value: "SessionService.SetAsync",
		docId: "sessions-architecture",
		line: 51,
		raw: "`SessionService.SetAsync`",
	},
	status: "unverifiable",
	detail:
		"unverifiable_symbol_language: symbol index is typescript-only, claim's doc covers a python module",
};

// ---------------------------------------------------------------------------
// frontmatter.ts
// ---------------------------------------------------------------------------

export const canonFrontmatterFixture: DocFrontmatter = {
	id: "sessions-architecture",
	title: "Session State Architecture",
	kind: "canon",
	status: "verified",
	owner: "platform-team",
	subsystem: "session",
	covers: ["src/session/**", "src/lib/redis-client.ts"],
	covers_apis: ["SessionService.SetAsync", "SessionService.GetAsync"],
	related_tests: ["tests/session/**"],
	supersedes: "sessions-v1-design",
	superseded_by: null,
	audience: ["agent", "human"],
	confidence: "high",
	last_verified_sha: "a3f9c21",
	last_verified_at: "2026-07-01",
	drift_tolerance: "strict",
	tags: ["redis", "session", "ttl", "pii"],
};

export const guideFrontmatterFixture: DocFrontmatter = {
	id: "contributing",
	title: "Contributing Guide",
	kind: "guide",
	status: "verified",
	owner: "platform-team",
	subsystem: "meta",
	audience: ["human"],
	confidence: "medium",
	last_verified_sha: "a3f9c21",
	last_verified_at: "2026-07-01",
	drift_tolerance: "loose",
	tags: ["conventions"],
};

export const scratchFrontmatterFixture: DocFrontmatter = {
	id: "w1-contracts-core-notes",
	title: "W1 Contracts Core — Working Notes",
	kind: "scratch",
	status: "draft",
	owner: "coordinator",
	subsystem: "meta",
	audience: ["agent"],
	confidence: "low",
	last_verified_sha: null,
	last_verified_at: null,
	drift_tolerance: "loose",
	tags: ["parcel"],
	expires: "2026-08-23",
};

/** Deliberately invalid: kind=canon without covers — violates §5.1's conditional requirement. */
export const brokenCanonFrontmatterFixture: unknown = {
	...canonFrontmatterFixture,
	covers: undefined,
};

// ---------------------------------------------------------------------------
// plugins.ts
// ---------------------------------------------------------------------------

export const gitFactsFixture: GitFacts = {
	isRepo: true,
	headSha: "b7e2d90",
	repoRoot: "/repo",
};

export const noGitFactsFixture: GitFacts = {
	isRepo: false,
	headSha: null,
	repoRoot: null,
};

export const symbolInfoFixture: SymbolInfo = {
	name: "SessionService.SetAsync",
	path: "src/session/service.ts",
	line: 88,
	kind: "method",
};

export const symbolIndexFixture: SymbolIndex = {
	language: "typescript",
	has(symbol: string): boolean {
		return symbol === symbolInfoFixture.name;
	},
	lookup(symbol: string): SymbolInfo[] {
		return symbol === symbolInfoFixture.name ? [symbolInfoFixture] : [];
	},
};

export const repoContextFixture: RepoContext = {
	root: "/repo",
	symbolIndex: symbolIndexFixture,
	git: gitFactsFixture,
};

export const parsedDocFixture: ParsedDoc = {
	id: "sessions-architecture",
	path: "docs/canon/session/architecture.md",
	frontmatter: canonFrontmatterFixture,
	frontmatterErrors: [],
	body: "# Session State Architecture\n\nSee `src/session/redis-client.ts`.\n",
};

export const extractorFixture: Extractor = {
	id: "extract-paths-fixture",
	kind: "path",
	extract(_doc: ParsedDoc): Claim[] {
		return [claimFixture];
	},
};

export const checkerFixture: Checker = {
	id: "check-paths-fixture",
	kind: "path",
	async check(claims: Claim[], _ctx: RepoContext): Promise<ClaimFinding[]> {
		return claims.map((claim) => ({ claim, status: "ok" }));
	},
};

// ---------------------------------------------------------------------------
// manifest.ts
// ---------------------------------------------------------------------------

export const manifestSubsystemFixture: ManifestSubsystem = {
	canon: ["sessions-architecture"],
	runbooks: ["session-redis-ops"],
	adrs: ["adr-014-redis-session-state"],
	code_roots: ["src/session/"],
	owner: "platform-team",
};

export const manifestDocEntryFixture: ManifestDocEntry = {
	path: "docs/canon/session/architecture.md",
	kind: "canon",
	status: "verified",
	confidence: "high",
	tokens_estimate: 1240,
	tags: ["redis", "session", "ttl", "pii"],
	covers: ["src/session/**"],
};

export const manifestRouteFixture: ManifestRoute = {
	match: "src/session/**",
	load: ["sessions-architecture", "adr-014-redis-session-state"],
	required: true,
};

export const manifestConflictFixture: ManifestConflict = {
	docId: "sessions-architecture",
	claim: "session TTL is 30 minutes",
	observed: "code sets TTL to 60 minutes",
	location: "src/session/redis-client.ts:118",
};

export const manifestFixture: Manifest = {
	version: 3,
	generated_at_sha: "b7e2d90",
	trust_rules_digest:
		"Code wins over docs. Only status=verified is canonical truth. Never treat kind=history or kind=scratch as current. On conflict, flag and proceed from code.",
	entrypoint: "AGENTS.md",
	subsystems: { session: manifestSubsystemFixture },
	docs: { "sessions-architecture": manifestDocEntryFixture },
	routes: [manifestRouteFixture],
	context_packets: {
		"modify-api": [
			"api-contracts",
			"api-auth-boundary",
			"testing-guide",
			"security-api-notes",
		],
	},
	stale_queue: ["deploy-runbook"],
	conflicts: [manifestConflictFixture],
};

/** Deliberately invalid: unknown status value — violates the closed DocStatus union. */
export const brokenManifestFixture: unknown = {
	...manifestFixture,
	docs: {
		"sessions-architecture": {
			...manifestDocEntryFixture,
			status: "vertified",
		},
	},
};

// ---------------------------------------------------------------------------
// report.ts
// ---------------------------------------------------------------------------

export const docScoreFixture: DocScore = {
	brokenClaimRatio: 0.25,
	coveredCodeChurn: 14,
	docAgeVsCodeAge: 0.6,
};

export const docFindingFixture: DocFinding = {
	docId: "sessions-architecture",
	claimFindings: [
		claimFindingOkFixture,
		claimFindingMovedFixture,
		claimFindingUnverifiableFixture,
	],
	score: docScoreFixture,
	provisionalKind: "canon",
	provisionalStatus: "stale",
};

export const coverageGapFixture: CoverageGap = {
	target: "src/billing/",
	targetKind: "code_root",
	churn: 42,
	fanIn: 7,
};

export const contradictionCandidateFixture: ContradictionCandidate = {
	docIds: ["sessions-architecture", "sessions-v1-design"],
	claimA: "session TTL is 30 minutes",
	claimB: "session TTL is 60 minutes",
	classification: "contradictory",
};

export const auditReportFixture: AuditReport = {
	generatedAtSha: "b7e2d90",
	toolVersion: "0.1.0",
	analysisDepth: "full",
	docFindings: [docFindingFixture],
	gaps: [coverageGapFixture],
	contradictions: [contradictionCandidateFixture],
};

/** Deliberately invalid: claim finding status outside the closed FindingStatus union. */
export const brokenAuditReportFixture: unknown = {
	...auditReportFixture,
	docFindings: [
		{
			...docFindingFixture,
			claimFindings: [{ claim: claimFixture, status: "unknown_status" }],
		},
	],
};

// ---------------------------------------------------------------------------
// provider.ts / errors.ts
// ---------------------------------------------------------------------------

export const evidencePacketDocFixture: EvidencePacketDoc = {
	docId: "sessions-architecture",
	path: "docs/canon/session/architecture.md",
	frontmatter: canonFrontmatterFixture,
	body: "# Session State Architecture\n\nSee `src/session/redis-client.ts`.\n",
};

export const evidencePacketSymbolSliceFixture: EvidencePacketSymbolSlice = {
	symbol: "SessionService.SetAsync",
	path: "src/session/service.ts",
	line: 88,
	snippet:
		"async function setAsync(key: string, value: string): Promise<void> { /* ... */ }",
};

export const evidencePacketDiffHunkFixture: EvidencePacketDiffHunk = {
	path: "src/session/redis-client.ts",
	hunk: "@@ -60,7 +60,7 @@\n-const TTL_SECONDS = 1800;\n+const TTL_SECONDS = 3600;",
	summary: "1 line changed in const TTL_SECONDS",
};

export const evidencePacketFixture: EvidencePacket = {
	task: "detect_contradictions",
	docs: [evidencePacketDocFixture],
	claims: [claimFixture],
	symbolSlices: [evidencePacketSymbolSliceFixture],
	diffHunks: [evidencePacketDiffHunkFixture],
	redacted: false,
};

/** Deliberately invalid: redacted is a string instead of boolean. */
export const brokenEvidencePacketFixture: unknown = {
	...evidencePacketFixture,
	redacted: "false",
};

export const taskRequestFixture: TaskRequest = {
	task: "detect_contradictions",
	schema: { type: "object", properties: { pairs: { type: "array" } } },
	evidence: evidencePacketFixture,
	budget: { maxInputTokens: 8000, maxOutputTokens: 1000, maxUsd: 0.5 },
	determinismHints: { temperature: 0, seed: 7 },
};

export const taskResultFixture: TaskResult = {
	output: { pairs: [] },
	provider: "local-ollama",
	model: "qwen2.5-coder:32b",
	modelVersion: "2024-11-01",
	usage: { inputTokens: 5123, outputTokens: 212, costUsd: 0 },
	schemaRepairAttempts: 0,
	advisory: true,
};

/** Deliberately invalid: advisory is false, violating the `const: true` tier-model gate. */
export const brokenTaskResultFixture: unknown = {
	...taskResultFixture,
	advisory: false,
};

export const capabilitySetFixture: CapabilitySet = {
	jsonSchema: "prompt-and-parse",
	maxUsableContext: 32000,
	embeddings: false,
};

export const healthStatusFixture: HealthStatus = {
	healthy: true,
	consecutiveFailures: 0,
	lastCheckedAt: "2026-07-09T00:00:00Z",
};

export const llmProviderFixture: LlmProvider = {
	id: "local-ollama",
	async capabilities(): Promise<CapabilitySet> {
		return capabilitySetFixture;
	},
	async complete(_req: TaskRequest): Promise<TaskResult> {
		return taskResultFixture;
	},
	async health(): Promise<HealthStatus> {
		return healthStatusFixture;
	},
};

export const providerErrorFixture: ProviderError = {
	code: "rate_limited",
	message: "local-ollama returned HTTP 429",
	cause: { httpStatus: 429 },
};
