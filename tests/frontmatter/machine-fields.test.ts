import assert from "node:assert/strict";
import test from "node:test";
import type { DocFrontmatter } from "../../src/contracts/index.js";
import {
	diffMachineOwnedFields,
	MACHINE_OWNED_FIELDS,
} from "../../src/frontmatter/machine-fields.js";

const baseFrontmatter: DocFrontmatter = {
	id: "sessions-architecture",
	title: "Session State Architecture",
	kind: "canon",
	status: "verified",
	owner: "platform-team",
	subsystem: "session",
	covers: ["src/session/**"],
	audience: ["agent", "human"],
	confidence: "high",
	last_verified_sha: "a3f9c21",
	last_verified_at: "2026-07-01",
	drift_tolerance: "strict",
	tags: ["session"],
};

test("MACHINE_OWNED_FIELDS is exactly confidence, last_verified_sha, last_verified_at", () => {
	assert.deepEqual(
		[...MACHINE_OWNED_FIELDS].sort(),
		["confidence", "last_verified_at", "last_verified_sha"].sort(),
	);
});

test("diffMachineOwnedFields: identical fixtures -> empty array", () => {
	const after = { ...baseFrontmatter };
	assert.deepEqual(diffMachineOwnedFields(baseFrontmatter, after), []);
});

test("diffMachineOwnedFields: fixtures differing only in last_verified_sha -> that field name", () => {
	const after: DocFrontmatter = {
		...baseFrontmatter,
		last_verified_sha: "b7e2d90",
	};
	assert.deepEqual(diffMachineOwnedFields(baseFrontmatter, after), [
		"last_verified_sha",
	]);
});

test("diffMachineOwnedFields: fixtures differing only in confidence -> that field name", () => {
	const after: DocFrontmatter = { ...baseFrontmatter, confidence: "medium" };
	assert.deepEqual(diffMachineOwnedFields(baseFrontmatter, after), [
		"confidence",
	]);
});

test("diffMachineOwnedFields: non-machine-owned field changing (e.g. title) is never reported", () => {
	const after: DocFrontmatter = { ...baseFrontmatter, title: "New Title" };
	assert.deepEqual(diffMachineOwnedFields(baseFrontmatter, after), []);
});

test("diffMachineOwnedFields: before=null (first-ever verify) reports every machine-owned field that is now set in after", () => {
	const after: DocFrontmatter = { ...baseFrontmatter };
	assert.deepEqual(
		[...diffMachineOwnedFields(null, after)].sort(),
		["confidence", "last_verified_at", "last_verified_sha"].sort(),
	);
});

test("diffMachineOwnedFields: before=null, after still has null last_verified_sha/at (pre-verify) -> only confidence reported", () => {
	const after: DocFrontmatter = {
		...baseFrontmatter,
		last_verified_sha: null,
		last_verified_at: null,
	};
	assert.deepEqual(diffMachineOwnedFields(null, after), ["confidence"]);
});
