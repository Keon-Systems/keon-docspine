/**
 * Barrel export for the whole contract layer. Downstream parcels import
 * from `src/contracts/index.js` (or the individual files directly) — both
 * are supported; this file exists so `import { Claim, Manifest } from
 * "../contracts/index.js"` works without knowing which file defines what.
 *
 * `src/contracts/**` is frozen once `w1-contracts-core` merges; changes go
 * through the Contract Amendment process (`docs/PARCELS/index.md`).
 */

export * from "./claims.js";
export * from "./errors.js";
export * from "./frontmatter.js";
export * from "./manifest.js";
export * from "./plugins.js";
export * from "./provider.js";
export * from "./report.js";
