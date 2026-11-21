/**
 * Failure-aware, committed path history for drift. This deliberately does NOT
 * change plumbing.ts's legacy empty-on-error/net-diff/whitespace heuristics.
 * No shell, patches, source execution, textconv, or external diff drivers.
 */
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
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
	| "history_limit"
	| "invalid_output";

export type PathHistoryResult =
	| {
			status: "ok";
			baselineSha: string;
			headSha: string;
			mergePolicy: "all-commits-first-parent-diff";
			/** Repo-relative leaf paths in the baseline tree, sorted. */
			baselinePaths: string[];
			/** Oldest topological order first, each commit once (including empty commits). */
			commits: PathHistoryCommit[];
	  }
	| { status: "unavailable"; reason: PathHistoryFailure; message: string };

type GitResult =
	| { ok: true; output: string }
	| {
			ok: false;
			exitCode: number | null;
			reason: "git_unavailable" | "history_limit" | "invalid_output";
	  };

const FULL_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_BUFFER = 64 * 1024 * 1024;
const MAX_COMMITS = 5_000;
const TOTAL_MS = 30_000;
const COMMAND_MS = 5_000;

function git(root: string, args: string[], deadline: number): GitResult {
	const remaining = Math.floor(deadline - performance.now());
	if (remaining <= 0)
		return { ok: false, exitCode: null, reason: "history_limit" };
	try {
		const result = spawnSync("git", ["--no-replace-objects", ...args], {
			cwd: root,
			stdio: ["ignore", "pipe", "pipe"],
			maxBuffer: MAX_BUFFER,
			timeout: Math.min(COMMAND_MS, remaining),
			killSignal: "SIGKILL",
			env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" },
			windowsHide: true,
			shell: false,
		});
		const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
		if (code === "ETIMEDOUT" || code === "ENOBUFS") {
			return { ok: false, exitCode: null, reason: "history_limit" };
		}
		if (result.error || result.status !== 0) {
			return { ok: false, exitCode: result.status, reason: "git_unavailable" };
		}
		try {
			return {
				ok: true,
				output: new TextDecoder("utf-8", {
					fatal: true,
					ignoreBOM: true,
				}).decode(result.stdout),
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
 * objects, or Git failures never return partial success. Local Git commands
 * have time and buffer limits; the entire scan also limits time, commits,
 * and aggregate output. Exhaustion is explicitly unevaluated.
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
	const deadline = performance.now() + TOTAL_MS;
	const run = (...args: string[]): GitResult => git(root, args, deadline);
	const headResult = run("rev-parse", "--verify", "HEAD^{commit}");
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
	const prefix = baseline.toLowerCase();
	const baseResult = run("rev-parse", `--disambiguate=${prefix}`);
	if (!baseResult.ok)
		return unavailable(
			baseResult.reason,
			"Cannot enumerate baseline objects locally.",
		);
	const candidates = baseResult.output.trim().split(/\n/).filter(Boolean);
	const baselineSha = candidates[0];
	if (candidates.length !== 1 || !baselineSha)
		return unavailable(
			"unavailable_baseline",
			"Baseline object is unavailable or ambiguous; fetch its history and retry with a full commit SHA.",
		);
	if (!FULL_OID.test(baselineSha) || !baselineSha.startsWith(prefix))
		return unavailable(
			"invalid_output",
			"Git returned an invalid baseline object ID.",
		);
	const type = run("cat-file", "-t", baselineSha);
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
	const shallow = run("rev-parse", "--is-shallow-repository");
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
	const ancestor = run("merge-base", "--is-ancestor", baselineSha, headSha);
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
	const tree = run(
		"ls-tree",
		"--full-tree",
		"-r",
		"-z",
		"--name-only",
		baselineSha,
	);
	if (!tree.ok)
		return unavailable(
			tree.reason,
			"Cannot enumerate the baseline's committed paths.",
		);
	const baselinePaths = tree.output.split("\0");
	if (baselinePaths.pop() !== "" || baselinePaths.some((p) => !p)) {
		return unavailable(
			"invalid_output",
			"Git returned malformed baseline paths.",
		);
	}
	baselinePaths.sort();
	const log = run(
		"rev-list",
		"--reverse",
		"--topo-order",
		"--parents",
		`--max-count=${MAX_COMMITS + 1}`,
		`${baselineSha}..${headSha}`,
		"--",
	);
	if (!log.ok)
		return unavailable(
			log.reason,
			"Cannot enumerate committed history; no partial drift counts are available.",
		);
	const lines = log.output.split("\n").filter(Boolean);
	if (lines.length > MAX_COMMITS)
		return unavailable(
			"history_limit",
			"History contains more than 5,000 commits; no partial counts are available.",
		);
	let remainingBytes =
		MAX_BUFFER - Buffer.byteLength(tree.output) - Buffer.byteLength(log.output);
	if (remainingBytes < 0)
		return unavailable(
			"history_limit",
			"Committed path history exceeds the aggregate output limit.",
		);
	const commits: PathHistoryCommit[] = [];
	for (const line of lines) {
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
		const diff = run(
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
		);
		if (!diff.ok)
			return unavailable(
				diff.reason,
				"Cannot read a commit's path changes; no partial drift counts are available.",
			);
		remainingBytes -= Buffer.byteLength(diff.output);
		if (remainingBytes < 0)
			return unavailable(
				"history_limit",
				"Committed path history exceeds the aggregate output limit.",
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
		baselinePaths,
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
