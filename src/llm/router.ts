import type { ProviderError } from "../contracts/errors.js";
import type {
	CapabilitySet,
	TaskRequest,
	TaskResult,
} from "../contracts/provider.js";
import { budgetDetail } from "./budgets.js";
import type {
	ProviderRegistry,
	RegisteredProvider,
	RouteOutcome,
	RouterEvent,
} from "./types.js";

export { buildRegistry } from "./registry.js";

const ERROR_CODES = new Set([
	"rate_limited",
	"context_exceeded",
	"schema_unrecoverable",
	"network_denied",
	"provider_down",
]);

function normalizedError(error: unknown): ProviderError {
	if (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		typeof error.code === "string" &&
		ERROR_CODES.has(error.code)
	) {
		// Do not inspect vendor messages or causes, including when logging.
		return { code: error.code as ProviderError["code"], message: error.code };
	}
	return { code: "provider_down", message: "unexpected_provider_failure" };
}

function log(registry: ProviderRegistry, event: RouterEvent): void {
	try {
		registry.log(event);
	} catch {
		// Even an injected diagnostics sink cannot break the non-throwing API.
	}
}

function skip(
	registry: ProviderRegistry,
	reason: Extract<RouteOutcome, { kind: "skipped" }>["reason"],
	detail: string,
): RouteOutcome {
	log(registry, { kind: "skipped", detail: `${reason}: ${detail}` });
	return { kind: "skipped", reason, detail };
}

class BudgetBlocked extends Error {}

/** Reject unredacted remote evidence; packet construction belongs to Batch B. */
function checkRequest(
	entry: RegisteredProvider,
	registry: ProviderRegistry,
	req: TaskRequest,
	caps: CapabilitySet,
): void {
	if (
		req.task !== req.evidence.task ||
		!entry.config.allowedTasks.includes(req.task) ||
		req.determinismHints.temperature !== 0
	) {
		throw { code: "network_denied" };
	}
	if (
		entry.network &&
		registry.config.redactSourceBeforeRemoteCalls &&
		(!req.evidence.redacted ||
			req.evidence.docs.some((doc) => doc.body !== undefined) ||
			req.evidence.symbolSlices.some((slice) => slice.snippet !== undefined) ||
			req.evidence.diffHunks.some(
				(hunk) => hunk.hunk !== undefined || hunk.summary === undefined,
			))
	) {
		throw { code: "network_denied" };
	}
	if (
		!Number.isFinite(caps.maxUsableContext) ||
		caps.maxUsableContext <= 0 ||
		req.budget.maxInputTokens + req.budget.maxOutputTokens >
			caps.maxUsableContext
	) {
		throw { code: "context_exceeded" };
	}
}

async function capabilities(entry: RegisteredProvider): Promise<CapabilitySet> {
	const pinned = entry.config.pinnedCapabilities;
	// A complete pinned floor avoids discovery calls in air-gapped installs.
	if (
		pinned?.jsonSchema !== undefined &&
		pinned.maxUsableContext !== undefined &&
		pinned.embeddings !== undefined
	) {
		return pinned as CapabilitySet;
	}
	return { ...(await entry.provider.capabilities()), ...pinned };
}

async function dispatch(
	registry: ProviderRegistry,
	entry: RegisteredProvider,
	request: TaskRequest,
	caps: CapabilitySet,
): Promise<TaskResult> {
	let retries = 0;
	let budgetFailure: BudgetBlocked | undefined;
	const complete = async (req: TaskRequest): Promise<TaskResult> => {
		if (req.task !== request.task) throw { code: "network_denied" };
		checkRequest(entry, registry, req, caps);
		const decision = registry.budgets.reserve(req, caps);
		if (!decision.allowed) {
			budgetFailure = new BudgetBlocked(decision.detail);
			throw budgetFailure;
		}
		try {
			const result = await entry.provider.complete(structuredClone(req));
			decision.reservation.settle(result.usage.costUsd);
			if (result.advisory !== true) throw { code: "schema_unrecoverable" };
			return result;
		} finally {
			// Idempotent: failed calls conservatively consume the reservation.
			decision.reservation.settle();
		}
	};
	try {
		return await complete(request);
	} catch (error) {
		if (error instanceof BudgetBlocked) throw error;
		const failure = normalizedError(error);
		if (failure.code !== "schema_unrecoverable" || !registry.repair) {
			throw failure;
		}
		let active = true;
		const successfulRetries = new Set<TaskResult>();
		try {
			const repaired = await registry.repair({
				request: structuredClone(request),
				error: failure,
				retry: async (req) => {
					if (!active || ++retries > 2) {
						throw { code: "schema_unrecoverable" };
					}
					const result = await complete(req);
					successfulRetries.add(result);
					return result;
				},
			});
			// A hook cannot turn failure into plausible invented output. A repaired
			// result must have come from one of its budgeted adapter completions.
			if (repaired?.advisory === true && successfulRetries.has(repaired)) {
				return { ...repaired, schemaRepairAttempts: retries };
			}
			throw budgetFailure ?? failure;
		} finally {
			active = false;
		}
	}
}

async function route(
	registry: ProviderRegistry,
	req: TaskRequest,
): Promise<RouteOutcome> {
	const config = registry.config;
	const preferred = config.routing[req.task]?.prefer;
	const ids = new Set([
		...(preferred ?? (config.defaultProvider ? [config.defaultProvider] : [])),
		...(config.fallbackProvider ? [config.fallbackProvider] : []),
	]);
	let denied = false;
	let permitted = false;
	let budgetFailure: string | undefined;
	for (const id of ids) {
		const entry = registry.providers.get(id);
		if (!entry) continue;
		// A permission-denied packet must never reach health, probing or complete.
		if (!entry.config.allowedTasks.includes(req.task)) {
			denied = true;
			continue;
		}
		permitted = true;
		try {
			if (!(await entry.provider.health()).healthy) {
				log(registry, {
					kind: "provider_unavailable",
					providerId: id,
					task: req.task,
					detail: "unhealthy",
				});
				continue;
			}
			const result = await dispatch(
				registry,
				entry,
				req,
				await capabilities(entry),
			);
			return { kind: "dispatched", result };
		} catch (error) {
			if (error instanceof BudgetBlocked) {
				budgetFailure = error.message;
			} else {
				const failure = normalizedError(error);
				log(registry, {
					kind: "provider_error",
					providerId: id,
					task: req.task,
					code: failure.code,
					detail: failure.message,
				});
			}
		}
	}
	if (budgetFailure) {
		return skip(
			registry,
			"budget_exhausted",
			budgetDetail(req.task, budgetFailure),
		);
	}
	if (denied && !permitted) {
		return skip(
			registry,
			"task_not_permitted",
			"task absent from allowedTasks",
		);
	}
	return skip(
		registry,
		"no_provider",
		"no healthy, eligible provider completed the task",
	);
}

/** All failures are advisory-soft; a skipped outcome never contains a result. */
export async function routeTask(
	registry: ProviderRegistry,
	req: TaskRequest,
): Promise<RouteOutcome> {
	try {
		// Isolate callers and fallback candidates from adapter/hook mutation.
		return await route(registry, structuredClone(req));
	} catch {
		return skip(registry, "no_provider", "unexpected_router_failure");
	}
}
