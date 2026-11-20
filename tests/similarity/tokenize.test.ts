import assert from "node:assert/strict";
import test from "node:test";
import { tokenizeDoc } from "../../src/similarity/tokenize.js";

test("lowercases, splits punctuation, keeps frequency, drops short words and stopwords", () => {
	assert.deepEqual(
		tokenizeDoc("The SESSION-store is a session store! ab 30 abc123"),
		["session", "store", "session", "store", "abc123"],
	);
	assert.deepEqual(tokenizeDoc(""), []);
	assert.deepEqual(tokenizeDoc("the and are should"), []);
});

test("strips frontmatter and URLs but preserves link labels and headings", () => {
	const body =
		"\uFEFF---\r\nid: secretmetadata\r\n---\r\n# Sessions\r\n[guide](https://example.com/hiddenpath) <http://noise.test/secret> www.example.org\r\n";
	assert.deepEqual(tokenizeDoc(body), ["sessions", "guide"]);
	assert.deepEqual(tokenizeDoc("---\nunfinished: metadata"), []);
	assert.deepEqual(tokenizeDoc("---\nsecret: value\n...\nvisible"), [
		"visible",
	]);
});

test("URLs do not consume adjacent labels or following prose", () => {
	assert.deepEqual(
		tokenizeDoc("[alpha](https://a.test)[beta](https://b.test)gamma"),
		["alpha", "beta", "gamma"],
	);
});

test("strips backtick and tilde fences, longer delimiters, and unclosed fences", () => {
	const body = [
		"before",
		"````md",
		"```js",
		"hidden",
		"```",
		"````",
		"middle",
		"  ~~~js",
		"hidden",
		"  ~~~~",
		"after",
		"```",
		"hidden",
	].join("\n");
	assert.deepEqual(tokenizeDoc(body), ["before", "middle", "after"]);
});

test("does not mistake a shorter backtick run for a multi-backtick closer", () => {
	assert.deepEqual(tokenizeDoc("alpha ``hidden ` stillhidden`` beta"), [
		"alpha",
		"beta",
	]);
});

test("strips inline code including multi-backtick spans without joining words", () => {
	assert.deepEqual(
		tokenizeDoc("alpha`hidden`beta and ``code ` nested` value`` gamma"),
		["alpha", "beta", "gamma"],
	);
});
