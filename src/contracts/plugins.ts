/**
 * Plugin surface for the deterministic verifier (T0 — design spec §18):
 * `ParsedDoc`/`GitFacts`/`RepoContext` are the inputs a plugin receives;
 * `Extractor`/`Checker` are the plugin interfaces themselves;
 * `SymbolIndex`/`SymbolInfo` are the language-backed lookup a `Checker` for
 * kind:"symbol" claims consults. This file has no behavior — every
 * implementation (a specific extractor, a specific checker, the TS symbol
 * index) is a separate parcel; see `docs/PARCELS/index.md`.
 */

import type { Claim, ClaimFinding, ClaimKind } from "./claims.js";
import type { DocFrontmatter } from "./frontmatter.js";

/**
 * One Markdown (or sidecar-described) doc, parsed but not yet claim-extracted.
 */
export interface ParsedDoc {
	/**
	 * CANONICAL — same rule as `Claim.docId`: the doc's frontmatter `id` if
	 * the doc has valid frontmatter with an `id` field, otherwise the doc's
	 * `path` (see below). Every `Claim` extracted from this doc carries this
	 * exact value as its `docId`.
	 */
	id: string;
	/** Repo-root-relative POSIX path to this doc, no leading "./". */
	path: string;
	/** `null` when the doc has no frontmatter block at all, or the block failed to parse as YAML (see `frontmatterErrors`). */
	frontmatter: DocFrontmatter | null;
	/**
	 * Human-readable frontmatter problems (missing block, YAML parse failure,
	 * schema-validation failures against `schemas/frontmatter.schema.json`).
	 * Empty when frontmatter parsed and validated cleanly. Non-empty and
	 * `frontmatter: null` are not the same thing: a doc can have a
	 * frontmatter block that parsed as YAML but failed schema validation, in
	 * which case implementations MAY still surface the partially-parsed
	 * object here as `null` — validity, not mere YAML-parseability, gates a
	 * non-null `frontmatter`.
	 */
	frontmatterErrors: string[];
	/** Markdown body with the frontmatter block stripped. */
	body: string;
}

/**
 * Git-derived facts about the repo, gathered once by the pipeline and
 * handed to every extractor/checker via `RepoContext.git`.
 *
 * GitFacts is a DATA SHAPE only — no methods, no lazy helpers, no behavior
 * pretending to be a contract. Populated once by the pipeline (design spec
 * §3.3); plugins read it, they never compute it.
 */
export interface GitFacts {
	/** `false` when the repo root is not inside a git working tree (e.g. an extracted tarball); every other field is then meaningless and MUST be `null`. */
	isRepo: boolean;
	/** Full commit SHA of HEAD, or `null` when `isRepo` is `false`. */
	headSha: string | null;
	/** Absolute filesystem path to the repo root (the directory containing `.git`), or `null` when `isRepo` is `false`. */
	repoRoot: string | null;
}

/**
 * Shared context every extractor/checker receives. Assembled once per run
 * by the pipeline.
 */
export interface RepoContext {
	/** Absolute filesystem path to the repo root — the base every repo-root-relative path in this system is relative to. */
	root: string;
	/** Present only when a symbol-backed checker is registered and a symbol index was built for this run; absent (not merely empty) otherwise. */
	symbolIndex?: SymbolIndex;
	git: GitFacts;
}

/**
 * Extracts claims of one `kind` from a single parsed doc. Pure function of
 * its input — no filesystem or network access (design spec §8 Step 2: this
 * is the mechanical-extraction stage, before any checking happens).
 */
export interface Extractor {
	/** Unique registration key (e.g. `"extract-paths"`); see `src/registry.ts`, owned by other parcels. */
	id: string;
	kind: ClaimKind;
	extract(doc: ParsedDoc): Claim[];
}

/**
 * Checks a batch of same-kind claims against the repo and returns one
 * finding per claim. May touch the filesystem, git, or a `SymbolIndex` via
 * `ctx` — that is exactly the T0 work this contract exists to bound (design
 * spec §18: T0 is deterministic, no model involvement, ever).
 */
export interface Checker {
	/** Unique registration key (e.g. `"check-paths"`); see `src/registry.ts`, owned by other parcels. */
	id: string;
	kind: ClaimKind;
	check(claims: Claim[], ctx: RepoContext): Promise<ClaimFinding[]>;
}

/**
 * One symbol's location and kind, as reported by a `SymbolIndex` lookup.
 * A DATA SHAPE only, matching `GitFacts`'s discipline above: whatever
 * language backend built the index populates this once; nothing on this
 * type computes anything.
 */
export interface SymbolInfo {
	/** The symbol name as it would be matched, e.g. `"SessionService.SetAsync"`. */
	name: string;
	/** Repo-root-relative POSIX path (no leading "./") to the file defining this symbol. */
	path: string;
	/** 1-indexed line number of the symbol's definition, same convention as `Claim.line`. */
	line: number;
	/**
	 * Free-text symbol category (e.g. `"function"`, `"class"`, `"method"`,
	 * `"interface"`, `"type"`, `"const"`). Intentionally a plain string, not a
	 * closed union: each language backend's native categories differ, and
	 * `SymbolIndex.language` already tells a consumer which vocabulary to
	 * expect for a given index.
	 */
	kind: string;
}

/**
 * Language-backed symbol lookup, consulted by checkers for kind:"symbol"
 * claims. v1 ships a TypeScript/JavaScript backend only (locked in
 * `docs/STRATEGY-docspine.md` §2); this contract is language-agnostic so
 * later backends (tree-sitter or otherwise) can implement it unchanged.
 */
export interface SymbolIndex {
	/** Whether `symbol` (in this index's native identifier form) is defined anywhere this index covers. */
	has(symbol: string): boolean;
	/** All definitions matching `symbol`; empty array (never throws) when `has(symbol)` is `false`. */
	lookup(symbol: string): SymbolInfo[];
	/**
	 * The language this index was built for (e.g. `"typescript"`). A checker
	 * that receives a symbol claim it cannot match against this language
	 * MUST report `status: "unverifiable"` with a `detail` naming the
	 * mismatch (e.g. `"unverifiable_symbol_language"`) — never a new
	 * `FindingStatus` (see `claims.ts`).
	 */
	language: string;
}
