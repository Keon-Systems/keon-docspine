import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderErrorCode } from "../../src/contracts/errors.js";
import type { TaskKind } from "../../src/contracts/provider.js";
import { buildRegistry, routeTask } from "../../src/llm/router.js";
import {
	config,
	FakeProvider,
	factories,
	providerConfig,
	request,
} from "./fake-provider.js";

function setup() {
	const first = new FakeProvider("first");
	const second = new FakeProvider("second");
	const cfg = config([providerConfig(first.id), providerConfig(second.id)]);
	cfg.routing.classify_docs = {
		prefer: [second.id, first.id],
		onNoProvider: "skip_and_log",
	};
	return { first, second, cfg };
}

test("preference order is authoritative and a success is always advisory", async () => {
	const { first, second, cfg } = setup();
	const outcome = await routeTask(
		buildRegistry(cfg, factories(first, second)),
		request(),
	);
	assert.equal(outcome.kind, "dispatched");
	if (outcome.kind !== "dispatched") return;
	assert.equal(outcome.result.provider, second.id);
	assert.equal(outcome.result.advisory, true);
	assert.equal(first.calls.length, 0);
	assert.equal(second.calls.length, 1);
});

test("unhealthy preference falls through to the next provider", async () => {
	const { first, second, cfg } = setup();
	second.healthy = false;
	const outcome = await routeTask(
		buildRegistry(cfg, factories(first, second)),
		request(),
	);
	assert.equal(
		outcome.kind === "dispatched" && outcome.result.provider,
		first.id,
	);
	assert.equal(second.calls.length, 0);
	assert.equal(second.capabilityCalls, 0);
});

for (const code of [
	"provider_down",
	"rate_limited",
	"context_exceeded",
	"schema_unrecoverable",
	"network_denied",
] satisfies ProviderErrorCode[]) {
	test(`normalized ${code} falls through, then skips if all fail`, async () => {
		const { first, second, cfg } = setup();
		second.error = { code, message: "secret vendor string" };
		const registry = buildRegistry(cfg, factories(first, second));
		const outcome = await routeTask(registry, request());
		assert.equal(
			outcome.kind === "dispatched" && outcome.result.provider,
			first.id,
		);
		first.error = { code: "provider_down" };
		const skipped = await routeTask(registry, request());
		assert.equal(skipped.kind === "skipped" && skipped.reason, "no_provider");
		assert.equal("result" in skipped, false);
		assert.doesNotMatch(
			JSON.stringify(registry.events),
			/secret vendor string/,
		);
	});
}

test("allowedTasks is checked before health, capabilities or complete", async () => {
	const provider = new FakeProvider("local");
	const registry = buildRegistry(
		config([providerConfig(provider.id)]),
		factories(provider),
	);
	const outcome = await routeTask(registry, request("doc_rewrite_draft"));
	assert.equal(
		outcome.kind === "skipped" && outcome.reason,
		"task_not_permitted",
	);
	assert.equal(provider.healthCalls, 0);
	assert.equal(provider.capabilityCalls, 0);
	assert.equal(provider.calls.length, 0);
});

test("a denied preference can fall through to an explicitly permitted provider", async () => {
	const { first, second, cfg } = setup();
	const secondConfig = cfg.providers[1];
	assert.ok(secondConfig);
	secondConfig.allowedTasks = [];
	const outcome = await routeTask(
		buildRegistry(cfg, factories(first, second)),
		request(),
	);
	assert.equal(
		outcome.kind === "dispatched" && outcome.result.provider,
		first.id,
	);
	assert.equal(second.healthCalls, 0);
});

test("zero, disabled, denied-network and unhealthy providers always skip", async () => {
	const provider = new FakeProvider("local");
	provider.healthy = false;
	for (const providers of [
		[],
		[providerConfig("local", { enabled: false })],
		[providerConfig("local", { baseUrl: "https://remote.example" })],
		[providerConfig("local")],
	]) {
		const registry = buildRegistry(config(providers), factories(provider));
		const outcome = await routeTask(registry, request());
		assert.equal(outcome.kind === "skipped" && outcome.reason, "no_provider");
		assert.equal("result" in outcome, false);
		assert.equal(registry.events.at(-1)?.kind, "skipped");
	}
});

test("fallback must be explicit; unrelated configured providers are not tried", async () => {
	const { first, second, cfg } = setup();
	cfg.routing = {};
	first.healthy = false;
	let outcome = await routeTask(
		buildRegistry(cfg, factories(first, second)),
		request(),
	);
	assert.equal(outcome.kind, "skipped");
	assert.equal(second.healthCalls, 0);
	cfg.fallbackProvider = second.id;
	outcome = await routeTask(
		buildRegistry(cfg, factories(first, second)),
		request(),
	);
	assert.equal(
		outcome.kind === "dispatched" && outcome.result.provider,
		second.id,
	);
});

