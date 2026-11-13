import type { Site, SiteTerrainInfo } from '../types';
import {
  formatMetric,
  getMetric,
  scoreRequirement,
  statusFor,
  TIME_DEPENDENT_METRICS,
  type ExperimentSpec,
  type MetricKey,
  type MissionSpec,
  type RequirementSpec,
} from '../mission';
import type {
  ExperimentTemporalResult,
  MonthlyExperimentPoint,
  MonthlyRequirementPoint,
  RequirementTemporalSeries,
  TemporalConfig,
  TemporalFeasibility,
  TemporalLookup,
  TemporalMatrix,
  TemporalMonthStatus,
  TemporalWindow,
} from './types';

export const MONTH_LABELS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const SOURCE = 'NASA POWER monthly climatology 2001–2020';

export function isTemporalMetric(metric: MetricKey) {
  return TIME_DEPENDENT_METRICS.has(metric);
}

export function requiredMonths(durationDays: number) {
  if (durationDays >= 365) return 12;
  return Math.max(1, Math.min(12, Math.ceil(durationDays / 30)));
}

export function monthRangeLabel(start: number, length: number) {
  const end = (start + length - 1) % 12;
  if (length === 1) return MONTH_LABELS[start];
  return `${MONTH_LABELS[start]}–${MONTH_LABELS[end]}`;
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function monthlyValue(
  metric: MetricKey,
  month: number,
  site: Site,
  terrain: SiteTerrainInfo | undefined,
  monthly: TemporalLookup[string],
): { value: number | null; annualized: boolean } {
  if (!monthly) return { value: getMetric(site, terrain, metric), annualized: false };
  switch (metric) {
    case 'tempMean':
      return { value: finite(monthly.temp[month]), annualized: false };
    case 'tempMax':
      return { value: finite(monthly.tempMax[month]), annualized: false };
    case 'tempMin':
      return { value: finite(monthly.tempMin[month]), annualized: false };
    case 'tempAmp': {
      const high = finite(monthly.tempMax[month]);
      const low = finite(monthly.tempMin[month]);
      return { value: high !== null && low !== null ? high - low : null, annualized: false };
    }
    case 'precipYear': {
      const rate = finite(monthly.precip[month]);
      return { value: rate !== null ? rate * 365 : null, annualized: true };
    }
    case 'humidity':
      return { value: finite(monthly.humidity[month]), annualized: false };
    case 'wind':
      return { value: finite(monthly.wind[month]), annualized: false };
    case 'solar':
      return { value: finite(monthly.solar[month]), annualized: false };
    case 'aerosol':
      return { value: finite(monthly.aerosol[month]), annualized: false };
    case 'soilWetnessTop':
      return { value: finite(monthly.soilWetnessTop[month]), annualized: false };
    case 'pressure':
      return { value: finite(monthly.pressure[month]), annualized: false };
    case 'airDensity': {
      const pressure = finite(monthly.pressure[month]);
      const temp = finite(monthly.temp[month]);
      if (pressure === null || temp === null) return { value: null, annualized: false };
      return { value: (pressure * 1000) / (287.05 * (temp + 273.15)), annualized: false };
    }
    default:
      return { value: getMetric(site, terrain, metric), annualized: false };
  }
}

function monthlyRequirement(
  requirement: RequirementSpec,
  site: Site,
  terrain: SiteTerrainInfo | undefined,
  monthly: TemporalLookup[string],
): RequirementTemporalSeries {
  const timeDependent = isTemporalMetric(requirement.metric);
  const points: MonthlyRequirementPoint[] = [];
  let available = 0;

  for (let month = 0; month < 12; month += 1) {
    if (requirement.kind === 'facility' || requirement.kind === 'impossible') {
      points.push({
        month,
        value: null,
        display: 'SITE-INDEPENDENT',
        score: null,
        status: 'not-applicable',
        timeDependent,
        annualized: false,
      });
      continue;
    }
    const resolved = monthlyValue(requirement.metric, month, site, terrain, monthly);
    if (resolved.value === null) {
      points.push({
        month,
        value: null,
        display: 'NO DATA',
        score: null,
        status: 'missing',
        timeDependent,
        annualized: resolved.annualized,
      });
      continue;
    }
    available += 1;
    points.push({
      month,
      value: resolved.value,
      display: formatMetric(requirement.metric, resolved.value, requirement.direction),
      score: scoreRequirement(requirement, resolved.value),
      status: statusFor(requirement, resolved.value),
      timeDependent,
      annualized: resolved.annualized,
    });
  }

  return {
    requirementId: requirement.id,
    metric: requirement.metric,
    label: requirement.label,
    kind: requirement.kind,
    unit: requirement.unit,
    statement: requirement.statement,
    timeDependent,
    annualizedMonthly: requirement.metric === 'precipYear',
    monthly: points,
    availableMonths: available,
    note:
      requirement.kind === 'facility' || requirement.kind === 'impossible'
        ? 'Mission-level condition. Not site-scored.'
        : timeDependent
          ? requirement.metric === 'precipYear'
            ? 'Monthly precipitation converted to an annualized rate; seasonal aridity is represented by the monthly cycle.'
            : 'Monthly climatological normal from NASA POWER, not a forecast.'
          : 'Time-invariant in the current evidence base; the same site value applies to every month.',
  };
}

function monthScore(
  experiment: ExperimentSpec,
  month: number,
  requirements: RequirementTemporalSeries[],
): MonthlyExperimentPoint {
  let totalWeight = 0;
  let availableWeight = 0;
  let weighted = 0;
  let requiredMissing = false;
  let requiredFailed = false;
  let requiredPartial = false;
  const violations: string[] = [];
  const missing: string[] = [];
  let temporalRequirements = 0;
  let temporalAvailable = 0;

  for (const requirement of experiment.requirements) {
    if (requirement.kind === 'facility' || requirement.kind === 'impossible') continue;
    totalWeight += requirement.weight;
    const series = requirements.find((item) => item.requirementId === requirement.id);
    const point = series?.monthly[month];
    if (series?.timeDependent) {
      temporalRequirements += 1;
      if (point?.value !== null && point?.value !== undefined) temporalAvailable += 1;
    }
    if (!point || point.score === null) {
      missing.push(requirement.label);
      if (requirement.kind === 'required') requiredMissing = true;
      continue;
    }
    availableWeight += requirement.weight;
    weighted += point.score * requirement.weight;
    if (point.status === 'fail') {
      violations.push(requirement.label);
      if (requirement.kind === 'required') requiredFailed = true;
    } else if (point.status === 'partial') {
      if (requirement.kind === 'required') requiredPartial = true;
    }
  }

  const raw = availableWeight > 0 ? weighted / availableWeight : null;
  const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;
  const dataCoverage = temporalRequirements > 0 ? temporalAvailable / temporalRequirements : 1;
  let score = raw === null ? null : raw * (0.55 + 0.45 * coverage);
  if (score !== null) {
    if (requiredMissing) score *= 0.9;
    if (requiredFailed) score *= 0.9;
    score = Math.min(score, requiredMissing || requiredFailed ? 84 : 100);
  }

  let status: TemporalMonthStatus = 'good';
  if (requiredFailed) status = 'unsuitable';
  else if (score === null || coverage < 0.35) status = 'insufficient';
  else if (requiredMissing || requiredPartial || coverage < 0.5) status = 'marginal';

  return {
    month,
    score,
    coverage,
    dataCoverage,
    status,
    violations,
    missing,
  };
}

interface Run {
  start: number;
  length: number;
  months: number[];
}

function circularRuns(flags: boolean[]): Run[] {
  const runs: Run[] = [];
  const all = flags.every(Boolean);
  if (all) {
    return [{ start: 0, length: 12, months: Array.from({ length: 12 }, (_, i) => i) }];
  }
  for (let start = 0; start < 12; start += 1) {
    const previous = (start + 11) % 12;
    if (!flags[start] || flags[previous]) continue;
    const months: number[] = [];
    let index = start;
    while (flags[index] && months.length < 12) {
      months.push(index);
      index = (index + 1) % 12;
    }
    runs.push({ start, length: months.length, months });
  }
  return runs;
}

function windowFor(
  months: number[],
  monthly: MonthlyExperimentPoint[],
  missionMonths: number,
): TemporalWindow {
  const points = months.map((month) => monthly[month]);
  const scores = points.map((point) => point.score).filter((value): value is number => value !== null);
  const meanScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const minScore = scores.length ? Math.min(...scores) : 0;
  const maxScore = scores.length ? Math.max(...scores) : 0;
  const stability = Math.max(0, Math.min(1, 1 - (maxScore - minScore) / 100));
  const coverage = points.reduce((total, point) => total + point.coverage, 0) / points.length;
  const dataCoverage = points.reduce((total, point) => total + point.dataCoverage, 0) / points.length;
  const violations = [...new Set(points.flatMap((point) => point.violations))];
  const missing = [...new Set(points.flatMap((point) => point.missing))];
  const feasibility = points.some((point) => point.status === 'marginal')
    ? 'marginal'
    : 'good';
  const start = months[0];
  const length = months.length;
  return {
    startMonth: start,
    endMonth: months[months.length - 1],
    months,
    wrap: length > 1 && months[months.length - 1] < start,
    lengthMonths: length,
    missionMonths,
    meanScore,
    minScore,
    stability,
    coverage,
    dataCoverage,
    feasibility,
    violations,
    missing,
    label: monthRangeLabel(start, length),
    source: SOURCE,
  };
}

function bestMissionWindow(
  run: Run,
  required: number,
  monthly: MonthlyExperimentPoint[],
): TemporalWindow | null {
  if (run.length < required) return null;
  let best: TemporalWindow | null = null;
  for (let offset = 0; offset <= run.length - required; offset += 1) {
    const months = Array.from({ length: required }, (_, index) => run.months[offset + index]);
    const candidate = windowFor(months, monthly, required);
    if (
      !best ||
      candidate.meanScore > best.meanScore + 0.001 ||
      (Math.abs(candidate.meanScore - best.meanScore) <= 0.001 &&
        candidate.stability > best.stability)
    ) {
      best = candidate;
    }
  }
  return best;
}

export function evaluateTemporal(
  mission: MissionSpec,
  sites: Site[],
  monthlyLookup: TemporalLookup,
  terrainLookup: Record<string, SiteTerrainInfo | undefined>,
  config: TemporalConfig,
): TemporalMatrix {
  const bySite: Record<string, Record<string, ExperimentTemporalResult>> = {};
  const byExperiment: Record<string, ExperimentTemporalResult[]> = {};
  for (const experiment of mission.experiments) byExperiment[experiment.id] = [];

  const required = requiredMonths(config.durationDays);
  for (const site of sites) {
    bySite[site.id] = {};
    for (const experiment of mission.experiments) {
      const requirements = experiment.requirements.map((requirement) =>
        monthlyRequirement(requirement, site, terrainLookup[site.id], monthlyLookup[site.id]),
      );
      const monthly = Array.from({ length: 12 }, (_, month) =>
        monthScore(experiment, month, requirements),
      );
      const suitable = monthly.map(
        (point) => point.status === 'good' || (config.allowMarginal && point.status === 'marginal'),
      );
      const runs = circularRuns(suitable);
      const windows = runs.map((run) =>
        windowFor(run.months, monthly, required),
      );
      const missionWindows = runs
        .map((run) => bestMissionWindow(run, required, monthly))
        .filter((window): window is TemporalWindow => Boolean(window));
      const bestWindow = missionWindows.sort(
        (a, b) =>
          b.meanScore - a.meanScore ||
          b.minScore - a.minScore ||
          b.stability - a.stability ||
          b.lengthMonths - a.lengthMonths,
      )[0] ?? null;
      const selectedWindow =
        config.startMonth === null
          ? null
          : (() => {
              const start = config.startMonth;
              const months = Array.from({ length: required }, (_, index) => (start + index) % 12);
              const allSuitable = months.every((month) => suitable[month]);
              if (!allSuitable) return null;
              return windowFor(months, monthly, required);
            })();
      const dataCoverage =
        monthly.reduce((total, point) => total + point.dataCoverage, 0) / 12;
      const temporalRequirementCount = requirements.filter((item) => item.timeDependent).length;
      const limitations: string[] = [
        'NASA POWER monthly climatology 2001–2020; this is not a weather forecast.',
        'Monthly normals suppress daily and hourly extremes; a suitable month is not a guarantee for every day.',
        'Climate is a point reanalysis value, not a spatial field across the 20.48 × 12.8 km site.',
      ];
      if (temporalRequirementCount === 0) {
        limitations.push('No time-dependent requirements in this experiment; windows are driven by the mission-duration rule.');
      }
      if (monthlyLookup[site.id]?.complete === false) {
        limitations.push('One or more monthly parameters are missing from NASA POWER for this site.');
      }
      if (monthly.some((point) => point.missing.length)) {
        limitations.push('Some monthly requirement evidence is unavailable; those months are marked insufficient or missing.');
      }
      const feasibility: TemporalFeasibility =
        bestWindow?.feasibility ??
        (windows.length > 0 && dataCoverage >= 0.5 ? 'none' : dataCoverage < 0.5 ? 'insufficient' : 'none');
      if (!bestWindow && windows.length > 0) {
        limitations.push(
          `Conditions remain suitable for ${windows[0].lengthMonths} month${windows[0].lengthMonths === 1 ? '' : 's'}, shorter than the ${required}-month mission duration.`,
        );
      }
      const result: ExperimentTemporalResult = {
        experimentId: experiment.id,
        siteId: site.id,
        monthly,
        requirements,
        windows,
        bestWindow,
        selectedWindow,
        feasibility,
        dataCoverage,
        limitations,
        source: SOURCE,
      };
      bySite[site.id][experiment.id] = result;
      byExperiment[experiment.id].push(result);
    }
  }

  const rank: Record<TemporalFeasibility, number> = {
    good: 0,
    marginal: 1,
    insufficient: 2,
    none: 3,
  };
  for (const experiment of mission.experiments) {
    byExperiment[experiment.id].sort(
      (a, b) =>
        rank[a.feasibility] - rank[b.feasibility] ||
        (b.bestWindow?.meanScore ?? -1) - (a.bestWindow?.meanScore ?? -1) ||
        b.dataCoverage - a.dataCoverage,
    );
  }

  return {
    config,
    bySite,
    byExperiment,
    monthLabels: MONTH_LABELS,
    source: SOURCE,
  };
}

export function temporalFactor(result: ExperimentTemporalResult | null | undefined) {
  if (!result) return 0.35;
  if (result.feasibility === 'good') return 1;
  if (result.feasibility === 'marginal') return 0.9;
  if (result.feasibility === 'insufficient') return 0.45;
  return 0.2;
}

export function temporalAvailabilityForMonth(
  result: ExperimentTemporalResult | null | undefined,
  month: number,
) {
  const point = result?.monthly[month];
  if (!point) return 'none';
  if (point.status === 'good' || point.status === 'marginal') return 'suitable';
  if (point.status === 'insufficient') return 'insufficient';
  return 'unsuitable';
}

export function monthScoreFor(
  result: ExperimentTemporalResult | null | undefined,
  month: number,
) {
  return result?.monthly[month] ?? null;
}

export function bestWindowFor(
  result: ExperimentTemporalResult | null | undefined,
  useSelected = false,
) {
  if (!result) return null;
  return useSelected && result.selectedWindow ? result.selectedWindow : result.bestWindow;
}

export function temporalWindowLabel(window: TemporalWindow | null) {
  if (!window) return 'NO WINDOW';
  return window.label;
}
