/**
 * Audit report shape (design spec §8, "Output"). `docaudit audit` writes
 * one of these to `.docaudit/reports/audit-<sha>.json`; it is the artifact
 * the whole product sells on first contact (design spec §17 — "the wedge
 * is the audit"). This file has no behavior: assembling a report
 * deterministically (stable ordering, content hashing) is `w1-report-writer`
 * / `w2-manifest-compile` work, per `docs/PARCELS/index.md`.
 *
 * The published JSON Schema for this shape lives at
 * `schemas/report.schema.json`.
 *
 * Envelope fields (`generatedAtSha`, `toolVersion`, `analysisDepth`) sit at
 * the top level of `AuditReport`, the same way `generated_at_sha` sits at
 * the top level of `manifest.json` (§5.2) rather than nested under a
 * separate key — they are metadata about the report, not content the
 * report is verifying, and per `docs/STRATEGY-docspine.md` §6.5 timestamps
 * and version stamps live in envelope fields, never inside hashed content.
 */

import type { ClaimFinding } from "./claims.js";
import type { DocKind, DocStatus } from "./frontmatter.js";

/**
 * Per-doc staleness signals (design spec §8 Step 4). Each field is a raw
 * measurement; turning these into a status transition (`stale`, etc.) is
 * pipeline logic, not part of this shape.
 */
export interface DocScore {
	/** Fraction (0–1) of this doc's extracted claims whose finding status is not `"ok"`. */
	brokenClaimRatio: number;
	/** Count of commits touching any path matched by this doc's `covers` globs since the doc's last git touch. */
	coveredCodeChurn: number;
	/**
	 * Signed staleness signal comparing the doc's age to its covered code's
	 * recent activity: positive values indicate the doc is stale relative to
	 * that churn (an old, quiet doc describing recently-active code); zero or
	 * negative indicates the doc has kept pace. The exact unit and formula
	 * are owned by the report-writer implementation, not fixed by this
	 * contract — only the sign convention (positive = more suspect) is.
	 */
	docAgeVsCodeAge: number;
}

/**
 * One record per doc (design spec §8, "Output": "one record per doc with
 * scores, provisional classification, findings").
 */
export interface DocFinding {
	/** The doc this record is about — same id convention as `Claim.docId`. */
	docId: string;
	/** Every claim finding extracted from and checked against this doc. */
	claimFindings: ClaimFinding[];
	score: DocScore;
	/**
	 * §8 Step 6 — heuristics + LLM (T1) provisional classification. Advisory
	 * only per the tier model (design spec §18): this field is a candidate a
	 * human or the promotion workflow considers, and it never mutates the
	 * doc's actual frontmatter `kind`/`status`.
	 */
	provisionalKind?: DocKind;
	provisionalStatus?: DocStatus;
}

/**
 * §8 Step 7 — one entry per piece of code with zero `covers` intersection
 * from any doc. `targetKind` is the closed set of surfaces the design spec
 * enumerates for gap analysis; churn and fan-in rank the backlog.
 */
export interface CoverageGap {
	/** Repo-root-relative POSIX path (no leading "./"), or a symbol identifier when `targetKind` is `"public_api"`. */
	target: string;
	targetKind:
		| "code_root"
		| "public_api"
		| "cli_entrypoint"
		| "ci_workflow"
		| "iac_dir"
		| "migration_dir"
		| "test_suite";
	/** Commit count touching `target` in the analyzed window. */
	churn: number;
	/** Count of other code/doc units depending on `target`. */
	fanIn: number;
}

/**
 * §8 Step 5 — a candidate pair an LLM (T1) pass flagged as duplicate,
 * complementary, or contradictory. Advisory only per the tier model
 * (design spec §18): a `"contradictory"` classification is a review
 * candidate for a human, never an automatic status change.
 */
export interface ContradictionCandidate {
	/** The two doc ids being compared, in the order they were compared. */
	docIds: [string, string];
	/** The specific conflicting (or duplicate/complementary) claim text from the first doc. */
	claimA: string;
	/** The corresponding claim text from the second doc. */
	claimB: string;
	classification: "duplicate" | "complementary" | "contradictory";
}

/**
 * `.docaudit/reports/audit-<sha>.json` — the full output of `docaudit audit`.
 */
export interface AuditReport {
	/** Commit SHA the audit ran against. */
	generatedAtSha: string;
	/** `docaudit` version that produced this report (semver string). */
	toolVersion: string;
	/**
	 * Free-text depth label (e.g. `"full"`, `"sharded-local"`,
	 * `"lexical-fallback"` — design spec §26) describing how thorough the T1
	 * analysis in this report was. Intentionally a plain string, not a closed
	 * union: the provider layer and pipeline (later parcels) introduce new
	 * depth labels as fallback ladders (design spec §20) grow, and consumers
	 * must not switch exhaustively on this value — only display it and, where
	 * relevant, avoid over-trusting a report produced at reduced depth.
	 */
	analysisDepth: string;
	docFindings: DocFinding[];
	gaps: CoverageGap[];
	contradictions: ContradictionCandidate[];
}
