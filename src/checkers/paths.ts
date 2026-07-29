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
 * Scans the repo's full rename history ONCE and returns a map from a
 * renamed-away-from path to its rename target, for O(1) lookup per missing
 * claim instead of re-running `git log` over full history per claim. Returns
 * an empty map on any git failure — never throws.
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
function buildRenameMap(root: string): Map<string, string> {
	const map = new Map<string, string>();
	let out: string;
	try {
		out = execFileSync(
			"git",
			["log", "--diff-filter=R", "-M", "--name-status", "--format="],
			{ cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		);
	} catch {
		return map;
	}

	for (const rawLine of out.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		const match = /^R\d*\t([^\t]+)\t([^\t]+)$/.exec(line);
		if (!match) continue;
		const [, fromPath, toPath] = match;
		// First-hop-wins: full history is scanned oldest-to-newest-reversed by
		// `git log`'s default order, but only a single rename hop is in scope
		// (see file header) — do not overwrite an existing entry.
		if (fromPath && toPath && !map.has(fromPath)) {
			map.set(fromPath, toPath);
		}
	}
	return map;
}

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
