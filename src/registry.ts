/**
 * PROVISIONAL registry (design spec §8; STRATEGY §2 "serialization points";
 * `docs/PARCELS/index.md` collision-risk table). Deliberately dumb: plain
 * data, arrays of already-implemented `Extractor`/`Checker` objects — no
 * dynamic imports, no decorators, no auto-discovery magic — so
 * `w1-registry-wiring` (the last W1 parcel) can safely replace this file
 * wholesale once every Batch-2 extractor/checker exists.
 *
 * Only the path extractor/checker are wired here; proving that slice works
 * end-to-end is this spike's entire job
 * (`docs/PARCELS/w1-spike-verify-paths.md`).
 */
import { pathChecker } from "./checkers/paths.js";
import { pathExtractor } from "./extractors/paths.js";
import type { Registry } from "./pipeline/run-verify.js";

export const registry: Registry = {
	extractors: [pathExtractor],
	checkers: [pathChecker],
};
