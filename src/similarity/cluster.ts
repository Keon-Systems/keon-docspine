import { jaccardEstimate, minhashSignature } from "./minhash.js";
import { buildTfIdf, cosineSimilarity } from "./tfidf.js";
import { tokenizeDoc } from "./tokenize.js";

export interface SimilarityPair {
	idA: string;
	idB: string;
	score: number;
	method: "tfidf" | "minhash";
}

export interface SimilarityCluster {
	memberIds: string[];
	pairs: SimilarityPair[];
}

/**
 * Produces similarity candidates for review, not duplicate/contradiction verdicts.
 * Nothing here has authority to change a document's status.
 * Defaults (threshold 0.6, numHashes 128) are provisional, not corpus-calibrated.
 * Recall for paraphrased duplication is materially worse than near-verbatim.
 *
 * MinHash signatures are built once per document; all pairs are scanned (O(n²)).
 * The cheap pre-filter uses threshold / 2 because Jaccard and cosine have
 * different scales. This heuristic can miss candidates; it is not a recall bound.
 * Surviving edges must meet the requested TF-IDF cosine threshold. Connected
 * components may contain non-adjacent members below threshold; only measured
 * qualifying edges appear in pairs. IDs must be unique.
 */
export function clusterDocs(
	docs: Array<{ id: string; body: string }>,
	opts: { threshold?: number; numHashes?: number } = {},
): SimilarityCluster[] {
	const threshold = opts.threshold ?? 0.6;
	const numHashes = opts.numHashes ?? 128;
	if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
		throw new RangeError("threshold must be in [0, 1]");
	// Validate even when the corpus is empty.
	minhashSignature([], numHashes);
	const sorted = [...docs].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
	const tokenized = sorted.map((doc) => ({
		id: doc.id,
		tokens: tokenizeDoc(doc.body),
	}));
	const model = buildTfIdf(tokenized);
	const signatures = tokenized.map((doc) =>
		minhashSignature(doc.tokens, numHashes),
	);
	const parents = tokenized.map((_, i) => i);
	function root(i: number): number {
		const parent = parents[i] ?? i;
		if (parent === i) return i;
		const result = root(parent);
		parents[i] = result;
		return result;
	}
	const edges: Array<{ index: number; pair: SimilarityPair }> = [];
	for (const [i, a] of tokenized.entries()) {
		if (a.tokens.length === 0) continue;
		for (let j = i + 1; j < tokenized.length; j++) {
			const b = tokenized[j];
			if (!b || b.tokens.length === 0) continue;
			const estimate = jaccardEstimate(
				signatures[i] ?? [],
				signatures[j] ?? [],
			);
			if (estimate <= 0 || estimate < threshold / 2) continue;
			const score = cosineSimilarity(
				model.vectors.get(a.id) ?? new Map(),
				model.vectors.get(b.id) ?? new Map(),
			);
			if (score <= 0 || score < threshold) continue;
			parents[root(j)] = root(i);
			edges.push({
				index: i,
				pair: { idA: a.id, idB: b.id, score, method: "tfidf" },
			});
		}
	}
	const groups = new Map<number, SimilarityCluster>();
	for (const [i, doc] of tokenized.entries()) {
		const key = root(i);
		const group = groups.get(key) ?? { memberIds: [], pairs: [] };
		group.memberIds.push(doc.id);
		groups.set(key, group);
	}
	for (const edge of edges) groups.get(root(edge.index))?.pairs.push(edge.pair);
	return [...groups.values()].filter((group) => group.memberIds.length > 1);
}
