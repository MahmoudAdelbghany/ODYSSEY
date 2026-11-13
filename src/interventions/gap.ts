import type { Site, SiteTerrainInfo } from '../types';
import {
  formatMetric,
  getMetric,
  type ExperimentSpec,
  type RequirementStatus,
} from '../mission';
import type {
  ExperimentTemporalResult,
  RequirementTemporalSeries,
  TemporalWindow,
} from '../temporal';
import { INTERVENTIONS, INTERVENTION_BY_ID } from './catalog';
import type {
  ExperimentGapAnalysis,
  GapKind,
  Intervention,
  RequirementGap,
} from './types';

export function selectionKey(siteId: string, experimentId: string, requirementId: string) {
  return `${siteId}:${experimentId}:${requirementId}`;
}

export function interventionFor(id: string | null | undefined) {
  return id ? INTERVENTION_BY_ID.get(id) ?? null : null;
}

export function gapLabel(gap: GapKind) {
  const labels: Record<GapKind, string> = {
    natural: 'NATURALLY SATISFIED',
    'natural-partial': 'NATURALLY PARTIAL',
    temporal: 'SEASONAL / WINDOW GAP',
    range: 'OUTSIDE NATURAL RANGE',
    facility: 'FACILITY-REPRODUCIBLE',
    impossible: 'NOT REALISTICALLY REPRODUCIBLE',
    missing: 'EVIDENCE GAP',
  };
  return labels[gap];
}

function worstStatus(statuses: RequirementStatus[]): RequirementStatus {
  if (statuses.some((status) => status === 'fail')) return 'fail';
  if (statuses.some((status) => status === 'partial')) return 'partial';
  if (statuses.some((status) => status === 'missing')) return 'missing';
  if (statuses.every((status) => status === 'not-applicable')) return 'not-applicable';
  return 'pass';
}

function displayRange(
  series: RequirementTemporalSeries,
  months: number[] | null,
): string {
  if (!months) return 'NO WINDOW';
  const values = months
    .map((month) => series.monthly[month]?.value)
    .filter((value): value is number => value !== null && value !== undefined);
  if (!values.length) return 'NO DATA';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const unit = series.unit;
  if (Math.abs(max - min) < 1e-9) {
    return formatMetric(series.metric, min, 'lower');
  }
  const suffix = unit === '°' || unit === '%' ? unit : unit ? ` ${unit}` : '';
  const digits = series.metric === 'access' || series.metric === 'dust' || series.metric === 'water' ? 2 : 1;
  return `${min.toFixed(digits)}–${max.toFixed(digits)}${suffix}`;
}

function bestMonthlyStatus(series: RequirementTemporalSeries): RequirementStatus {
  const statuses = series.monthly
    .filter((point) => point.status !== 'not-applicable')
    .map((point) => point.status);
  if (!statuses.length) return 'not-applicable';
  if (statuses.includes('pass')) return 'pass';
  if (statuses.includes('partial')) return 'partial';
  if (statuses.includes('fail')) return 'fail';
  return 'missing';
}

