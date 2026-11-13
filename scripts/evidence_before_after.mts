/**
 * Recompute the demonstration mission with the current evidence base and
 * compare it with the stored demo run (the "before" state).
 * Usage: npx tsx scripts/evidence_before_after.mts [runId] > out.json
 */
import { DatabaseSync } from 'node:sqlite';
import { decomposeMission } from '../src/mission/index.ts';
import { odyssey } from '../server/science/data.ts';
import { matrices, targetProfile } from '../server/agent/engine.ts';
import { evaluateCandidates, sortCandidates, earthWideGaps } from '../server/science/candidates.ts';
import { thresholdBasis } from '../src/mission/evidence.ts';

const runId = process.argv[2] ?? '95db2401-7a03-4d72-a143-5ffbe2507221';
const db = new DatabaseSync('server/data/odyssey.sqlite');
const row = db.prepare('select state from runs where id = ?').get(runId) as { state: string };
const before = JSON.parse(row.state);
const state = JSON.parse(row.state);
const profile = odyssey.profiles[state.parsed.profile];
state.mission = decomposeMission(state.brief, state.parsed.profile, profile.short, profile.experiments, {
  archetypes: state.parsed.selections.map((s: any) => ({ id: s.archetypeId, terms: s.briefFragment ? [s.briefFragment] : [], source: s.source, confidence: s.source === 'brief' ? 90 : 45 })),
  durationDays: state.parsed.durationDays,
});
const { matrix, temporal } = matrices(state);
const target = targetProfile(state);
const out: any = { runId, brief: state.brief, requirements: [], experiments: {} };

for (const e of state.mission.experiments) {
  const beforeExp = before.mission.experiments.find((x: any) => x.id === e.id);
  for (const r of e.requirements) {
    const evals = matrix.byExperiment[e.id].map((res) => res.evaluations.find((v) => v.requirementId === r.id)!);
    const states: Record<string, number> = {};
    const statuses: Record<string, number> = {};
    for (const v of evals) {
      const k = v.evidence?.state ?? 'none';
      states[k] = (states[k] ?? 0) + 1;
      statuses[v.status] = (statuses[v.status] ?? 0) + 1;
    }
    const prev = beforeExp?.requirements.find((x: any) => x.id === r.id);
    out.requirements.push({
      id: r.id, experiment: e.id, kind: r.kind, metric: r.metric, statement: r.statement,
      previousStatement: prev?.statement ?? null,
      threshold: thresholdBasis(r), evidenceSource: r.evidence.source,
      states, statuses,
    });
  }
  const list = sortCandidates(evaluateCandidates(e, matrix, temporal, target));
  const prevList = before.candidates[e.id] ?? [];
  out.experiments[e.id] = {
    before: prevList.slice(0, 8).map((c: any) => ({ site: c.siteId, decision: c.decision, aggregate: c.aggregate })),
    after: list.slice(0, 8).map((c) => ({ site: c.siteId, decision: c.decision, aggregate: c.aggregate, reasons: c.reasons.slice(0, 3) })),
    decisionsBefore: prevList.reduce((a: any, c: any) => ((a[c.decision] = (a[c.decision] ?? 0) + 1), a), {}),
    decisionsAfter: list.reduce((a: any, c) => ((a[c.decision] = (a[c.decision] ?? 0) + 1), a), {}),
    changed: list.filter((c) => prevList.find((p: any) => p.siteId === c.siteId)?.decision !== c.decision).map((c) => ({ site: c.siteId, from: prevList.find((p: any) => p.siteId === c.siteId)?.decision, to: c.decision, reason: c.reasons[0] })),
    gaps: earthWideGaps(e.id, list).map((g) => ({ label: g.label, best: g.bestAvailable, outcome: g.outcome, side: g.gapSide })),
  };
}
console.log(JSON.stringify(out, null, 1));
