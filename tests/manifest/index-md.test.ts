import assert from "node:assert/strict";
import test from "node:test";
import { renderIndexMd } from "../../src/manifest/index-md.js";
import { manifestFixture } from "../contracts/fixtures.js";

test("INDEX is a stable manifest view including every document and packet order", () => {
	const manifest = structuredClone(manifestFixture);
	const entry = Object.values(manifest.docs)[0];
	assert.ok(entry);
	manifest.docs = {
		z: { ...entry, path: "docs/a file.md", status: "draft" },
		"a|[x]": { ...entry, path: "README.md" },
	};
	manifest.context_packets = { work: ["z", "a|[x]"] };
	const output = renderIndexMd(manifest);
	assert.match(output, /Documents: 2/);
	assert.match(output, /a%20file.md/);
	assert.ok(output.includes("../README.md"));
	assert.match(output, /draft/);
	assert.match(output, /a&#124;&#91;x&#93;/);
	assert.match(output, /work: z → a&#124;&#91;x&#93;/);
	manifest.docs = Object.fromEntries(Object.entries(manifest.docs).reverse());
	assert.equal(renderIndexMd(manifest), output);
});
