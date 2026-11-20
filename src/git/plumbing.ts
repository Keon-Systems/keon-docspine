/**
 * General-purpose git-plumbing primitives (design spec §11.1, drift
 * mechanism) for the future drift engine and report-writer
 * (`docs/PARCELS/w1-git-plumbing.md`): diff-since-SHA, single-hop
 * rename-follow, and a material/cosmetic/contract-level change classifier.
 *
 * Same discipline as `src/checkers/paths.ts` and
 * `src/pipeline/run-verify.ts`'s `getGitFacts`: thin `execFileSync`-over-`git`
 * wrappers that are typed and NEVER throw — not-a-git-repo, an invalid SHA,
 * or "no changes" are all valid, non-exceptional outcomes reported via the
 * documented empty/null return value, not an exception.
 *
 * This file intentionally does not share code with `paths.ts`'s
 * `findRenameTarget` (same underlying technique, independently implemented
 * general-purpose primitive) — see the parcel spec's "Forbidden" section;
 * wiring/dedup is a future parcel's job, not this one's.
 */
import { execFileSync } from "node:child_process";
import picomatch from "picomatch";

/** One file's status in a diff between two refs. */
export interface DiffEntry {
	/** Repo-root-relative POSIX path (no leading "./"), same convention as `Claim.value` for kind:"path". */
	path: string;
	status: "added" | "modified" | "deleted" | "renamed";
	/** Present only when `status` is `"renamed"`: the path's prior name. */
	renamedFrom?: string;
	/**
	 * Present when `status` is `"renamed"` and reported by `git diff -M`:
	 * git's content-similarity score (0–100). Lets `classifyChange` classify a
	 * rename in O(1) without re-scanning full repository history.
	 */
	renameSimilarity?: number;
}

/** Design spec §11.1 — the three-way change classification the future drift engine scores against. */
export type ChangeKind = "contract-level" | "material" | "cosmetic";

/** Generous stdout buffer so large repositories never silently truncate or fail `git log` / `git diff`. */
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

function runGit(root: string, args: string[]): string | null {
	try {
		return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
			cwd: root,
			encoding: "utf8",
			maxBuffer: GIT_MAX_BUFFER,
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		return null;
	}
}

/**
 * Diffs `sinceSha` (exclusive) against the working tree's current HEAD
 * (inclusive), returning one `DiffEntry` per changed path. Returns an empty
 * array (never throws) when `root` is not a git repo, `sinceSha` is not a
 * valid ref in this repo's history, or there are no changes.
 *
 * Implementation: a single `git diff --name-status -M <sinceSha> HEAD` —
 * comparing the two tree snapshots directly (not walking per-commit) so the
 * result is exactly one entry per net-changed path across the whole range,
 * matching the contract. `-M` enables git's default rename detection so a
 * delete+add pair with sufficiently similar content collapses into a single
 * `"renamed"` entry instead of a separate `"deleted"` + `"added"` pair.
 */
export function diffSinceSha(root: string, sinceSha: string): DiffEntry[] {
	const out = runGit(root, ["diff", "--name-status", "-M", sinceSha, "HEAD"]);
	if (out === null) return [];

	const entries: DiffEntry[] = [];
	for (const rawLine of out.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		const parts = line.split("\t");
		const code = parts[0];
		if (!code) continue;

		if (code.startsWith("R")) {
			const [, fromPath, toPath] = parts;
			if (fromPath && toPath) {
				const simDigits = code.slice(1);
				const parsedSim = simDigits
					? Number.parseInt(simDigits, 10)
					: Number.NaN;
				const entry: DiffEntry = {
					path: toPath,
					status: "renamed",
					renamedFrom: fromPath,
				};
				if (Number.isFinite(parsedSim)) {
					entry.renameSimilarity = parsedSim;
				}
				entries.push(entry);
			}
			continue;
		}

		const filePath = parts[1];
		if (!filePath) continue;

		if (code.startsWith("A")) {
			entries.push({ path: filePath, status: "added" });
		} else if (code.startsWith("M")) {
			entries.push({ path: filePath, status: "modified" });
		} else if (code.startsWith("D")) {
			entries.push({ path: filePath, status: "deleted" });
		}
		// Any other status code (e.g. "T" type-change, "C" copy — copies are
		// never emitted since we don't pass -C) is intentionally ignored: the
		// contract's `DiffEntry.status` union has no slot for it, and silently
		// dropping an exotic status code is safer than guessing.
	}
	return entries;
}

