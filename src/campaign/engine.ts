import type { Site, SiteTerrainInfo } from '../types';
import type { ExperimentSpec, MissionMatrix } from '../mission';
import type { TemporalMatrix } from '../temporal';
import { temporalFactor } from '../temporal';
import {
  analyzeGaps,
  autoInterventions,
  interventionComplexity,
} from '../interventions';
import type {
  CampaignAssignment,
  CampaignConfig,
  CampaignExperimentIssue,
  CampaignLeg,
  CampaignMetrics,
  CampaignPlan,
  CampaignPriority,
  CampaignResult,
  CampaignStop,
  CampaignWindow,
} from './types';

const PLANNING_YEAR = 2027;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const SOURCE =
  'Odyssey campaign optimizer / NASA POWER monthly climatology 2001–2020 / Copernicus DEM / Macrostrat';

function haversineKm(a: Site, b: Site) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function intersectionWindow(assignments: CampaignAssignment[]): CampaignWindow | null {
  if (!assignments.length) return null;
  const labels = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  let months = new Set(assignments[0].temporalWindow.months);
  for (const assignment of assignments.slice(1)) {
    const next = new Set(assignment.temporalWindow.months);
    months = new Set([...months].filter((month) => next.has(month)));
    if (!months.size) return null;
  }
  const required = Math.max(
    ...assignments.map((assignment) => assignment.temporalWindow.missionMonths),
  );
  if (months.size < required) return null;
  let run: number[];
  if (months.size === 12) {
    const start = assignments[0].temporalWindow.startMonth;
    run = Array.from({ length: 12 }, (_, index) => (start + index) % 12);
  } else {
    const all = [...months].sort((a, b) => a - b);
    let start = all.find((month) => !months.has((month + 11) % 12));
    if (start === undefined) start = all[0];
    run = [];
    let current = start;
    while (months.has(current) && run.length < 12) {
      run.push(current);
      current = (current + 1) % 12;
    }
  }
  if (run.length < required) return null;
  const end = run[run.length - 1];
  const endYear = end < run[0] ? PLANNING_YEAR + 1 : PLANNING_YEAR;
  return {
    startMonth: run[0],
    endMonth: end,
    months: run,
    lengthMonths: run.length,
    label: run.length === 1 ? labels[run[0]] : `${labels[run[0]]}–${labels[end]}`,
    startDate: isoDate(PLANNING_YEAR, run[0], 1),
    endDate: isoDate(endYear, end, MONTH_DAYS[end]),
    planningYear: PLANNING_YEAR,
    climatology: true,
  };
}

function buildLegs(stops: CampaignStop[], sites: Map<string, Site>) {
  const legs: CampaignLeg[] = [];
  let km = 0;
  let hours = 0;
  if (!stops.length) return { legs, km, hours };
  const first = sites.get(stops[0].siteId);
  hours += first?.airport?.groundHours ?? 2;
  for (let index = 0; index < stops.length - 1; index += 1) {
    const from = sites.get(stops[index].siteId);
    const to = sites.get(stops[index + 1].siteId);
    if (!from || !to) continue;
    const distance = haversineKm(from, to);
    const flight = distance / 800;
    const ground = to.airport?.groundHours ?? 2;
    const legHours = flight + ground;
    km += distance;
    hours += legHours;
    legs.push({
      fromSiteId: from.id,
      toSiteId: to.id,
      fromName: from.name,
      toName: to.name,
      km: Math.round(distance),
      hours: Math.round(legHours * 10) / 10,
      mode: 'great-circle + destination airport ground transfer',
      source: 'Derived from site coordinates and published airport ground estimates; not a booked route.',
    });
  }
  return { legs, km, hours };
}

function planSignature(assignments: CampaignAssignment[]) {
  return [...assignments]
    .map(
      (assignment) =>
        `${assignment.experimentId}:${assignment.siteId}:${assignment.temporalWindow.startMonth}-${assignment.temporalWindow.lengthMonths}`,
    )
    .sort()
    .join('|');
}

