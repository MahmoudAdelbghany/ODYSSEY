/**
 * Autonomous candidate filtering (PART 6).
 *
 * Hard constraints are applied deterministically first; nothing learned can
 * override them. Rankings are reported per dimension; the aggregate is an
 * explicitly weighted secondary summary, not a probability.
 */
import type { ExperimentSpec, MissionMatrix } from '../../src/mission/index.ts';
import type { TemporalMatrix } from '../../src/temporal/index.ts';
import { SITE_BY_ID } from './data.ts';
import { alignBaseline, compareMeasurements, detectMismatches, type MismatchFinding } from './mismatch.ts';
import { earthSiteProfile, type EnvironmentalProfile } from './profile.ts';
import { proposeInterventions } from './interventions.ts';

export interface Rankings {
  terrainSimilarity: number | null;
  thermalCompatibility: number | null;
  geologicalRelevance: number | null;
  operationalFeasibility: number | null;
  experimentalSuitability: number | null;
  evidenceCompleteness: number | null;
  interventionFeasibility: number | null;
}

export const AGGREGATE_WEIGHTS: Record<keyof Rankings, number> = {
  experimentalSuitability: 0.35,
  terrainSimilarity: 0.15,
  thermalCompatibility: 0.1,
  geologicalRelevance: 0.1,
  operationalFeasibility: 0.1,
  evidenceCompleteness: 0.15,
  interventionFeasibility: 0.05,
};

export const AGGREGATE_DEFINITION =
  'Secondary summary = Σ wᵢ·rankingᵢ / Σ wᵢ over available rankings, with w = experimental suitability 0.35, terrain 0.15, evidence completeness 0.15, thermal 0.10, geology 0.10, operations 0.10, intervention feasibility 0.05. Not a probability of success.';

export interface CandidateEvaluation {
  siteId: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  decision: 'viable' | 'downgraded' | 'rejected';
  reasons: string[];
  hardFailures: string[];
  rankings: Rankings;
  aggregate: number | null;
  experimentScore: number | null;
  coverage: number;
  requiredCoverage: number;
  temporal: { feasibility: string; window: string | null };
  mismatches: MismatchFinding[];
}

const CLASS_SCORE: Record<string, number | null> = {
  analog: 100,
  partial: 55,
  mismatch: 10,
  not_naturally_reproducible: 0,
  incompatible_support: null,
  missing: null,
};

