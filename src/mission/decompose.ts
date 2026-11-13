import type { ProfileKey } from '../types';
import { TIME_DEPENDENT_METRICS } from './types';
import { ARCHETYPES, ARCHETYPE_BY_ID, type Archetype, type RequirementRecipe } from './archetypes';
import { metricEvidence, metricLabel, metricUnit } from './metrics';
import type {
  EvidenceProvenance,
  ExperimentSource,
  ExperimentSpec,
  ExplicitConstraint,
  MetricKey,
  MissionSpec,
  RequirementSpec,
  TargetBody,
} from './types';

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fourteen: 14,
  twenty: 20,
  thirty: 30,
  forty: 40,
  sixty: 60,
  ninety: 90,
};

const PROFILE_MAP: { pattern: RegExp; id: string }[] = [
  { pattern: /construction|regolith/i, id: 'regolith_construction' },
  { pattern: /thermal|illumination/i, id: 'thermal_survival' },
  { pattern: /shield|subsurface/i, id: 'subsurface_shielding' },
  { pattern: /power|energy/i, id: 'continuous_power' },
  { pattern: /dust|aeolian/i, id: 'dust_aeolian' },
  { pattern: /mineral|habitab|astro/i, id: 'astrobiology' },
  { pattern: /rover|terrain/i, id: 'rover_navigation' },
  { pattern: /geolog|sampling/i, id: 'geological_sampling' },
  { pattern: /deploy|equipment/i, id: 'equipment_deployment' },
  { pattern: /communication|relay/i, id: 'communications' },
  { pattern: /isru|resource/i, id: 'isru' },
  { pattern: /ice|glaci/i, id: 'glaciology' },
  { pattern: /volcan/i, id: 'volcanology' },
  { pattern: /impact|crater/i, id: 'impact_cratering' },
  { pattern: /drill|core/i, id: 'drilling' },
  { pattern: /uav|aerial|drone/i, id: 'uav_survey' },
  { pattern: /agricultur|crop|plant/i, id: 'agriculture' },
  { pattern: /human|isolation/i, id: 'human_factors' },
  { pattern: /sample return|curation/i, id: 'sample_return' },
];

interface ConstraintMetric {
  metric: MetricKey;
  aliases: string[];
}

const CONSTRAINT_METRICS: ConstraintMetric[] = [
  { metric: 'slopeP95', aliases: ['slopes?', 'gradients?', 'terrain slope'] },
  { metric: 'tempAmp', aliases: ['diurnal range', 'temperature range', 'diurnal amplitude'] },
  { metric: 'tempMean', aliases: ['temperatures?', 'temperature'] },
  { metric: 'precipYear', aliases: ['precipitation', 'rainfall', 'rain'] },
  { metric: 'wind', aliases: ['wind speed', 'winds?'] },
  { metric: 'humidity', aliases: ['relative humidity', 'humidity'] },
  { metric: 'solar', aliases: ['solar', 'insolation', 'irradiance'] },
  { metric: 'elevation', aliases: ['elevation', 'altitude'] },
  { metric: 'access', aliases: ['access', 'accessible'] },
  { metric: 'dust', aliases: ['dust'] },
  { metric: 'pressure', aliases: ['pressure'] },
  { metric: 'airportHours', aliases: ['airport', 'airport transfer'] },
  { metric: 'water', aliases: ['water index', 'water availability', 'water'] },
  { metric: 'soilWetnessTop', aliases: ['soil wetness', 'soil moisture'] },
];

const AFFINITY: Partial<Record<MetricKey, string[]>> = {
  slopeP95: ['rover_navigation', 'equipment_deployment', 'regolith_construction', 'site_survey'],
  tempMean: ['thermal_survival', 'agriculture', 'human_factors'],
  tempMax: ['thermal_survival', 'eva_suit', 'agriculture'],
  tempMin: ['thermal_survival', 'human_factors', 'drilling'],
  tempAmp: ['thermal_survival', 'eva_suit'],
  precipYear: ['dust_aeolian', 'astrobiology', 'geological_sampling'],
  humidity: ['sample_return', 'astrobiology', 'human_factors'],
  wind: ['dust_aeolian', 'uav_survey', 'equipment_deployment'],
  solar: ['continuous_power', 'agriculture'],
  dust: ['dust_aeolian', 'rover_navigation'],
  access: ['equipment_deployment', 'sample_return', 'site_survey'],
  airportHours: ['equipment_deployment', 'sample_return'],
  pressure: ['uav_survey'],
  elevation: ['uav_survey'],
  water: ['isru', 'agriculture', 'astrobiology'],
  soilWetnessTop: ['agriculture', 'astrobiology'],
};

