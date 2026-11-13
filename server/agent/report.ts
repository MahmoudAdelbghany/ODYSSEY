/**
 * Mission report + evidence graph (PART 7.3). Every numeric statement in the
 * structured sections comes from tool state. The LLM narrative is kept apart,
 * labelled, and checked for references to ids that do not exist.
 */
import { SITE_BY_ID } from '../science/data.ts';
import { AGGREGATE_DEFINITION } from '../science/candidates.ts';
import { planetaryProfile } from '../science/profile.ts';

const TOOL_NAMES = ['parse_mission', 'decompose_experiments', 'extract_requirements', 'discover_global_regions', 'search_earth_evidence', 'search_planetary_reference', 'retrieve_source', 'verify_source', 'compare_measurements', 'evaluate_requirement', 'detect_environmental_mismatch', 'rank_candidate_regions', 'rerank_evidence', 'analyze_temporal_window', 'find_intervention_options', 'evaluate_intervention', 'optimize_campaign', 'generate_mission_report'];
import type { AgentState } from './state.ts';

export interface GraphNode {
  id: string;
  type: 'mission' | 'experiment' | 'requirement' | 'target' | 'candidate' | 'measurement' | 'source' | 'mismatch' | 'intervention' | 'recommendation';
  label: string;
  status?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
}

export interface Narrative {
  summary: string;
  keyFindings: string[];
  cannotEstablish: string[];
  nextMeasurements: string[];
}

export const INTEGRITY_STATEMENT = [
  'No Earth location is described as physically equivalent to the Moon or Mars.',
  'Search results are PENDING REVIEW until a full source is retrieved and a verbatim quote is checked.',
  'Missing measurements are reported as MISSING, never as zero and never as a match.',
  'Air temperature, surface temperature and thermal inertia are separate quantities and are never compared with one another.',
  'Intervention outputs are PROPOSED setpoints or SIMULATED first-order model results, never observations.',
  'The secondary aggregate is a defined weighted summary, not a probability of mission success.',
  'The learned reranker reorders only candidates that passed deterministic hard constraints.',
];

