/**
 * Regression test: a doc that `git ls-files` reports as tracked but that is
 * missing from the working tree (e.g. deleted on disk without staging the
 * deletion, or a staged-deletion checkout) must be skipped, never crash the
 * whole `runVerify` pipeline. Uses a minimal, throwaway git repo rather than
 * the shared `fixtures/messy-repo` tree, since this only needs one tracked
 * doc and one deleted-from-disk doc.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuditReport } from "../../src/contracts/index.js";
import { runVerify } from "../../src/pipeline/run-verify.js";
import { registry } from "../../src/registry.js";

let repoRoot: string;
let report: AuditReport;

before(async () => {
	repoRoot = path.join(
		os.tmpdir(),
		`ds-unreadable-doc-${randomBytes(4).toString("hex")}`,
	);
	mkdirSync(repoRoot, { recursive: true });

	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: repoRoot, stdio: "pipe" });

	git("init", "-q");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");

	writeFileSync(path.join(repoRoot, "present.md"), "# Present\n\nStays put.\n");
	writeFileSync(
		path.join(repoRoot, "gone.md"),
		"# Gone\n\nDeleted after commit.\n",
	);
	git("add", "present.md", "gone.md");
	git("commit", "-q", "-m", "seed");

	// Tracked in the index/HEAD, but missing from disk -- readFileSync would
	// throw ENOENT if run-verify.ts didn't guard this read.
	unlinkSync(path.join(repoRoot, "gone.md"));

	report = await runVerify(repoRoot, registry);
});

after(() => {
	if (repoRoot) rmSync(repoRoot, { recursive: true, force: true });
});

test("runVerify does not throw when a tracked doc is missing from disk", () => {
	assert.ok(report);
});

test("the unreadable doc produces no docFinding entry", () => {
	assert.equal(
		report.docFindings.find((d) => d.docId === "gone.md"),
		undefined,
	);
});

test("the still-present doc is still processed normally", () => {
	assert.ok(report.docFindings.find((d) => d.docId === "present.md"));
});
