/** Okapi BM25, a deterministic lexical relevance baseline. Scores are relevance, never truth. */
const STOP = new Set('a an and are as at be by for from has have in into is it its of on or that the their this to was were which with within without'.split(' '));

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export interface Bm25Hit<T> {
  item: T;
  score: number;
  index: number;
}

export function bm25<T>(query: string, docs: T[], text: (doc: T) => string, k1 = 1.2, b = 0.75): Bm25Hit<T>[] {
  const q = [...new Set(tokenize(query))];
  const toks = docs.map((d) => tokenize(text(d)));
  const avg = toks.reduce((s, t) => s + t.length, 0) / Math.max(1, toks.length);
  const df = new Map<string, number>();
  for (const t of toks) for (const term of new Set(t)) df.set(term, (df.get(term) ?? 0) + 1);
  const n = docs.length;
  return docs
    .map((item, index) => {
      const tf = new Map<string, number>();
      for (const term of toks[index]) tf.set(term, (tf.get(term) ?? 0) + 1);
      let score = 0;
      for (const term of q) {
        const f = tf.get(term) ?? 0;
        if (!f) continue;
        const idf = Math.log(1 + (n - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks[index].length) / Math.max(1, avg)));
      }
      return { item, score: Math.round(score * 1000) / 1000, index };
    })
    .sort((x, y) => y.score - x.score || x.index - y.index);
}

/** Kendall tau-b between two orderings of the same ids (for ranker-vs-baseline tests). */
export function kendallTau(a: string[], b: string[]): number | null {
  const common = a.filter((id) => b.includes(id));
  if (common.length < 2) return null;
  const pa = new Map(a.map((id, i) => [id, i]));
  const pb = new Map(b.map((id, i) => [id, i]));
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < common.length; i += 1) {
    for (let j = i + 1; j < common.length; j += 1) {
      const x = Math.sign(pa.get(common[i])! - pa.get(common[j])!);
      const y = Math.sign(pb.get(common[i])! - pb.get(common[j])!);
      if (x * y > 0) concordant += 1;
      else if (x * y < 0) discordant += 1;
    }
  }
  const total = concordant + discordant;
  return total ? Math.round(((concordant - discordant) / total) * 1000) / 1000 : null;
}
