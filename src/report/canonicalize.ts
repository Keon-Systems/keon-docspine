/**
 * Deterministic `AuditReport` assembly (design spec §8 "Output";
 * `docs/STRATEGY-docspine.md` §6 item 5 — "stable key ordering, stable array
 * sorting, no timestamps inside hashed content"). This generalizes the ad hoc
 * inline sorting `src/pipeline/run-verify.ts` does today (`docFindings` by
 * `docId`, `claimFindings` by `line`) into a standalone, reusable, more
 * complete module: it also canonically orders `gaps` and `contradictions`,
 * which that spike's inline sort never touched (both arrays are always empty
 * in its path-only scope).
 *
 * `src/pipeline/run-verify.ts` is not wired to call this yet — that's a
 * future wiring parcel's job (see `docs/PARCELS/w1-report-writer.md`).
 */

import type {
	AuditReport,
	ClaimFinding,
	ContradictionCandidate,
	CoverageGap,
	DocFinding,
} from "../contracts/index.js";

function compareStrings(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** `(claim.line, claim.kind, claim.value)` ascending, in that tie-break order — matches `run-verify.ts`'s `line`-only sort, extended with two more tie-breaks for full determinism when lines collide. */
function compareClaimFindings(a: ClaimFinding, b: ClaimFinding): number {
	if (a.claim.line !== b.claim.line) return a.claim.line - b.claim.line;
	const kindCmp = compareStrings(a.claim.kind, b.claim.kind);
	if (kindCmp !== 0) return kindCmp;
	return compareStrings(a.claim.value, b.claim.value);
}

function compareDocFindings(a: DocFinding, b: DocFinding): number {
	return compareStrings(a.docId, b.docId);
}

function compareCoverageGaps(a: CoverageGap, b: CoverageGap): number {
	return compareStrings(a.target, b.target);
}

/**
 * Lexicographic on the joined pair, e.g. `docIds.join("")`. Deliberately NOT
 * a literal NUL-byte delimiter (house rule: a prior parcel used `"\0"` as a
 * dedup-key join delimiter and it made git/GitHub render the whole file as
 * binary, permanently breaking diff review for that file) — `JSON.stringify`
 * gives an unambiguous, printable composite key.
 */
function contradictionSortKey(c: ContradictionCandidate): string {
	return JSON.stringify(c.docIds);
}

function compareContradictions(
	a: ContradictionCandidate,
	b: ContradictionCandidate,
): number {
	return compareStrings(contradictionSortKey(a), contradictionSortKey(b));
}

/**
 * Returns a deep-cloned `AuditReport` with every array field in canonical,
 * deterministic order:
 *   - `docFindings`: sorted by `docId` (lexicographic).
 *   - each `docFindings[].claimFindings`: sorted by `(claim.line, claim.kind, claim.value)` ascending, in that tie-break order.
 *   - `gaps`: sorted by `target` (lexicographic).
 *   - `contradictions`: sorted by `docIds` (lexicographic on the joined pair via `JSON.stringify`).
 *
 * Idempotent: canonicalizing an already-canonical report returns an
 * equivalent structure.
 */
export function canonicalizeReport(report: AuditReport): AuditReport {
	const cloned = structuredClone(report);

	const docFindings = cloned.docFindings.map((docFinding) => ({
		...docFinding,
		claimFindings: [...docFinding.claimFindings].sort(compareClaimFindings),
	}));
	docFindings.sort(compareDocFindings);

	const gaps = [...cloned.gaps].sort(compareCoverageGaps);
	const contradictions = [...cloned.contradictions].sort(compareContradictions);

	return {
		...cloned,
		docFindings,
		gaps,
		contradictions,
	};
}
