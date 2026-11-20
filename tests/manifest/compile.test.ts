import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { DocFrontmatter } from "../../src/contracts/index.js";
import { validateFrontmatter } from "../../src/frontmatter/validate.js";
import {
	compileManifest,
	serializeManifest,
	trustRulesDigest,
} from "../../src/manifest/compile.js";
import { walkDocs } from "../../src/pipeline/walk.js";
import { canonFrontmatterFixture } from "../contracts/fixtures.js";

const project = fileURLToPath(new URL("../../", import.meta.url));
function temp(t: { after(fn: () => void): void }): string {
	const root = mkdtempSync(path.join(os.tmpdir(), "docspine-manifest-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(path.join(root, "docs"));
	return root;
}
function doc(
	root: string,
	id: string,
	overrides: Partial<DocFrontmatter> = {},
	filename = `${id}.md`,
): void {
	writeFileSync(
		path.join(root, "docs", filename),
		`---\n${JSON.stringify({ ...canonFrontmatterFixture, id, ...overrides })}\n---\nBody text.\n`,
	);
}
function git(root: string, ...args: string[]): string {
	return execFileSync("git", args, {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}
function commit(root: string): void {
	git(root, "init");
	git(root, "add", ".");
	git(
		root,
		"-c",
		"user.name=Test",
		"-c",
		"user.email=test@example.com",
		"-c",
		"commit.gpgsign=false",
		"commit",
		"-m",
		"fixture",
	);
}

test("only eligible verified docs enter routes, packets and canonical groups", async (t) => {
	const root = temp(t);
	for (const status of ["draft", "stale", "superseded", "archived"] as const)
		doc(root, status, { status });
	for (const kind of ["history", "scratch", "reference"] as const)
		doc(root, kind, { kind });
	doc(root, "human", { audience: ["human"] });
	doc(root, "z");
	doc(root, "a");
	doc(root, "run", { kind: "runbook" });
	doc(root, "adr", { kind: "adr" });
	commit(root);
	const ids = [
		"z",
		"a",
		"draft",
		"stale",
		"history",
		"scratch",
		"reference",
		"human",
		"missing",
		"superseded",
		"archived",
	];
	const options = {
		routes: [{ match: "src/**", load: ids, required: true }],
		contextPackets: { work: ids },
		ignore: [],
	};
	const before = structuredClone(options);
	const result = await compileManifest(root, options);
	assert.deepEqual(options, before);
	assert.equal(
		result.manifest.generated_at_sha,
		git(root, "rev-parse", "HEAD"),
	);
	assert.equal(Object.keys(result.manifest.docs).length, 12);
	assert.deepEqual(result.manifest.context_packets.work, ["z", "a"]);
	assert.deepEqual(result.manifest.subsystems.session?.canon, ["a", "z"]);
	assert.deepEqual(result.manifest.subsystems.session?.runbooks, ["run"]);
	assert.deepEqual(result.manifest.subsystems.session?.adrs, ["adr"]);
	assert.deepEqual(result.manifest.stale_queue, ["stale"]);
	assert.ok(
		result.manifest.routes.every((route) =>
			route.load.every((id) => ["a", "z", "run", "adr"].includes(id)),
		),
	);
	for (const id of ids.slice(2))
		assert.ok(
			result.errors.some((error) => error.includes(`doc ${id} `)),
			id,
		);
	assert.equal(
		serializeManifest(result.manifest),
		serializeManifest((await compileManifest(root, options)).manifest),
	);
	assert.equal(result.indexMd, (await compileManifest(root, options)).indexMd);
	assert.equal(
		(await compileManifest(root, { ignore: ["docs/a.md"] })).manifest.docs.a,
		undefined,
	);
	const validate = new Ajv2020({ strict: true }).compile(
		JSON.parse(
			readFileSync(path.join(project, "schemas/manifest.schema.json"), "utf8"),
		),
	);
	assert.ok(validate(result.manifest), JSON.stringify(validate.errors));
	assert.ok(serializeManifest(result.manifest).includes('"generated_at_sha"'));
	assert.ok(!serializeManifest(result.manifest).includes('"generatedAtSha"'));
});

test("malformed metadata, duplicate IDs, empty routes and special object keys are safe", async (t) => {
	const root = temp(t);
	doc(root, "same");
	doc(root, "same", {}, "duplicate.md");
	doc(root, "__proto__", { subsystem: "__proto__" });
	writeFileSync(path.join(root, "docs", "bad.md"), "---\nid: [invalid\n---\n");
	writeFileSync(
		path.join(root, "docs", "invalid.md"),
		"---\nid: invalid\nkind: invalid\n---\n",
	);
	const result = await compileManifest(root, {
		routes: [
			{ match: "", load: ["same"] },
			{ match: "**", load: ["same"] },
		],
		contextPackets: { work: ["same"] },
	});
	assert.equal(result.manifest.generated_at_sha, "unknown");
	for (const text of [
		"Git HEAD unavailable",
		"duplicate doc id same",
		"bad.md",
		"invalid.md",
		"match must not be empty",
		"doc same",
	])
		assert.ok(
			result.errors.some((error) => error.includes(text)),
			text,
		);
	assert.ok(
		result.manifest.routes.every((route) => !route.load.includes("same")),
	);
	assert.deepEqual(result.manifest.context_packets.work, []);
	assert.ok(
		Object.hasOwn(
			JSON.parse(serializeManifest(result.manifest)).docs,
			"__proto__",
		),
	);
});

test("real messy fixture: every schema-valid doc is inventoried, malformed doc reported", async (t) => {
	const root = temp(t);
	cpSync(path.join(project, "fixtures/messy-repo"), root, { recursive: true });
	commit(root);
	const result = await compileManifest(root);
	for (const docPath of walkDocs(root)) {
		const validated = validateFrontmatter(
			readFileSync(path.join(root, docPath), "utf8"),
			docPath,
		);
		if (validated.frontmatter)
			assert.ok(result.manifest.docs[validated.frontmatter.id], docPath);
	}
	assert.ok(
		result.errors.some((error) => error.includes("malformed-frontmatter.md")),
	);
	assert.equal(result.manifest.docs["fixture-conventions"]?.status, "verified");
	assert.equal(
		result.indexMd.match(/Documents: (\d+)/)?.[1],
		String(Object.keys(result.manifest.docs).length),
	);
});

test("trust digest is exactly the AGENTS.md trust block", () => {
	const agents = readFileSync(path.join(project, "AGENTS.md"), "utf8");
	assert.equal(
		agents.match(/```\n(TRUST RULES[\s\S]*?)\n```/)?.[1],
		trustRulesDigest,
	);
});

test("compile/check entrypoint writes only target, is byte stable, detects drift without writing", async (t) => {
	const root = temp(t);
	doc(root, "one");
	commit(root);
	const run = (...args: string[]) =>
		spawnSync(
			process.execPath,
			[
				"--import",
				"tsx",
				path.join(project, "scripts/compile.ts"),
				root,
				...args,
			],
			{ cwd: project, encoding: "utf8" },
		);
	const first = run();
	assert.equal(first.status, 0, first.stderr);
	const manifestPath = path.join(root, "docs/manifest.json");
	const indexPath = path.join(root, "docs/INDEX.md");
	const json = readFileSync(manifestPath, "utf8");
	const index = readFileSync(indexPath, "utf8");
	assert.equal(run().status, 0);
	assert.equal(readFileSync(manifestPath, "utf8"), json);
	assert.equal(readFileSync(indexPath, "utf8"), index);
	assert.equal(run("--check").status, 0);
	writeFileSync(indexPath, "changed");
	assert.equal(run("--check").status, 1);
	assert.equal(readFileSync(indexPath, "utf8"), "changed");
	writeFileSync(path.join(root, "docs/bad.md"), "---\nkind: invalid\n---\n");
	git(root, "add", "docs/bad.md");
	const invalid = run();
	assert.equal(invalid.status, 1);
	assert.match(invalid.stderr, /bad.md/);
});
