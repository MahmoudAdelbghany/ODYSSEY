import type {
  CandidateScore,
  DimensionKey,
  DimensionResult,
  DiscoveryCandidate,
  ReferenceKey,
  ReferenceProfile,
  TimeWindow,
} from './types';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export const REFERENCES: Record<ReferenceKey, ReferenceProfile> = {
  lunar_south_pole: {
    key: 'lunar_south_pole',
    name: 'Moon south pole base',
    short: 'Moon south pole',
    description:
      'Polar terrain, permanent shadow, extreme cold, low illumination, coarse hydrogen context. Earth cannot reproduce vacuum, gravity or radiation.',
    weights: {
      thermal: 20,
      terrain: 22,
      aridity: 16,
      dust: 10,
      geology: 16,
      illumination: 10,
      ice: 6,
      pressure: 0,
      access: 0,
    },
    targetSummary: [
      'slope p95 5–30° at a matched baseline',
      'roughness 0.5–6 m; local relief 50–600 m',
      'mean temperature below −30 °C; large diurnal amplitude',
      'precipitation below 100 mm/yr; humidity below 30%',
      'polar latitude and low solar irradiance',
      'basalt / anorthosite / impact / regolith / ice geology',
    ],
  },
  mars_jezero: {
    key: 'mars_jezero',
    name: 'Mars / Jezero landing',
    short: 'Mars / Jezero',
    description:
      'Cold, dry, dusty terrain with clay / carbonate / sulfate / iron mineralogy, low pressure and accessible analog value. Earth cannot reproduce the thin atmosphere, gravity or radiation.',
    weights: {
      thermal: 18,
      terrain: 18,
      aridity: 12,
      dust: 16,
      geology: 22,
      illumination: 0,
      ice: 0,
      pressure: 6,
      access: 8,
    },
    targetSummary: [
      'slope p95 below 15°; roughness 0.2–3 m',
      'mean temperature below −30 °C; diurnal amplitude above 50 °C',
      'precipitation below 200 mm/yr; humidity below 40%',
      'dusty aerosol regime; wind 3–10 m/s',
      'clay / sulfate / carbonate / iron / olivine / basalt geology',
      'low pressure via high elevation; field access',
    ],
  },
};

const DIMENSION_UNCERTAINTY: Record<DimensionKey, number> = {
  thermal: 0.1,
  terrain: 0.1,
  aridity: 0.1,
  dust: 0.1,
  geology: 0.15,
  illumination: 0.1,
  ice: 0.15,
  pressure: 0.05,
  access: 0.1,
};

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  thermal: 'Thermal envelope',
  terrain: 'Terrain & roughness',
  aridity: 'Dry / volatile regime',
  dust: 'Dust & wind',
  geology: 'Surface materials',
  illumination: 'Polar illumination',
  ice: 'Ice / permafrost proxy',
  pressure: 'Low-pressure proxy',
  access: 'Field access',
};

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

function lower(value: number, target: number, tolerance: number) {
  return value <= target ? 1 : clamp(1 - (value - target) / tolerance);
}

function higher(value: number, target: number, tolerance: number) {
  return value >= target ? 1 : clamp(1 - (target - value) / tolerance);
}

function band(value: number, lo: number, hi: number, soft: number) {
  if (value >= lo && value <= hi) return 1;
  if (value < lo) return clamp(1 - (lo - value) / soft);
  return clamp(1 - (value - hi) / soft);
}

function tagsOf(candidate: DiscoveryCandidate) {
  return new Set(
    [...candidate.tags, ...(candidate.geology?.tags ?? [])].map((tag) => tag.toLowerCase()),
  );
}

function geologyScore(candidate: DiscoveryCandidate, desired: string[]) {
  if (!candidate.geology && candidate.tags.length === 0) return null;
  const tags = tagsOf(candidate);
  let hits = 0;
  for (const tag of desired) {
    if (tags.has(tag)) hits += 1;
  }
  const tagScore = clamp(hits / 3);
  const text = `${candidate.geology?.lith ?? ''} ${candidate.geology?.unit ?? ''} ${
    candidate.geology?.age ?? ''
  }`.toLowerCase();
  let lithHits = 0;
  for (const tag of desired) {
    if (text.includes(tag)) lithHits += 1;
  }
  const lithScore = clamp(lithHits / 2);
  return Math.max(tagScore, lithScore * 0.85);
}

