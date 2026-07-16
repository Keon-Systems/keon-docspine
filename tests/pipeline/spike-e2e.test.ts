/**
 * Full pipeline run against a temp fixture copy (per the parcel spec's
 * Required Tests). Asserts every `fixtures/messy-repo/EXPECTED-FINDINGS.md`
 * row whose Claim Kind is `path` is reproduced with the expected status,
 * asserts zero path findings for control-negative #10
 * (docs/canon/valid-frontmatter.md) and exactly one for #13's path row
 * (docs/canon/all-claim-kinds-valid.md), and validates the emitted report
 * against schemas/report.schema.json via ajv. Never mutates the checked-in
 * fixture tree — always seeds via setup-fixture-git.ps1 into a fresh temp
 * directory.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AuditReport, ClaimFinding } from "../../src/contracts/index.js";
import { runVerify } from "../../src/pipeline/run-verify.js";
import { registry } from "../../src/registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const setupScript = path.resolve(
	__dirname,
	"../../fixtures/messy-repo/setup-fixture-git.ps1",
);
const schemasDir = path.resolve(__dirname, "../../schemas");

let seededRoot: string;
let report: AuditReport;

before(async () => {
	seededRoot = path.join(
		os.tmpdir(),
		`ds-spike-e2e-${randomBytes(4).toString("hex")}`,
	);
	execFileSync(
		"pwsh",
		["-NoLogo", "-NoProfile", "-File", setupScript, "-Target", seededRoot],
		{ stdio: "pipe" },
	);
	report = await runVerify(seededRoot, registry);
});

after(() => {
	if (seededRoot) rmSync(seededRoot, { recursive: true, force: true });
});

function findingsFor(docId: string): ClaimFinding[] {
	return report.docFindings.find((d) => d.docId === docId)?.claimFindings ?? [];
}

// --- Defect #1: docs/canon/payments.md, path, broken, path_not_found ------

test("defect #1: broken path claim (src/payments/refund-handler.ts)", () => {
	const finding = findingsFor("payments-overview").find(
		(f) => f.claim.value === "src/payments/refund-handler.ts",
	);
	assert.ok(
		finding,
		"expected a path claim for src/payments/refund-handler.ts",
	);
	assert.equal(finding?.status, "broken");
	assert.match(finding?.detail ?? "", /path_not_found/);
});

// --- Defect #2: docs/canon/payments.md, path, moved, renamed_via_git_follow

test("defect #2: moved path claim (src/payments/processor.ts -> charge-processor.ts)", () => {
	const finding = findingsFor("payments-overview").find(
		(f) => f.claim.value === "src/payments/processor.ts",
	);
	assert.ok(finding, "expected a path claim for src/payments/processor.ts");
	assert.equal(finding?.status, "moved");
	assert.equal(finding?.movedTo, "src/payments/charge-processor.ts");
	assert.match(finding?.detail ?? "", /renamed_via_git_follow/);
});

// --- Defect #6: dual-purpose row -- a genuine ok path claim in each of the
// two near-duplicate session-ttl docs (the contradiction-candidate part of
// this defect is an analysis-layer signal, out of this path-only spike's
// scope entirely). ----------------------------------------------------------

test("defect #6: ok path claim in session-ttl-notes-a (src/session/session-store.js)", () => {
	const finding = findingsFor("session-ttl-notes-a").find(
		(f) => f.claim.value === "src/session/session-store.js",
	);
	assert.ok(finding, "expected a path claim for src/session/session-store.js");
	assert.equal(finding?.status, "ok");
});

test("defect #6: ok path claim in session-ttl-notes-b (src/session/session-store.js)", () => {
	const finding = findingsFor("session-ttl-notes-b").find(
		(f) => f.claim.value === "src/session/session-store.js",
	);
	assert.ok(finding, "expected a path claim for src/session/session-store.js");
	assert.equal(finding?.status, "ok");
});

// --- Defect #12: docs/canon/metrics.md, path row, ok, path_exists ---------

test("defect #12: ok path claim in metrics-overview (src-py/report_utils.py)", () => {
	const finding = findingsFor("metrics-overview").find(
		(f) => f.claim.value === "src-py/report_utils.py",
	);
	assert.ok(finding, "expected a path claim for src-py/report_utils.py");
	assert.equal(finding?.status, "ok");
});

// --- Defect #13: control negative, all-claim-kinds-valid.md's path row ---

test("defect #13: exactly one ok path claim, no false positives (control negative)", () => {
	const findings = findingsFor("all-claim-kinds-valid");
	// With the full registry wired (w1-registry-wiring), all four claim kinds
	// are now extracted and checked. Filter to path findings only — the test's
	// intent is that the path extractor produces no false path claims for this
	// doc, not that the doc has no other claim kinds.
	const pathFindings = findings.filter((f) => f.claim.kind === "path");
	assert.equal(
		pathFindings.length,
		1,
		"control-negative #13 must have exactly one path finding",
	);
	assert.equal(pathFindings[0]?.claim.value, "src/billing/invoice.ts");
	assert.equal(pathFindings[0]?.status, "ok");
});

// --- Defect #10: control negative, zero findings expected -----------------

test("defect #10: zero path findings (control negative, valid-frontmatter.md)", () => {
	const findings = findingsFor("fixture-conventions");
	assert.equal(
		findings.length,
		0,
		"control-negative #10 must have zero path findings",
	);
});

// --- Determinism (STRATEGY §6 item 5: cheap now) ---------------------------

test("docFindings are sorted by docId", () => {
	const docIds = report.docFindings.map((d) => d.docId);
	const sorted = [...docIds].sort();
	assert.deepEqual(docIds, sorted);
});

// --- Schema validation ------------------------------------------------------

test("emitted report validates against schemas/report.schema.json", () => {
	const schema = JSON.parse(
		readFileSync(path.join(schemasDir, "report.schema.json"), "utf8"),
	);
	const ajv = new Ajv2020({ allErrors: true, strict: true });
	const validate = ajv.compile(schema);
	const ok = validate(report);
	assert.equal(ok, true, JSON.stringify(validate.errors));
});
