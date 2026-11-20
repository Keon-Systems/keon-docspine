import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clusterDocs } from "../../src/similarity/cluster.js";
import { buildTfIdf, cosineSimilarity } from "../../src/similarity/tfidf.js";
import { tokenizeDoc } from "../../src/similarity/tokenize.js";

function fixture(id: string) {
	return {
		id,
		body: readFileSync(
			new URL(`../../fixtures/messy-repo/docs/canon/${id}`, import.meta.url),
			"utf8",
		),
	};
}
const fixtures = [
	"session-ttl-a.md",
	"session-ttl-b.md",
	"billing.md",
	"metrics.md",
].map(fixture);

test("defect #6: paraphrased session notes cluster at an explicit review threshold", () => {
	// These are conflicting paraphrases, not near-identical prose. Their cosine
	// is ~0.314 in this corpus: do not pretend the provisional default catches it.
	const clusters = clusterDocs(fixtures, { threshold: 0.25 });
	assert.deepEqual(
		clusters.map((group) => group.memberIds),
		[["session-ttl-a.md", "session-ttl-b.md"]],
	);
	const pair = clusters[0]?.pairs[0];
	assert.equal(pair?.method, "tfidf");
	assert.ok(pair && pair.score > 0.3 && pair.score < 0.4);
	const model = buildTfIdf(
		fixtures.map((doc) => ({ id: doc.id, tokens: tokenizeDoc(doc.body) })),
	);
	assert.equal(
		pair?.score,
		cosineSimilarity(
			model.vectors.get("session-ttl-a.md") ?? new Map(),
			model.vectors.get("session-ttl-b.md") ?? new Map(),
		),
	);
	assert.deepEqual(clusterDocs(fixtures), []);
});

test("unrelated billing and metrics fixtures do not cluster even at the lower threshold", () => {
	assert.deepEqual(
		clusterDocs([fixture("billing.md"), fixture("metrics.md")]),
		[],
	);
	assert.deepEqual(clusterDocs(fixtures.slice(2), { threshold: 0.25 }), []);
});

test("near-verbatim prose is caught with defaults; results and ordering are deterministic", () => {
	const body =
		"Session storage expires inactive clients after thirty minutes. Authentication refresh renews the session window.";
	const docs = [
		{ id: "z", body },
		{ id: "a", body: `${body} Details.` },
		{ id: "m", body },
		{ id: "other", body: "Invoices calculate billing taxes." },
	];
	const original = structuredClone(docs);
	const result = clusterDocs(docs);
	assert.deepEqual(
		result.map((group) => group.memberIds),
		[["a", "m", "z"]],
	);
	assert.deepEqual(
		result[0]?.pairs.map((pair) => [pair.idA, pair.idB]),
		[
			["a", "m"],
			["a", "z"],
			["m", "z"],
		],
	);
	assert.deepEqual(result, clusterDocs(docs));
	assert.deepEqual(result, clusterDocs([...docs].reverse()));
	assert.deepEqual(docs, original);
});

test("sharing only a large code fence or metadata never creates a cluster", () => {
	const code =
		"\n```ts\n" +
		"const sharedNoise = enormousFunction(payload);\n".repeat(200) +
		"```";
	const metadata =
		"---\nid: common shared metadata\ntitle: shared noise\n---\n";
	assert.deepEqual(
		clusterDocs([
			{ id: "a", body: `${metadata}Oranges citrus orchard${code}` },
			{ id: "b", body: `${metadata}Database latency tracing${code}` },
		]),
		[],
	);
});

test("TF-IDF rejects identical token sets with incompatible term frequencies", () => {
	assert.deepEqual(
		clusterDocs([
			{ id: "a", body: `${"orange ".repeat(100)}database` },
			{ id: "b", body: `orange ${"database ".repeat(100)}` },
		]),
		[],
	);
});

test("connected components retain only qualifying edges and sort separate groups", () => {
	const docs = [
		{ id: "z", body: "invoice payment" },
		{ id: "y", body: "invoice payment" },
		{ id: "c", body: "tracing latency" },
		{ id: "b", body: "session storage tracing latency" },
		{ id: "a", body: "session storage" },
	];
	const clusters = clusterDocs(docs, { threshold: 0.6 });
	assert.deepEqual(
		clusters.map((group) => group.memberIds),
		[
			["a", "b", "c"],
			["y", "z"],
		],
	);
	assert.deepEqual(
		clusters[0]?.pairs.map((pair) => [pair.idA, pair.idB]),
		[
			["a", "b"],
			["b", "c"],
		],
	);
	assert.deepEqual(
		clusters,
		clusterDocs([...docs].reverse(), { threshold: 0.6 }),
	);
});

test("empty, singleton, stopword and mixed empty documents are legal", () => {
	for (const docs of [
		[],
		[{ id: "a", body: "" }],
		[{ id: "a", body: "session storage" }],
		[
			{ id: "a", body: "the and are" },
			{ id: "b", body: "and the" },
		],
		[
			{ id: "a", body: "" },
			{ id: "b", body: "session" },
		],
	])
		assert.deepEqual(clusterDocs(docs), []);
});

test("options are validated and threshold endpoints do not cluster unrelated content", () => {
	for (const threshold of [-1, 2, Number.NaN, Number.POSITIVE_INFINITY])
		assert.throws(() => clusterDocs([], { threshold }), RangeError);
	assert.throws(() => clusterDocs([], { numHashes: 0 }), RangeError);
	assert.throws(
		() =>
			clusterDocs([
				{ id: "same", body: "" },
				{ id: "same", body: "" },
			]),
		RangeError,
	);
	assert.deepEqual(
		clusterDocs(
			[
				{ id: "a", body: "orange" },
				{ id: "b", body: "database" },
			],
			{ threshold: 0 },
		),
		[],
	);
	const docs = [
		{ id: "a", body: "session storage" },
		{ id: "b", body: "session storage" },
	];
	for (const numHashes of [16, 256]) {
		assert.deepEqual(
			clusterDocs(docs, { numHashes }),
			clusterDocs([...docs].reverse(), { numHashes }),
		);
		assert.equal(clusterDocs(docs, { numHashes, threshold: 1 }).length, 1);
	}
});
