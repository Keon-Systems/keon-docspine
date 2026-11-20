import type {
	CapabilitySet,
	TaskKind,
	TaskRequest,
} from "../contracts/provider.js";
import type { RouterConfig } from "./types.js";

const TASK_TIERS = {
	classify_docs: "T1",
	detect_duplicates: "T1",
	detect_contradictions: "T1",
	summarize_stale_docs: "T1",
	cleanup_recommendations: "T1",
	pr_review_comments: "T1",
	draft_missing_docs: "T2",
	doc_rewrite_draft: "T2",
	context_packet_generation: "T2",
} as const satisfies Record<TaskKind, "T1" | "T2">;

/** Deferred is a report, not a persistent queue (which belongs to W3). */
export function budgetDetail(task: TaskKind, detail: string): string {
	return `${TASK_TIERS[task]}:${TASK_TIERS[task] === "T2" ? "deferred" : "shed"}: ${detail}`;
}

export interface BudgetReservation {
	readonly usd: number;
	/** Omitted/invalid actual cost, including a failed call, charges the reserve. */
	settle(actualUsd?: number): void;
}

export type BudgetDecision =
	| { allowed: true; reservation: BudgetReservation }
	| { allowed: false; detail: string };

function nonnegative(value: number): boolean {
	return Number.isFinite(value) && value >= 0;
}

const NANOS_PER_USD = 1_000_000_000n;

/** Decimal number text -> integer nanodollars, without binary-float sums.
 * Costs round up; ceilings round down, so sub-nanodollar values fail safely.
 */
function nanos(usd: number, roundUp = true): bigint {
	const [mantissa = "0", exponent = "0"] = usd.toString().split("e");
	const [whole = "0", fraction = ""] = mantissa.split(".");
	const digits = BigInt(whole + fraction);
	const shift = 9 + Number(exponent) - fraction.length;
	if (shift >= 0) return digits * 10n ** BigInt(shift);
	const divisor = 10n ** BigInt(-shift);
	return (digits + (roundUp ? divisor - 1n : 0n)) / divisor;
}

function dollars(value: bigint): number {
	return Number(value) / Number(NANOS_PER_USD);
}

/**
 * Run-scoped, synchronous reservations prevent concurrent dispatches from
 * spending the same headroom. Failed calls retain their full reservation:
 * a rejected adapter Promise does not prove the vendor did not charge.
 */
export class BudgetTracker {
	#runUsd = 0n;
	#monthUsd = 0n;
	#reservedUsd = 0n;
	readonly #limits: RouterConfig["budgets"];
	readonly #valid: boolean;

	constructor(limits: RouterConfig["budgets"], monthToDateUsd = 0) {
		this.#limits = { ...limits };
		this.#valid =
			nonnegative(monthToDateUsd) &&
			[limits.perRunUsd, limits.perMonthUsd].every(
				(limit) => limit === undefined || nonnegative(limit),
			);
		if (this.#valid) this.#monthUsd = nanos(monthToDateUsd);
	}

	get usage(): { runUsd: number; monthUsd: number; reservedUsd: number } {
		return {
			runUsd: dollars(this.#runUsd),
			monthUsd: dollars(this.#monthUsd),
			reservedUsd: dollars(this.#reservedUsd),
		};
	}

	reserve(req: TaskRequest, capabilities: CapabilitySet): BudgetDecision {
		const { maxInputTokens, maxOutputTokens, maxUsd } = req.budget;
		const limits = [this.#limits.perRunUsd, this.#limits.perMonthUsd];
		if (
			!Number.isSafeInteger(maxInputTokens) ||
			maxInputTokens < 0 ||
			!Number.isSafeInteger(maxOutputTokens) ||
			maxOutputTokens < 0 ||
			(maxUsd !== undefined && !nonnegative(maxUsd)) ||
			!this.#valid
		) {
			return { allowed: false, detail: "invalid_budget" };
		}

		const price = capabilities.costUsdPer1kTokens;
		// An explicit adapter-enforced cap is the strongest upper bound. Without
		// one, use the maximum allowed tokens, never an optimistic token estimate.
		let amount = maxUsd === undefined ? undefined : nanos(maxUsd);
		if (amount === undefined && price !== undefined && nonnegative(price)) {
			amount =
				((BigInt(maxInputTokens) + BigInt(maxOutputTokens)) * nanos(price) +
					999n) /
				1000n;
		}
		if (amount === undefined) {
			if (limits.some((limit) => limit !== undefined)) {
				return {
					allowed: false,
					detail: "unknown_cost: set maxUsd or pin pricing",
				};
			}
			amount = 0n; // Unbounded run: still account for actual cost when supplied.
		}

		for (const [limit, spent, label] of [
			[this.#limits.perRunUsd, this.#runUsd, "per_run"],
			[this.#limits.perMonthUsd, this.#monthUsd, "per_month"],
		] as const) {
			if (
				limit !== undefined &&
				spent + this.#reservedUsd + amount > nanos(limit, false)
			) {
				return { allowed: false, detail: `${label}_ceiling` };
			}
		}

		this.#reservedUsd += amount;
		const reserved = amount;
		let settled = false;
		return {
			allowed: true,
			reservation: {
				usd: dollars(reserved),
				settle: (actualUsd) => {
					if (settled) return;
					settled = true;
					const charged =
						actualUsd !== undefined && nonnegative(actualUsd)
							? nanos(actualUsd)
							: reserved;
					this.#reservedUsd -= reserved;
					this.#runUsd += charged;
					this.#monthUsd += charged;
				},
			},
		};
	}
}