function sentenceEnd(text: string, from: number) {
  const match = /[.;\n]/.exec(text.slice(from));
  return match ? from + match.index : text.length;
}

function matchArchetypes(brief: string) {
  const matches: {
    archetype: Archetype;
    index: number;
    indices: number[];
    terms: string[];
  }[] = [];
  for (const archetype of ARCHETYPES) {
    let best = Number.POSITIVE_INFINITY;
    const indices: number[] = [];
    const terms: string[] = [];
    for (const pattern of archetype.patterns) {
      const match = pattern.exec(brief);
      if (match) {
        best = Math.min(best, match.index);
        indices.push(match.index);
        if (!terms.includes(match[0].toLowerCase())) terms.push(match[0].toLowerCase());
      }
    }
    if (Number.isFinite(best)) matches.push({ archetype, index: best, indices, terms });
  }
  return matches.sort((a, b) => a.index - b.index);
}

function priorityFor(brief: string, indices: number[]) {
  const triggers = /\b(prioriti[sz]e|priority|focus(?:ed)? on|emphasis|primary|critical|essential)\b/gi;
  let trigger: RegExpExecArray | null;
  while ((trigger = triggers.exec(brief))) {
    const current = trigger;
    const stop = sentenceEnd(brief, current.index);
    if (indices.some((index) => index >= current.index && index <= stop)) {
      return /\b(primary|critical|essential)\b/i.test(current[0]) ? 3 : 2;
    }
  }
  return 1;
}

function targetFrom(brief: string): { target: TargetBody; note: string } {
  const text = brief.toLowerCase();
  if (/\bmars\b|martian/.test(text)) {
    return { target: 'Mars', note: 'Mars analog profile selected from brief language.' };
  }
  if (/\bmoon\b|\blunar\b|south pole/.test(text)) {
    return { target: 'Moon', note: 'Lunar analog profile selected from brief language.' };
  }
  if (/\bearth\b|terrestrial/.test(text)) {
    return { target: 'Earth analog', note: 'Brief frames the work as an Earth analog study.' };
  }
  if (/\beuropa\b|\btitan\b|\bceres\b|\basteroid\b|\bvenus\b|\benceladus\b/.test(text)) {
    return {
      target: 'Unresolved',
      note:
        'ODYSSEY has no dedicated profile for this target body. The 39 Earth analog ' +
        'sites are still evaluated, but the planetary reference conditions are unresolved.',
    };
  }
  return {
    target: 'Unresolved',
    note:
      'The brief does not name a target body. Analog selection uses the chosen mission ' +
      'profile; planetary reference conditions are unresolved.',
  };
}

function durationFrom(brief: string): { days: number | null; label: string } {
  const numeric = /(\d+)[- ]day\b/i.exec(brief);
  if (numeric) {
    const days = Number(numeric[1]);
    return { days, label: `${days}-DAY` };
  }
  const word = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|twenty|thirty|forty|sixty|ninety)[- ]day\b/i.exec(
    brief,
  );
  if (word) {
    const days = WORD_NUMBERS[word[1].toLowerCase()] ?? null;
    return { days, label: days ? `${days}-DAY` : 'NOT STATED' };
  }
  if (/\bpermanent\b/i.test(brief)) return { days: null, label: 'PERMANENT' };
  if (/\blong[- ]duration\b/i.test(brief)) return { days: null, label: 'LONG DURATION' };
  if (/\bexpedition\b/i.test(brief)) return { days: null, label: 'EXPEDITION' };
  return { days: null, label: 'NOT STATED' };
}

function crewFrom(brief: string): number | null {
  const numeric = /(\d+)\s*(?:-|\s)?(?:person|people|crew|astronaut|member)/i.exec(brief);
  if (numeric) return Number(numeric[1]);
  const word = /\b(one|two|three|four|five|six|seven|eight|nine|ten)[- ](?:person|people|crew|astronaut|member)\b/i.exec(
    brief,
  );
  if (word) return WORD_NUMBERS[word[1].toLowerCase()] ?? null;
  return null;
}

