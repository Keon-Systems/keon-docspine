/**
 * Stable content hashing for `AuditReport` (design spec §8 "Output", §22.3 —
 * the hash feeds a future attestation trail; not implemented here, out of
 * scope for this parcel). Builds on `canonicalizeReport` for array-order
 * insensitivity, and additionally sorts object keys recursively before
 * serializing so field-insertion-order differences between two
 * structurally-identical reports never change the hash.
 */

import { createHash } from "node:crypto";
import type { AuditReport } from "../contracts/index.js";
import { canonicalizeReport } from "./canonicalize.js";

import { stableStringify } from "./serialize.js";

/**
 * Canonicalizes `report` (via `canonicalizeReport`) and returns a stable
 * SHA-256 hex digest of its content: a deterministic JSON serialization
 * with object keys sorted recursively (so field-insertion-order differences
 * between two structurally-identical reports never change the hash).
 * `generatedAtSha`/`toolVersion`/`analysisDepth` ARE included in the hash —
 * there is no timestamp field to exclude in the current contract; the hash
 * identifies "this exact report's content," which legitimately changes when
 * the SHA it ran against changes.
 */
export function hashReport(report: AuditReport): string {
	const canonical = canonicalizeReport(report);
	const serialized = stableStringify(canonical);
	return createHash("sha256").update(serialized, "utf8").digest("hex");
}
