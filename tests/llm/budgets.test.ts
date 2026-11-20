import assert from "node:assert/strict";
import test from "node:test";
import type { TaskKind } from "../../src/contracts/provider.js";
import { BudgetTracker, budgetDetail } from "../../src/llm/budgets.js";
import { buildRegistry, routeTask } from "../../src/llm/router.js";
import {
	config,
	FakeProvider,
	factories,
	providerConfig,
	request,
} from "./fake-provider.js";

for (const task of [
	"classify_docs",
	"draft_missing_docs",
] satisfies TaskKind[]) {
	test(`${task}: per-run ceiling blocks before complete with tier-aware detail`, async () => {
		const provider = new FakeProvider("local");
		const cfg = config([providerConfig(provider.id, { allowedTasks: [task] })]);
		cfg.budgets.perRunUsd = 0.1; // 1500 tokens at $0.1/1k reserves $0.15.
		const registry = buildRegistry(cfg, factories(provider));
		const outcome = await routeTask(registry, request(task));
		assert.equal(
			outcome.kind === "skipped" && outcome.reason,
			"budget_exhausted",
		);
		if (outcome.kind === "skipped") {
			assert.match(
				outcome.detail,
				task === "classify_docs" ? /^T1:shed:/ : /^T2:deferred:/,
			);
		}
		assert.equal(provider.calls.length, 0);
		assert.equal(registry.events.at(-1)?.kind, "skipped");
	});
}

test("every task has an explicit budget tier", () => {
	for (const task of [
		"classify_docs",
		"detect_duplicates",
		"detect_contradictions",
		"summarize_stale_docs",
		"cleanup_recommendations",
		"pr_review_comments",
	] satisfies TaskKind[]) {
		assert.match(budgetDetail(task, "test"), /^T1:shed:/);
	}
	for (const task of [
		"draft_missing_docs",
		"doc_rewrite_draft",
		"context_packet_generation",
	] satisfies TaskKind[]) {
		assert.match(budgetDetail(task, "test"), /^T2:deferred:/);
	}
});

test("per-month ceiling includes supplied month-to-date spend", async () => {
	const provider = new FakeProvider("local");
	const cfg = config([providerConfig(provider.id)]);
	cfg.budgets = { perRunUsd: 10, perMonthUsd: 1 };
	const registry = buildRegistry(cfg, factories(provider), {
		monthToDateUsd: 0.9,
	});
	const outcome = await routeTask(registry, request());
	assert.equal(
		outcome.kind === "skipped" && outcome.reason,
		"budget_exhausted",
	);
	if (outcome.kind === "skipped")
		assert.match(outcome.detail, /per_month_ceiling/);
	assert.equal(provider.calls.length, 0);
});

test("exact ceiling is allowed; actual cost replaces reserve and blocks subsequent calls", async () => {
	const provider = new FakeProvider("local");
	provider.costUsd = 0.15;
	const cfg = config([providerConfig(provider.id)]);
	cfg.budgets.perRunUsd = 0.15;
	const registry = buildRegistry(cfg, factories(provider));
	assert.equal((await routeTask(registry, request())).kind, "dispatched");
	assert.deepEqual(registry.budgets.usage, {
		runUsd: 0.15,
		monthUsd: 0.15,
		reservedUsd: 0,
	});
	assert.equal((await routeTask(registry, request())).kind, "skipped");
	assert.equal(provider.calls.length, 1);
});

test("decimal additions do not reject exact per-month ceilings", () => {
	const tracker = new BudgetTracker({ perMonthUsd: 0.3 }, 0.1);
	const req = request();
	req.budget.maxUsd = 0.2;
	const decision = tracker.reserve(req, new FakeProvider("local").caps);
	assert.equal(decision.allowed, true);
	if (!decision.allowed) return;
	decision.reservation.settle(0.2);
	assert.equal(tracker.usage.monthUsd, 0.3);
});

test("sub-nanodollar costs round up and ceilings round down", () => {
	const tracker = new BudgetTracker({ perRunUsd: 0.0000000009 });
	const req = request();
	req.budget.maxUsd = 0.0000000001;
	assert.equal(
		tracker.reserve(req, new FakeProvider("local").caps).allowed,
		false,
	);
});

test("unpriced bounded calls fail closed unless an explicit adapter-enforced maxUsd exists", async () => {
	const provider = new FakeProvider("local");
	delete provider.caps.costUsdPer1kTokens;
	const cfg = config([providerConfig(provider.id)]);
	cfg.budgets.perRunUsd = 0.2;
	const registry = buildRegistry(cfg, factories(provider));
	assert.equal((await routeTask(registry, request())).kind, "skipped");
	assert.equal(provider.calls.length, 0);
	const req = request();
	req.budget.maxUsd = 0.1;
	assert.equal((await routeTask(registry, req)).kind, "dispatched");
	assert.equal(provider.calls[0]?.budget.maxUsd, 0.1);
});

test("zero-cost local calls work with a zero-dollar budget", async () => {
	const provider = new FakeProvider("local");
	provider.caps.costUsdPer1kTokens = 0;
	provider.costUsd = 0;
	const cfg = config([providerConfig(provider.id)]);
	cfg.budgets = { perRunUsd: 0, perMonthUsd: 0 };
	assert.equal(
		(await routeTask(buildRegistry(cfg, factories(provider)), request())).kind,
		"dispatched",
	);
});

