import type {
	CapabilitySet,
	HealthStatus,
	LlmProvider,
	TaskKind,
	TaskRequest,
	TaskResult,
} from "../../src/contracts/provider.js";
import type {
	AdapterFactories,
	ProviderConfig,
	RouterConfig,
} from "../../src/llm/types.js";

export function request(task: TaskKind = "classify_docs"): TaskRequest {
	return {
		task,
		schema: { type: "object" },
		evidence: {
			task,
			docs: [],
			claims: [],
			symbolSlices: [],
			diffHunks: [],
			redacted: false,
		},
		budget: { maxInputTokens: 1000, maxOutputTokens: 500 },
		determinismHints: { temperature: 0 },
	};
}

export function providerConfig(
	id: string,
	patch: Partial<ProviderConfig> = {},
): ProviderConfig {
	return {
		id,
		type: "custom",
		enabled: true,
		allowedTasks: ["classify_docs"],
		models: { classify_docs: "fake-model" },
		...patch,
	};
}

export function config(providers: ProviderConfig[] = []): RouterConfig {
	return {
		defaultProvider: providers[0]?.id ?? null,
		fallbackProvider: null,
		allowNetworkProviders: false,
		redactSourceBeforeRemoteCalls: true,
		budgets: {},
		providers,
		routing: {},
	};
}

/** In-repo adapter: no network, tools or filesystem access. */
export class FakeProvider implements LlmProvider {
	calls: TaskRequest[] = [];
	healthCalls = 0;
	capabilityCalls = 0;
	healthy = true;
	error: unknown;
	costUsd: number | undefined = 0.1;
	caps: CapabilitySet = {
		jsonSchema: "native",
		maxUsableContext: 8000,
		embeddings: false,
		costUsdPer1kTokens: 0.1,
	};
	handler?: (request: TaskRequest) => Promise<TaskResult>;

	constructor(public id: string) {}

	async health(): Promise<HealthStatus> {
		this.healthCalls++;
		return {
			healthy: this.healthy,
			consecutiveFailures: this.healthy ? 0 : 1,
			lastCheckedAt: "2026-01-01T00:00:00Z",
		};
	}

	async capabilities(): Promise<CapabilitySet> {
		this.capabilityCalls++;
		return this.caps;
	}

	result(): TaskResult {
		return {
			output: { candidate: this.id },
			provider: this.id,
			model: "fake-model",
			usage: { inputTokens: 10, outputTokens: 10, costUsd: this.costUsd },
			schemaRepairAttempts: 0,
			advisory: true,
		};
	}

	async complete(req: TaskRequest): Promise<TaskResult> {
		this.calls.push(req);
		if (this.handler) return this.handler(req);
		if (this.error !== undefined) throw this.error;
		return this.result();
	}
}

export function factories(...providers: FakeProvider[]): AdapterFactories {
	return {
		custom: (cfg) => {
			const provider = providers.find((provider) => provider.id === cfg.id);
			if (!provider) throw new Error("missing fake");
			return provider;
		},
	};
}
