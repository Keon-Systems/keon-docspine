/**
 * Every published JSON Schema in `schemas/` must be draft-2020-12 valid and
 * ajv-compilable, and every "good" fixture in `fixtures.ts` must validate
 * against its schema. Every "broken" fixture must fail validation — proving
 * the schema actually constrains something, not just that it parses.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
	auditReportFixture,
	brokenAuditReportFixture,
	brokenCanonFrontmatterFixture,
	brokenEvidencePacketFixture,
	brokenManifestFixture,
	brokenTaskResultFixture,
	canonFrontmatterFixture,
	evidencePacketFixture,
	guideFrontmatterFixture,
	manifestFixture,
	scratchFrontmatterFixture,
	taskResultFixture,
} from "./fixtures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemasDir = path.resolve(__dirname, "../../schemas");

function loadSchema(name: string): object {
	const raw = readFileSync(path.join(schemasDir, name), "utf8");
	return JSON.parse(raw) as object;
}

const frontmatterSchema = loadSchema("frontmatter.schema.json");
const manifestSchema = loadSchema("manifest.schema.json");
const reportSchema = loadSchema("report.schema.json");
const evidencePacketSchema = loadSchema("evidence-packet.schema.json");
const taskResultSchema = loadSchema("task-result.schema.json");

/**
 * One ajv instance, all five published schemas registered on it, so
 * `evidence-packet.schema.json`'s $ref into `frontmatter.schema.json`
 * resolves. Each test below compiles its own schema off this shared
 * instance via `getSchema`.
 */
function buildAjv() {
	const ajv = new Ajv2020({ allErrors: true, strict: true });
	ajv.addSchema(frontmatterSchema);
	ajv.addSchema(manifestSchema);
	ajv.addSchema(reportSchema);
	ajv.addSchema(evidencePacketSchema);
	ajv.addSchema(taskResultSchema);
	return ajv;
}

function getValidator(
	ajv: ReturnType<typeof buildAjv>,
	id: string,
): ValidateFunction {
	const validate = ajv.getSchema(id);
	assert.ok(validate, `expected ajv to have compiled a schema for ${id}`);
	return validate as ValidateFunction;
}

test("all five published schemas are draft-2020-12 valid and ajv-compilable", () => {
	assert.doesNotThrow(() => buildAjv());
});

test("frontmatter.schema.json: canon fixture with covers validates", () => {
	const ajv = buildAjv();
	const validate = getValidator(
		ajv,
		"https://docspine.dev/schemas/frontmatter.schema.json",
	);
	const ok = validate(canonFrontmatterFixture);
	assert.equal(ok, true, JSON.stringify(validate.errors));
});

test("frontmatter.schema.json: guide fixture without covers validates (covers optional off canon/runbook)", () => {
	const ajv = buildAjv();
	const validate = getValidator(
		ajv,
		"https://docspine.dev/schemas/frontmatter.schema.json",
	);
	const ok = validate(guideFrontmatterFixture);
	assert.equal(ok, true, JSON.stringify(validate.errors));
});

test("frontmatter.schema.json: scratch fixture with expires validates", () => {
	const ajv = buildAjv();
	const validate = getValidator(
		ajv,
		"https://docspine.dev/schemas/frontmatter.schema.json",
	);
	const ok = validate(scratchFrontmatterFixture);
	assert.equal(ok, true, JSON.stringify(validate.errors));
});

test("frontmatter.schema.json: canon fixture WITHOUT covers is rejected", () => {
	const ajv = buildAjv();
	const validate = getValidator(
		ajv,
		"https://docspine.dev/schemas/frontmatter.schema.json",
	);
	const ok = validate(brokenCanonFrontmatterFixture);
	assert.equal(ok, false);
});

test("manifest.schema.json: manifest fixture validates", () => {
	const ajv = buildAjv();
	const validate = getValidator(
		ajv,
		"https://docspine.dev/schemas/manifest.schema.json",
	);
	const ok = validate(manifestFixture);
	assert.equal(ok, true, JSON.stringify(validate.errors));
});

test("manifest.schema.json: fixture with an unknown status value is rejected", () => {
	const ajv = buildAjv();
	const validate = getValidator(
		ajv,
		"https://docspine.dev/schemas/manifest.schema.json",
	);
	const ok = validate(brokenManifestFixture);
	assert.equal(ok, false);
});

test("report.schema.json: audit report fixture validates", () => {
	const ajv = buildAjv();
	const validate = getValidator(
		ajv,
		"https://docspine.dev/schemas/report.schema.json",
	);
	const ok = validate(auditReportFixture);
	assert.equal(ok, true, JSON.stringify(validate.errors));
});

test("report.schema.json: fixture with a claim finding status outside FindingStatus is rejected", () => {
	const ajv = buildAjv();
	const validate = getValidator(
		ajv,
		"https://docspine.dev/schemas/report.schema.json",
	);
	const ok = validate(brokenAuditReportFixture);
	assert.equal(ok, false);
});

test("evidence-packet.schema.json: evidence packet fixture (with nested frontmatter $ref) validates", () => {
	const ajv = buildAjv();
	const validate = getValidator(
		ajv,
		"https://docspine.dev/schemas/evidence-packet.schema.json",
	);
	const ok = validate(evidencePacketFixture);
	assert.equal(ok, true, JSON.stringify(validate.errors));
});

test("evidence-packet.schema.json: fixture with redacted as a string instead of boolean is rejected", () => {
	const ajv = buildAjv();
	const validate = getValidator(
		ajv,
		"https://docspine.dev/schemas/evidence-packet.schema.json",
	);
	const ok = validate(brokenEvidencePacketFixture);
	assert.equal(ok, false);
});

test("task-result.schema.json: task result fixture validates", () => {
	const ajv = buildAjv();
	const validate = getValidator(
		ajv,
		"https://docspine.dev/schemas/task-result.schema.json",
	);
	const ok = validate(taskResultFixture);
	assert.equal(ok, true, JSON.stringify(validate.errors));
});

test("task-result.schema.json: fixture with advisory=false is rejected (const:true gate)", () => {
	const ajv = buildAjv();
	const validate = getValidator(
		ajv,
		"https://docspine.dev/schemas/task-result.schema.json",
	);
	const ok = validate(brokenTaskResultFixture);
	assert.equal(ok, false);
});