function parseConstraints(brief: string): ExplicitConstraint[] {
  const maxWords = '(?:below|under|less than|at most|no more than|max(?:imum)?|within|<=?|≤)';
  const minWords = '(?:above|over|at least|min(?:imum)?|>=?|greater than|more than|≥)';
  const found: ExplicitConstraint[] = [];

  for (const entry of CONSTRAINT_METRICS) {
    const alias = `(?:${entry.aliases.join('|')})`;
    const patterns = [
      new RegExp(`${alias}[^.;\\n]{0,24}?\\b(${maxWords}|${minWords})\\b[^.;\\n]{0,10}?(-?\\d+(?:\\.\\d+)?)`, 'gi'),
      new RegExp(`\\b(${maxWords}|${minWords})\\b[^,.;\\n]{0,12}?(-?\\d+(?:\\.\\d+)?)\\s*[^,.;\\n]{0,12}?${alias}`, 'gi'),
    ];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(brief))) {
        const operatorText = match[1].toLowerCase();
        const value = Number(match[2]);
        if (!Number.isFinite(value)) continue;
        const isMin = /above|over|at least|min|>=?|greater|more|≥/.test(operatorText);
        let metric = entry.metric;
        if (metric === 'tempMean') {
          metric = isMin ? 'tempMin' : 'tempMax';
        }
        const parent = brief.slice(
          Math.max(0, match.index - 20),
          Math.min(brief.length, match.index + match[0].length + 20),
        );
        if (found.some((c) => c.metric === metric && c.value === value && c.operator === (isMin ? 'min' : 'max'))) {
          continue;
        }
        found.push({
          metric,
          operator: isMin ? 'min' : 'max',
          value,
          unit: metricUnit(metric),
          text: parent.replace(/\s+/g, ' ').trim(),
        });
      }
    }
  }
  return found;
}

function unitSuffix(unit: string) {
  if (!unit) return '';
  if (unit === '°' || unit === '%') return unit;
  return ` ${unit}`;
}

function slackFor(metric: MetricKey, value: number) {
  if (metric === 'slopeMean' || metric === 'slopeP95' || metric === 'slopeMax') return 10;
  if (metric === 'tempMax' || metric === 'tempMin' || metric === 'tempMean' || metric === 'tempAmp') return 15;
  if (metric === 'precipYear') return Math.max(100, Math.abs(value) * 1.5);
  if (metric === 'humidity') return 30;
  if (metric === 'dust' || metric === 'access' || metric === 'water' || metric === 'aerosol') return 0.35;
  if (metric === 'soilWetnessTop') return 0.1;
  if (metric === 'wind') return 4;
  if (metric === 'solar') return 2;
  if (metric === 'elevation' || metric === 'relief') return 1000;
  if (metric === 'pressure') return 30;
  if (metric === 'airportHours') return 5;
  return Math.max(1, Math.abs(value) * 0.5);
}

function applyConstraint(
  recipe: RequirementRecipe,
  constraint: ExplicitConstraint,
): RequirementRecipe & { explicit: true } {
  const slack = slackFor(constraint.metric, constraint.value);
  const direction = constraint.operator === 'max' ? 'lower' : 'higher';
  const ideal = constraint.value;
  const limit = constraint.operator === 'max' ? constraint.value + slack : constraint.value - slack;
  const label = recipe.label ?? metricLabel(recipe.metric);
  const unit = metricUnit(recipe.metric);
  return {
    ...recipe,
    direction,
    ideal,
    limit,
    idealMax: undefined,
    limitMax: undefined,
    kind: 'required',
    statement: `${label.toLowerCase()} ${constraint.operator === 'max' ? '≤' : '≥'} ${ideal}${unitSuffix(unit)} (stated in brief)`,
    explicit: true,
  };
}

function defaultStatement(recipe: RequirementRecipe): string {
  const label = recipe.label ?? metricLabel(recipe.metric);
  const unit = metricUnit(recipe.metric);
  const suffix = unitSuffix(unit);
  if (recipe.direction === 'boolean') return `${label.toLowerCase()} present`;
  if (recipe.direction === 'band') {
    return `${label.toLowerCase()} ${recipe.ideal}${suffix} to ${recipe.idealMax}${suffix}`;
  }
  return `${label.toLowerCase()} ${recipe.direction === 'lower' ? '≤' : '≥'} ${recipe.ideal}${suffix}`;
}

