export type SparseVector = ReadonlyMap<string, number>;

export interface TfIdfModel {
	/** Smoothed inverse document frequencies: log((1 + N) / (1 + df)) + 1. */
	idf: ReadonlyMap<string, number>;
	/** Raw term counts multiplied by IDF, keyed by unique document ID. */
	vectors: ReadonlyMap<string, SparseVector>;
}

/** Build a deterministic vocabulary and sparse vectors without mutating inputs. */
export function buildTfIdf(
	docs: Array<{ id: string; tokens: string[] }>,
): TfIdfModel {
	const frequencies = new Map<string, number>();
	const counts = new Map<string, Map<string, number>>();
	for (const doc of [...docs].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	)) {
		if (counts.has(doc.id)) throw new RangeError("Document IDs must be unique");
		const terms = new Map<string, number>();
		for (const token of [...doc.tokens].sort())
			terms.set(token, (terms.get(token) ?? 0) + 1);
		counts.set(doc.id, terms);
		for (const term of terms.keys())
			frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
	}
	const idf = new Map(
		[...frequencies]
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(
				([term, count]) =>
					[term, Math.log((1 + docs.length) / (1 + count)) + 1] as const,
			),
	);
	const vectors = new Map<string, SparseVector>();
	for (const [id, terms] of counts) {
		vectors.set(
			id,
			new Map(
				[...terms].map(([term, count]) => [term, count * (idf.get(term) ?? 0)]),
			),
		);
	}
	return { idf, vectors };
}

/** Cosine in [0, 1] for TF-IDF vectors; a zero vector has similarity zero. */
export function cosineSimilarity(a: SparseVector, b: SparseVector): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (const [term, weight] of a) {
		dot += weight * (b.get(term) ?? 0);
		normA += weight * weight;
	}
	for (const weight of b.values()) normB += weight * weight;
	if (normA === 0 || normB === 0) return 0;
	const cosine = dot / (Math.sqrt(normA) * Math.sqrt(normB));
	// Roundoff must not reject identical vectors at threshold=1.
	if (Math.abs(1 - cosine) <= 4 * Number.EPSILON) return 1;
	return Math.max(0, Math.min(1, cosine));
}
