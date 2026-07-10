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
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
	Checker,
	Claim,
	ClaimFinding,
	RepoContext,
} from "../contracts/index.js";

/**
 * Looks for a git rename record showing `missingPath` was renamed to some
 * other path, by scanning the repo's full rename history and matching
 * client-side. Returns the new path when found, `null` otherwise (including
 * on any git failure — never throws).
 *
 * Implementation note (spike friction worth flagging to the coordinator):
 * the parcel spec names `git log --follow --diff-filter=R` as the detection
 * mechanism, but `--follow` walks a single file's history *backward* from
 * an existing path — given the doc's stale (now-deleted) OLD path as the
 * pathspec, `--follow --name-status` reports the rename commit as a plain
 * `D <oldpath>` delete, not an `R <old> <new>` record, because pathspec
 * filtering on a diff resolves by the post-image name, not the pre-image
 * one (confirmed empirically: `git log -M --name-status -- <oldpath>`
 * shows `D`/`A` pairs; the same command with no trailing pathspec at all
 * shows the correct `R100 <old> <new>` line). So this scans full history
 * with NO pathspec restriction and matches the "from" side ourselves,
 * rather than relying on `--follow` to do it. Functionally this still is
 * the `git log --diff-filter=R` "happy path" the spec scopes this spike
 * to (single rename hop, no chained renames) — just without `--follow`
 * doing the useless-in-this-direction legwork.
 */
function findRenameTarget(root: string, missingPath: string): string | null {
	let out: string;
	try {
		out = execFileSync(
			"git",
			["log", "--diff-filter=R", "-M", "--name-status", "--format="],
			{ cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		);
	} catch {
		return null;
	}

	for (const rawLine of out.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		const match = /^R\d*\t([^\t]+)\t([^\t]+)$/.exec(line);
		if (!match) continue;
		const [, fromPath, toPath] = match;
		if (fromPath === missingPath && toPath) {
			return toPath;
		}
	}
	return null;
}

export const pathChecker: Checker = {
	id: "check-paths",
	kind: "path",

	async check(claims: Claim[], ctx: RepoContext): Promise<ClaimFinding[]> {
		return claims.map((claim) => {
			const abs = path.join(ctx.root, claim.value);
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

			const movedTo = findRenameTarget(ctx.root, claim.value);
			if (movedTo) {
				return {
					claim,
					status: "moved",
					detail: "renamed_via_git_follow",
					movedTo,
				};
			}

			return { claim, status: "broken", detail: "path_not_found" };
		});
	},
};
