import assert from "node:assert/strict";
import test from "node:test";
import { buildRegistry } from "../../src/llm/registry.js";
import type { ProviderConfig } from "../../src/llm/types.js";
import { config, FakeProvider, providerConfig } from "./fake-provider.js";

for (const type of [
	"openai-compatible",
	"anthropic-compatible",
	"gemini",
	"bedrock",
	"custom",
] satisfies ProviderConfig["type"][]) {
	test(`local-only never invokes ${type} network factory`, () => {
		let calls = 0;
		const registry = buildRegistry(
			config([
				providerConfig("remote", { type, baseUrl: "https://api.example.com" }),
			]),
			{
				[type]: () => {
					calls++;
					return new FakeProvider("remote");
				},
			},
		);
		assert.equal(calls, 0);
		assert.equal(registry.providers.size, 0);
		assert.equal(registry.events[0]?.detail, "network_denied");
	});
	if (type !== "custom") {
		test(`absent ${type} endpoint defaults to network`, () => {
			let calls = 0;
			const registry = buildRegistry(
				config([providerConfig("remote", { type })]),
				{
					[type]: () => {
						calls++;
						return new FakeProvider("remote");
					},
				},
			);
			assert.equal(calls, 0);
			assert.equal(registry.providers.size, 0);
		});
	}
}

for (const baseUrl of [
	"http://localhost:11434/v1",
	"https://LOCALHOST:8080",
	"http://127.0.0.1/v1",
	"http://[::1]:8080/v1",
]) {
	test(`loopback ${baseUrl} is constructed`, () => {
		let calls = 0;
		const registry = buildRegistry(
			config([providerConfig("local", { baseUrl })]),
			{
				custom: () => {
					calls++;
					return new FakeProvider("local");
				},
			},
		);
		assert.equal(calls, 1);
		assert.equal(registry.providers.get("local")?.network, false);
	});
}

for (const baseUrl of [
	"",
	"not a URL",
	"//localhost/v1",
	"file:///tmp/model",
	"ftp://localhost",
	"https://localhost.evil.example",
	"https://localhost@evil.example",
	"http://[::ffff:127.0.0.1]",
	"https://localhost.",
]) {
	test(`ambiguous/nonlocal endpoint fails closed: ${baseUrl}`, () => {
		let calls = 0;
		buildRegistry(config([providerConfig("bad", { baseUrl })]), {
			custom: () => {
				calls++;
				return new FakeProvider("bad");
			},
		});
		assert.equal(calls, 0);
	});
}

test("gate precedes factory lookup, not just invocation", () => {
	let reads = 0;
	const factories = Object.defineProperty({}, "custom", {
		get: () => {
			reads++;
			throw new Error("factory accessed");
		},
	});
	buildRegistry(
		config([providerConfig("remote", { baseUrl: "https://remote.example" })]),
		factories,
	);
	assert.equal(reads, 0);
});

test("disabled providers are never constructed, even with network enabled", () => {
	let calls = 0;
	const cfg = config([providerConfig("disabled", { enabled: false })]);
	cfg.allowNetworkProviders = true;
	buildRegistry(cfg, {
		custom: () => {
			calls++;
			return new FakeProvider("disabled");
		},
	});
	assert.equal(calls, 0);
});

test("explicit network opt-in constructs the remote adapter", () => {
	const cfg = config([
		providerConfig("remote", { baseUrl: "https://remote.example" }),
	]);
	cfg.allowNetworkProviders = true;
	const registry = buildRegistry(cfg, {
		custom: () => new FakeProvider("remote"),
	});
	assert.equal(registry.providers.get("remote")?.network, true);
});

test("missing/throwing factories and mismatched ids degrade to diagnostics", () => {
	for (const factories of [
		{},
		{
			custom: () => {
				throw new Error("secret");
			},
		},
		{ custom: () => new FakeProvider("wrong") },
	]) {
		const registry = buildRegistry(
			config([providerConfig("local")]),
			factories,
		);
		assert.equal(registry.providers.size, 0);
		assert.equal(registry.events.length, 1);
		assert.doesNotMatch(JSON.stringify(registry.events), /secret/);
	}
});

test("duplicate ids never invoke a factory", () => {
	let calls = 0;
	buildRegistry(config([providerConfig("same"), providerConfig("same")]), {
		custom: () => {
			calls++;
			return new FakeProvider("same");
		},
	});
	assert.equal(calls, 0);
});

test("config and adapter copies cannot mutate caller policy; logging is isolated", () => {
	const cfg = config([providerConfig("local")]);
	const registry = buildRegistry(
		cfg,
		{
			custom: (entry) => {
				entry.allowedTasks.push("doc_rewrite_draft");
				return new FakeProvider(entry.id);
			},
		},
		{
			onEvent: () => {
				throw new Error("sink failure");
			},
		},
	);
	cfg.providers[0]?.allowedTasks.push("draft_missing_docs");
	assert.deepEqual(registry.providers.get("local")?.config.allowedTasks, [
		"classify_docs",
	]);
	assert.doesNotThrow(() => registry.log({ kind: "skipped", detail: "test" }));
	assert.equal(registry.events.length, 1);
});