test("unbounded unpriced calls still account for actual spend", async () => {
	const provider = new FakeProvider("local");
	delete provider.caps.costUsdPer1kTokens;
	const registry = buildRegistry(
		config([providerConfig(provider.id)]),
		factories(provider),
	);
	assert.equal((await routeTask(registry, request())).kind, "dispatched");
	assert.equal(registry.budgets.usage.runUsd, 0.1);
});

test("concurrent calls cannot reserve the same remaining headroom", async () => {
	const provider = new FakeProvider("local");
	let release!: () => void;
	let started!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const entered = new Promise<void>((resolve) => {
		started = resolve;
	});
	provider.handler = async () => {
		started();
		await gate;
		return provider.result();
	};
	const cfg = config([providerConfig(provider.id)]);
	cfg.budgets.perRunUsd = 0.2;
	const registry = buildRegistry(cfg, factories(provider));
	const first = routeTask(registry, request());
	await entered;
	assert.equal(registry.budgets.usage.reservedUsd, 0.15);
	try {
		const second = await routeTask(registry, request());
		assert.equal(
			second.kind === "skipped" && second.reason,
			"budget_exhausted",
		);
		assert.equal(provider.calls.length, 1);
	} finally {
		release();
	}
	assert.equal((await first).kind, "dispatched");
	assert.equal(registry.budgets.usage.reservedUsd, 0);
});

test("failed attempts retain their reserve before fallback", async () => {
	const first = new FakeProvider("first");
	const second = new FakeProvider("second");
	first.error = { code: "provider_down" };
	const cfg = config([providerConfig(first.id), providerConfig(second.id)]);
	cfg.fallbackProvider = second.id;
	cfg.budgets.perRunUsd = 0.2;
	const registry = buildRegistry(cfg, factories(first, second));
	const outcome = await routeTask(registry, request());
	assert.equal(
		outcome.kind === "skipped" && outcome.reason,
		"budget_exhausted",
	);
	assert.equal(first.calls.length, 1);
	assert.equal(second.calls.length, 0);
	assert.equal(registry.budgets.usage.runUsd, 0.15);
});

test("budget-blocked expensive preference can fall back to an affordable provider", async () => {
	const first = new FakeProvider("first");
	const second = new FakeProvider("second");
	second.caps.costUsdPer1kTokens = 0;
	second.costUsd = 0;
	const cfg = config([providerConfig(first.id), providerConfig(second.id)]);
	cfg.budgets.perRunUsd = 0;
	cfg.fallbackProvider = second.id;
	const outcome = await routeTask(
		buildRegistry(cfg, factories(first, second)),
		request(),
	);
	assert.equal(
		outcome.kind === "dispatched" && outcome.result.provider,
		second.id,
	);
	assert.equal(first.calls.length, 0);
});

test("repair retries pass through pre-call budgeting", async () => {
	const provider = new FakeProvider("local");
	provider.error = { code: "schema_unrecoverable" };
	const cfg = config([providerConfig(provider.id)]);
	cfg.budgets.perRunUsd = 0.2;
	const registry = buildRegistry(cfg, factories(provider), {
		repair: async ({ request: req, retry }) => retry(req),
	});
	const outcome = await routeTask(registry, request());
	assert.equal(
		outcome.kind === "skipped" && outcome.reason,
		"budget_exhausted",
	);
	assert.equal(provider.calls.length, 1);
});

test("invalid limits, token counts and per-call caps fail closed", () => {
	const caps = new FakeProvider("local").caps;
	for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
		for (const field of [
			"maxUsd",
			"maxInputTokens",
			"maxOutputTokens",
		] as const) {
			const req = request();
			req.budget[field] = value;
			assert.equal(new BudgetTracker({}).reserve(req, caps).allowed, false);
		}
		assert.equal(
			new BudgetTracker({ perRunUsd: value }).reserve(request(), caps).allowed,
			false,
		);
		assert.equal(
			new BudgetTracker({ perMonthUsd: value }).reserve(request(), caps)
				.allowed,
			false,
		);
		assert.equal(
			new BudgetTracker({}, value).reserve(request(), caps).allowed,
			false,
		);
	}
});

test("missing/invalid actual cost retains reserve; settlement is idempotent", () => {
	for (const actual of [undefined, Number.NaN, -1]) {
		const tracker = new BudgetTracker({ perRunUsd: 1 });
		const decision = tracker.reserve(request(), new FakeProvider("local").caps);
		assert.equal(decision.allowed, true);
		if (!decision.allowed) continue;
		decision.reservation.settle(actual);
		decision.reservation.settle(0);
		assert.deepEqual(tracker.usage, {
			runUsd: 0.15,
			monthUsd: 0.15,
			reservedUsd: 0,
		});
	}
});

test("an adapter reporting more than its reserve consumes future headroom", () => {
	const tracker = new BudgetTracker({ perRunUsd: 1 });
	const caps = new FakeProvider("local").caps;
	const decision = tracker.reserve(request(), caps);
	if (!decision.allowed) assert.fail("expected reservation");
	decision.reservation.settle(2);
	assert.equal(tracker.usage.runUsd, 2);
	assert.equal(tracker.reserve(request(), caps).allowed, false);
});