test("an empty explicit preference overrides the default; duplicate candidates run once", async () => {
	const provider = new FakeProvider("local");
	const cfg = config([providerConfig(provider.id)]);
	cfg.routing.classify_docs = { prefer: [], onNoProvider: "skip_and_log" };
	assert.equal(
		(await routeTask(buildRegistry(cfg, factories(provider)), request())).kind,
		"skipped",
	);
	assert.equal(provider.calls.length, 0);
	cfg.routing.classify_docs.prefer = [provider.id, provider.id];
	cfg.fallbackProvider = provider.id;
	provider.error = new Error("vendor failure");
	await routeTask(buildRegistry(cfg, factories(provider)), request());
	assert.equal(provider.calls.length, 1);
});

test("exceptions in health, discovery and diagnostics never escape", async () => {
	for (const phase of ["health", "capabilities"] as const) {
		const provider = new FakeProvider("local");
		provider[phase] = () => {
			throw new Error("private endpoint credentials");
		};
		const registry = buildRegistry(
			config([providerConfig(provider.id)]),
			factories(provider),
			{
				onEvent: () => {
					throw new Error("logging failed");
				},
			},
		);
		const outcome = await routeTask(registry, request());
		assert.equal(outcome.kind === "skipped" && outcome.reason, "no_provider");
		assert.doesNotMatch(JSON.stringify(registry.events), /credentials/);
	}
});

test("throwing error accessors and Proxy traps still allow explicit fallback", async () => {
	for (const error of [
		Object.defineProperty({}, "code", {
			get: () => {
				throw new Error("getter");
			},
		}),
		new Proxy(
			{},
			{
				has: () => {
					throw new Error("proxy");
				},
			},
		),
	]) {
		const { first, second, cfg } = setup();
		second.error = error;
		const outcome = await routeTask(
			buildRegistry(cfg, factories(first, second)),
			request(),
		);
		assert.equal(
			outcome.kind === "dispatched" && outcome.result.provider,
			first.id,
		);
	}
});

test("complete pinned capabilities skip discovery and partial pins override it", async () => {
	const provider = new FakeProvider("local");
	let registry = buildRegistry(
		config([
			providerConfig(provider.id, { pinnedCapabilities: provider.caps }),
		]),
		factories(provider),
	);
	assert.equal((await routeTask(registry, request())).kind, "dispatched");
	assert.equal(provider.capabilityCalls, 0);
	registry = buildRegistry(
		config([
			providerConfig(provider.id, {
				pinnedCapabilities: { maxUsableContext: 1 },
			}),
		]),
		factories(provider),
	);
	assert.equal((await routeTask(registry, request())).kind, "skipped");
	assert.equal(provider.capabilityCalls, 1);
	assert.equal(provider.calls.length, 1);
});

test("context floor and evidence-task mismatch prevent completion", async () => {
	for (const invalid of ["context", "task", "temperature"]) {
		const provider = new FakeProvider("local");
		const req = request();
		if (invalid === "context") provider.caps.maxUsableContext = 100;
		if (invalid === "task") req.evidence.task = "doc_rewrite_draft";
		if (invalid === "temperature")
			Object.assign(req.determinismHints, { temperature: 1 });
		assert.equal(
			(
				await routeTask(
					buildRegistry(
						config([providerConfig(provider.id)]),
						factories(provider),
					),
					req,
				)
			).kind,
			"skipped",
		);
		assert.equal(provider.calls.length, 0);
	}
});

test("remote redaction is fail-closed and checks source fields, not just the flag", async () => {
	for (const source of [
		"flag",
		"body",
		"snippet",
		"hunk",
		"summary",
		"safe",
		"optout",
	]) {
		const provider = new FakeProvider("remote");
		const cfg = config([
			providerConfig(provider.id, { baseUrl: "https://remote.example" }),
		]);
		cfg.allowNetworkProviders = true;
		cfg.redactSourceBeforeRemoteCalls = source !== "optout";
		const req = request();
		req.evidence.redacted = source !== "flag";
		if (source === "body")
			req.evidence.docs = [
				{ docId: "doc", path: "doc.md", frontmatter: null, body: "private" },
			];
		if (source === "snippet")
			req.evidence.symbolSlices = [
				{ symbol: "x", path: "x.ts", line: 1, snippet: "private" },
			];
		if (source === "hunk")
			req.evidence.diffHunks = [{ path: "x.ts", hunk: "private" }];
		if (source === "summary") req.evidence.diffHunks = [{ path: "x.ts" }];
		if (source === "safe")
			req.evidence.diffHunks = [
				{ path: "x.ts", summary: "one symbol changed" },
			];
		const outcome = await routeTask(
			buildRegistry(cfg, factories(provider)),
			req,
		);
		assert.equal(
			outcome.kind,
			["safe", "optout"].includes(source) ? "dispatched" : "skipped",
		);
	}
});

