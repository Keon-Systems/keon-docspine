/**
 * Path claim checker (design spec §8 Step 3, path-only spike slice).
 *
 * Behavior (parcel spec `docs/PARCELS/w1-spike-verify-paths.md`):
 *   - path exists on disk (relative to `ctx.root`)                -> "ok"
 *   - path missing, but `git log --follow --diff-filter=R` locates
 *     a rename                                                    -> "moved" (+movedTo)
 *   - path missing, no rename found                               -> "broken"
 *   - `ctx.root` is not a git working tree at all                 -> existence
 *     check only; rename detection is reported as "unverifiable"
 *     (never a crash, never silently treated as "broken")
 *
 * Rename-detection scope is intentionally the `git log --follow` happy
 * path only (single rename hop) — multi-hop rename chains and other edge
 * cases are out of scope per the parcel spec's "Out of Scope" section.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import type {
	Checker,
	Claim,
	ClaimFinding,
	RepoContext,
} from "../contracts/index.js";
import { buildRenameMap } from "../git/plumbing.js";

/**
 * Docs are untrusted data (per `AGENTS.md`'s prompt-injection posture): a
 * claim value containing `../` segments must never be followed outside
 * `root` and verified against the host filesystem, since that would let a
 * doc claim to "prove" the existence of an arbitrary file elsewhere on disk.
 */
function isWithinRoot(root: string, abs: string): boolean {
	const rel = path.relative(root, abs);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export const pathChecker: Checker = {
	id: "check-paths",
	kind: "path",

	async check(claims: Claim[], ctx: RepoContext): Promise<ClaimFinding[]> {
		// Built lazily, once per run, and only if a claim actually needs it —
		// avoids an unbounded `git log` scan when every claim resolves on disk.
		let renameMap: Map<string, string> | undefined;

		return claims.map((claim) => {
			const abs = path.join(ctx.root, claim.value);
			if (!isWithinRoot(ctx.root, abs)) {
				return { claim, status: "broken", detail: "path_escapes_repo_root" };
			}
			if (existsSync(abs)) {
				return { claim, status: "ok" };
			}

			if (!ctx.git.isRepo) {
				return {
					claim,
					status: "unverifiable",
					detail:
						"unverifiable_rename_detection: repo root is not a git working tree, cannot distinguish moved from broken",
				};
			}

			if (!renameMap) {
				renameMap = buildRenameMap(ctx.root);
			}
			const movedTo = renameMap.get(claim.value);
			if (movedTo) {
				const movedAbs = path.join(ctx.root, movedTo);
				if (isWithinRoot(ctx.root, movedAbs) && existsSync(movedAbs)) {
					return {
						claim,
						status: "moved",
						detail: "renamed_via_git_follow",
						movedTo,
					};
				}
			}

			return { claim, status: "broken", detail: "path_not_found" };
		});
	},
};