function meanOf(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

const GEOLOGY_METRICS = new Set(['basalt', 'evaporite', 'clay', 'sulfate', 'volcanic', 'impact', 'regolith', 'sand', 'iron', 'limestone', 'hydratedMinerals', 'geoTagCount', 'geologyMapped', 'cave', 'ice', 'glacier']);
const OPERATIONS_METRICS = new Set(['access', 'airportHours', 'water', 'isolationIndex']);

export function evaluateCandidates(
  experiment: ExperimentSpec,
  matrix: MissionMatrix,
  temporal: TemporalMatrix,
  target: EnvironmentalProfile,
  options: { minRequiredCoverage?: number; minScore?: number } = {},
): CandidateEvaluation[] {
  const minRequiredCoverage = options.minRequiredCoverage ?? 0.5;
  const minScore = options.minScore ?? 40;
  const results = matrix.byExperiment[experiment.id] ?? [];
  const requirementById = new Map(experiment.requirements.map((r) => [r.id, r]));
  return results.map((result) => {
    const site = SITE_BY_ID.get(result.siteId)!;
    const profile = earthSiteProfile(site);
    const mismatches = detectMismatches(experiment.id, experiment.id, profile, target);
    const aligned = alignBaseline(profile, target);
    const classScore = (dims: string[]) =>
      meanOf(dims.map((d) => CLASS_SCORE[compareMeasurements(aligned.measurements[d], target.measurements[d]).classification]));
    const terrainSimilarity = classScore(['terrain.slopeMean', 'terrain.slopeP95', 'terrain.roughness', 'terrain.relief']);
    const thermalCompatibility = classScore(target.body === 'Mars' ? ['thermal.surfaceRange', 'thermal.airRange'] : ['thermal.surfaceRange']);
    const reqScores = (pred: (metric: string) => boolean) =>
      meanOf(result.evaluations.filter((e) => pred(requirementById.get(e.requirementId)?.metric ?? '')).map((e) => e.score));
    const geologicalRelevance = reqScores((m) => GEOLOGY_METRICS.has(m));
    const operationalFeasibility = meanOf([reqScores((m) => OPERATIONS_METRICS.has(m)), Math.round(site.access * 100)]);
    const relevantDims = mismatches.filter((m) => m.importance !== 'context');
    const evidencedDims = relevantDims.filter((m) => m.comparison.classification !== 'missing' && m.comparison.classification !== 'incompatible_support').length;
    const evidenceCompleteness = Math.round(100 * (0.5 * result.coverage + 0.5 * (relevantDims.length ? evidencedDims / relevantDims.length : 0)));
    const bridgeable = mismatches.filter((m) => m.matters && (m.comparison.classification === 'not_naturally_reproducible' || m.comparison.classification === 'mismatch'));
    const interventionFeasibility = bridgeable.length
      ? Math.round((100 * bridgeable.filter((m) => proposeInterventions(m, target).some((i) => i.label !== 'CONCEPT ONLY')).length) / bridgeable.length)
      : null;
    const rankings: Rankings = {
      terrainSimilarity,
      thermalCompatibility,
      geologicalRelevance,
      operationalFeasibility,
      experimentalSuitability: result.score == null ? null : Math.round(result.score),
      evidenceCompleteness,
      interventionFeasibility,
    };
    let num = 0;
    let den = 0;
    for (const [key, weight] of Object.entries(AGGREGATE_WEIGHTS) as Array<[keyof Rankings, number]>) {
      const value = rankings[key];
      if (value != null) {
        num += weight * value;
        den += weight;
      }
    }
    const aggregate = den ? Math.round(num / den) : null;

    const hardFailures: string[] = [];
    const reasons: string[] = [];
    for (const evaluation of result.evaluations) {
      const req = requirementById.get(evaluation.requirementId);
      if (req?.kind === 'required' && evaluation.status === 'fail') {
        hardFailures.push(`${req.label}: ${evaluation.display} violates the required limit (${req.statement})`);
      }
    }
    const t = temporal.bySite[result.siteId]?.[experiment.id];
    const window = t?.bestWindow ?? null;
    if (t && t.feasibility === 'none') hardFailures.push(`No climatological window satisfies the required conditions for ${temporal.config.durationDays} days.`);
    let decision: CandidateEvaluation['decision'] = 'viable';
    if (hardFailures.length) {
      decision = 'rejected';
      reasons.push(...hardFailures);
    } else if (result.requiredCoverage < minRequiredCoverage) {
      decision = 'rejected';
      reasons.push(`Insufficient evidence: only ${Math.round(result.requiredCoverage * 100)}% of required conditions are measured (minimum ${Math.round(minRequiredCoverage * 100)}%), regardless of its screening score.`);
    } else if (result.score == null || result.score < minScore) {
      decision = 'rejected';
      reasons.push(`Experiment score ${result.score == null ? 'unavailable' : Math.round(result.score)} is below the ${minScore} minimum.`);
    } else {
      const critical = mismatches.filter((m) => m.importance === 'critical' && (m.comparison.classification === 'mismatch'));
      if (critical.length) {
        decision = 'downgraded';
        reasons.push(...critical.map((m) => `Critical mismatch on ${m.label}: ${m.comparison.reason}`));
      }
      // Missing Earth evidence on a critical condition the target *does* quantify is a site-specific gap.
      const unevidenced = mismatches.filter(
        (m) => m.importance === 'critical' && m.comparison.classification === 'missing' && m.comparison.earth.status === 'MISSING' && m.comparison.planet.status !== 'MISSING',
      );
      if (unevidenced.length) {
        decision = 'downgraded';
        reasons.push(...unevidenced.map((m) => `Critical condition not evidenced at this site: ${m.label} (${m.comparison.earth.note || 'no data'}).`));
      }
      if (result.partial.length) reasons.push(`${result.partial.length} requirement(s) only partially met.`);
      if (result.missing.length) reasons.push(`${result.missing.length} requirement(s) have no data and remain unresolved.`);
      if (t?.feasibility === 'marginal') reasons.push('Only marginal climatological windows are available.');
      const estimated = result.evaluations.filter((e) => requirementById.get(e.requirementId)?.kind === 'required' && e.score !== null && e.evidence?.state === 'unvalidated_estimate');
      if (estimated.length) reasons.push(`Required condition(s) rest on unvalidated estimates: ${estimated.map((e) => requirementById.get(e.requirementId)?.label).join(', ')}.`);
      if (!reasons.length) reasons.push('Meets all required conditions with measured or derived evidence.');
    }
    return {
      siteId: site.id,
      name: site.name,
      country: site.country,
      lat: site.lat,
      lon: site.lon,
      decision,
      reasons,
      hardFailures,
      rankings,
      aggregate,
      experimentScore: result.score == null ? null : Math.round(result.score),
      coverage: Math.round(result.coverage * 100) / 100,
      requiredCoverage: Math.round(result.requiredCoverage * 100) / 100,
      temporal: { feasibility: t?.feasibility ?? 'unknown', window: window?.label ?? null },
      mismatches,
    };
  });
}

const ORDER = { viable: 0, downgraded: 1, rejected: 2 } as const;

export function sortCandidates(list: CandidateEvaluation[]) {
  return [...list].sort((a, b) => ORDER[a.decision] - ORDER[b.decision] || (b.aggregate ?? -1) - (a.aggregate ?? -1) || a.siteId.localeCompare(b.siteId));
}

/**
 * A critical condition that no viable Earth candidate reproduces even partially
 * is an Earth-wide gap: no site choice can close it, so it needs an intervention,
 * a simulation, or acknowledgement as residual.
 */
export function earthWideGaps(experimentId: string, candidates: CandidateEvaluation[]) {
  const pool = candidates.filter((c) => c.decision !== 'rejected');
  if (!pool.length) return [];
  const dims = new Map<string, { label: string; importance: string; best: string; why: string; outcome: string; side: string | null; next: string | null }>();
  for (const c of pool) {
    for (const m of c.mismatches) {
      if (m.importance === 'context') continue;
      const prev = dims.get(m.dimension);
      const rank = (cls: string) => ['analog', 'partial', 'mismatch', 'not_naturally_reproducible', 'incompatible_support', 'missing'].indexOf(cls);
      const better = !prev || rank(m.comparison.classification) < rank(prev.best);
      // On a tie, prefer the more specific explanation (only the target side missing means Earth data exists).
      const sharper = prev && rank(m.comparison.classification) === rank(prev.best) && prev.side === 'both' && m.comparison.gapSide !== 'both';
      if (better || sharper)
        dims.set(m.dimension, { label: m.label, importance: m.importance, best: m.comparison.classification, why: m.why, outcome: m.comparison.gapOutcome, side: m.comparison.gapSide, next: m.comparison.nextAction });
    }
  }
  return [...dims.entries()]
    .filter(([, v]) => v.outcome !== 'not_applicable')
    .filter(([, v]) => v.best === 'mismatch' || v.best === 'not_naturally_reproducible' || v.best === 'missing' || v.best === 'incompatible_support')
    .map(([dimension, v]) => ({
      experimentId,
      dimension,
      label: v.label,
      importance: v.importance,
      bestAvailable: v.best,
      kind: v.best === 'missing' || v.best === 'incompatible_support' ? ('unresolved_evidence' as const) : ('not_reproducible_by_site_choice' as const),
      outcome: v.outcome,
      gapSide: v.side,
      nextAction: v.next,
      why: v.why,
    }));
}