function compare(priority: CampaignPriority, a: CampaignPlan, b: CampaignPlan) {
  const am = a.metrics;
  const bm = b.metrics;
  if (priority === 'science') {
    return (
      bm.minFit - am.minFit ||
      bm.meanFit - am.meanFit ||
      am.residualCount - bm.residualCount ||
      am.interventionComplexity - bm.interventionComplexity ||
      am.sites - bm.sites ||
      am.travelHours - bm.travelHours
    );
  }
  if (priority === 'logistics') {
    return (
      am.sites - bm.sites ||
      am.travelHours - bm.travelHours ||
      bm.minFit - am.minFit ||
      bm.meanFit - am.meanFit ||
      am.interventionComplexity - bm.interventionComplexity ||
      am.residualCount - bm.residualCount
    );
  }
  return (
    am.interventionComplexity - bm.interventionComplexity ||
    am.residualCount - bm.residualCount ||
    bm.minFit - am.minFit ||
    am.sites - bm.sites ||
    am.travelHours - bm.travelHours ||
    bm.meanFit - am.meanFit
  );
}

const PRIORITY_LABELS: Record<CampaignPriority, { label: string; objective: string }> = {
  science: {
    label: 'SCIENCE-FIRST',
    objective:
      'Maximise the weakest experiment fit, then mean fit; then minimise residual gaps, intervention complexity, distinct sites and travel. This is the default recommendation.',
  },
  logistics: {
    label: 'LOGISTICS-FIRST',
    objective:
      'Minimise distinct sites and travel hours first; then maximise the weakest experiment fit. Use this when field logistics dominate.',
  },
  interventions: {
    label: 'INTERVENTION-LIGHT',
    objective:
      'Minimise intervention complexity and residual unresolved conditions first; then maximise the weakest experiment fit. Use this when facility access is constrained.',
  },
};

