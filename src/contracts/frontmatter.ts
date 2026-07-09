/**
 * Doc frontmatter shape (design spec §5.1). Every Markdown doc under
 * `docs/` carries this as YAML frontmatter (or, for non-Markdown assets, as
 * a `<name>.docmeta.yaml` sidecar with the same schema — design spec §5.3).
 * Humans write the prose body; tooling writes and owns the fields marked
 * "machine-written" below (design spec P4, §5.1).
 *
 * The published JSON Schema for this shape lives at
 * `schemas/frontmatter.schema.json` and is the contract external tooling
 * (the manifest compiler, CI checks, future GitHub App) depends on; this
 * file is the TypeScript mirror of that schema.
 */

/** §4.1 — one kind per doc; enforced by `docaudit compile`. Closed union. */
export type DocKind =
	| "canon"
	| "adr"
	| "runbook"
	| "map"
	| "reference"
	| "history"
	| "scratch"
	| "guide";

/** §4.2 — one status per doc, machine-transitioned except `draft -> verified`. Closed union. */
export type DocStatus =
	| "draft"
	| "verified"
	| "stale"
	| "superseded"
	| "archived";

/**
 * Machine-set confidence, reflecting only what `docaudit` can mechanically
 * check (design spec §15, failure mode 2 — "verification theater"). Never
 * hand-edited.
 */
export type Confidence = "high" | "medium" | "low";

/** §11.2 — per-doc drift sensitivity; defaults by kind are a compiler concern, not encoded here. */
export type DriftTolerance = "strict" | "normal" | "loose";

/** §5.1 `audience` — retrieval filter; a doc can target either or both. */
export type Audience = "agent" | "human";

/**
 * YAML frontmatter required on every doc (design spec §5.1).
 *
 * Mandatory fields per the design spec: `id`, `title`, `kind`, `status`,
 * `owner`, `subsystem`. `covers` is additionally mandatory when `kind` is
 * `"canon"` or `"runbook"` (a canon doc that covers nothing is unverifiable
 * and is rejected at compile) — that conditional requirement is expressed
 * in `schemas/frontmatter.schema.json`, not in this type, because it is a
 * cross-field business rule rather than a shape difference.
 */
export interface DocFrontmatter {
	/** Stable slug, never reused even after a doc is archived or superseded. */
	id: string;
	title: string;
	kind: DocKind;
	status: DocStatus;
	/** Team or person; CODEOWNERS-compatible. */
	owner: string;
	/** Must exist in the manifest's subsystem list once a manifest exists. */
	subsystem: string;
	/**
	 * CANONICAL — code this doc makes claims about. Each entry is a glob
	 * matched with picomatch semantics against paths that are
	 * repo-root-relative POSIX (no leading "./") — the same normalization
	 * `Claim.value` uses for kind:"path", so `covers` globs and extracted
	 * path claims compare directly without re-normalization on either side.
	 * Mandatory when `kind` is `"canon"` or `"runbook"` (see class doc above);
	 * optional for every other kind.
	 */
	covers?: string[];
	/** Optional: exported symbols under contract (e.g. `SessionService.SetAsync`). */
	covers_apis?: string[];
	/** Optional: glob(s), same convention as `covers`, pointing at the tests that exercise this doc's subject. */
	related_tests?: string[];
	/** Optional: the doc id this doc replaces, if any. */
	supersedes?: string | null;
	/** Optional: the doc id that replaced this doc, if any. Non-null implies `status: "superseded"`. */
	superseded_by?: string | null;
	/** Retrieval filter — which audience(s) this doc is written for. */
	audience: Audience[];
	confidence: Confidence;
	/**
	 * Machine-written; NEVER hand-edited. Full commit SHA `docaudit verify`
	 * last checked this doc's claims against, or `null` before the doc's
	 * first verification run.
	 */
	last_verified_sha: string | null;
	/**
	 * Machine-written; informational only (not used for freshness math —
	 * freshness is SHA-anchored per design spec P7/§11). ISO-8601 date of the
	 * last verify run, or `null` before first verification.
	 */
	last_verified_at: string | null;
	drift_tolerance: DriftTolerance;
	/** Retrieval tags. */
	tags: string[];
	/**
	 * §11.4 — scratch-only expiry date (ISO-8601 date). Absent (or `null`) on
	 * non-scratch docs. The default-45-days policy and the weekly expiry-PR
	 * behavior are tooling concerns, not part of this shape.
	 */
	expires?: string | null;
}