function buildRequirement(
  experimentId: string,
  archetype: Archetype,
  recipe: RequirementRecipe,
  explicit: boolean,
): RequirementSpec {
  const evidence: EvidenceProvenance = metricEvidence(recipe.metric);
  const label = recipe.label ?? metricLabel(recipe.metric);
  return {
    id: `${experimentId}:${recipe.metric}`,
    experimentId,
    label,
    shortLabel: label,
    statement: recipe.statement ?? defaultStatement(recipe),
    metric: recipe.metric,
    direction: recipe.direction,
    ideal: recipe.ideal,
    limit: recipe.limit,
    idealMax: recipe.idealMax,
    limitMax: recipe.limitMax,
    unit: metricUnit(recipe.metric),
    kind: recipe.kind,
    weight: recipe.weight,
    why: recipe.why,
    evidence,
    source: explicit ? 'brief' : 'template',
    inferred: !explicit,
    temporal: TIME_DEPENDENT_METRICS.has(recipe.metric),
    assumption:
      recipe.assumption ??
      (explicit || recipe.kind === 'facility' || recipe.kind === 'impossible'
        ? undefined
        : `Threshold inferred from the ${archetype.name} experiment definition; not stated in the brief.`),
    missingReason: recipe.missingReason,
    thresholdBasis: explicit ? 'user_stated' : (recipe.thresholdBasis ?? 'archetype_assumption'),
    thresholdNote: explicit ? 'Taken from the numbers in your brief.' : recipe.thresholdNote,
  };
}

function buildExperiment(
  archetype: Archetype,
  index: number,
  source: ExperimentSource,
  confidence: number,
  priority: number,
  terms: string[],
  constraints: ExplicitConstraint[],
): ExperimentSpec {
  const applied = new Set<string>();
  const requirements: RequirementSpec[] = archetype.requirements.map((recipe) => {
    const match = constraints.find((c) => c.metric === recipe.metric);
    if (match) {
      applied.add(`${match.metric}:${match.operator}:${match.value}`);
      const constrained = applyConstraint(recipe, match);
      return buildRequirement(archetype.id, archetype, constrained, true);
    }
    return buildRequirement(archetype.id, archetype, recipe, false);
  });

  const unapplied = constraints.filter(
    (c) => !applied.has(`${c.metric}:${c.operator}:${c.value}`),
  );
  if (unapplied.length) {
    const affinity = AFFINITY[unapplied[0].metric];
    const owns = affinity?.[0] === archetype.id || affinity?.includes(archetype.id);
    if (owns) {
      for (const constraint of unapplied) {
        if (requirements.some((r) => r.metric === constraint.metric)) continue;
        const label = metricLabel(constraint.metric);
        const slack = slackFor(constraint.metric, constraint.value);
        const recipe: RequirementRecipe = {
          metric: constraint.metric,
          direction: constraint.operator === 'max' ? 'lower' : 'higher',
          ideal: constraint.value,
          limit: constraint.operator === 'max' ? constraint.value + slack : constraint.value - slack,
          kind: 'required',
          weight: 3,
          why: 'Explicit mission constraint stated in the brief.',
          label,
          statement: `${label.toLowerCase()} ${constraint.operator === 'max' ? '≤' : '≥'} ${constraint.value}${unitSuffix(constraint.unit)} (stated in brief)`,
        };
        requirements.push(buildRequirement(archetype.id, archetype, recipe, true));
      }
    }
  }

  return {
    id: archetype.id,
    index: index + 1,
    name: archetype.name,
    shortName: archetype.shortName,
    objective: archetype.objective,
    analog: archetype.analog,
    equipment: archetype.equipment,
    measurements: archetype.measurements,
    constraints: archetype.constraints,
    assumptions: archetype.assumptions,
    confidence,
    priority,
    source,
    sourceTerms: terms,
    requirements,
    facilityNotes: archetype.facilityNotes,
  };
}

function inferFromProfile(profileExperiments: string[]): Archetype[] {
  const picked: Archetype[] = [];
  for (const name of profileExperiments) {
    const entry = PROFILE_MAP.find((m) => m.pattern.test(name));
    if (!entry) continue;
    const archetype = ARCHETYPES.find((a) => a.id === entry.id);
    if (archetype && !picked.some((p) => p.id === archetype.id)) picked.push(archetype);
  }
  return picked;
}

