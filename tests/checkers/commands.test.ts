/**
 * ok / broken / unverifiable behaviors for the command checker, against a
 * synthetic temp-dir `package.json` (per the parcel spec's Required Tests —
 * no git, no `fixtures/messy-repo` seeding needed for this checker).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { commandChecker } from "../../src/checkers/commands.js";
import type { Claim, RepoContext } from "../../src/contracts/index.js";

let tmpRoot: string;
let emptyRoot: string;

before(() => {
	tmpRoot = path.join(
		os.tmpdir(),
		`ds-check-commands-${randomBytes(4).toString("hex")}`,
	);
	mkdirSync(tmpRoot, { recursive: true });
	writeFileSync(
		path.join(tmpRoot, "package.json"),
		JSON.stringify({
			name: "synthetic-fixture",
			version: "0.0.0",
			scripts: {
				build: "echo build",
				test: "echo test",
				lint: "echo lint",
			},
		}),
	);

	emptyRoot = path.join(
		os.tmpdir(),
		`ds-check-commands-nopkg-${randomBytes(4).toString("hex")}`,
	);
	mkdirSync(emptyRoot, { recursive: true });
});

after(() => {
	if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
	if (emptyRoot) rmSync(emptyRoot, { recursive: true, force: true });
});

function claim(raw: string, value: string): Claim {
	return {
		kind: "command",
		value,
		docId: "test-doc",
		line: 1,
		raw,
	};
}

function ctx(root: string): RepoContext {
	return {
		root,
		git: { isRepo: false, headSha: null, repoRoot: null },
	};
}

test("npm run <script> for an existing script -> ok", async () => {
	const findings = await commandChecker.check(
		[claim("npm run build", "build")],
		ctx(tmpRoot),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "ok");
	assert.equal(findings[0]?.detail, "npm_script_exists:build");
});

test("npm run <script> for a missing script -> broken (fixture defect #4 shape)", async () => {
	const findings = await commandChecker.check(
		[claim("npm run build:prod", "build:prod")],
		ctx(tmpRoot),
	);
	assert.equal(findings[0]?.status, "broken");
	assert.equal(findings[0]?.detail, "npm_script_not_found:build:prod");
});

test("bare npm test against a package.json with a test script -> ok (fixture defect #13 shape)", async () => {
	const findings = await commandChecker.check(
		[claim("npm test", "test")],
		ctx(tmpRoot),
	);
	assert.equal(findings[0]?.status, "ok");
	assert.equal(findings[0]?.detail, "npm_script_exists:test");
});

test("non-npm raw line -> unverifiable", async () => {
	const findings = await commandChecker.check(
		[claim("docker build .", "docker build .")],
		ctx(tmpRoot),
	);
	assert.equal(findings[0]?.status, "unverifiable");
	assert.match(findings[0]?.detail ?? "", /unverifiable_command_shape/);
});

test("target directory with no package.json at all -> every claim unverifiable_no_package_json, no throw", async () => {
	const findings = await commandChecker.check(
		[
			claim("npm run build", "build"),
			claim("npm test", "test"),
			claim("docker build .", "docker build ."),
		],
		ctx(emptyRoot),
	);
	assert.equal(findings.length, 3);
	for (const finding of findings) {
		assert.equal(finding.status, "unverifiable");
		assert.equal(finding.detail, "unverifiable_no_package_json");
	}
});