export function analyzeGaps(
  experiment: ExperimentSpec,
  site: Site,
  terrain: SiteTerrainInfo | undefined,
  temporal: ExperimentTemporalResult,
  selections: Record<string, string>,
): ExperimentGapAnalysis {
  const window: TemporalWindow | null = temporal.bestWindow ?? temporal.windows[0] ?? null;
  const gaps: RequirementGap[] = [];

  for (const requirement of experiment.requirements) {
    const series = temporal.requirements.find((item) => item.requirementId === requirement.id);
    let naturalStatus: RequirementStatus = 'missing';
    let windowStatus: RequirementStatus | 'not-scored' = 'not-scored';
    let naturalDisplay = 'NO DATA';

    if (requirement.kind === 'facility' || requirement.kind === 'impossible') {
      naturalStatus = 'not-applicable';
      windowStatus = 'not-scored';
      naturalDisplay = 'SITE-INDEPENDENT';
    } else if (series) {
      if (window) {
        windowStatus = worstStatus(
          window.months.map((month) => series.monthly[month]?.status ?? 'missing'),
        );
        naturalStatus = windowStatus;
        naturalDisplay = displayRange(series, window.months);
      } else {
        naturalStatus = bestMonthlyStatus(series);
        naturalDisplay = displayRange(
          series,
          series.monthly.map((point) => point.month),
        );
      }
      if (naturalStatus === 'not-applicable') {
        const value = getMetric(site, terrain, requirement.metric);
        naturalDisplay = value === null ? 'NO DATA' : formatMetric(requirement.metric, value, requirement.direction);
        naturalStatus = value === null ? 'missing' : 'pass';
      }
    }

    let gap: GapKind;
    if (requirement.kind === 'facility') gap = 'facility';
    else if (requirement.kind === 'impossible') gap = 'impossible';
    else if (naturalStatus === 'pass') gap = 'natural';
    else if (naturalStatus === 'partial') gap = 'natural-partial';
    else if (naturalStatus === 'missing' || naturalStatus === 'not-applicable') gap = 'missing';
    else if (series?.timeDependent && bestMonthlyStatus(series) !== 'fail') gap = 'temporal';
    else gap = 'range';

    const candidates = INTERVENTIONS.filter(
      (item) => item.addresses.includes(requirement.metric) && item.gapKinds.includes(gap),
    ).map((item) => item.id);
    const key = selectionKey(site.id, experiment.id, requirement.id);
    const selectedId = selections[key] ?? null;
    const selected =
      selectedId && candidates.includes(selectedId) ? interventionFor(selectedId) : null;
    const controlled = selected?.closure ?? 'none';
    const note =
      gap === 'missing'
        ? requirement.missingReason ??
          'No measurement is available in the current evidence base. Measurement would reduce uncertainty, not create the condition.'
        : gap === 'temporal'
          ? 'The condition is available in another month but is outside the stated requirement inside the best mission window.'
          : gap === 'facility' || gap === 'impossible'
            ? requirement.missingReason ??
              'No ordinary field environment provides this condition. A facility may partially reproduce it.'
            : gap === 'natural'
              ? 'Satisfied by the site in the best available mission window.'
              : gap === 'natural-partial'
                ? 'Within the acceptable limit but outside the stated ideal during the window.'
                : 'Outside the acceptable limit during the best available mission window.';

    gaps.push({
      requirementId: requirement.id,
      experimentId: experiment.id,
      siteId: site.id,
      metric: requirement.metric,
      label: requirement.label,
      statement: requirement.statement,
      kind: requirement.kind,
      weight: requirement.weight,
      naturalStatus,
      naturalDisplay,
      windowStatus,
      gap,
      gapLabel: gapLabel(gap),
      note,
      interventionIds: candidates,
      selectedInterventionId: selected ? selected.id : null,
      controlled,
      residual: gap !== 'natural',
    });
  }

  gaps.sort((a, b) => {
    const rank = (gap: RequirementGap) => (gap.gap === 'natural' ? 1 : 0);
    return rank(a) - rank(b);
  });

  const naturalSatisfied = gaps.filter((gap) => gap.gap === 'natural').length;
  const naturalGaps = gaps.length - naturalSatisfied;
  const controlledAddressed = gaps.filter(
    (gap) =>
      gap.selectedInterventionId !== null &&
      gap.gap !== 'natural' &&
      gap.controlled !== 'measurement-only',
  ).length;
  const measuredOnly = gaps.filter((gap) => gap.controlled === 'measurement-only').length;
  const residualUnresolved = gaps.filter(
    (gap) =>
      gap.gap !== 'natural' &&
      (!gap.selectedInterventionId || gap.controlled !== 'full'),
  ).length;
  const controlledFull = gaps.filter((gap) => gap.controlled === 'full').length;
  const controlledPartial = gaps.filter(
    (gap) => gap.controlled === 'partial' || gap.controlled === 'simulation-only',
  ).length;
  const total = Math.max(1, gaps.length);
  const base =
    (naturalSatisfied +
      controlledFull +
      0.5 * controlledPartial +
      0.15 * measuredOnly) /
    total;
  const residualPenalty = 1 - 0.4 * (residualUnresolved / total);
  const confidence = Math.max(0, Math.min(1, base * residualPenalty));

  const limitations = [
    'An intervention adds a controlled layer; it does not change the natural condition of the site.',
    'Intervention availability, performance, infrastructure and cost are not verified for any candidate site.',
    'A measured gap is not a reproduced condition; measurement only reduces evidence uncertainty.',
    'Facility-reproduced conditions are not equivalent to the open planetary environment.',
  ];
  const impossible = gaps.filter((gap) => gap.gap === 'impossible');
  for (const gap of impossible) {
    limitations.push(
      `${gap.label}: ${gap.selectedInterventionId ? 'an intervention can only partially simulate it' : 'no intervention closes this condition'}.`,
    );
  }
  for (const gap of gaps.filter((item) => item.gap === 'missing')) {
    limitations.push(`${gap.label}: ${gap.note}`);
  }
  if (!window) {
    limitations.unshift(
      'No suitable mission window was found for this experiment at this site; the gap analysis uses the best available month and is not a recommendation.',
    );
  }

  return {
    experimentId: experiment.id,
    siteId: site.id,
    experimentName: experiment.name,
    window,
    gaps,
    naturalSatisfied,
    naturalGaps,
    controlledAddressed,
    measuredOnly,
    residualUnresolved,
    totalRequirements: gaps.length,
    confidence,
    limitations,
    source:
      'Odyssey intervention model / NASA POWER monthly climatology 2001–2020 / Copernicus DEM / Macrostrat',
  };
}