function buildReportData(state: AgentState, narrative: Narrative) {
  const mission = state.mission!;
  const target = planetaryProfile(state.parsed!.target!);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const node = (n: GraphNode) => {
    if (!nodes.some((x) => x.id === n.id)) nodes.push(n);
    return n.id;
  };
  const edge = (from: string, to: string, relation: string) => edges.push({ from, to, relation });

  const missionId = node({ id: 'mission', type: 'mission', label: state.brief.slice(0, 80) });
  const targetId = node({ id: `target:${target.id}`, type: 'target', label: target.name });
  edge(missionId, targetId, 'targets');

  const experiments = mission.experiments.map((e) => {
    const eid = node({ id: `exp:${e.id}`, type: 'experiment', label: e.name, status: e.source });
    edge(missionId, eid, 'decomposes_into');
    for (const r of e.requirements.filter((r) => r.kind === 'required').slice(0, 6)) {
      const rid = node({ id: `req:${r.id}`, type: 'requirement', label: r.statement.slice(0, 80), status: r.source === 'brief' ? 'BRIEF' : 'INFERRED' });
      edge(eid, rid, 'requires');
    }
    const candidates = state.candidates[e.id] ?? [];
    const kept = candidates.filter((c) => c.decision !== 'rejected').slice(0, 3);
    const rejected = candidates.filter((c) => c.decision === 'rejected').slice(0, 2);
    for (const c of [...kept, ...rejected]) {
      const cid = node({ id: `site:${c.siteId}`, type: 'candidate', label: c.name });
      edge(eid, cid, c.decision === 'rejected' ? 'rejects' : c.decision === 'downgraded' ? 'downgrades' : 'selects');
    }
    for (const m of (state.mismatches[e.id] ?? []).filter((m) => m.matters).slice(0, 12)) {
      const mid = node({ id: `mm:${e.id}:${m.siteId}:${m.dimension}`, type: 'mismatch', label: `${m.label}: ${m.comparison.classification}`, status: m.handling });
      const meas = node({ id: `meas:${m.siteId}:${m.dimension}`, type: 'measurement', label: `${m.label} @ ${m.siteId}`, status: m.comparison.earth.status });
      edge(`site:${m.siteId}`, meas, 'has_measurement');
      edge(meas, mid, 'compared_in');
      edge(targetId, mid, 'reference_for');
      edge(`exp:${e.id}`, mid, 'affected_by');
    }
    return {
      id: e.id,
      name: e.name,
      source: e.source,
      objective: e.objective,
      requirements: e.requirements.map((r) => ({ id: r.id, kind: r.kind, statement: r.statement, provenance: `${r.evidence.nature}/${r.evidence.spatiality}`, origin: r.source === 'brief' ? 'BRIEF' : 'INFERRED' })),
      candidates: {
        counts: candidates.reduce<Record<string, number>>((acc, c) => ((acc[c.decision] = (acc[c.decision] ?? 0) + 1), acc), {}),
        top: kept.map((c) => ({ siteId: c.siteId, name: c.name, decision: c.decision, aggregate: c.aggregate, rankings: c.rankings, window: c.temporal.window, reasons: c.reasons })),
        rejected: rejected.map((c) => ({ siteId: c.siteId, name: c.name, reasons: c.reasons })),
      },
      earthWideGaps: state.earthWideGaps[e.id] ?? [],
      mismatches: (state.mismatches[e.id] ?? []).map((m) => ({ siteId: m.siteId, dimension: m.dimension, label: m.label, importance: m.importance, classification: m.comparison.classification, matters: m.matters, handling: m.handling, reason: m.comparison.reason, earth: m.comparison.earth, planet: m.comparison.planet })),
    };
  });

  for (const ev of state.evidence) {
    const sid = node({ id: `src:${ev.id}`, type: 'source', label: (ev.source?.title ?? ev.title).slice(0, 90), status: ev.status });
    if (ev.siteId) edge(sid, `site:${ev.siteId}`, 'about_site');
    if (ev.scope === 'planetary_target') edge(sid, targetId, 'about_target');
    for (const exp of ev.experimentIds) if (nodes.some((n) => n.id === `exp:${exp}`)) edge(sid, `exp:${exp}`, 'relevant_to');
  }

  for (const spec of state.interventions) {
    const iid = node({ id: `int:${spec.id}`, type: 'intervention', label: spec.name, status: spec.label });
    const mm = nodes.find((n) => n.type === 'mismatch' && n.id.startsWith(`mm:${spec.experimentId}:`) && n.id.endsWith(`:${spec.targetGap}`));
    edge(iid, mm ? mm.id : `exp:${spec.experimentId}`, 'bridges');
  }

  const plan = state.campaign?.plans[0];
  for (const stop of plan?.stops ?? []) {
    const rid = node({ id: `rec:${stop.siteId}`, type: 'recommendation', label: `${stop.siteName}, ${stop.window}` });
    edge(rid, `site:${stop.siteId}`, 'at_site');
    for (const ex of stop.experiments) edge(rid, `exp:${ex.id}`, 'schedules');
  }

  // Narrative check: flag any snake_case identifier that is not a known experiment/site/dimension.
  const vocabulary = ['insufficient_evidence', 'pending_review', 'requires_review', 'not_naturally_reproducible', 'incompatible_support', 'retrieval_failed', 'model_predicted', 'within_checked_constraints', 'violates_constraints', 'unresolved_evidence', 'not_reproducible_by_site_choice', 'natural_analog', 'choose_better_site', 'controlled_intervention', 'numerical_simulation', 'acknowledge_residual', 'needs_measurement', 'moon_south_pole', 'mars_jezero', 'lunar_base', 'lunar_expedition', 'mars_landing'];
  const known = new Set<string>([...mission.experiments.map((e) => e.id), ...SITE_BY_ID.keys(), ...Object.keys(target.measurements), ...state.interventions.map((s) => s.id), ...TOOL_NAMES, ...vocabulary]);
  const text = [narrative.summary, ...narrative.keyFindings, ...narrative.cannotEstablish, ...narrative.nextMeasurements].join(' ');
  const unknown = [...new Set([...text.matchAll(/\b[a-z]+_[a-z_]+\b/g)].map((m) => m[0]))].filter((t) => !known.has(t));
  const narrativeCheck = !text.trim() ? 'no narrative supplied' : unknown.length ? `unrecognised identifiers: ${unknown.slice(0, 8).join(', ')}` : 'all identifiers recognised';

  const unresolved = [
    ...state.decisions.filter((d) => d.kind === 'unresolved').map((d) => `${d.subject}: ${d.reason}`),
    ...Object.values(state.earthWideGaps).flat().filter((g) => g.kind === 'unresolved_evidence').map((g) => `${g.experimentId}: ${g.label} cannot be evaluated (${g.bestAvailable}).`),
  ];
  const report = {
    format: 'odyssey-mission-report/1',
    generatedAt: new Date().toISOString(),
    runId: state.runId,
    brief: state.brief,
    parsed: state.parsed,
    target: {
      id: target.id,
      name: target.name,
      body: target.body,
      measurements: Object.values(target.measurements).filter((m) => m.status !== 'MISSING').map((m) => ({ dimension: m.dimension, value: m.value, range: m.range, unit: m.unit, status: m.status, source: m.source, url: m.sourceUrl })),
      missing: Object.values(target.measurements).filter((m) => m.status === 'MISSING').map((m) => m.dimension),
    },
    experiments,
    globalRegions: state.globalRegions,
    evidence: state.evidence.map((e) => ({ id: e.id, url: e.url, title: e.source?.title ?? e.title, scope: e.scope, siteId: e.siteId, status: e.status, publishedDate: e.source?.publishedDate ?? null, doi: e.source?.doi ?? null, verification: e.verification ? { status: e.verification.status, summary: e.verification.summary, claims: e.verification.claims.map((c) => ({ quote: c.quote, value: c.value, range: c.range, unit: c.unit, relation: c.relation })) } : null, verifications: (e.verifications ?? []).map((v) => ({ quantity: v.quantity, status: v.status, summary: v.summary, claims: v.claims.map((c) => ({ quote: c.quote, value: c.value, range: c.range, unit: c.unit, relation: c.relation, note: c.note })) })), retrievalError: e.retrievalError ?? null })),
    searchReports: state.searchReports,
    validatorFindings: state.validationFindings,
    contradictions: state.contradictions,
    reranks: state.reranks,
    interventions: state.interventions.map((s) => ({ ...s, evaluation: state.interventionEvaluations.find((e) => e.interventionId === s.id) ?? null })),
    campaign: state.campaign,
    decisions: state.decisions,
    unresolved,
    evidenceGaps: Object.values(state.evidenceInvestigations ?? {}).map((g) => ({ key: g.key, label: g.label, side: g.side, state: g.state, outcome: g.outcome, conclusion: g.conclusion, nextAction: g.nextAction, alternatives: g.alternatives, searches: g.searches })),
    aggregateDefinition: AGGREGATE_DEFINITION,
    integrity: INTEGRITY_STATEMENT,
    budgets: state.budgets,
    narrative: { ...narrative, authoredBy: (narrative as { authoredBy?: string }).authoredBy ?? 'LLM agent (OpenCode)', check: narrativeCheck, note: 'Narrative is the agent’s interpretation. Numbers and decisions above are computed by deterministic tools.' },
    graph: { nodes, edges },
  };
  return report;
}

