/**
 * Failure-aware, committed path history for drift. This deliberately does NOT
 * change plumbing.ts's legacy empty-on-error/net-diff/whitespace heuristics.
 * No shell, patches, source execution, textconv, or external diff drivers.
 */
import { spawnSync } from "node:child_process";
import picomatch from "picomatch";
import type { ChangeKind } from "./plumbing.js";

export interface CommitPathChange {
	/** Repo-relative POSIX paths, decoded as UTF-8 without trimming/unquoting. */
	path: string;
	status: "added" | "modified" | "deleted" | "renamed" | "type_changed";
	renamedFrom?: string;
	oldMode: string;
	newMode: string;
	oldOid: string;
	newOid: string;
}

export interface PathHistoryCommit {
	sha: string;
	/** All parents, in Git's recorded order; [] for a root commit. */
	parents: string[];
	/** Diff against parents[0], or the empty tree for a root commit. */
	changes: CommitPathChange[];
}

export type PathHistoryFailure =
	| "invalid_baseline"
	| "unavailable_baseline"
	| "non_ancestor_baseline"
	| "shallow_history"
	| "git_unavailable"
	| "invalid_output";

export type PathHistoryResult =
	| {
			status: "ok";
			baselineSha: string;
			headSha: string;
			mergePolicy: "all-commits-first-parent-diff";
			/** Oldest topological order first, each commit once (including empty commits). */
			commits: PathHistoryCommit[];
	  }
	| { status: "unavailable"; reason: PathHistoryFailure; message: string };

type GitResult =
	| { ok: true; output: string }
	| {
			ok: false;
			exitCode: number | null;
			reason: "git_unavailable" | "invalid_output";
	  };

const FULL_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_BUFFER = 64 * 1024 * 1024;

function git(root: string, args: string[]): GitResult {
	try {
		const result = spawnSync("git", ["--no-replace-objects", ...args], {
			cwd: root,
			stdio: ["ignore", "pipe", "pipe"],
			maxBuffer: MAX_BUFFER,
			windowsHide: true,
			shell: false,
		});
		if (result.error || result.status !== 0) {
			return { ok: false, exitCode: result.status, reason: "git_unavailable" };
		}
		try {
			return {
				ok: true,
				output: new TextDecoder("utf-8", { fatal: true }).decode(result.stdout),
			};
		} catch {
			return { ok: false, exitCode: null, reason: "invalid_output" };
		}
	} catch {
		return { ok: false, exitCode: null, reason: "git_unavailable" };
	}
}

function unavailable(
	reason: PathHistoryFailure,
	message: string,
): PathHistoryResult {
	return { status: "unavailable", reason, message };
}

/** Raw -z is header NUL path NUL [rename-destination NUL], never line/tab split on paths. */
function parseChanges(output: string): CommitPathChange[] | null {
	if (output === "") return [];
	const tokens = output.split("\0");
	if (tokens.pop() !== "") return null;
	const changes: CommitPathChange[] = [];
	for (let i = 0; i < tokens.length; ) {
		const header = tokens[i++];
		const match =
			header &&
			/^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]+) ([0-9a-f]+) (A|M|D|T|R100)$/.exec(
				header,
			);
		if (!match) return null;
		const [, oldMode, newMode, oldOid, newOid, code] = match;
		if (
			!oldMode ||
			!newMode ||
			!oldOid ||
			!newOid ||
			!FULL_OID.test(oldOid) ||
			!FULL_OID.test(newOid)
		)
			return null;
		const firstPath = tokens[i++];
		if (!firstPath) return null;
		const path = code === "R100" ? tokens[i++] : firstPath;
		if (!path) return null;
		const status =
			code === "A"
				? "added"
				: code === "D"
					? "deleted"
					: code === "T"
						? "type_changed"
						: code === "R100"
							? "renamed"
							: "modified";
		changes.push({
			path,
			status,
			oldMode,
			newMode,
			oldOid,
			newOid,
			...(code === "R100" ? { renamedFrom: firstPath } : {}),
		});
	}
	return changes.sort((a, b) =>
		a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
	);
}

/**
 * Read baseline-exclusive..HEAD-inclusive history, pinning HEAD once. Baseline
 * must be a hex commit object ID (7-64 digits, including unique abbreviations),
 * NOT a ref, option, tag, tree, or revision expression. Unknown objects and
 * non-ancestors are distinct from successful empty history. Shallow repos are
 * conservatively unavailable, even when the visible range looks complete;
 * fetch full history before retrying. Invalid UTF-8, malformed output, missing
 * objects, buffer exhaustion, or Git failures never return partial success.
 *
 * Merge policy: enumerate ALL commits reachable from HEAD but not baseline,
 * once each, in reverse topological order, without path-history simplification.
 * Diff each commit against its FIRST parent (root against empty tree). Merges
 * therefore include integration/conflict-resolution changes; a side-branch
 * edit may count both at its original commit and at integration. This is an
 * intentional conservative integration-event count, NOT a count of unique
 * patches. An ancestor baseline need not be on HEAD's first-parent chain.
 * Net-reverted paths and material-then-whitespace edits cannot disappear.
 *
 * Paths use raw NUL-delimited output. Only exact-content renames are detected;
 * inexact renames remain add/delete events. Mode/type/gitlink changes are kept.
 * Worktree/index edits are excluded. Legacy helpers remain unchanged.
 */
