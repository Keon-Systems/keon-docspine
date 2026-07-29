/**
 * ok / broken / moved / non-git-repo behaviors for the path checker,
 * against a TEMP COPY of the fixture repo with seeded git history (per the
 * parcel spec's Required Tests). Never mutates the checked-in
 * `fixtures/messy-repo` tree — always seeds via `setup-fixture-git.ps1`
 * into a fresh directory under the OS temp dir.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { pathChecker } from "../../src/checkers/paths.js";
import type { Claim, RepoContext } from "../../src/contracts/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const setupScript = path.resolve(
	__dirname,
	"../../fixtures/messy-repo/setup-fixture-git.ps1",
);

let seededRoot: string;

before(() => {
	seededRoot = path.join(
		os.tmpdir(),
		`ds-spike-checkers-${randomBytes(4).toString("hex")}`,
	);
	execFileSync(
		"pwsh",
		["-NoLogo", "-NoProfile", "-File", setupScript, "-Target", seededRoot],
		{ stdio: "pipe" },
	);
});

after(() => {
	if (seededRoot) rmSync(seededRoot, { recursive: true, force: true });
});

function claim(value: string): Claim {
	return {
		kind: "path",
		value,
		docId: "test-doc",
		line: 1,
		raw: `\`${value}\``,
	};
}

function gitCtx(): RepoContext {
	return {
		root: seededRoot,
		git: { isRepo: true, headSha: "HEAD", repoRoot: seededRoot },
	};
}

function nonGitCtx(): RepoContext {
	// Reuses the same seeded tree but overrides the git facts the pipeline
	// would have gathered, to exercise the checker's "not a git repo"
	// behavior in isolation (RepoContext.git is populated once by the
	// pipeline; the checker trusts it, per contracts/plugins.ts).
	return {
		root: seededRoot,
		git: { isRepo: false, headSha: null, repoRoot: null },
	};
}

test("existing path on disk -> ok", async () => {
	const findings = await pathChecker.check(
		[claim("src/billing/invoice.ts")],
		gitCtx(),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "ok");
});

test("missing path with no rename history -> broken", async () => {
	const findings = await pathChecker.check(
		[claim("src/payments/refund-handler.ts")],
		gitCtx(),
	);
	assert.equal(findings[0]?.status, "broken");
	assert.match(findings[0]?.detail ?? "", /path_not_found/);
});

test("missing path that was git-renamed -> moved, with movedTo set", async () => {
	const findings = await pathChecker.check(
		[claim("src/payments/processor.ts")],
		gitCtx(),
	);
	assert.equal(findings[0]?.status, "moved");
	assert.equal(findings[0]?.movedTo, "src/payments/charge-processor.ts");
	assert.match(findings[0]?.detail ?? "", /renamed_via_git_follow/);
});

test("non-git repo root: existing path is still ok", async () => {
	const findings = await pathChecker.check(
		[claim("src/billing/invoice.ts")],
		nonGitCtx(),
	);
	assert.equal(findings[0]?.status, "ok");
});

test("non-git repo root: missing path -> unverifiable, never broken, never a crash", async () => {
	const findings = await pathChecker.check(
		[claim("src/payments/refund-handler.ts")],
		nonGitCtx(),
	);
	assert.equal(findings[0]?.status, "unverifiable");
	assert.match(findings[0]?.detail ?? "", /rename/);
});

test("claim value escaping the repo root via ../ -> broken, never followed onto the host filesystem", async () => {
	const findings = await pathChecker.check(
		[claim("../../../../etc/passwd")],
		gitCtx(),
	);
	assert.equal(findings[0]?.status, "broken");
	assert.match(findings[0]?.detail ?? "", /path_escapes_repo_root/);
});
