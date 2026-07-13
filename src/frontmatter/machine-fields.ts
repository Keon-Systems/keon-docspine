/**
 * Pure comparison primitive over `DocFrontmatter`'s machine-owned fields
 * (design spec §5.1, P4). This module does NOT determine whether a change
 * to one of these fields was made by a human or by tooling — see the
 * parcel spec's Forbidden section. That requires git-commit-authorship
 * context and a verify-report marker this module has no access to. This is
 * the diffing primitive a future parcel composes into the actual
 * enforcement check.
 */
import type { DocFrontmatter } from "../contracts/index.js";

/**
 * The frontmatter fields tooling owns exclusively; never hand-edited.
 *
 * Restricted to the three fields whose JSDoc in `src/contracts/frontmatter.ts`
 * is unambiguous ("Machine-written", "Never hand-edited", with no carve-out):
 * `confidence`, `last_verified_sha`, `last_verified_at`.
 *
 * `status` is deliberately EXCLUDED even though most of its transitions are
 * machine-driven: its JSDoc documents an explicit human exception
 * (`draft -> verified`), so a `status` change is not reliably a tampering
 * signal the way a change to one of the three fields above is — a human
 * legitimately flipping `draft` to `verified` should not be flagged by this
 * primitive. Judgment call, flagged per the parcel spec's Stop-and-Report
 * Rule rather than picked silently.
 */
export const MACHINE_OWNED_FIELDS: readonly (keyof DocFrontmatter)[] = [
	"confidence",
	"last_verified_sha",
	"last_verified_at",
];

/** Shallow equality that also handles the array-valued case generically, in case a future machine-owned field is array-typed. */
function valuesDiffer(a: unknown, b: unknown): boolean {
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length !== b.length || a.some((v, i) => v !== b[i]);
	}
	return a !== b;
}

/**
 * Pure comparison: returns the subset of `MACHINE_OWNED_FIELDS` whose value
 * differs between `before` and `after`. Does NOT determine whether a change
 * was made by a human or by tooling — see module docstring.
 *
 * `before: null` convention (a genuine judgment call, documented rather than
 * silently picked — see parcel spec's Stop-and-Report Rule): a doc being
 * verified for the first time has no prior machine-owned state to diff
 * against. Reporting zero fields changed would hide the fact that the doc
 * now HAS verification data it didn't have before, so `null` is treated as
 * "every machine-owned field that is now set (non-null, non-undefined) in
 * `after` counts as changed." A field `after` still leaves `null`
 * (e.g. a doc whose first verify run hasn't populated `last_verified_sha`
 * yet) is NOT reported, since it remains "unset" on both sides.
 */
export function diffMachineOwnedFields(
	before: DocFrontmatter | null,
	after: DocFrontmatter,
): (keyof DocFrontmatter)[] {
	if (before === null) {
		return MACHINE_OWNED_FIELDS.filter((field) => {
			const value = after[field];
			return value !== null && value !== undefined;
		});
	}
	return MACHINE_OWNED_FIELDS.filter((field) =>
		valuesDiffer(before[field], after[field]),
	);
}