function scoreIntervention(intervention: Intervention) {
  const closureRank: Record<Intervention['closure'], number> = {
    full: 0,
    partial: 1,
    'simulation-only': 2,
    'measurement-only': 3,
  };
  return (
    closureRank[intervention.closure] * 10 +
    intervention.complexityRank +
    (intervention.deployment === 'facility' ? 5 : 0)
  );
}

export function suggestedIntervention(
  gap: RequirementGap,
  policy: 'field-only' | 'include-facility',
): Intervention | null {
  const candidates = gap.interventionIds
    .map((id) => interventionFor(id))
    .filter((item): item is Intervention => Boolean(item));
  if (gap.gap === 'missing') {
    const measurements = candidates.filter(
      (item) => item.closure === 'measurement-only',
    );
    if (!measurements.length) return null;
    return [...measurements].sort(
      (a, b) => scoreIntervention(a) - scoreIntervention(b),
    )[0];
  }
  const allowed = candidates.filter(
    (item) =>
      policy === 'include-facility' ||
      item.deployment === 'field' ||
      item.deployment === 'either',
  );
  if (!allowed.length) return null;
  return [...allowed].sort((a, b) => scoreIntervention(a) - scoreIntervention(b))[0];
}

export function autoInterventions(
  gaps: RequirementGap[],
  policy: 'field-only' | 'include-facility',
): Record<string, string> {
  const selections: Record<string, string> = {};
  for (const gap of gaps) {
    if (gap.gap === 'natural') continue;
    const intervention = suggestedIntervention(gap, policy);
    if (intervention) {
      selections[selectionKey(gap.siteId, gap.experimentId, gap.requirementId)] =
        intervention.id;
    }
  }
  return selections;
}

export function interventionComplexity(interventions: string[]) {
  const unique = [...new Set(interventions)];
  return unique.reduce(
    (total, id) => total + (interventionFor(id)?.complexityRank ?? 0),
    0,
  );
}