test("adapter mutations do not leak to fallback or caller evidence", async () => {
	const { first, second, cfg } = setup();
	second.handler = async (req) => {
		req.evidence.docs.push({ docId: "injected", path: "x", frontmatter: null });
		throw { code: "provider_down" };
	};
	const req = request();
	assert.equal(
		(await routeTask(buildRegistry(cfg, factories(first, second)), req)).kind,
		"dispatched",
	);
	assert.deepEqual(first.calls[0]?.evidence.docs, []);
	assert.deepEqual(req.evidence.docs, []);
});

test("runtime non-advisory adapter results are never dispatched", async () => {
	const provider = new FakeProvider("local");
	provider.handler = async () =>
		Object.assign(provider.result(), { advisory: false }) as never;
	const outcome = await routeTask(
		buildRegistry(config([providerConfig(provider.id)]), factories(provider)),
		request(),
	);
	assert.equal(outcome.kind, "skipped");
	assert.equal("result" in outcome, false);
});

for (const task of [
	"classify_docs",
	"detect_duplicates",
	"detect_contradictions",
	"summarize_stale_docs",
	"cleanup_recommendations",
	"draft_missing_docs",
	"doc_rewrite_draft",
	"context_packet_generation",
	"pr_review_comments",
] satisfies TaskKind[]) {
	test(`${task} dispatched outcomes carry advisory:true`, async () => {
		const provider = new FakeProvider("local");
		const registry = buildRegistry(
			config([providerConfig(provider.id, { allowedTasks: [task] })]),
			factories(provider),
		);
		const outcome = await routeTask(registry, request(task));
		assert.equal(
			outcome.kind === "dispatched" && outcome.result.advisory,
			true,
		);
	});
}

test("repair hook receives normalized error and bounded retry function", async () => {
	const provider = new FakeProvider("local");
	provider.handler = async () => {
		if (provider.calls.length === 1)
			throw { code: "schema_unrecoverable", message: "secret" };
		return { ...provider.result(), schemaRepairAttempts: 1 };
	};
	const registry = buildRegistry(
		config([providerConfig(provider.id)]),
		factories(provider),
		{
			repair: async ({ request: req, error, retry }) => {
				assert.deepEqual(error, {
					code: "schema_unrecoverable",
					message: "schema_unrecoverable",
				});
				return retry(req);
			},
		},
	);
	const outcome = await routeTask(registry, request());
	assert.equal(
		outcome.kind === "dispatched" && outcome.result.schemaRepairAttempts,
		1,
	);
	assert.equal(provider.calls.length, 2);
});

test("repair hooks cannot fabricate results or retain a live retry callback", async () => {
	const provider = new FakeProvider("local");
	provider.error = { code: "schema_unrecoverable" };
	let savedRetry:
		| ((req: ReturnType<typeof request>) => Promise<unknown>)
		| undefined;
	const registry = buildRegistry(
		config([providerConfig(provider.id)]),
		factories(provider),
		{
			repair: async ({ retry }) => {
				savedRetry = retry;
				return provider.result();
			},
		},
	);
	assert.equal((await routeTask(registry, request())).kind, "skipped");
	assert.ok(savedRetry);
	await assert.rejects(savedRetry(request()));
	assert.equal(provider.calls.length, 1);
});

test("repair retries cannot switch to another allowed task", async () => {
	const provider = new FakeProvider("local");
	provider.error = { code: "schema_unrecoverable" };
	const registry = buildRegistry(
		config([
			providerConfig(provider.id, {
				allowedTasks: ["classify_docs", "doc_rewrite_draft"],
			}),
		]),
		factories(provider),
		{
			repair: async ({ retry }) => retry(request("doc_rewrite_draft")),
		},
	);
	assert.equal((await routeTask(registry, request())).kind, "skipped");
	assert.equal(provider.calls.length, 1);
});

test("throwing, exhausted and abandoned repairs are nonfatal", async () => {
	for (const mode of ["throw", "exhaust", "abandon"]) {
		const provider = new FakeProvider("local");
		provider.error = { code: "schema_unrecoverable" };
		const registry = buildRegistry(
			config([providerConfig(provider.id)]),
			factories(provider),
			{
				repair: async ({ request: req, retry }) => {
					if (mode === "throw") throw new Error("secret hook failure");
					if (mode === "exhaust")
						for (let i = 0; i < 4; i++) await retry(req).catch(() => undefined);
					return undefined;
				},
			},
		);
		assert.equal((await routeTask(registry, request())).kind, "skipped");
		assert.equal(provider.calls.length, mode === "exhaust" ? 3 : 1);
	}
});