function addCompanions(picked: Archetype[], profileExperiments: string[], limit: number) {
  const candidates = inferFromProfile(profileExperiments);
  const inferred: Archetype[] = [];
  for (const archetype of candidates) {
    if (picked.some((p) => p.id === archetype.id)) continue;
    inferred.push(archetype);
    if (inferred.length >= limit) break;
  }
  return inferred;
}

/**
 * Optional externally selected experiments (e.g. from the server-side agent's
 * language model). Each id must exist in the archetype catalog; `terms` are
 * brief fragments that justify the selection. Requirements are still built by
 * the same deterministic recipes, so thresholds and provenance are unchanged.
 */
export interface DecomposeOptions {
  archetypes?: { id: string; terms: string[]; source: ExperimentSource; confidence?: number }[];
  durationDays?: number | null;
}

export function decomposeMission(
  brief: string,
  profile: ProfileKey,
  profileLabel: string,
  profileExperiments: string[],
  options: DecomposeOptions = {},
): MissionSpec {
  const text = brief.trim();
  const keywordMatches = matchArchetypes(text);
  const override = (options.archetypes ?? [])
    .map((entry) => ({ entry, archetype: ARCHETYPE_BY_ID.get(entry.id) }))
    .filter((item): item is { entry: NonNullable<DecomposeOptions['archetypes']>[number]; archetype: Archetype } => Boolean(item.archetype));
  const matches = override.length
    ? override.map(({ entry, archetype }) => {
        const lower = text.toLowerCase();
        const indices = entry.terms.map((term) => lower.indexOf(term.toLowerCase())).filter((index) => index >= 0);
        return { archetype, index: indices.length ? Math.min(...indices) : Number.MAX_SAFE_INTEGER, indices, terms: entry.terms.map((t) => t.toLowerCase()), source: entry.source, confidence: entry.confidence };
      })
    : keywordMatches.map((match) => ({ ...match, source: 'brief' as ExperimentSource, confidence: undefined as number | undefined }));
  const target = targetFrom(text);
  const parsedDuration = durationFrom(text);
  const duration =
    options.durationDays != null && parsedDuration.days == null
      ? { days: options.durationDays, label: `${options.durationDays}-DAY` }
      : parsedDuration;
  const crew = crewFrom(text);
  const constraints = parseConstraints(text);

  let picked: { archetype: Archetype; source: ExperimentSource; terms: string[]; confidence: number }[];
  let inferredCount = 0;

  if (matches.length === 0) {
    const inferred = inferFromProfile(profileExperiments);
    const fallback = inferred.length
      ? inferred
      : ARCHETYPES.filter((a) => a.id === 'site_survey');
    picked = fallback.map((archetype) => ({
      archetype,
      source: 'profile' as const,
      terms: [],
      confidence: 38,
    }));
    inferredCount = picked.length;
  } else {
    picked = matches.map((match) => ({
      archetype: match.archetype,
      source: match.source,
      terms: match.terms,
      confidence: match.confidence ?? Math.min(96, 86 + match.terms.length * 2),
    }));
    const broadBase =
      /\b(base|habitat|settlement|outpost|permanent|mission)\b/i.test(text) &&
      picked.length < 2;
    if (broadBase) {
      const companions = addCompanions(
        picked.map((p) => p.archetype),
        profileExperiments,
        2,
      );
      for (const archetype of companions) {
        picked.push({ archetype, source: 'inferred', terms: [], confidence: 42 });
        inferredCount += 1;
      }
    }
  }

  if (picked.length > 5) picked = picked.slice(0, 5);

  const experiments = picked.map((entry, index) =>
    buildExperiment(
      entry.archetype,
      index,
      entry.source,
      entry.confidence,
      entry.source === 'brief'
        ? priorityFor(
            text,
            matches.find((m) => m.archetype.id === entry.archetype.id)?.indices ?? [],
          )
        : 1,
      entry.terms,
      constraints,
    ),
  );

  const appliedConstraints = new Set(
    experiments.flatMap((experiment) =>
      experiment.requirements
        .filter((requirement) => requirement.source === 'brief')
        .map((requirement) => requirement.metric),
    ),
  );
  const unappliedConstraints = constraints.filter(
    (constraint) => !appliedConstraints.has(constraint.metric),
  );
  if (unappliedConstraints.length > 0 && experiments.length > 0) {
    const target = experiments[0];
    for (const constraint of unappliedConstraints) {
      if (target.requirements.some((requirement) => requirement.metric === constraint.metric)) {
        continue;
      }
      const archetype = ARCHETYPE_BY_ID.get(target.id);
      if (!archetype) continue;
      const label = metricLabel(constraint.metric);
      const slack = slackFor(constraint.metric, constraint.value);
      const recipe: RequirementRecipe = {
        metric: constraint.metric,
        direction: constraint.operator === 'max' ? 'lower' : 'higher',
        ideal: constraint.value,
        limit:
          constraint.operator === 'max'
            ? constraint.value + slack
            : constraint.value - slack,
        kind: 'required',
        weight: 3,
        label,
        statement: `${label.toLowerCase()} ${
          constraint.operator === 'max' ? '≤' : '≥'
        } ${constraint.value}${unitSuffix(constraint.unit)} (mission constraint in brief)`,
        why: 'Mission-level constraint stated in the brief; applied to this experiment as the closest match.',
      };
      target.requirements.push(
        buildRequirement(target.id, archetype, recipe, true),
      );
    }
  }

  const missing = new Map<string, string[]>();
  for (const experiment of experiments) {
    for (const requirement of experiment.requirements) {
      if (requirement.evidence.nature === 'missing') {
        const list = missing.get(requirement.label) ?? [];
        list.push(experiment.shortName);
        missing.set(requirement.label, list);
      }
    }
  }
  const facility = experiments.flatMap((experiment) =>
    experiment.requirements
      .filter((r) => r.kind === 'facility' || r.kind === 'impossible')
      .map((r) => `${experiment.shortName}: ${r.label}`),
  );
  const templateInferred = experiments.flatMap((e) =>
    e.requirements.filter((r) => r.inferred),
  ).length;
  const explicitRequirements = experiments.flatMap((e) =>
    e.requirements.filter((r) => r.source === 'brief'),
  ).length;

  const assumptions = [
    'A requirement threshold is a criterion, not an observation. Template thresholds are tagged INFERRED; constraints stated in the brief are tagged BRIEF.',
    'Learned-model suitability is shown for context only. It does not contribute to any requirement score.',
    'Climate is a point reanalysis value and geology is a mapped point lookup. Only DEM-derived terrain metrics are spatial.',
  ];
  if (target.note) assumptions.push(target.note);
  if (duration.days === null && duration.label === 'NOT STATED') {
    assumptions.push('The brief states no mission duration; experiment suitability is duration-independent.');
  }
  if (inferredCount > 0) {
    assumptions.push(
      `${inferredCount} experiment${inferredCount === 1 ? '' : 's'} inferred from the mission profile or the base intent; the brief does not name them.`,
    );
  }
  if (templateInferred > 0) {
    assumptions.push(
      `${templateInferred} requirement thresholds are inferred from the experiment definitions; ${explicitRequirements} come from explicit brief constraints.`,
    );
  }
  if (facility.length > 0) {
    assumptions.push(
      `${facility.length} requirement${facility.length === 1 ? '' : 's'} cannot be reproduced at an Earth site and are excluded from site scoring.`,
    );
  }

  const unresolved = [...missing.entries()].map(
    ([label, owners]) =>
      `No open measurement for ${label.toLowerCase()} (${[...new Set(owners)].join(', ')}); it is shown as NO DATA and never imputed.`,
  );
  if (constraints.length) {
    unresolved.push(
      `${constraints.length} numeric constraint${constraints.length === 1 ? '' : 's'} parsed from the brief; check the quoted fragment in each BRIEF requirement.`,
    );
  }
  if (unappliedConstraints.length) {
    assumptions.push(
      `${unappliedConstraints.length} mission-level constraint${unappliedConstraints.length === 1 ? '' : 's'} had no direct experiment match and ${unappliedConstraints.length === 1 ? 'was' : 'were'} attached to ${experiments[0]?.shortName ?? 'the first experiment'}.`,
    );
  }

  const confidence =
    experiments.reduce((total, experiment) => total + experiment.confidence * experiment.priority, 0) /
    Math.max(1, experiments.reduce((total, experiment) => total + experiment.priority, 0));

  return {
    brief: text,
    profile,
    profileLabel,
    target: target.target,
    targetNote: target.note,
    durationDays: duration.days,
    durationLabel: duration.label,
    crew,
    experiments,
    assumptions,
    unresolved,
    constraints,
    confidence: Math.round(confidence),
  };
}
