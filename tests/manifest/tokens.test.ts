import assert from "node:assert/strict";
import test from "node:test";
import { estimateTokens } from "../../src/manifest/tokens.js";

test("ceil UTF-16 characters / 4, deterministic including empty and Unicode", () => {
	for (const text of [
		"",
		"a",
		"abcd",
		"abcde",
		"😀",
		"你好世界",
		"x".repeat(1001),
	]) {
		assert.equal(estimateTokens(text), Math.ceil(text.length / 4));
		assert.equal(estimateTokens(text), estimateTokens(text));
	}
});