function monthScore(candidate: DiscoveryCandidate, reference: ReferenceKey, month: number) {
  const m = candidate.monthly;
  const temp = m.temp[month];
  const precip = m.precip[month];
  const aerosol = m.aerosol[month];
  const wind = m.wind[month];
  if (temp === null || precip === null) return null;
  const cold = lower(temp, -25, 35);
  const dry = lower(precip, 0.5, 3);
  if (reference === 'lunar_south_pole') {
    const clear = aerosol === null ? 0.5 : lower(aerosol, 0.05, 0.2);
    const calm = wind === null ? 0.5 : lower(wind, 4, 6);
    return 0.4 * cold + 0.3 * dry + 0.2 * clear + 0.1 * calm;
  }
  const dusty = aerosol === null ? 0.5 : band(aerosol, 0.2, 0.8, 0.4);
  const windy = wind === null ? 0.5 : band(wind, 3, 10, 5);
  return 0.35 * cold + 0.25 * dry + 0.25 * dusty + 0.15 * windy;
}

export function monthlyScores(candidate: DiscoveryCandidate, reference: ReferenceKey) {
  return Array.from({ length: 12 }, (_, i) => monthScore(candidate, reference, i));
}

function bestWindow(candidate: DiscoveryCandidate, reference: ReferenceKey): TimeWindow | null {
  const scores = monthlyScores(candidate, reference);
  let best: { start: number; length: number; score: number } | null = null;
  for (const length of [3, 2]) {
    for (let start = 0; start + length <= 12; start += 1) {
      const slice = scores.slice(start, start + length);
      if (slice.some((value) => value === null)) continue;
      const mean = (slice as number[]).reduce((a, b) => a + b, 0) / length;
      if (!best || mean > best.score) best = { start, length, score: mean };
    }
  }
  if (!best) return null;
  const months = Array.from({ length: best.length }, (_, i) => best!.start + i);
  return {
    months,
    label: months.map((i) => MONTHS[i]).join('–'),
    score: best.score,
    note: 'Climatological window, not a forecast. Polar night and access season are not modeled.',
  };
}

