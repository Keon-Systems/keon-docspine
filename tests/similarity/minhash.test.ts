import assert from "node:assert/strict";
import test from "node:test";
import {
	jaccardEstimate,
	minhashSignature,
} from "../../src/similarity/minhash.js";

const a = Array.from({ length: 100 }, (_, i) => `term${i}`);
const b = Array.from({ length: 100 }, (_, i) => `term${i + 50}`);

test("MinHash is deterministic and ignores token order and multiplicity", () => {
	const input = [...a];
	const signature = minhashSignature(input, 128);
	assert.deepEqual(signature, minhashSignature(a, 128));
	assert.deepEqual(
		signature,
		minhashSignature([...a].reverse().concat(a), 128),
	);
	assert.deepEqual(input, a);
	assert.equal(jaccardEstimate(signature, signature), 1);
	assert.ok(
		signature.every(
			(value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff,
		),
	);
});

test("estimated Jaccard approximates known intersection 50 / union 150", () => {
	for (const count of [128, 512]) {
		const estimate = jaccardEstimate(
			minhashSignature(a, count),
			minhashSignature(b, count),
		);
		assert.ok(Math.abs(estimate - 1 / 3) < 0.1, `${count}: ${estimate}`);
	}
});

test("hash count changes resolution with stable signature prefixes", () => {
	const small = minhashSignature(a, 16);
	const large = minhashSignature(a, 256);
	assert.equal(small.length, 16);
	assert.equal(large.length, 256);
	assert.deepEqual(small, large.slice(0, 16));
	assert.deepEqual(large, minhashSignature(a, 256));
});

test("empty inputs are zero similarity, invalid sizes are rejected", () => {
	assert.deepEqual(minhashSignature([], 128), []);
	assert.equal(jaccardEstimate([], []), 0);
	assert.equal(jaccardEstimate([], [1, 2]), 0);
	assert.equal(jaccardEstimate([1, 2], []), 0);
	assert.throws(() => jaccardEstimate([1], [1, 2]), RangeError);
	for (const count of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
		assert.throws(() => minhashSignature([], count), RangeError);
});
