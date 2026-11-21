import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
	classifyPathChange,
	type PathHistoryResult,
	readPathHistory,
} from "../../src/git/path-history.js";
import { classifyChange, diffSinceSha } from "../../src/git/plumbing.js";

function fixture() {
	const root = mkdtempSync(path.join(os.tmpdir(), "ds-path-history-"));
	const git = (args: string[], input?: string | Buffer) =>
		execFileSync("git", args, {
			cwd: root,
			input,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
	git(["init", "-q", "-b", "main"]);
	git(["config", "user.email", "path-history@docspine.invalid"]);
	git(["config", "user.name", "Path History Test"]);
	git(["config", "commit.gpgSign", "false"]);
	git(["config", "core.autocrlf", "false"]);
	git(["config", "core.hooksPath", path.join(root, "no-hooks")]);
	const write = (file: string, content: string) =>
		writeFileSync(path.join(root, file), content);
	const commit = (message: string) => {
		git(["add", "-A"]);
		git(["commit", "-q", "--allow-empty", "-m", message]);
		return git(["rev-parse", "HEAD"]);
	};
	return {
		root,
		git,
		write,
		commit,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

function ok(result: PathHistoryResult) {
	assert.equal(result.status, "ok", JSON.stringify(result));
	assert.ok(result.status === "ok");
	return result;
}

function failure(result: PathHistoryResult, reason: string) {
	assert.equal(result.status, "unavailable");
	assert.ok(result.status === "unavailable");
	assert.equal(result.reason, reason);
	assert.ok(result.message.length > 0);
	assert.equal(Object.hasOwn(result, "commits"), false);
}

test("path history preserves material-then-whitespace and net-reverted events; legacy stays unchanged", () => {
	const f = fixture();
	try {
		f.write("source.py", "if enabled:\n    run()\n");
		f.write("reverted.txt", "original\n");
		const base = f.commit("base");
		f.write("source.py", "if enabled:\n    run_new()\n");
		f.write("reverted.txt", "temporary material edit\n");
		const material = f.commit("material");
		f.write("source.py", "if enabled:\nrun_new()\n");
		f.write("reverted.txt", "original\n");
		const whitespace = f.commit("indentation and revert");
		const result = ok(readPathHistory(f.root, base));
		assert.deepEqual(
			result.commits.map((c) => c.sha),
			[material, whitespace],
		);
		assert.equal(result.baselineSha, base);
		assert.deepEqual(result.baselinePaths, ["reverted.txt", "source.py"]);
		assert.equal(result.headSha, whitespace);
		for (const commit of result.commits) {
			assert.deepEqual(
				commit.changes.map((c) => c.path),
				["reverted.txt", "source.py"],
			);
			assert.deepEqual(
				commit.changes.map((c) => classifyPathChange(c)),
				["material", "material"],
			);
		}
		// Old net-diff behavior and optimistic single-last-change heuristic are
		// intentionally preserved for existing callers, but not used for drift.
		assert.equal(
			diffSinceSha(f.root, base).some((c) => c.path === "reverted.txt"),
			false,
		);
		assert.equal(
			classifyChange(f.root, { path: "source.py", status: "modified" }, []),
			"cosmetic",
		);
		assert.deepEqual(diffSinceSha(f.root, "not-a-sha"), []);
		assert.deepEqual(readPathHistory(f.root, base), result);
		assert.deepEqual(ok(readPathHistory(f.root, base.slice(0, 12))), result);
		assert.deepEqual(ok(readPathHistory(f.root, base.toUpperCase())), result);
	} finally {
		f.cleanup();
	}
});

test("history distinguishes no changes, empty commits, invalid/missing/non-ancestor baselines, and unavailable Git", () => {
	const f = fixture();
	const nonRepo = mkdtempSync(path.join(os.tmpdir(), "ds-nonrepo-"));
	try {
		const base = f.commit("base");
		assert.deepEqual(ok(readPathHistory(f.root, base)).commits, []);
		const empty = f.commit("empty but successful");
		assert.deepEqual(ok(readPathHistory(f.root, base)).commits, [
			{ sha: empty, parents: [base], changes: [] },
		]);
		for (const invalid of ["", "HEAD", "--all", `${base}^`, "not-a-sha"])
			failure(readPathHistory(f.root, invalid), "invalid_baseline");
		failure(readPathHistory(f.root, "f".repeat(40)), "unavailable_baseline");
		const tagOnly = "deadbeef01234567";
		f.git(["tag", tagOnly, base]);
		failure(readPathHistory(f.root, tagOnly), "unavailable_baseline");
		failure(
			readPathHistory(f.root, f.git(["rev-parse", "HEAD^{tree}"])),
			"invalid_baseline",
		);
		f.git(["checkout", "-q", "-b", "side", base]);
		const side = f.commit("side-only");
		f.git(["checkout", "-q", "main"]);
		failure(readPathHistory(f.root, side), "non_ancestor_baseline");
		failure(readPathHistory(nonRepo, base), "git_unavailable");
		failure(
			readPathHistory(path.join(nonRepo, "missing-directory"), base),
			"git_unavailable",
		);
		f.write("uncommitted.txt", "not history");
		assert.deepEqual(ok(readPathHistory(f.root, empty)).commits, []);
		f.git(["add", "uncommitted.txt"]);
		assert.deepEqual(ok(readPathHistory(f.root, empty)).commits, []);
	} finally {
		f.cleanup();
		rmSync(nonRepo, { recursive: true, force: true });
	}
});

test("merge policy includes side commits AND first-parent integration and conflict resolution", () => {
	const f = fixture();
	try {
		f.write("conflict.txt", "base\n");
		const base = f.commit("base");
		f.git(["checkout", "-q", "-b", "side"]);
		f.write("conflict.txt", "side\n");
		f.write("side.txt", "side payload\n");
		const side = f.commit("side edit");
		f.git(["checkout", "-q", "main"]);
		f.write("conflict.txt", "main\n");
		const main = f.commit("main edit");
		assert.throws(() => f.git(["merge", "--no-ff", "--no-commit", "side"]));
		f.write("conflict.txt", "resolved third version\n");
		const merge = f.commit("resolve merge");
		const result = ok(readPathHistory(f.root, base));
		assert.equal(result.mergePolicy, "all-commits-first-parent-diff");
		assert.equal(new Set(result.commits.map((c) => c.sha)).size, 3);
		assert.equal(result.commits.at(-1)?.sha, merge);
		assert.deepEqual(
			new Set(result.commits.slice(0, 2).map((c) => c.sha)),
			new Set([side, main]),
		);
		const integration = result.commits.at(-1);
		assert.deepEqual(integration?.parents, [main, side]);
		assert.deepEqual(
			integration?.changes.map((c) => [c.path, c.status]),
			[
				["conflict.txt", "modified"],
				["side.txt", "added"],
			],
		);
		// Baseline on second-parent ancestry is valid under the documented
		// all-reachable-commits policy, not silently reduced to first-parent log.
		assert.deepEqual(
			ok(readPathHistory(f.root, side)).commits.map((c) => c.sha),
			[main, merge],
		);
	} finally {
		f.cleanup();
	}
});

test("raw -z parsing preserves unusual paths; exact rename endpoints, deletes, modes, and contract globs", () => {
	const f = fixture();
	try {
		f.write("old.txt", "unique rename payload\n");
		f.write("delete.txt", "delete payload\n");
		f.write("mode.txt", "mode payload\n");
		f.write("type.txt", "regular file\n");
		const base = f.commit("base");
		f.git(["mv", "old.txt", "new.txt"]);
		f.git(["rm", "-q", "delete.txt"]);
		f.git(["update-index", "--chmod=+x", "mode.txt"]);
		const blob = f.git(
			["hash-object", "-w", "--stdin"],
			"payload for odd paths\n",
		);
		// Build tree objects directly, never checking out platform-restricted
		// paths or relying on Windows index path validation or symlink support.
		f.git(["update-index", "--cacheinfo", `120000,${blob},type.txt`]);
		const indexTree = f.git(["write-tree"]);
		const entries = execFileSync("git", ["ls-tree", "-z", indexTree], {
			cwd: f.root,
		});
		const paths = [
			" leading and trailing ",
			"tab\tname.md",
			"line\nname.md",
			'quote".md',
			"é.md",
			":(glob)*",
			"-option",
			"back\\slash.md",
			".hidden",
		];
		const tree = f.git(
			["mktree", "-z"],
			Buffer.concat([
				entries,
				Buffer.from(
					paths.map((name) => `100644 blob ${blob}\t${name}\0`).join(""),
				),
			]),
		);
		const commit = f.git(
			["commit-tree", tree, "-p", base],
			"raw path events\n",
		);
		f.git(["update-ref", "HEAD", commit]);
		const changes = ok(readPathHistory(f.root, base)).commits[0]?.changes;
		assert.ok(changes);
		for (const name of paths)
			assert.equal(
				changes.find((c) => c.path === name)?.status,
				"added",
				JSON.stringify(name),
			);
		assert.equal(
			changes.find((c) => c.path === "delete.txt")?.status,
			"deleted",
		);
		const mode = changes.find((c) => c.path === "mode.txt");
		assert.ok(mode);
		assert.equal(mode.oldMode, "100644");
		assert.equal(mode.newMode, "100755");
		assert.equal(classifyPathChange(mode), "material");
		assert.equal(
			changes.find((c) => c.path === "type.txt")?.status,
			"type_changed",
		);
		const hidden = changes.find((c) => c.path === ".hidden");
		assert.ok(hidden);
		assert.equal(classifyPathChange(hidden, ["*"]), "contract-level");
		const renamed = changes.find((c) => c.path === "new.txt");
		assert.ok(renamed);
		assert.equal(renamed.status, "renamed");
		assert.equal(renamed.renamedFrom, "old.txt");
		assert.equal(renamed.oldOid, renamed.newOid);
		assert.equal(classifyPathChange(renamed), "material");
		assert.equal(classifyPathChange(renamed, ["old.*"]), "contract-level");
		assert.equal(classifyPathChange(renamed, ["new.*"]), "contract-level");
	} finally {
		f.cleanup();
	}
});

test("whitespace inside strings, trailing Markdown breaks, comments, and inexact renames stay material", () => {
	const f = fixture();
	try {
		f.write("strings.js", 'const message = "a b";\n');
		f.write("doc.md", "line one\nline two\n");
		f.write("comment.js", "// old\n");
		f.write("old.txt", "old content\n");
		const base = f.commit("base");
		f.write("strings.js", 'const message = "ab";\n');
		f.write("doc.md", "line one  \nline two\n");
		f.write("comment.js", "// new\n");
		f.git(["mv", "old.txt", "new.txt"]);
		f.write("new.txt", "totally different content\n");
		f.commit("semantic whitespace and comments");
		const changes = ok(readPathHistory(f.root, base)).commits[0]?.changes;
		assert.ok(changes);
		assert.deepEqual(
			changes.map((c) => c.path),
			["comment.js", "doc.md", "new.txt", "old.txt", "strings.js"],
		);
		for (const change of changes)
			assert.equal(classifyPathChange(change), "material");
		const comment = changes.find((c) => c.path === "comment.js");
		assert.ok(comment);
		assert.equal(classifyPathChange(comment, ["*.js"]), "contract-level");
	} finally {
		f.cleanup();
	}
});

test("shallow clones and invalid UTF-8 path output are explicitly unevaluated", () => {
	const f = fixture();
	const container = mkdtempSync(path.join(os.tmpdir(), "ds-shallow-"));
	try {
		const base = f.commit("base");
		f.commit("second");
		// file:// makes --depth effective for local clones on every platform.
		const clone = path.join(container, "clone");
		execFileSync(
			"git",
			["clone", "-q", "--depth=1", pathToFileURL(f.root).href, clone],
			{ stdio: "pipe" },
		);
		const cloneHead = execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: clone,
			encoding: "utf8",
		}).trim();
		failure(readPathHistory(clone, cloneHead), "shallow_history");
		failure(readPathHistory(clone, base), "unavailable_baseline");
		const blob = f.git(["hash-object", "-w", "--stdin"], "payload\n");
		const treeInfo = Buffer.concat([
			Buffer.from(`100644 blob ${blob}\tbad-`),
			Buffer.from([0xff]),
			Buffer.from(".md\0"),
		]);
		const tree = f.git(["mktree", "-z"], treeInfo);
		const head = f.git(["rev-parse", "HEAD"]);
		const commit = f.git(
			["commit-tree", tree, "-p", head],
			"invalid UTF8 path\n",
		);
		f.git(["update-ref", "HEAD", commit]);
		failure(readPathHistory(f.root, base), "invalid_output");
	} finally {
		f.cleanup();
		rmSync(container, { recursive: true, force: true });
	}
});
