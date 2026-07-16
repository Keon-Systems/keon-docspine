/**
 * Final W1 registry (design spec §8; STRATEGY §2 "serialization points";
 * `docs/PARCELS/w1-registry-wiring.md`). Wires all W1 extractors, checkers,
 * and the TypeScript SymbolIndex builder. Plain data — no dynamic imports,
 * no decorators, no auto-discovery magic.
 *
 * Replaces the provisional path-only spike registry from
 * `docs/PARCELS/w1-spike-verify-paths.md`.
 */
import { commandChecker } from "./checkers/commands.js";
import { linkChecker } from "./checkers/links.js";
import { pathChecker } from "./checkers/paths.js";
import { symbolChecker } from "./checkers/symbols.js";
import { commandExtractor } from "./extractors/commands.js";
import { linkExtractor } from "./extractors/links.js";
import { pathExtractor } from "./extractors/paths.js";
import { symbolExtractor } from "./extractors/symbols.js";
import type { Registry } from "./pipeline/run-verify.js";
import { buildTypeScriptSymbolIndex } from "./symbol-index/typescript.js";

export const registry: Registry = {
	extractors: [pathExtractor, symbolExtractor, commandExtractor, linkExtractor],
	checkers: [pathChecker, symbolChecker, commandChecker, linkChecker],
	symbolIndexBuilder: buildTypeScriptSymbolIndex,
};