/**
 * Builds a single-pass map of renamed-from -> final renamed-to paths across
 * `root`'s git history, following multi-hop rename chains (`A -> B -> C` maps
 * `A -> C` and `B -> C`). Returns an empty map on any git failure — never
 * throws. Callers checking many missing paths should build this map once and
 * query it in O(1) instead of calling `findRename` in a loop.
 */
export function buildRenameMap(root: string): Map<string, string> {
	const direct = new Map<string, string>();
	const out = runGit(root, [
		"log",
		"--diff-filter=R",
		"-M",
		"--name-status",
		"--format=",
	]);
	if (out === null) return direct;

	for (const rawLine of out.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		const match = /^R\d*\t([^\t]+)\t([^\t]+)$/.exec(line);
		if (!match) continue;
		const [, fromPath, toPath] = match;
		if (fromPath && toPath && !direct.has(fromPath)) {
			direct.set(fromPath, toPath);
		}
	}

	// Follow multi-hop rename chains (A -> B -> C) with cycle protection.
	const resolved = new Map<string, string>();
	for (const [start, firstHop] of direct) {
		const seen = new Set<string>([start]);
		let curr = firstHop;
		while (direct.has(curr) && !seen.has(curr)) {
			seen.add(curr);
			curr = direct.get(curr) as string;
		}
		resolved.set(start, curr);
	}
	return resolved;
}

/**
 * Rename lookup: if `missingPath` was renamed (single-hop or chained) at any
 * point in `root`'s history, returns the latest renamed path. Returns `null`
 * on no match, not-a-git-repo, or any git failure — never throws.
 */
export function findRename(root: string, missingPath: string): string | null {
	return buildRenameMap(root).get(missingPath) ?? null;
}

/**
 * Returns the similarity percentage (0-100) git recorded for the rename of
 * `fromPath` -> `toPath`, by scanning full rename history the same way
 * `findRename` does (see its note on why `--follow` can't be used here).
 * Returns `null` if no matching rename record is found or on any git
 * failure — never throws.
 */
function renameSimilarity(
	root: string,
	fromPath: string,
	toPath: string,
): number | null {
	const out = runGit(root, [
		"log",
		"--diff-filter=R",
		"-M",
		"--name-status",
		"--format=",
	]);
	if (out === null) return null;

	for (const rawLine of out.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		const match = /^R(\d+)\t([^\t]+)\t([^\t]+)$/.exec(line);
		if (!match) continue;
		const [, similarity, from, to] = match;
		if (from === fromPath && to === toPath && similarity) {
			return Number.parseInt(similarity, 10);
		}
	}
	return null;
}

/**
 * Finds the most recent commit (as of HEAD) whose diff against its parent
 * touched `filePath`, and returns `[parentSha, commitSha]`. Returns `null`
 * if `filePath` has no history, its introducing commit has no parent (a
 * root commit — nothing to diff against), or on any git failure.
 */
function lastChangeRange(
	root: string,
	filePath: string,
): [string, string] | null {
	const log = runGit(root, ["log", "-1", "--format=%H", "--", filePath]);
	const commit = log?.trim();
	if (!commit) return null;

	const parent = runGit(root, ["rev-parse", `${commit}^`])?.trim();
	if (!parent) return null;

	return [parent, commit];
}

/**
 * Best-effort whitespace-only check for the most recent change to
 * `filePath`: diffs `parentSha`..`commitSha` for that path with `git diff
 * -w` (ignore-all-whitespace) and treats empty output as "no non-whitespace
 * changes" (cosmetic). Returns `"material"` on any git failure — the safe
 * default that never hides a real change behind an optimistic "cosmetic"
 * label.
 */
function classifyContentChange(
	root: string,
	filePath: string,
	sinceSha?: string,
): ChangeKind {
	if (sinceSha) {
		const diff = runGit(root, ["diff", "-w", sinceSha, "HEAD", "--", filePath]);
		if (diff === null) return "material";
		return diff.trim().length === 0 ? "cosmetic" : "material";
	}

	const range = lastChangeRange(root, filePath);
	if (!range) return "material";
	const [parent, commit] = range;

	const diff = runGit(root, ["diff", "-w", parent, commit, "--", filePath]);
	if (diff === null) return "material";
	return diff.trim().length === 0 ? "cosmetic" : "material";
}