function valueOrNull(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function scoreCandidate(candidate: DiscoveryCandidate, reference: ReferenceKey): CandidateScore {
  const profile = REFERENCES[reference];
  const c = candidate.climate;
  const t = candidate.terrain;
  const dims: DimensionResult[] = [];

  const push = (
    key: DimensionKey,
    score: number | null,
    value: string,
    target: string,
    source: string,
    note: string,
  ) => {
    dims.push({
      key,
      label: DIMENSION_LABELS[key],
      score: score === null ? null : clamp(score),
      weight: profile.weights[key],
      value,
      target,
      source,
      note,
    });
  };

  if (reference === 'lunar_south_pole') {
    const cold = lower(c.tempMean, -30, 45);
    const amp = higher(c.tempAmp, 30, 25);
    push(
      'thermal',
      0.65 * cold + 0.35 * amp,
      `${c.tempMean.toFixed(0)} °C mean / ${c.tempAmp.toFixed(0)} °C diurnal`,
      'mean below −30 °C; large amplitude',
      'NASA POWER monthly climatology',
      'Earth air temperature, not lunar surface temperature. Absolute values cannot match.',
    );

    if (t) {
      const slope = band(t.slopeP95, 5, 30, 15);
      const rough = band(t.roughness, 0.5, 6, 4);
      const relief = band(t.relief, 50, 600, 300);
      push(
        'terrain',
        0.5 * slope + 0.25 * rough + 0.25 * relief,
        `${t.slopeP95.toFixed(1)}° p95 / ${t.roughness.toFixed(1)} m rough / ${t.relief.toFixed(0)} m relief`,
        'slope p95 5–30°; roughness 0.5–6 m',
        'Copernicus DEM GLO-90',
        '90 m DSM; slope and roughness are at a 90 m baseline, not a metre-scale hazard survey.',
      );
    } else {
      push('terrain', null, 'NO DEM', 'slope p95 5–30°', 'Copernicus DEM GLO-90', 'DEM unavailable at this point.');
    }

    const precip = lower(c.precipYear, 100, 500);
    const humidity = lower(c.humidity, 30, 40);
    const soil = lower(c.soilWetnessTop, 0.1, 0.4);
    push(
      'aridity',
      0.5 * precip + 0.3 * humidity + 0.2 * soil,
      `${c.precipYear.toFixed(0)} mm/yr / ${c.humidity.toFixed(0)}% RH`,
      '<100 mm/yr; <30% RH',
      'NASA POWER / MERRA-2',
      'Reanalysis at 0.5°; not a site measurement.',
    );

    const clear = lower(c.aerosol, 0.05, 0.25);
    const calm = lower(c.wind, 3, 8);
    push(
      'dust',
      0.7 * clear + 0.3 * calm,
      `AOD ${c.aerosol.toFixed(2)} / wind ${c.wind.toFixed(1)} m/s`,
      'low aerosol; low wind',
      'NASA POWER / MERRA-2',
      'Lunar dust is surface regolith, not an atmospheric aerosol. This is a clear-atmosphere proxy.',
    );

    const geo = geologyScore(candidate, [
      'basalt',
      'anorthosite',
      'impact',
      'regolith',
      'ice',
      'volcanic',
    ]);
    push(
      'geology',
      geo,
      candidate.geology?.lith || candidate.tags.slice(0, 3).join(' / ') || 'NO UNIT',
      'basalt / anorthosite / impact / regolith',
      'Macrostrat + candidate tags',
      'Regional mapped unit, not an outcrop or assay. Mineral species require EMIT/ASTER.',
    );

    const polar = higher(Math.abs(candidate.lat), 60, 25);
    const lowSun = lower(c.solar, 4, 3);
    push(
      'illumination',
      0.6 * polar + 0.4 * lowSun,
      `${Math.abs(candidate.lat).toFixed(0)}° lat / ${c.solar.toFixed(1)} kWh/m²/day`,
      'polar latitude; low solar',
      'Candidate coordinate + NASA POWER',
      'Latitude and annual solar proxy. True lunar illumination and PSR geometry are not modeled.',
    );

    const iceTag = tagsOf(candidate).has('ice') || tagsOf(candidate).has('glacier') ? 1 : 0;
    const coldProxy = lower(c.tempMean, -20, 30);
    push(
      'ice',
      0.5 * iceTag + 0.5 * coldProxy,
      iceTag ? 'ice / glacier tag' : 'no ice tag',
      'ice / permafrost / permanent shadow',
      'Candidate tags + NASA POWER',
      'Proxy only. No ice thickness, subsurface ice or hydrogen measurement at this point.',
    );
  } else {
    const cold = lower(c.tempMean, -30, 40);
    const amp = higher(c.tempAmp, 50, 30);
    push(
      'thermal',
      0.5 * cold + 0.5 * amp,
      `${c.tempMean.toFixed(0)} °C mean / ${c.tempAmp.toFixed(0)} °C diurnal`,
      'mean below −30 °C; amplitude above 50 °C',
      'NASA POWER monthly climatology',
      'Earth air temperature, not Mars surface temperature. Absolute values cannot match.',
    );

    if (t) {
      const slope = lower(t.slopeP95, 15, 15);
      const rough = band(t.roughness, 0.2, 3, 2);
      const relief = band(t.relief, 50, 400, 250);
      push(
        'terrain',
        0.5 * slope + 0.25 * rough + 0.25 * relief,
        `${t.slopeP95.toFixed(1)}° p95 / ${t.roughness.toFixed(1)} m rough / ${t.relief.toFixed(0)} m relief`,
        'slope p95 below 15°; roughness 0.2–3 m',
        'Copernicus DEM GLO-90',
        '90 m DSM; not a metre-scale landing-hazard survey.',
      );
    } else {
      push('terrain', null, 'NO DEM', 'slope p95 below 15°', 'Copernicus DEM GLO-90', 'DEM unavailable at this point.');
    }

    const precip = lower(c.precipYear, 200, 500);
    const humidity = lower(c.humidity, 40, 40);
    const soil = lower(c.soilWetnessTop, 0.15, 0.4);
    push(
      'aridity',
      0.5 * precip + 0.3 * humidity + 0.2 * soil,
      `${c.precipYear.toFixed(0)} mm/yr / ${c.humidity.toFixed(0)}% RH`,
      '<200 mm/yr; <40% RH',
      'NASA POWER / MERRA-2',
      'Reanalysis at 0.5°; not a site measurement.',
    );

    const dusty = band(c.aerosol, 0.2, 1.0, 0.4);
    const windy = band(c.wind, 3, 10, 5);
    push(
      'dust',
      0.6 * dusty + 0.4 * windy,
      `AOD ${c.aerosol.toFixed(2)} / wind ${c.wind.toFixed(1)} m/s`,
      'dusty aerosol; wind 3–10 m/s',
      'NASA POWER / MERRA-2',
      'Column AOD is not surface dust flux. MERRA-2 dust and field sampling are required for confirmation.',
    );

    const geo = geologyScore(candidate, [
      'clay',
      'sulfate',
      'carbonate',
      'iron',
      'olivine',
      'basalt',
      'evaporite',
      'sedimentary',
      'regolith',
    ]);
    push(
      'geology',
      geo,
      candidate.geology?.lith || candidate.tags.slice(0, 3).join(' / ') || 'NO UNIT',
      'clay / sulfate / carbonate / iron / basalt',
      'Macrostrat + candidate tags',
      'Regional mapped unit, not an outcrop or assay. Mineral species require EMIT/ASTER.',
    );

    const pressure = lower(c.pressure, 80, 25);
    push(
      'pressure',
      pressure,
      `${c.pressure.toFixed(0)} kPa`,
      'low pressure via high elevation',
      'NASA POWER surface pressure',
      'Earth pressure is a weak proxy for Mars; the absolute value cannot match 0.6 kPa.',
    );

    const access = valueOrNull(candidate.access);
    push(
      'access',
      access === null ? null : higher(access, 0.7, 0.7),
      candidate.airport ? `${candidate.airport.km.toFixed(0)} km to ${candidate.airport.iata || 'airport'}` : 'NO AIRPORT',
      'practical field access',
      'OurAirports',
      'Straight-line distance to a scheduled airport. Not a road, permit or cost model.',
    );
  }

  const valid = dims.filter((d) => d.score !== null && d.weight > 0);
  const validWeight = valid.reduce((sum, d) => sum + d.weight, 0);
  const total = validWeight === 0 ? 0 : valid.reduce((sum, d) => sum + (d.score ?? 0) * d.weight, 0) / validWeight;
  const totalPct = total * 100;

  // Weak-link score: a weighted Euclidean distance in per-dimension loss space.
  // This is a diagonal Mahalanobis-style distance, not a full covariance model.
  const weightedLoss = valid.reduce((sum, d) => {
    const loss = 1 - (d.score ?? 0);
    return sum + d.weight * loss * loss;
  }, 0);
  const distance = validWeight === 0 ? 1 : Math.sqrt(weightedLoss / validWeight);
  const weakLink = validWeight === 0 ? 0 : (1 - distance) * 100;
  const weakestDimension = valid.length === 0 ? 0 : Math.min(...valid.map((d) => d.score ?? 0)) * 100;

  const sensitivityLow =
    validWeight === 0
      ? 0
      : (valid.reduce(
          (sum, d) => sum + d.weight * Math.max(0, (d.score ?? 0) - DIMENSION_UNCERTAINTY[d.key]),
          0,
        ) /
          validWeight) *
        100;
  const sensitivityHigh =
    validWeight === 0
      ? 0
      : (valid.reduce(
          (sum, d) => sum + d.weight * Math.min(1, (d.score ?? 0) + DIMENSION_UNCERTAINTY[d.key]),
          0,
        ) /
          validWeight) *
        100;

  const coverage = validWeight / 100;
  const novelty = clamp(candidate.noveltyKm / 500);
  const noveltyGrade: CandidateScore['noveltyGrade'] =
    totalPct >= 65 && coverage >= 0.6 && novelty >= 0.4
      ? 'N2'
      : totalPct >= 50 && coverage >= 0.4
        ? 'N1'
        : 'N0';
  const robustness: CandidateScore['robustness'] =
    weakestDimension < 30 ? 'fragile' : weakestDimension < 50 ? 'mixed' : 'robust';

  const missing = dims.filter((d) => d.score === null).map((d) => d.label);
  for (const item of candidate.missing) {
    if (!missing.includes(item)) missing.push(item);
  }

  return {
    total: Math.round(total * 1000) / 10,
    weakLink: Math.round(weakLink * 10) / 10,
    distance: Math.round(distance * 1000) / 1000,
    sensitivity: {
      low: Math.round(sensitivityLow * 10) / 10,
      high: Math.round(sensitivityHigh * 10) / 10,
    },
    coverage: Math.round(coverage * 100) / 100,
    dimensions: dims,
    missing,
    novelty: Math.round(novelty * 100) / 100,
    noveltyGrade,
    robustness,
    window: bestWindow(candidate, reference),
  };
}

export function gradeLabel(grade: CandidateScore['noveltyGrade']) {
  if (grade === 'N2') return 'N2 / strong screening candidate';
  if (grade === 'N1') return 'N1 / secondary candidate';
  return 'N0 / weak match';
}

export function formatCoord(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lon).toFixed(2)}°${
    lon >= 0 ? 'E' : 'W'
  }`;
}