export function optimizeCampaign(
  experiments: ExperimentSpec[],
  missionMatrix: MissionMatrix,
  temporalMatrix: TemporalMatrix,
  sites: Site[],
  terrainLookup: Record<string, SiteTerrainInfo | undefined>,
  config: CampaignConfig,
): CampaignResult {
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const issues: CampaignExperimentIssue[] = [];
  const optionsByExperiment: Record<string, CampaignAssignment[]> = {};
  const allOptionsByExperiment: Record<string, CampaignAssignment[]> = {};
  const optionCounts: Record<string, number> = {};

  for (const experiment of experiments) {
    const temporalRows = temporalMatrix.byExperiment[experiment.id] ?? [];
    const options: CampaignAssignment[] = [];
    const reasons = new Set<string>();
    for (const temporal of temporalRows) {
      if (temporal.feasibility === 'none' || temporal.feasibility === 'insufficient') {
        reasons.add(
          temporal.feasibility === 'none'
            ? 'no suitable climatological window for the configured duration'
            : 'monthly evidence coverage is insufficient',
        );
        continue;
      }
      const window =
        temporalMatrix.config.startMonth !== null
          ? temporal.selectedWindow
          : temporal.bestWindow;
      if (!window) {
        reasons.add('fixed start month is not suitable for the required duration');
        continue;
      }
      const staticResult = missionMatrix.bySite[temporal.siteId]?.experiments[experiment.id];
      const staticFit = staticResult?.score ?? null;
      if (staticFit === null) {
        reasons.add('static experiment evidence is insufficient');
        continue;
      }
      if (staticFit < config.minimumExperimentFit) {
        reasons.add(`static fit is below the ${config.minimumExperimentFit} minimum`);
        continue;
      }
      const site = siteById.get(temporal.siteId);
      if (!site) continue;
      const baseGaps = analyzeGaps(
        experiment,
        site,
        terrainLookup[site.id],
        temporal,
        {},
      );
      const auto = autoInterventions(baseGaps.gaps, config.interventionPolicy);
      const analysis = analyzeGaps(
        experiment,
        site,
        terrainLookup[site.id],
        temporal,
        auto,
      );
      const interventions = [
        ...new Set(
          analysis.gaps
            .map((gap) => gap.selectedInterventionId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const residualGaps = analysis.gaps.filter(
        (gap) => gap.gap !== 'natural' && gap.controlled !== 'full',
      );
      const residualLabels = residualGaps.map((gap) => `${gap.label}: ${gap.gapLabel}`);
      const planningScore = staticFit * temporalFactor(temporal);
      const confidence =
        analysis.confidence *
        (0.55 + 0.45 * Math.max(0, Math.min(1, window.dataCoverage)));
      options.push({
        experimentId: experiment.id,
        experimentName: experiment.name,
        experimentShortName: experiment.shortName,
        siteId: site.id,
        siteName: site.name,
        country: site.country,
        staticFit,
        temporalFeasibility: temporal.feasibility,
        temporalScore: window.meanScore,
        planningScore,
        evidenceCoverage: staticResult.coverage,
        temporalWindow: window,
        interventions,
        interventionComplexity: interventionComplexity(interventions),
        measuredOnly: analysis.measuredOnly,
        residualGaps,
        residualLabels,
        gapAnalysis: analysis,
        confidence,
      });
    }
    options.sort(
      (a, b) =>
        b.planningScore - a.planningScore ||
        b.confidence - a.confidence ||
        a.interventionComplexity - b.interventionComplexity,
    );
    optionCounts[experiment.id] = options.length;
    allOptionsByExperiment[experiment.id] = options;
    optionsByExperiment[experiment.id] = options.slice(0, config.optionsPerExperiment);
    if (!options.length) {
      issues.push({
        experimentId: experiment.id,
        experimentName: experiment.name,
        reasons: [...reasons].length ? [...reasons] : ['no candidate site passed the constraints'],
      });
    }
  }

  // Keep the top options, and also retain options at sites that are competitive
  // for more than one experiment. This makes shared-site logistics discoverable
  // without exploding the search space.
  const siteAppearances = new Map<string, Set<string>>();
  for (const experiment of experiments) {
    const topSites = new Set(
      (allOptionsByExperiment[experiment.id] ?? [])
        .slice(0, 4)
        .map((option) => option.siteId),
    );
    for (const siteId of topSites) {
      const set = siteAppearances.get(siteId) ?? new Set<string>();
      set.add(experiment.id);
      siteAppearances.set(siteId, set);
    }
  }
  for (const experiment of experiments) {
    const base = optionsByExperiment[experiment.id] ?? [];
    const seen = new Set(base.map((option) => option.siteId));
    const extra = (allOptionsByExperiment[experiment.id] ?? [])
      .filter(
        (option) =>
          !seen.has(option.siteId) &&
          (siteAppearances.get(option.siteId)?.size ?? 0) > 1,
      )
      .slice(0, 3);
    optionsByExperiment[experiment.id] = [...base, ...extra];
  }

  const validPlans = new Map<string, CampaignPlan>();
  const chosen: CampaignAssignment[] = [];
  const evaluateCombination = () => {
    const grouped = new Map<string, CampaignAssignment[]>();
    for (const assignment of chosen) {
      const list = grouped.get(assignment.siteId) ?? [];
      list.push(assignment);
      grouped.set(assignment.siteId, list);
    }
    if (grouped.size > config.maxSites) return;
    const stops: CampaignStop[] = [];
    for (const [siteId, assignments] of grouped) {
      const site = siteById.get(siteId);
      if (!site) return;
      const window = intersectionWindow(assignments);
      if (!window) return;
      const interventions = [
        ...new Set(
          assignments.flatMap((assignment) => assignment.interventions),
        ),
      ];
      const equipment = [
        ...new Set(
          experiments
            .filter((experiment) =>
              assignments.some((assignment) => assignment.experimentId === experiment.id),
            )
            .flatMap((experiment) => experiment.equipment),
        ),
      ];
      const unresolved = [
        ...new Set(assignments.flatMap((assignment) => assignment.residualLabels)),
      ];
      const dependencies: string[] = [];
      if (assignments.length > 1) {
        dependencies.push(
          `${assignments.length} experiments share this site; they must be sequenced inside the common ${window.label} window.`,
        );
      }
      if (interventions.length) {
        dependencies.push(
          `${interventions.length} intervention or measurement action${interventions.length === 1 ? '' : 's'} must be planned before the experiment.`,
        );
      }
      const confidence =
        assignments.reduce((total, assignment) => total + assignment.confidence, 0) /
        assignments.length;
      const suitability =
        assignments.reduce((total, assignment) => total + assignment.planningScore, 0) /
        assignments.length;
      stops.push({
        siteId,
        siteName: site.name,
        country: site.country,
        lat: site.lat,
        lon: site.lon,
        window,
        experiments: assignments,
        interventions,
        equipment,
        dependencies,
        unresolved,
        confidence,
        suitability,
        access: site.airport
          ? `${site.airport.name} / ${site.airport.groundHours.toFixed(1)} h ground`
          : 'No published airport transfer',
        sequence: 0,
        monthOffset: 0,
      });
    }

    const permutations: CampaignStop[][] = [];
    const permute = (items: CampaignStop[], prefix: CampaignStop[] = []) => {
      if (!items.length) {
        permutations.push(prefix);
        return;
      }
      for (let index = 0; index < items.length; index += 1) {
        permute(
          [...items.slice(0, index), ...items.slice(index + 1)],
          [...prefix, items[index]],
        );
      }
    };
    permute(stops);
    let ordered = stops;
    let bestTravel = Number.POSITIVE_INFINITY;
    for (const permutation of permutations) {
      if (!permutation.length) continue;
      const first = permutation[0].window.startMonth;
      let previous = -1;
      let chronological = true;
      for (const stop of permutation) {
        const offset = (stop.window.startMonth - first + 12) % 12;
        if (offset < previous) {
          chronological = false;
          break;
        }
        previous = offset;
      }
      if (!chronological) continue;
      const travel = buildLegs(permutation, siteById);
      if (travel.hours < bestTravel) {
        bestTravel = travel.hours;
        ordered = permutation;
      }
    }
    const firstMonth = ordered[0]?.window.startMonth ?? 0;
    ordered.forEach((stop, index) => {
      stop.sequence = index + 1;
      stop.monthOffset = (stop.window.startMonth - firstMonth + 12) % 12;
    });
    const lastMonthOffset = Math.max(
      ...ordered.map((stop) => stop.monthOffset + stop.window.lengthMonths - 1),
    );
    const timelineEndMonth = (firstMonth + lastMonthOffset) % 12;
    const timelineEndYear =
      timelineEndMonth < firstMonth || lastMonthOffset >= 12
        ? PLANNING_YEAR + 1
        : PLANNING_YEAR;
    const timeline = {
      startMonth: firstMonth,
      endMonth: timelineEndMonth,
      totalMonths: lastMonthOffset + 1,
      startDate: isoDate(PLANNING_YEAR, firstMonth, 1),
      endDate: isoDate(timelineEndMonth === firstMonth && lastMonthOffset === 0 ? PLANNING_YEAR : timelineEndYear, timelineEndMonth, MONTH_DAYS[timelineEndMonth]),
      planningYear: PLANNING_YEAR,
      label:
        lastMonthOffset === 0
          ? ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][firstMonth]
          : `${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][firstMonth]}–${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][(firstMonth + lastMonthOffset) % 12]}`,
      climatology: true as const,
    };
    const travel = buildLegs(ordered, siteById);
    if (travel.hours > config.maxTravelHours) return;

    const allAssignments = ordered.flatMap((stop) => stop.experiments);
    const minFit = Math.min(...allAssignments.map((assignment) => assignment.planningScore));
    const meanFit =
      allAssignments.reduce((total, assignment) => total + assignment.planningScore, 0) /
      allAssignments.length;
    const meanTemporal =
      allAssignments.reduce((total, assignment) => total + assignment.temporalScore, 0) /
      allAssignments.length;
    const interventions = [
      ...new Set(allAssignments.flatMap((assignment) => assignment.interventions)),
    ];
    const unresolved = [...new Set(allAssignments.flatMap((assignment) => assignment.residualLabels))];
    const metrics: CampaignMetrics = {
      minFit,
      meanFit,
      meanTemporal,
      sites: new Set(allAssignments.map((assignment) => assignment.siteId)).size,
      stops: ordered.length,
      travelKm: Math.round(travel.km),
      travelHours: Math.round(travel.hours * 10) / 10,
      interventionComplexity: interventionComplexity(interventions),
      interventions: interventions.length,
      residualCount: unresolved.length,
      confidence:
        allAssignments.reduce((total, assignment) => total + assignment.confidence, 0) /
        allAssignments.length,
    };
    const signature = planSignature(allAssignments);
    if (validPlans.has(signature)) return;
    const priority: CampaignPriority = 'science';
    validPlans.set(signature, {
      id: signature,
      priority,
      label: 'CAMPAIGN',
      objective: PRIORITY_LABELS[priority].objective,
      stops: ordered,
      legs: travel.legs,
      metrics,
      timeline,
      assumptions: [
        'Windows are NASA POWER 2001–2020 monthly climatological normals, not forecasts.',
        'Travel is a derived great-circle estimate plus published airport ground-transfer times; no cost model is applied.',
        'Interventions are generic capability classes; site-specific availability, performance and permits are not verified.',
        'A residual gap is carried explicitly; this campaign is not a perfectly matched planetary analog.',
      ],
      limitations: [
        ...unresolved,
        'Monthly windows suppress daily and hourly extremes; verify the actual weather before deployment.',
        'Representative planning dates use a 2027 planning envelope; they are not a forecast.',
      ],
      unresolved,
      source: SOURCE,
    });
  };

  const recurse = (index: number) => {
    if (index >= experiments.length) {
      evaluateCombination();
      return;
    }
    const experiment = experiments[index];
    const options = optionsByExperiment[experiment.id] ?? [];
    const selectedSites = new Set(chosen.map((assignment) => assignment.siteId));
    for (const option of options) {
      if (!selectedSites.has(option.siteId) && selectedSites.size >= config.maxSites) {
        continue;
      }
      chosen.push(option);
      recurse(index + 1);
      chosen.pop();
    }
  };
  recurse(0);

  const allPlans = [...validPlans.values()];
  const priorities: CampaignPriority[] = ['science', 'logistics', 'interventions'];
  const selected: CampaignPlan[] = [];
  const used = new Set<string>();
  for (const priority of priorities) {
    const sorted = [...allPlans].sort((a, b) => compare(priority, a, b));
    const plan = sorted.find((item) => !used.has(item.id));
    if (plan) {
      used.add(plan.id);
      selected.push({
        ...plan,
        priority,
        label: PRIORITY_LABELS[priority].label,
        objective: PRIORITY_LABELS[priority].objective,
      });
    }
  }
  if (!selected.length && allPlans.length) {
    const plan = [...allPlans].sort((a, b) => compare('science', a, b))[0];
    for (const priority of priorities) {
      selected.push({
        ...plan,
        priority,
        label: PRIORITY_LABELS[priority].label,
        objective: PRIORITY_LABELS[priority].objective,
      });
    }
  }

  const constraintIssues: string[] = [];
  if (!selected.length) {
    if (issues.length) {
      constraintIssues.push(
        'No feasible campaign exists because at least one experiment has no temporal option under the current constraints.',
      );
    } else {
      constraintIssues.push(
        `No assignment combination satisfies all constraints (max ${config.maxSites} sites, max ${config.maxTravelHours} travel hours).`,
      );
      constraintIssues.push(
        'Relax the site or travel constraint, allow marginal windows, or reduce the minimum experiment fit.',
      );
    }
  }

  return {
    config,
    plans: selected,
    selectedPlanId: selected[0]?.id ?? null,
    infeasible: issues,
    constraintIssues,
    objective:
      'Exhaustive search over the pruned option set (top options per experiment). Hard constraints: every experiment must have a climatological window, the fixed start month if set must be suitable, maximum distinct sites, maximum travel hours, and minimum static experiment fit. Three lexicographic priorities expose the trade-off: science-first, logistics-first and intervention-light.',
    assumptions: [
      'Temporal windows are NASA POWER 2001–2020 monthly climatological normals, not forecasts.',
      'Representative planning dates use a 2027 envelope; they are not a dated weather prediction.',
      'Travel is a derived great-circle estimate plus published airport ground-transfer times; it is not a booked route and has no cost model.',
      'Interventions are generic capability classes. Site-specific availability, performance, infrastructure, permits and cost are not verified.',
      'A campaign with residual gaps is not a perfect planetary analog. Residual conditions are carried in every stop.',
      'Monthly windows suppress daily extremes; a seasonally suitable month is not a guarantee for every day.',
    ],
    optionCounts,
    source: SOURCE,
  };
}