export function buildReport(state: AgentState, narrative: Narrative) {
  const data = buildReportData(state, narrative);
  return { ...data, markdown: toMarkdown(data) };
}

type Report = ReturnType<typeof buildReportData>;

function toMarkdown(r: Report): string {
  const lines: string[] = [];
  const p = (s = '') => lines.push(s);
  p(`# ODYSSEY mission plan`);
  p();
  p(`> ${r.brief}`);
  p();
  p(`Run \`${r.runId}\` · generated ${r.generatedAt} · target **${r.target.name}** · parser ${r.parsed?.parser ?? 'n/a'}`);
  p();
  if (r.narrative.summary) {
    p(`## Agent summary`);
    p();
    p(`*${r.narrative.note} Check: ${r.narrative.check}.*`);
    p();
    p(r.narrative.summary);
    p();
    for (const f of r.narrative.keyFindings) p(`- ${f}`);
    p();
  }
  p(`## Planetary reference: ${r.target.name}`);
  p();
  p(`| Dimension | Value | Status | Source |`);
  p(`|---|---|---|---|`);
  for (const m of r.target.measurements) p(`| ${m.dimension} | ${m.range ? `${m.range[0]}–${m.range[1]}` : (m.value ?? '–')} ${m.unit === '-' ? '' : m.unit} | ${m.status} | ${m.url ? `[${m.source.slice(0, 70)}](${m.url})` : m.source.slice(0, 90)} |`);
  p();
  p(`Missing on the target side: ${r.target.missing.join(', ') || 'none'}.`);
  p();
  for (const e of r.experiments) {
    p(`## Experiment: ${e.name} (\`${e.id}\`, ${e.source})`);
    p();
    p(e.objective);
    p();
    p(`Candidates: ${Object.entries(e.candidates.counts).map(([k, v]) => `${v} ${k}`).join(', ')}.`);
    p();
    p(`| Site | Decision | Aggregate | Suitability | Terrain | Thermal | Evidence | Window |`);
    p(`|---|---|---|---|---|---|---|---|`);
    for (const c of e.candidates.top) p(`| ${c.name} | ${c.decision} | ${c.aggregate ?? '–'} | ${c.rankings.experimentalSuitability ?? '–'} | ${c.rankings.terrainSimilarity ?? '–'} | ${c.rankings.thermalCompatibility ?? '–'} | ${c.rankings.evidenceCompleteness ?? '–'} | ${c.window ?? 'none'} |`);
    p();
    for (const c of e.candidates.top) p(`- **${c.name}**: ${c.reasons.slice(0, 3).join(' ')}`);
    for (const c of e.candidates.rejected) p(`- ✗ **${c.name}** rejected: ${c.reasons[0]}`);
    p();
    const matters = e.mismatches.filter((m) => m.matters);
    if (matters.length) {
      p(`### Where Earth does not match`);
      p();
      p(`| Site | Condition | Importance | Class | Handling | Reason |`);
      p(`|---|---|---|---|---|---|`);
      for (const m of matters.slice(0, 14)) p(`| ${m.siteId} | ${m.label} | ${m.importance} | ${m.classification} | ${m.handling.replace(/_/g, ' ')} | ${m.reason.replace(/\|/g, '/').slice(0, 160)} |`);
      p();
    }
    if (e.earthWideGaps.length) {
      p(`Earth-wide gaps (no candidate site closes them): ${e.earthWideGaps.map((g) => `${g.label} (${g.bestAvailable})`).join('; ')}.`);
      p();
    }
  }
  if (r.interventions.length) {
    p(`## Controlled interventions`);
    p();
    for (const i of r.interventions) {
      p(`### ${i.name} (**${i.evaluation?.label ?? i.label}**)`);
      p();
      p(`Gap: ${i.targetGapLabel} (${i.experimentId}). Feasibility: ${i.feasibility}. ${i.verificationStatus}`);
      p();
      for (const c of i.controlVariables) p(`- Control: ${c.name} → ${c.target ? `${c.target[0]}–${c.target[1]}` : 'to be specified'} ${c.unit} (${c.basis.slice(0, 120)})`);
      for (const o of i.evaluation?.outputs ?? []) p(`- Model \`${o.model}\` [${o.label}] ${o.equation}: ${Object.entries(o.outputs).map(([k, v]) => `${k} = ${v.value ?? 'n/a'} ${v.unit}`).join(', ')}. ${o.validity}`);
      for (const d of (i.evaluation as { defaults?: string[] } | null)?.defaults ?? []) p(`- Assumed input: ${d}`);
      for (const l of i.limitations) p(`- Limitation: ${l}`);
      p();
    }
  }
  if (r.campaign) {
    p(`## Campaign`);
    p();
    for (const plan of r.campaign.plans) {
      p(`### ${plan.label}`);
      p();
      p(plan.objective);
      p();
      for (const s of plan.stops) p(`1. **${s.siteName}** (${s.country}), ${s.window}${s.travelFromPrevious ? ` · +${s.travelFromPrevious.hours} h travel` : ''}: ${s.experiments.map((x) => `${x.name} (fit ${x.staticFit})`).join(', ')}`);
      p();
    }
    if (r.campaign.infeasible.length) {
      p(`Infeasible experiments: ${r.campaign.infeasible.map((i) => `${i.experimentName}: ${i.reasons.join('; ')}`).join(' · ')}`);
      p();
    }
  }
  p(`## Evidence`);
  p();
  for (const e of r.evidence) {
    p(`- [${e.status.toUpperCase()}] [${e.title.slice(0, 100)}](${e.url})${e.retrievalError ? `, retrieval failed (${e.retrievalError})` : ''}`);
    for (const v of e.verifications) {
      p(`  - ${v.quantity}: **${v.status}**: ${v.summary}`);
      for (const c of v.claims.slice(0, 2)) p(`    > “${c.quote.slice(0, 220)}” (${c.relation})`);
    }
  }
  if (!r.evidence.length) p('No external evidence was retrieved in this run.');
  p();
  if (r.contradictions.length) {
    p(`## Contradictions`);
    p();
    for (const c of r.contradictions) p(`- ${c.quantity}: ${c.description}`);
    p();
  }
  if (r.reranks.length) {
    p(`## Reranking`);
    p();
    for (const rr of r.reranks) p(`- ${rr.experimentId} (${rr.target}) via ${rr.component}: ${rr.outputOrder.slice(0, 6).join(' > ')}${rr.kendallTauVsBaseline != null ? ` · τ vs baseline ${rr.kendallTauVsBaseline}` : ''}`);
    p();
  }
  if (r.evidenceGaps.length) {
    const groups: Array<[string, string]> = [['integration_needed', 'Integration needed (a dataset exists but is not connected)'], ['field_measurement', 'Field measurement required'], ['physical_mismatch', 'Not reproducible on Earth'], ['investigation_needed', 'Not yet investigated']];
    p(`## Evidence gaps`);
    p();
    for (const [outcome, title] of groups) {
      const items = r.evidenceGaps.filter((g) => g.outcome === outcome);
      if (!items.length) continue;
      p(`### ${title}`);
      p();
      for (const g of items) p(`- **${g.label}** (${g.side === 'target' ? 'target reference' : g.side === 'both' ? 'Earth and target' : 'Earth sites'}): ${g.conclusion} Next: ${g.nextAction}`);
      p();
    }
  }
  p(`## What ODYSSEY could not establish`);
  p();
  for (const u of [...r.narrative.cannotEstablish, ...r.unresolved].slice(0, 30)) p(`- ${u}`);
  p();
  if (r.narrative.nextMeasurements.length) {
    p(`## Measurements that would most improve this plan`);
    p();
    for (const m of r.narrative.nextMeasurements) p(`- ${m}`);
    p();
  }
  p(`## Scientific integrity`);
  p();
  for (const s of r.integrity) p(`- ${s}`);
  p();
  p(`Aggregate definition: ${r.aggregateDefinition}`);
  p();
  p(`Budgets used: ${r.budgets.toolCalls} tool calls, ${r.budgets.llmTurns} LLM turns, ${r.budgets.searchCalls} searches, ${r.budgets.sourceFetches} source fetches, ${r.budgets.promptTokens + r.budgets.completionTokens} tokens.`);
  return lines.join('\n');
}