/**
 * Classifies a rename as `"cosmetic"` when git recorded it as a 100%
 * content-similarity rename (a pure move, byte-identical content) and
 * `"material"` otherwise (renamed with an accompanying content edit).
 * Uses `entry.renameSimilarity` directly when already supplied by
 * `diffSinceSha`, avoiding a full-history `git log` scan.
 */
function classifyRename(
	root: string,
	fromPath: string,
	toPath: string,
	knownSimilarity?: number,
): ChangeKind {
	const similarity =
		knownSimilarity ?? renameSimilarity(root, fromPath, toPath);
	if (similarity === null) return "material";
	return similarity === 100 ? "cosmetic" : "material";
}

/**
 * Classifies one `DiffEntry` as `"cosmetic"` (formatting/whitespace-only
 * diff, or a pure rename with no content change) vs `"material"` (real
 * content change) vs `"contract-level"` (touches a path matched by the
 * caller-supplied `contractPaths` globs — e.g. an exported API surface
 * file, a schema file, a route file — design spec §11.1's highest-priority
 * drift category). `contractPaths` matching uses `picomatch`, same globbing
 * convention as `DocFrontmatter.covers` / `Manifest`'s subsystem globs, and
 * is checked first (and wins) regardless of what the content diff looks
 * like — a whitespace tweak to a contract file is still reported
 * `"contract-level"`, not `"cosmetic"`.
 *
 * Heuristic and its known, accepted limitations (read before relying on
 * this for anything beyond a best-effort signal):
 *
 * 1. **No range parameter.** Unlike `diffSinceSha`, this function's
 *    contract takes no `sinceSha` — it can only reason about `entry.path`'s
 *    (and, for renames, `entry.renamedFrom`'s) history as of `HEAD`. For
 *    non-renamed entries it inspects only the SINGLE most recent commit
 *    that touched `entry.path` (`git log -1 -- path`), diffed against that
 *    commit's parent with `git diff -w`. If the caller's actual range of
 *    interest (e.g. a `diffSinceSha` window) spans several commits that
 *    touched the same path, only the last one is inspected — an earlier
 *    material change in that range can be masked by a later whitespace-only
 *    commit, causing a false `"cosmetic"` result. This is an accepted,
 *    documented limitation of a per-entry classifier with no range
 *    argument, not a bug to chase in this parcel.
 * 2. **Whitespace-only, not comment-only.** The cosmetic check is `git diff
 *    -w` producing empty output — it will NOT catch a comment-only change
 *    (e.g. `// old note` -> `// new note`) as cosmetic; that is reported as
 *    `"material"`. Documented, accepted limitation per the parcel spec.
 * 3. **Added/deleted paths are effectively always `"material"`.** There is
 *    no prior/subsequent version of the file to whitespace-diff against
 *    (a brand-new or fully-removed file has no matching old/new line for
 *    `-w` to compare), so additions and deletions are not eligible for the
 *    `"cosmetic"` label under this heuristic — only modifications and pure
 *    renames are.
 * 4. **Pure-rename detection uses git's rename-similarity score.** A rename
 *    is `"cosmetic"` only when git recorded it at 100% content similarity
 *    (byte-identical); any lower similarity (rename + edit) is `"material"`.
 *    If the matching rename record can't be found in history at all (should
 *    not happen for an `entry` produced by this module's own
 *    `diffSinceSha`, but defensive), the safe default is `"material"`.
 * 5. **Never throws.** Any git failure at any step falls through to the
 *    safe default of `"material"` — this heuristic is only ever allowed to
 *    fail closed (over-report as material), never open (silently hide a
 *    real change as cosmetic).
 */
export function classifyChange(
	root: string,
	entry: DiffEntry,
	contractPaths: string[],
	sinceSha?: string,
): ChangeKind {
	try {
		const isContractPath = (p: string) =>
			contractPaths.some((pattern) => picomatch.isMatch(p, pattern));
		if (
			isContractPath(entry.path) ||
			(entry.renamedFrom !== undefined && isContractPath(entry.renamedFrom))
		) {
			return "contract-level";
		}
	} catch {
		// Malformed glob in contractPaths — fall through to the
		// material/cosmetic heuristic below rather than throwing.
	}

	try {
		if (entry.status === "added" || entry.status === "deleted") {
			return "material";
		}
		if (entry.status === "renamed" && entry.renamedFrom !== undefined) {
			return classifyRename(
				root,
				entry.renamedFrom,
				entry.path,
				entry.renameSimilarity,
			);
		}
		return classifyContentChange(root, entry.path, sinceSha);
	} catch {
		return "material";
	}
}