export function readPathHistory(
	root: string,
	baseline: string,
): PathHistoryResult {
	if (!/^[0-9a-fA-F]{7,64}$/.test(baseline)) {
		return unavailable(
			"invalid_baseline",
			"Use a hexadecimal commit SHA, not a ref or revision expression.",
		);
	}
	const headResult = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
	if (!headResult.ok)
		return unavailable(
			headResult.reason,
			"Git or HEAD is unavailable; check the repository and commit history.",
		);
	const headSha = headResult.output.trim();
	if (!FULL_OID.test(headSha))
		return unavailable(
			"invalid_output",
			"Git returned an invalid HEAD object ID.",
		);
	const baseResult = git(root, [
		"rev-parse",
		"--verify",
		"--end-of-options",
		`${baseline.toLowerCase()}^{object}`,
	]);
	if (!baseResult.ok)
		return unavailable(
			baseResult.reason === "invalid_output"
				? "invalid_output"
				: "unavailable_baseline",
			"Baseline object is unavailable or ambiguous; fetch its history and retry with a full commit SHA.",
		);
	const baselineSha = baseResult.output.trim();
	if (!FULL_OID.test(baselineSha))
		return unavailable(
			"invalid_output",
			"Git returned an invalid baseline object ID.",
		);
	const type = git(root, ["cat-file", "-t", baselineSha]);
	if (!type.ok)
		return unavailable(
			type.reason,
			"Cannot read the baseline object; check Git object availability.",
		);
	if (type.output.trim() !== "commit")
		return unavailable(
			"invalid_baseline",
			"Baseline must identify a commit, not a tree, blob, or tag.",
		);
	const shallow = git(root, ["rev-parse", "--is-shallow-repository"]);
	if (!shallow.ok)
		return unavailable(
			shallow.reason,
			"Cannot determine history completeness.",
		);
	if (shallow.output.trim() === "true")
		return unavailable(
			"shallow_history",
			"Shallow history is unevaluated; fetch full history and retry.",
		);
	if (shallow.output.trim() !== "false")
		return unavailable(
			"invalid_output",
			"Git returned an invalid shallow-history marker.",
		);
	const ancestor = git(root, [
		"merge-base",
		"--is-ancestor",
		baselineSha,
		headSha,
	]);
	if (!ancestor.ok) {
		return ancestor.exitCode === 1
			? unavailable(
					"non_ancestor_baseline",
					"Baseline is not an ancestor of HEAD; select a reachable verification baseline.",
				)
			: unavailable(
					ancestor.reason,
					"Cannot establish baseline ancestry; history is unevaluated.",
				);
	}
	const log = git(root, [
		"rev-list",
		"--reverse",
		"--topo-order",
		"--parents",
		`${baselineSha}..${headSha}`,
		"--",
	]);
	if (!log.ok)
		return unavailable(
			log.reason,
			"Cannot enumerate committed history; no partial drift counts are available.",
		);
	const commits: PathHistoryCommit[] = [];
	for (const line of log.output.split("\n")) {
		if (line === "") continue;
		const [sha, ...parents] = line.split(" ");
		if (
			!sha ||
			!FULL_OID.test(sha) ||
			parents.some((parent) => !FULL_OID.test(parent))
		)
			return unavailable(
				"invalid_output",
				"Git returned malformed commit ancestry.",
			);
		const diff = git(root, [
			"diff-tree",
			"-r",
			"--root",
			"--no-commit-id",
			"--raw",
			"-z",
			"--no-abbrev",
			"--no-ext-diff",
			"--no-textconv",
			"--no-renames",
			"--find-renames=100%",
			"--ignore-submodules=none",
			...(parents[0] ? [parents[0], sha] : [sha]),
			"--",
		]);
		if (!diff.ok)
			return unavailable(
				diff.reason,
				"Cannot read a commit's path changes; no partial drift counts are available.",
			);
		const changes = parseChanges(diff.output);
		if (changes === null)
			return unavailable(
				"invalid_output",
				"Git returned malformed NUL-delimited path changes.",
			);
		commits.push({ sha, parents, changes });
	}
	return {
		status: "ok",
		baselineSha,
		headSha,
		mergePolicy: "all-commits-first-parent-diff",
		commits,
	};
}

/**
 * Conservative v1 policy: explicit contract globs on EITHER rename endpoint
 * win; every other path event is material. Whitespace can alter Python blocks,
 * JS strings, Markdown breaks, YAML, etc.; comments, modes, and even byte-equal
 * renames can change behavior. No language-aware proof means NO cosmetic
 * inference. Empty commits have no path events, not fabricated cosmetic ones.
 * Invalid glob configuration is allowed to throw rather than hide a contract
 * match. This does not reuse plumbing.ts's optimistic legacy heuristics.
 */
export function classifyPathChange(
	change: CommitPathChange,
	contractPaths: string[] = [],
): ChangeKind {
	return [change.path, change.renamedFrom].some(
		(path) =>
			path !== undefined &&
			contractPaths.some((pattern) =>
				picomatch.isMatch(path, pattern, { dot: true }),
			),
	)
		? "contract-level"
		: "material";
}