/** Factual, template-built narrative used when no LLM narrative is available. */
export function deterministicNarrative(state: AgentState): Narrative & { authoredBy?: string } {
  const mission = state.mission!;
  const plan = state.campaign?.plans[0];
  const lines = mission.experiments.map((e) => {
    const list = state.candidates[e.id] ?? [];
    const top = list.find((c) => c.decision !== 'rejected');
    const rejected = list.filter((c) => c.decision === 'rejected').length;
    return top
      ? `${e.name}: best kept candidate ${top.name} (${top.decision}, aggregate ${top.aggregate ?? 'n/a'}); ${rejected} site(s) rejected.`
      : `${e.name}: no candidate survived the hard constraints.`;
  });
  const gaps = Object.values(state.earthWideGaps).flat();
  return {
    summary:
      `Deterministic summary (no language-model narrative). ${mission.experiments.length} experiments were evaluated against ${Object.values(state.candidates)[0]?.length ?? 0} curated sites for ${state.parsed?.body}. ` +
      (plan ? `The ${plan.label.toLowerCase()} plan uses ${plan.stops.length} stop(s): ${plan.stops.map((s) => s.siteName).join(' → ')}.` : 'No campaign plan was feasible.'),
    keyFindings: lines,
    cannotEstablish: gaps.filter((g) => g.kind === 'unresolved_evidence').map((g) => `${g.experimentId}: ${g.label}: no compatible evidence.`).slice(0, 8),
    nextMeasurements: [...new Set(gaps.filter((g) => g.kind === 'unresolved_evidence').map((g) => g.label))].slice(0, 6).map((l) => `Obtain a compatible measurement of ${l.toLowerCase()}.`),
    authoredBy: 'deterministic template',
  };
}
