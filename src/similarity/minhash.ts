import { createHash } from "node:crypto";

// Fixed seed namespace and index offset are part of the signature format.
const SEED_NAMESPACE = "docspine-minhash-v1";
const SEED_OFFSET = 0x9e3779b9;

/** Deterministic set MinHash. Empty token sets have an empty signature. */
export function minhashSignature(
	tokens: string[],
	numHashes: number,
): number[] {
	if (!Number.isSafeInteger(numHashes) || numHashes < 1) {
		throw new RangeError("numHashes must be a positive safe integer");
	}
	const unique = [...new Set(tokens)].sort();
	if (unique.length === 0) return [];
	return Array.from({ length: numHashes }, (_, index) => {
		const seed = "\0";
		let minimum = 0xffffffff;
		for (const token of unique) {
			const hash = createHash("sha256")
				.update(SEED_NAMESPACE)
				.update(String(SEED_OFFSET + index))
				.update(seed)
				.update(token)
				.digest()
				.readUInt32BE(0);
			minimum = Math.min(minimum, hash);
		}
		return minimum;
	});
}

/** Fraction of matching positions; empty signatures have similarity zero. */
export function jaccardEstimate(sigA: number[], sigB: number[]): number {
	if (sigA.length !== sigB.length)
		throw new RangeError("Signature lengths must match");
	if (sigA.length === 0) return 0;
	let equal = 0;
	for (let i = 0; i < sigA.length; i++) if (sigA[i] === sigB[i]) equal++;
	return equal / sigA.length;
}
