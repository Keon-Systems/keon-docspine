# Parcel: w2-lexical-similarity

## Goal
Model-free duplicate and near-duplicate detection over doc sections — the fallback that makes `detect_duplicates` work with **zero providers configured**, proving T1 degradation is real and not aspirational.

## Wave
W2

## Branch
feat/w2-lexical-similarity

## Worktree
C:\Repos\docspine.w2-lexical-similarity

## Dependencies
- W1 complete (merged)

## Allowed Files
- src/similarity/tokenize.ts
- src/similarity/tfidf.ts
- src/similarity/minhash.ts
- src/similarity/cluster.ts
- tests/similarity/tokenize.test.ts
- tests/similarity/tfidf.test.ts
- tests/similarity/minhash.test.ts
- tests/similarity/cluster.test.ts

## Forbidden
- **Do NOT import from `src/llm/**`, and do NOT call any embedding API.** The entire point of this parcel is that it runs with no model and no network.
- Do NOT emit `ContradictionCandidate` values with `classification: "contradictory"`. This parcel produces *similarity clusters* only; classifying a pair as duplicate vs complementary vs contradictory is a T1 judgment. Fabricating that label deterministically would be the single most dishonest thing in the codebase.
- Do NOT modify `src/contracts/**` or `schemas/**`.
- No new dependencies — pure `node:` builtins (`node:crypto` for hashing).
- No pipeline wiring. This parcel ships pure functions plus tests; `w2-pipeline-audit` or a later T1 parcel consumes them.

## Out of Scope
Contradiction detection, embeddings, cross-language similarity, and any report emission. Reviewers should expect a well-tested library, not a feature.

## Existing Patterns To Follow
- Pure-function parcel style established by `src/report/hash.ts` and `src/report/canonicalize.ts` — deterministic, dependency-free, heavily unit-tested
- `docs/design/llm-native-docs-system.md` §8 step 5, §20 (embeddings fallback row), §26.1
- `npm run verify` is the gate

## Contract
```ts
export function tokenizeDoc(body: string): string[];            // markdown-aware, see decision 2
export function buildTfIdf(docs: Array<{ id: string; tokens: string[] }>): TfIdfModel;
export function cosineSimilarity(a: SparseVector, b: SparseVector): number;
export function minhashSignature(tokens: string[], numHashes: number): number[];
export function jaccardEstimate(sigA: number[], sigB: number[]): number;

export interface SimilarityPair { idA: string; idB: string; score: number; method: "tfidf" | "minhash"; }
export interface SimilarityCluster { memberIds: string[]; pairs: SimilarityPair[]; }
export function clusterDocs(
  docs: Array<{ id: string; body: string }>,
  opts?: { threshold?: number; numHashes?: number },
): SimilarityCluster[];
```
Locked decisions:
1. **Determinism is mandatory.** MinHash seeds are fixed constants in source, never random, never time-derived. Two runs over identical input produce identical signatures and identical cluster membership ordering. Same rule as report canonicalization — sort cluster members and pairs by id.
2. **Tokenization is markdown-aware:** strip fenced code blocks, inline code, URLs, and frontmatter before tokenizing; lowercase; split on non-alphanumerics; drop tokens shorter than 3 chars and a small English stopword list held as a source constant. Rationale: code blocks and URLs are high-entropy noise that make unrelated docs look similar, which produces exactly the false-positive clusters that train a reviewer to ignore the tool.
3. **Two methods, honest about their jobs.** MinHash is the cheap pre-filter over all pairs (`O(n)` signatures, fast candidate generation); TF-IDF cosine is the refinement on surviving candidates. `SimilarityPair.method` records which produced the score so a consumer never conflates an estimate with a measurement.
4. **Default `threshold: 0.6`** for candidate clusters, `numHashes: 128`. Both overridable via `opts`. These are starting values, not tuned truth — the parcel must state in JSDoc that they are provisional and that recall for *paraphrased* duplication is materially worse than for near-verbatim (design spec §20). Near-verbatim is the common real-repo case and must be caught reliably.
5. **Empty and degenerate inputs are legal**: empty body, single doc, all-stopword doc → return `[]`, never throw, never divide by zero.
6. Output is **candidates for review**, and the JSDoc on `clusterDocs` must say so explicitly. Nothing here has authority to change a doc's status.

## Required Tests
- Two near-identical fixture docs (defect #6: `session-ttl-a.md` / `session-ttl-b.md`) cluster together
- Two unrelated fixture docs (e.g. `billing.md` vs `metrics.md`) do NOT cluster — false-positive guard
- Determinism: same input twice → identical signatures, identical cluster ordering
- Code-block stripping: two docs sharing only a large identical code fence do NOT cluster (proves decision 2 works)
- MinHash `jaccardEstimate` approximates true Jaccard within tolerance on a constructed pair with known overlap
- Degenerate inputs: empty string, single doc, stopwords-only → `[]`, no throw
- `numHashes` variation changes precision but never determinism

## Acceptance Criteria
- `npm run verify` green
- Zero imports outside `node:` builtins and `src/contracts/**` types
- Defect #6 pair clusters; the unrelated-pair guard passes
- Provisional-threshold caveat present in JSDoc

## Verification
- `npm run verify`
- Manual: confirm no `fetch`, no network, no randomness (`grep -r "Math.random\|Date.now" src/similarity/` returns nothing)

## Collision Risk
None — entirely new `src/similarity/**` tree, no shared files, no registry edits. Safest parcel in W2; ideal for parallel dispatch.

## PR Notes
- What changed: model-free similarity library (tokenizer, TF-IDF, MinHash, clustering)
- Why: it makes zero-provider operation real — the W2 exit criterion that `detect_duplicates` works with no providers configured
- Risk: threshold tuning is provisional and will need real-corpus calibration; do not present the defaults as validated
- Verification: `npm run verify` plus the no-randomness grep

## Stop-and-Report Rule
If the fixture's duplicate pair cannot be separated from unrelated docs at any single threshold, STOP and report with the measured scores — that is real signal about the approach, not something to paper over by moving the threshold until the test passes. If a required file is not in Allowed Files, stop and request a spec amendment.
