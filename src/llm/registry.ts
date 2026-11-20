import { BudgetTracker } from "./budgets.js";
import type {
	AdapterFactories,
	ProviderConfig,
	ProviderRegistry,
	RegisteredProvider,
	RegistryOptions,
	RouterConfig,
	RouterEvent,
} from "./types.js";

/**
 * No DNS lookup: exact loopback hosts only. Invalid/non-HTTP endpoints fail
 * closed as network-classified. The built-in families default to hosted
 * services; only custom promises local execution without an explicit URL.
 */
export function isNetworkProvider(config: ProviderConfig): boolean {
	if (config.baseUrl === undefined) return config.type !== "custom";
	try {
		const url = new URL(config.baseUrl);
		return (
			!["http:", "https:"].includes(url.protocol) ||
			!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
		);
	} catch {
		return true;
	}
}

export function buildRegistry(
	cfg: RouterConfig,
	factories: AdapterFactories,
	options: RegistryOptions = {},
): ProviderRegistry {
	const config = structuredClone(cfg);
	const providers = new Map<string, RegisteredProvider>();
	const events: RouterEvent[] = [];
	const log = (event: RouterEvent): void => {
		events.push({ ...event });
		try {
			options.onEvent?.({ ...event });
		} catch {
			// Diagnostics must never make advisory analysis fatal.
		}
	};
	// Reject every occurrence of a duplicate id, rather than letting ordering
	// accidentally replace a local provider with a remote or differently scoped one.
	const ids = config.providers.map((provider) => provider.id);
	for (const entry of config.providers) {
		const unavailable = (detail: string) =>
			log({ kind: "provider_unavailable", providerId: entry.id, detail });
		if (ids.indexOf(entry.id) !== ids.lastIndexOf(entry.id)) {
			unavailable("duplicate_provider_id");
			continue;
		}
		if (!entry.enabled) {
			unavailable("disabled");
			continue;
		}
		const network = isNetworkProvider(entry);
		// Load-bearing gate: do not even read the factory before this check.
		if (network && !config.allowNetworkProviders) {
			unavailable("network_denied");
			continue;
		}
		try {
			const factory = Object.hasOwn(factories, entry.type)
				? factories[entry.type]
				: undefined;
			if (!factory) {
				unavailable("missing_factory");
				continue;
			}
			const provider = factory(structuredClone(entry));
			if (provider.id !== entry.id) {
				unavailable("provider_id_mismatch");
				continue;
			}
			providers.set(entry.id, { config: entry, provider, network });
		} catch {
			unavailable("factory_failed");
		}
	}
	return {
		config,
		providers,
		budgets: new BudgetTracker(config.budgets, options.monthToDateUsd),
		repair: options.repair,
		events,
		log,
	};
}
