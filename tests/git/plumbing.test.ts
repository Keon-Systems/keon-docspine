/**
 * Tests for `src/git/plumbing.ts`'s `diffSinceSha`, `findRename`, and
 * `classifyChange`, against a small, purpose-built temp git repo seeded in
 * this file's own `before()` hook (per the parcel spec's Required Tests —
 * self-contained, does NOT depend on or mutate `fixtures/messy-repo`, which
 * is a different parcel's read-only-after-merge asset).
 *
 * Seeded history (all in one throwaway repo under the OS temp dir):
 *   commit 1 (base, `baseSha`):
 *     - add `material.txt`, `whitespace.txt`, `to-delete.txt`,
 *       `old-name.txt`, `contract/api.ts`
 *   commit 2:
 *     - modify `material.txt` (real content change)
 *     - modify `contract/api.ts` (real content change, but under a
 *       `contractPaths` glob -> must classify "contract-level" regardless)
 *     - delete `to-delete.txt`
 *     - `git mv old-name.txt new-name.txt` with NO content change (pure
 *       rename)
 *     - add `new-file.txt`
 *   commit 3 (HEAD):
 *     - whitespace-only edit to `whitespace.txt` (trailing spaces added to
 *       existing lines only, no line added/removed, no non-whitespace
 *       change)
 *
 * `diffSinceSha(root, baseSha)` (baseSha exclusive, HEAD inclusive) should
 * then report the net change across commits 2+3 for every path above.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
	buildRenameMap,
	classifyChange,
	type DiffEntry,
	diffSinceSha,
	findRename,
} from "../../src/git/plumbing.js";

let repoRoot: string;
let baseSha: string;

function git(args: string[], cwd = repoRoot): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function write(relPath: string, content: string): void {
	const abs = path.join(repoRoot, relPath);
	mkdirSync(path.dirname(abs), { recursive: true });
	writeFileSync(abs, content, "utf8");
}

before(() => {
	repoRoot = path.join(
		os.tmpdir(),
		`ds-git-plumbing-${randomBytes(4).toString("hex")}`,
	);
	mkdirSync(repoRoot, { recursive: true });

	git(["init", "-q", "-b", "main"]);
	git(["config", "user.email", "plumbing-test@docspine.invalid"]);
	git(["config", "user.name", "DocSpine Plumbing Test"]);

	// Commit 1: base state.
	write("material.txt", "line one\nline two\nline three\n");
	write("whitespace.txt", "alpha\nbeta\ngamma\n");
	write("to-delete.txt", "temporary content\n");
	write("old-name.txt", "unchanged rename payload\n");
	write("contract/api.ts", "export function original() {}\n");
	git(["add", "-A"]);
	git(["commit", "-q", "-m", "base commit"]);
	baseSha = git(["rev-parse", "HEAD"]);

	// Commit 2: material edit, contract-level edit, delete, pure rename, add.
	write("material.txt", "line one\nline two CHANGED\nline three\n");
	write("contract/api.ts", "export function original() { return 42; }\n");
	git(["rm", "-q", "to-delete.txt"]);
	git(["mv", "old-name.txt", "new-name.txt"]);
	write("new-file.txt", "brand new file\n");
	git(["add", "-A"]);
	git(["commit", "-q", "-m", "material + contract + delete + rename + add"]);

	// Commit 3 (HEAD): whitespace-only change (trailing whitespace added to
	// existing lines only — no line added/removed, so `git diff -w` between
	// this commit and its parent is empty for this path).
	write("whitespace.txt", "alpha  \nbeta\t\ngamma\n");
	git(["add", "-A"]);
	git(["commit", "-q", "-m", "whitespace-only tweak"]);
});

after(() => {
	if (repoRoot) rmSync(repoRoot, { recursive: true, force: true });
});

function findEntry(entries: DiffEntry[], p: string): DiffEntry | undefined {
	return entries.find((e) => e.path === p);
}

test("diffSinceSha: reports added/modified/deleted/renamed across the range", () => {
	const entries = diffSinceSha(repoRoot, baseSha);

	const material = findEntry(entries, "material.txt");
	assert.equal(material?.status, "modified");

	const contract = findEntry(entries, "contract/api.ts");
	assert.equal(contract?.status, "modified");

	const deleted = findEntry(entries, "to-delete.txt");
	assert.equal(deleted?.status, "deleted");

	const renamed = findEntry(entries, "new-name.txt");
	assert.equal(renamed?.status, "renamed");
	assert.equal(renamed?.renamedFrom, "old-name.txt");
	assert.equal(renamed?.renameSimilarity, 100);

	const added = findEntry(entries, "new-file.txt");
	assert.equal(added?.status, "added");

	const whitespace = findEntry(entries, "whitespace.txt");
	assert.equal(whitespace?.status, "modified");
});

test("diffSinceSha: invalid SHA returns empty array, never throws", () => {
	assert.deepEqual(diffSinceSha(repoRoot, "not-a-real-sha-1234567"), []);
});

test("diffSinceSha: no changes (sinceSha == HEAD) returns empty array", () => {
	const head = git(["rev-parse", "HEAD"]);
	assert.deepEqual(diffSinceSha(repoRoot, head), []);
});

test("diffSinceSha: not-a-git-repo returns empty array, never throws", () => {
	const nonRepo = path.join(
		os.tmpdir(),
		`ds-git-plumbing-nonrepo-${randomBytes(4).toString("hex")}`,
	);
	mkdirSync(nonRepo, { recursive: true });
	try {
		assert.deepEqual(diffSinceSha(nonRepo, baseSha), []);
	} finally {
		rmSync(nonRepo, { recursive: true, force: true });
	}
});

test("findRename: positive match on a renamed file", () => {
	assert.equal(findRename(repoRoot, "old-name.txt"), "new-name.txt");
});

test("findRename: genuinely deleted file returns null, not a guess", () => {
	assert.equal(findRename(repoRoot, "to-delete.txt"), null);
});

test("findRename: unknown path returns null", () => {
	assert.equal(findRename(repoRoot, "never/existed.txt"), null);
});

test("findRename: not-a-git-repo returns null, never throws", () => {
	const nonRepo = path.join(
		os.tmpdir(),
		`ds-git-plumbing-nonrepo-${randomBytes(4).toString("hex")}`,
	);
	mkdirSync(nonRepo, { recursive: true });
	try {
		assert.equal(findRename(nonRepo, "old-name.txt"), null);
	} finally {
		rmSync(nonRepo, { recursive: true, force: true });
	}
});

test("classifyChange: contract-level when contractPaths glob matches", () => {
	const entry: DiffEntry = { path: "contract/api.ts", status: "modified" };
	assert.equal(
		classifyChange(repoRoot, entry, ["contract/**"]),
		"contract-level",
	);
});

test("classifyChange: contract-level wins even for a renamed contract path", () => {
	const entry: DiffEntry = {
		path: "new-name.txt",
		status: "renamed",
		renamedFrom: "old-name.txt",
	};
	// contractPaths matches the OLD name here to prove renamedFrom is checked
	// too, not just the new path.
	assert.equal(
		classifyChange(repoRoot, entry, ["old-name.txt"]),
		"contract-level",
	);
});

test("classifyChange: cosmetic for a whitespace-only diff", () => {
	const entry: DiffEntry = { path: "whitespace.txt", status: "modified" };
	assert.equal(classifyChange(repoRoot, entry, []), "cosmetic");
});

test("classifyChange: cosmetic for a pure rename with no content change", () => {
	const entry: DiffEntry = {
		path: "new-name.txt",
		status: "renamed",
		renamedFrom: "old-name.txt",
	};
	assert.equal(classifyChange(repoRoot, entry, []), "cosmetic");
});

test("classifyChange: material for a real content change", () => {
	const entry: DiffEntry = { path: "material.txt", status: "modified" };
	assert.equal(classifyChange(repoRoot, entry, []), "material");
});

test("classifyChange: material for a deleted path (no cosmetic label for deletes)", () => {
	const entry: DiffEntry = { path: "to-delete.txt", status: "deleted" };
	assert.equal(classifyChange(repoRoot, entry, []), "material");
});

test("classifyChange: material for an added path (no cosmetic label for adds)", () => {
	const entry: DiffEntry = { path: "new-file.txt", status: "added" };
	assert.equal(classifyChange(repoRoot, entry, []), "material");
});

test("classifyChange: not-a-git-repo never throws, falls back to material", () => {
	const nonRepo = path.join(
		os.tmpdir(),
		`ds-git-plumbing-nonrepo-${randomBytes(4).toString("hex")}`,
	);
	mkdirSync(nonRepo, { recursive: true });
	try {
		const entry: DiffEntry = { path: "whatever.txt", status: "modified" };
		assert.equal(classifyChange(nonRepo, entry, []), "material");
	} finally {
		rmSync(nonRepo, { recursive: true, force: true });
	}
});

test("buildRenameMap: follows multi-hop rename chains (A -> B -> C)", () => {
	const chainRepo = path.join(
		os.tmpdir(),
		`ds-git-plumbing-chain-${randomBytes(4).toString("hex")}`,
	);
	mkdirSync(chainRepo, { recursive: true });
	try {
		git(["init", "-q", "-b", "main"], chainRepo);
		git(["config", "user.email", "plumbing-test@docspine.invalid"], chainRepo);
		git(["config", "user.name", "DocSpine Plumbing Test"], chainRepo);

		writeFileSync(path.join(chainRepo, "a.txt"), "payload\n", "utf8");
		git(["add", "-A"], chainRepo);
		git(["commit", "-q", "-m", "add a"], chainRepo);

		git(["mv", "a.txt", "b.txt"], chainRepo);
		git(["commit", "-q", "-m", "a -> b"], chainRepo);

		git(["mv", "b.txt", "c.txt"], chainRepo);
		git(["commit", "-q", "-m", "b -> c"], chainRepo);

		const map = buildRenameMap(chainRepo);
		assert.equal(map.get("a.txt"), "c.txt");
		assert.equal(map.get("b.txt"), "c.txt");
		assert.equal(findRename(chainRepo, "a.txt"), "c.txt");
	} finally {
		rmSync(chainRepo, { recursive: true, force: true });
	}
});

test("classifyChange with sinceSha: detects material change even when followed by a whitespace-only commit", () => {
	const rangeRepo = path.join(
		os.tmpdir(),
		`ds-git-plumbing-range-${randomBytes(4).toString("hex")}`,
	);
	mkdirSync(rangeRepo, { recursive: true });
	try {
		git(["init", "-q", "-b", "main"], rangeRepo);
		git(["config", "user.email", "plumbing-test@docspine.invalid"], rangeRepo);
		git(["config", "user.name", "DocSpine Plumbing Test"], rangeRepo);

		writeFileSync(path.join(rangeRepo, "file.txt"), "v1\n", "utf8");
		git(["add", "-A"], rangeRepo);
		git(["commit", "-q", "-m", "base"], rangeRepo);
		const since = git(["rev-parse", "HEAD"], rangeRepo);

		writeFileSync(path.join(rangeRepo, "file.txt"), "v2\n", "utf8");
		git(["add", "-A"], rangeRepo);
		git(["commit", "-q", "-m", "material edit"], rangeRepo);

		writeFileSync(path.join(rangeRepo, "file.txt"), "v2   \n", "utf8");
		git(["add", "-A"], rangeRepo);
		git(["commit", "-q", "-m", "trailing whitespace"], rangeRepo);

		const entry: DiffEntry = { path: "file.txt", status: "modified" };
		assert.equal(classifyChange(rangeRepo, entry, [], since), "material");
	} finally {
		rmSync(rangeRepo, { recursive: true, force: true });
	}
});
