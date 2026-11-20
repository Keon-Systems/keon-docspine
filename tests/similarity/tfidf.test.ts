import assert from "node:assert/strict";
import test from "node:test";
import { buildTfIdf, cosineSimilarity } from "../../src/similarity/tfidf.js";

test("smoothed IDF and raw term frequency have known weights", () => {
	const model = buildTfIdf([
		{ id: "a", tokens: ["shared", "rare", "rare"] },
		{ id: "b", tokens: ["shared"] },
	]);
	assert.equal(model.idf.get("shared"), 1);
	assert.equal(model.idf.get("rare"), Math.log(3 / 2) + 1);
	assert.equal(model.vectors.get("a")?.get("rare"), 2 * (Math.log(3 / 2) + 1));
	assert.equal(model.vectors.get("b")?.get("shared"), 1);
});

test("cosine handles known vectors, orthogonality, symmetry, and zero", () => {
	const a = new Map([
		["x", 3],
		["y", 4],
	]);
	const b = new Map([["x", 1]]);
	assert.equal(cosineSimilarity(a, b), 0.6);
	assert.equal(cosineSimilarity(b, a), 0.6);
	assert.equal(cosineSimilarity(a, a), 1);
	assert.equal(cosineSimilarity(a, new Map([["z", 1]])), 0);
	assert.equal(cosineSimilarity(new Map(), a), 0);
	assert.equal(cosineSimilarity(new Map(), new Map()), 0);
});

test("empty corpora, empty documents, and duplicate IDs", () => {
	assert.equal(buildTfIdf([]).vectors.size, 0);
	const empty = buildTfIdf([{ id: "empty", tokens: [] }]);
	assert.equal(empty.vectors.get("empty")?.size, 0);
	assert.throws(
		() =>
			buildTfIdf([
				{ id: "a", tokens: [] },
				{ id: "a", tokens: [] },
			]),
		RangeError,
	);
});

test("model is order independent and leaves caller input intact", () => {
	const docs = [
		{ id: "b", tokens: ["z", "a", "z"] },
		{ id: "a", tokens: ["z", "b"] },
	];
	const original = structuredClone(docs);
	assert.deepEqual(
		buildTfIdf(docs),
		buildTfIdf(
			[...docs]
				.reverse()
				.map((doc) => ({ ...doc, tokens: [...doc.tokens].reverse() })),
		),
	);
	assert.deepEqual(docs, original);
});
