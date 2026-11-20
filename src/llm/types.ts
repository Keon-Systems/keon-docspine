/** Mini-contracts for adapters, schema repair, and config loading. */
import type { ProviderError, ProviderErrorCode } from "../contracts/errors.js";
import type {
	CapabilitySet,
	LlmProvider,
	TaskKind,
	TaskRequest,
	TaskResult,
} from "../contracts/provider.js";
import type { BudgetTracker } from "./budgets.js";

export interface ProviderConfig {
	id: string;
	type:
		| "openai-compatible"
		| "anthropic-compatible"
		| "gemini"
		| "bedrock"
		| "custom";
	enabled: boolean;
	/** Only HTTP(S) loopback endpoints are local; built-in defaults are hosted. */
	baseUrl?: string;
	allowedTasks: TaskKind[];
	models: Partial<Record<TaskKind, string>>;
	pinnedCapabilities?: Partial<CapabilitySet>;
}

export interface RouterConfig {
	defaultProvider: string | null;
	/** Explicit fallback only; never inferred from the available providers. */
	fallbackProvider: string | null;
	allowNetworkProviders: boolean;
	redactSourceBeforeRemoteCalls: boolean;
	budgets: { perRunUsd?: number; perMonthUsd?: number };
	providers: ProviderConfig[];
	routing: Partial<
		Record<TaskKind, { prefer: string[]; onNoProvider: "skip_and_log" }>
	>;
}

export type RouteOutcome =
	| { kind: "dispatched"; result: TaskResult }
	| {
			kind: "skipped";
			reason: "no_provider" | "budget_exhausted" | "task_not_permitted";
			detail: string;
	  };

/**
 * Synchronous, lazy construction, keyed by adapter family. Factories must honor
 * baseUrl, models, and the provider contract's per-call token/USD limits. A
 * `custom` factory without baseUrl promises entirely on-box execution. No
 * network-classified factory is invoked in local-only mode. A private config
 * copy is supplied so a factory cannot mutate routing/data-flow policy.
 */
export type AdapterFactory = (config: ProviderConfig) => LlmProvider;
export type AdapterFactories = Partial<
	Record<ProviderConfig["type"], AdapterFactory>
>;

/**
 * Optional schema-repair integration, called only for schema_unrecoverable.
 * Return undefined to abandon the provider, or a successful `retry` result
 * unchanged (the router records the retry count). The hook owns validator-error
 * re-prompting, not the router. All retries MUST use `retry`, never a raw
 * adapter: it rechecks task identity, redaction, capabilities and budgets.
 * At most two retries are permitted; each is independently budgeted. Altered
 * evidence must retain the original task. Hook failures degrade to skipped.
 */
export type RepairHook = (context: {
	request: TaskRequest;
	error: ProviderError;
	retry: (request: TaskRequest) => Promise<TaskResult>;
}) => Promise<TaskResult | undefined>;

export interface RouterEvent {
	kind: "provider_unavailable" | "provider_error" | "skipped";
	providerId?: string;
	task?: TaskKind;
	code?: ProviderErrorCode;
	/** Router-authored only: never raw vendor errors or packet contents. */
	detail: string;
}

export interface RegistryOptions {
	repair?: RepairHook;
	/** Optional diagnostics sink. Exceptions in logging never abort routing. */
	onEvent?: (event: RouterEvent) => void;
	/**
	 * Prior spend in the current month, supplied by the caller's ledger. No
	 * files are read here. Reuse a registry for a run; create a new one with
	 * updated month-to-date spend for the next run. Persistence is W3 work.
	 */
	monthToDateUsd?: number;
}

export interface RegisteredProvider {
	readonly config: ProviderConfig;
	readonly provider: LlmProvider;
	readonly network: boolean;
}

export interface ProviderRegistry {
	readonly config: RouterConfig;
	/** Contains constructed providers only, not disabled/denied/failed entries. */
	readonly providers: ReadonlyMap<string, RegisteredProvider>;
	readonly budgets: BudgetTracker;
	readonly repair?: RepairHook;
	/** In-memory diagnostics are always retained, even without an external sink. */
	readonly events: readonly RouterEvent[];
	log(event: RouterEvent): void;
}
