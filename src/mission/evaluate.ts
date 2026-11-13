import type { Site } from '../types';
import { formatMetric, getMetric } from './metrics';
import { requirementEvidence } from './evidence';
import type {
  ExperimentSiteResult,
  ExperimentSpec,
  MissionMatrix,
  MissionSpec,
  RequirementEvaluation,
  RequirementSpec,
  RequirementSummary,
  SiteMissionResult,
  SiteTerrainLookup,
} from './types';

function smoothstep(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function scoreRequirement(requirement: RequirementSpec, value: number): number {
  const { direction, ideal, limit, idealMax, limitMax } = requirement;
  if (direction === 'boolean') return value >= 1 ? 100 : 0;
  if (direction === 'lower') {
    if (value <= ideal) return 100;
    if (value >= limit) return 0;
    return smoothstep((limit - value) / Math.max(1e-9, limit - ideal)) * 100;
  }
  if (direction === 'higher') {
    if (value >= ideal) return 100;
    if (value <= limit) return 0;
    return smoothstep((value - limit) / Math.max(1e-9, ideal - limit)) * 100;
  }
  const lowIdeal = ideal;
  const highIdeal = idealMax ?? ideal;
  const lowLimit = limit;
  const highLimit = limitMax ?? idealMax ?? limit;
  if (value >= lowIdeal && value <= highIdeal) return 100;
  if (value < lowIdeal) {
    if (value <= lowLimit) return 0;
    return smoothstep((value - lowLimit) / Math.max(1e-9, lowIdeal - lowLimit)) * 100;
  }
  if (value >= highLimit) return 0;
  return smoothstep((highLimit - value) / Math.max(1e-9, highLimit - highIdeal)) * 100;
}

export function statusFor(
  requirement: RequirementSpec,
  value: number,
): 'pass' | 'partial' | 'fail' {
  if (requirement.direction === 'boolean') {
    return value >= 1 ? 'pass' : 'fail';
  }
  if (requirement.direction === 'lower') {
    if (value <= requirement.ideal) return 'pass';
    if (value >= requirement.limit) return 'fail';
    return 'partial';
  }
  if (requirement.direction === 'higher') {
    if (value >= requirement.ideal) return 'pass';
    if (value <= requirement.limit) return 'fail';
    return 'partial';
  }
  const highIdeal = requirement.idealMax ?? requirement.ideal;
  const lowLimit = requirement.limit;
  const highLimit = requirement.limitMax ?? requirement.idealMax ?? requirement.limit;
  if (value >= requirement.ideal && value <= highIdeal) return 'pass';
  if (value <= lowLimit || value >= highLimit) return 'fail';
  return 'partial';
}

export function evaluateRequirement(
  requirement: RequirementSpec,
  site: Site,
  terrain: SiteTerrainLookup[string],
): RequirementEvaluation {
  const base = { requirementId: requirement.id, experimentId: requirement.experimentId, siteId: site.id };
  if (requirement.kind === 'facility' || requirement.kind === 'impossible') {
    return {
      ...base,
      value: null,
      display: 'SITE-INDEPENDENT',
      score: null,
      status: 'not-applicable',
      note: requirement.missingReason ?? 'Requires a facility; cannot be evaluated from a candidate site.',
      evidence: requirementEvidence(requirement, site, null),
    };
  }

  const value = getMetric(site, terrain, requirement.metric);
  const evidence = requirementEvidence(requirement, site, value);
  if (value === null || !Number.isFinite(value)) {
    // An upper bound can disprove a "higher is better" requirement, never prove it.
    if (evidence.bound && requirement.direction === 'higher' && evidence.bound.value < requirement.limit) {
      return {
        ...base,
        value: null,
        display: `≤ ${evidence.bound.value}${evidence.bound.unit}`,
        score: 0,
        status: 'fail',
        note: evidence.why,
        evidence,
      };
    }
    return {
      ...base,
      value: null,
      display: evidence.bound ? `≤ ${evidence.bound.value}${evidence.bound.unit}` : 'NO DATA',
      score: null,
      status: 'missing',
      note: evidence.why,
      evidence,
    };
  }

  const score = scoreRequirement(requirement, value);
  return {
    ...base,
    value,
    display: formatMetric(requirement.metric, value, requirement.direction),
    score,
    status: statusFor(requirement, value),
    note: `${requirement.evidence.nature.toUpperCase()} / ${requirement.evidence.spatiality.toUpperCase()}`,
    evidence,
  };
}

function evaluateExperiment(
  experiment: ExperimentSpec,
  site: Site,
  terrain: SiteTerrainLookup[string],
): ExperimentSiteResult {
  const evaluations = experiment.requirements.map((requirement) =>
    evaluateRequirement(requirement, site, terrain),
  );
  const scorable = experiment.requirements.filter(
    (requirement) => requirement.kind !== 'facility' && requirement.kind !== 'impossible',
  );

  let totalWeight = 0;
  let availableWeight = 0;
  let weighted = 0;
  let requiredWeight = 0;
  let requiredAvailable = 0;
  for (const requirement of scorable) {
    totalWeight += requirement.weight;
    const evaluation = evaluations.find((e) => e.requirementId === requirement.id);
    if (requirement.kind === 'required') requiredWeight += requirement.weight;
    if (evaluation && evaluation.score !== null) {
      availableWeight += requirement.weight;
      weighted += evaluation.score * requirement.weight;
      if (requirement.kind === 'required') requiredAvailable += requirement.weight;
    }
  }

  const rawScore = availableWeight > 0 ? weighted / availableWeight : null;
  const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;
  const requiredCoverage = requiredWeight > 0 ? requiredAvailable / requiredWeight : 1;
  const missing = evaluations
    .filter((e) => e.status === 'missing')
    .map((e) => e.requirementId);
  const failed = evaluations
    .filter((e) => e.status === 'fail')
    .map((e) => e.requirementId);
  const partial = evaluations
    .filter((e) => e.status === 'partial')
    .map((e) => e.requirementId);
  const facility = evaluations
    .filter((e) => e.status === 'not-applicable')
    .map((e) => e.requirementId);
  const impossible = experiment.requirements
    .filter((r) => r.kind === 'impossible')
    .map((r) => r.id);

  const failedRequired = evaluations.some((e) => {
    const requirement = experiment.requirements.find((r) => r.id === e.requirementId);
    return requirement?.kind === 'required' && e.status === 'fail';
  });
  const missingRequired = evaluations.some((e) => {
    const requirement = experiment.requirements.find((r) => r.id === e.requirementId);
    return requirement?.kind === 'required' && e.status === 'missing';
  });
  const requiredLimited = requiredCoverage < 0.6;
  let requiredEstimateWeight = 0;
  for (const requirement of scorable) {
    if (requirement.kind !== 'required') continue;
    const evaluation = evaluations.find((e) => e.requirementId === requirement.id);
    if (evaluation?.score !== null && evaluation?.evidence?.state === 'unvalidated_estimate') requiredEstimateWeight += requirement.weight;
  }
  const estimateLed = requiredAvailable > 0 && requiredEstimateWeight / requiredAvailable >= 0.5;

  let score = rawScore === null ? null : rawScore * (0.55 + 0.45 * coverage);
  if (score !== null) {
    if (missingRequired) score *= 0.9;
    if (failedRequired) score *= 0.9;
    if (requiredLimited) score *= 0.94;
    if (coverage < 0.35) score = Math.min(score, 35);
    if (failedRequired) score = Math.min(score, 76);
    if (missingRequired) score = Math.min(score, 84);
  }

  let status: ExperimentSiteResult['status'] =
    score === null || coverage < 0.35
      ? 'insufficient'
      : score >= 70
        ? 'strong'
        : score >= 45
          ? 'moderate'
          : 'weak';
  if (status === 'strong' && (missingRequired || failedRequired || requiredLimited || estimateLed)) {
    status = 'moderate';
  }

  return {
    experimentId: experiment.id,
    siteId: site.id,
    rawScore,
    score,
    coverage,
    requiredCoverage,
    missing,
    failed,
    partial,
    facility,
    impossible,
    status,
    evaluations,
  };
}

export function evaluateMission(
  mission: MissionSpec,
  sites: Site[],
  terrain: SiteTerrainLookup,
): MissionMatrix {
  const bySite: Record<string, SiteMissionResult> = {};
  const byExperiment: Record<string, ExperimentSiteResult[]> = {};
  const requirementSummaries: Record<string, RequirementSummary> = {};

  for (const experiment of mission.experiments) {
    byExperiment[experiment.id] = [];
  }

  for (const site of sites) {
    const experiments: Record<string, ExperimentSiteResult> = {};
    let weighted = 0;
    let weight = 0;
    let coverageWeighted = 0;

    for (const experiment of mission.experiments) {
      const result = evaluateExperiment(experiment, site, terrain[site.id]);
      experiments[experiment.id] = result;
      byExperiment[experiment.id].push(result);
      const priority = experiment.priority;
      weighted += (result.score ?? 0) * priority;
      weight += priority;
      coverageWeighted += result.coverage * priority;

      for (const evaluation of result.evaluations) {
        const requirement = experiment.requirements.find((r) => r.id === evaluation.requirementId);
        if (!requirement) continue;
        const summary =
          requirementSummaries[requirement.id] ??
          ({
            experimentId: experiment.id,
            requirementId: requirement.id,
            pass: 0,
            partial: 0,
            fail: 0,
            missing: 0,
            notApplicable: 0,
            evaluated: 0,
            total: 0,
          } satisfies RequirementSummary);
        summary.total += 1;
        if (evaluation.status === 'pass') summary.pass += 1;
        else if (evaluation.status === 'partial') summary.partial += 1;
        else if (evaluation.status === 'fail') summary.fail += 1;
        else if (evaluation.status === 'missing') summary.missing += 1;
        else summary.notApplicable += 1;
        if (evaluation.score !== null) summary.evaluated += 1;
        requirementSummaries[requirement.id] = summary;
      }
    }

    const score = weight > 0 ? weighted / weight : null;
    const coverage = weight > 0 ? coverageWeighted / weight : 0;
    const supported = mission.experiments
      .filter((experiment) => {
        const result = experiments[experiment.id];
        return result.score !== null && result.score >= 65 && result.coverage >= 0.5;
      })
      .map((experiment) => experiment.id);
    const best = mission.experiments.reduce<{ id: string; score: number } | null>((current, experiment) => {
      const value = experiments[experiment.id].score;
      if (value === null) return current;
      if (!current || value > current.score) return { id: experiment.id, score: value };
      return current;
    }, null);

    bySite[site.id] = {
      siteId: site.id,
      score,
      coverage,
      experiments,
      supported,
      bestExperimentId: best?.id ?? null,
    };
  }

  for (const experiment of mission.experiments) {
    byExperiment[experiment.id].sort((a, b) => {
      if (a.score === null && b.score === null) return b.coverage - a.coverage;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      if (Math.abs(b.score - a.score) > 0.05) return b.score - a.score;
      return b.coverage - a.coverage;
    });
  }

  const rankedSiteIds = [...sites]
    .sort((a, b) => {
      const left = bySite[a.id];
      const right = bySite[b.id];
      if (left.score === null && right.score === null) return right.coverage - left.coverage;
      if (left.score === null) return 1;
      if (right.score === null) return -1;
      if (Math.abs(right.score - left.score) > 0.05) return right.score - left.score;
      return right.coverage - left.coverage;
    })
    .map((site) => site.id);

  return { bySite, byExperiment, requirementSummaries, rankedSiteIds };
}
