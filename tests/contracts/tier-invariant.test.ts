/**
 * The tier model (design spec §18, `docs/STRATEGY-docspine.md` §6.1) is
 * load-bearing from commit one: no T1/T2 output may ever be typed as
 * authoritative. `TaskResult.advisory` must be the literal type `true`, not
 * `boolean` — this test asserts that invariant at both the type level
 * (would fail `tsc --noEmit` if the contract regressed to `boolean`) and
 * the runtime level (the fixture actually carries `true`).
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { TaskResult } from "../../src/contracts/index.js";
import { taskResultFixture } from "./fixtures.js";

/**
 * Standard "exact type equality" helper: distributes over a generic so that
 * `Equals<boolean, true>` is `false` while `Equals<true, true>` is `true`.
 * This distinguishes the literal type `true` from the wider type `boolean`,
 * which a plain `extends`/`satisfies` check on its own cannot do (`true`
 * satisfies `boolean` just fine — that's exactly the regression this test
 * exists to catch).
 */
type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;

// Compile-time proof: fails `tsc --noEmit` if `TaskResult["advisory"]` is ever
// widened from the literal `true` to `boolean` (or narrowed/changed to anything
// else). `Equals<TaskResult["advisory"], true>` must be exactly the type
// `true` for `true satisfies ...` below to type-check.
type AdvisoryIsExactlyLiteralTrue = Equals<TaskResult["advisory"], true>;
const _advisoryIsExactlyLiteralTrue =
	true satisfies AdvisoryIsExactlyLiteralTrue;

test("TaskResult['advisory'] is the literal type `true` (compile-time proof compiled)", () => {
	// If this file compiled at all, the type-level proof above already held.
	// The runtime assertion here just keeps the proof from being dead code
	// that `tsc` could theoretically elide.
	assert.equal(_advisoryIsExactlyLiteralTrue, true);
});

test("taskResultFixture.advisory is runtime `true`", () => {
	assert.equal(taskResultFixture.advisory, true);
	assert.equal(typeof taskResultFixture.advisory, "boolean");
});

test("a value narrowed to TaskResult['advisory'] can only ever be `true`", () => {
	const advisory: TaskResult["advisory"] = taskResultFixture.advisory;
	// The type of `advisory` is `true`, not `boolean` — so this is the only
	// literal that could ever be assigned here without a type error above.
	assert.equal(advisory, true);
});
