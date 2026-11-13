import { useEffect, useMemo, useState } from 'react';
import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { Database, Download, MapPin, Orbit, X } from 'lucide-react';
import generatedRaw from '../data/globalDiscovery.json';
import thermalRaw from '../data/generatedThermal.json';
import planetaryRaw from '../data/generatedPlanetaryReference.json';
import groupsRaw from '../data/generatedRegionGroupsV2.json';
import odysseyRaw from '../data/odyssey.json';
import discoveryRaw from '../data/discovery.json';
import { formatCoord } from '../discovery/engine';
import {
  enrichedRegionIds,
  enrichmentSite,
  getPromotedMeta,
  type EnrichmentSite,
} from '../generated';
import '../discovery.css';
import '../generatedDiscovery.css';
import '../discovery-theme.css';

type FeatureStat = { mean: number | null; min: number | null; max: number | null; n: number };
type ProfileStat = {
  max: number;
  mean: number;
  coverageMean: number;
  cells: number;
  dimensions: Record<string, number | null>;
};
type CellGeometry = { cell: string; center: [number, number]; boundary: [number, number][] };
type GeneratedRegion = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  classification: 'new' | 'nearby' | 'existing';
  noveltyKm: number;
  nearestExisting: { id: string; kind: 'control' | 'seed'; distanceKm: number };
  cellCount: number;
  areaKm2: number;
  bbox: [number, number, number, number];
  representativeCell: string;
  cells: string[];
  cellGeometry: CellGeometry[];
  features: Record<string, FeatureStat>;
  profiles: Record<string, ProfileStat>;
  bestProfile: string | null;
  rationale: {
    profile: string;
    profileLabel: string;
    score: number;
    coverage: number;
    strongest: { key: string; score: number }[];
    observations: Record<string, number | null>;
  } | null;
  bestScore: number;
  dataCompleteness: number;
  footprint: any;
  evidence: Record<string, string>;
  missing: string[];
  category: string;
};
type GeneratedData = {
  version: string;
  generatedAt: string;
  methodology: string;
  grid: {
    index: string;
    resolution: number;
    totalCells: number;
    landCells: number;
    usableLandCells: number;
    averageCellAreaKm2: number;
  };
  screening: { dedupKm: number; minRegionCells: number; maxRegions: number; exclusions: Record<string, number> };
  counts: {
    totalCells: number;
    landCells: number;
    usableLandCells: number;
    candidateCells: number;
    clusters: number;
    keptRegions: number;
    spatialDuplicatesRemoved: number;
    newRegions: number;
    nearbyRegions: number;
    existingRegions: number;
    knownExistingAfterDedup: number;
    knownNearbyAfterDedup: number;
    knownRegionsAudited: number;
  };
  regions: GeneratedRegion[];
};

type ThermalPhase = {
  status: string;
  nAccepted: number;
  nGoodQC: number;
  nOtherQC: number;
  meanK: number | null;
  minK: number | null;
  maxK: number | null;
};
type ThermalBlock = {
  window: string;
  hemisphere: string;
  availableDates: number;
  selectedDates: number;
  day: ThermalPhase;
  night: ThermalPhase;
  pairedDayNight: { nPaired: number; meanDeltaK: number | null };
  air: { meanK: number; minK: number; maxK: number; source: string; support: string } | null;
};
type PlanetStat = {
  elevationMean: number;
  reliefP95P5: number;
  slopeMean: number;
  slopeP95: number;
  roughness: number;
  resolutionM: number;
  windowKm: number;
  pixels: [number, number];
  source: string;
  datum: string;
};
type PlanetReference = {
  reliefP95P5: number;
  slopeP95: number;
  roughness: number;
};

const data = generatedRaw as unknown as GeneratedData;
const ENRICHED_IDS = new Set(enrichedRegionIds());
const thermalData = thermalRaw as unknown as {
  earth: Record<string, ThermalBlock>;
};
const planetaryData = planetaryRaw as unknown as {
  earth: Record<string, { '400m': PlanetStat; '463m': PlanetStat }>;
  references: { moon: PlanetReference; mars: PlanetReference };
};
const groupsData = groupsRaw as unknown as {
  version: string;
  groups: { id: string; regionIds: string[]; size: number; combinedAreaKm2: number; representativeRegion: string }[];
};
const groupByRegion = new Map(
  groupsData.groups.flatMap((group) => group.regionIds.map((id) => [id, group] as const)),
);
const controls = (odysseyRaw as unknown as { sites: { lat: number; lon: number; name: string }[] }).sites;
const seeds = (discoveryRaw as unknown as { candidates: { lat: number; lon: number; name: string }[] }).candidates;

const PROFILE_ORDER = ['lunar_base', 'lunar_expedition', 'mars_landing'] as const;
const PROFILE_LABELS: Record<string, string> = {
  lunar_base: 'Lunar base',
  lunar_expedition: 'Lunar expedition',
  mars_landing: 'Mars landing',
};
const DIMENSION_LABELS: Record<string, string> = {
  thermal: 'Thermal',
  aridity: 'Aridity',
  terrain: 'Terrain',
  polar: 'Polar',
  seasonality: 'Precip seasonality',
  access: 'Access',
};
const CATEGORIES = [
  { key: 'ALL', label: 'All' },
  { key: 'polar', label: 'Polar' },
  { key: 'hyper_arid', label: 'Hyper-arid' },
  { key: 'high_relief', label: 'High relief' },
  { key: 'remote', label: 'Remote' },
  { key: 'moderate_relief', label: 'Mod. Relief' },
  { key: 'other', label: 'Other' },
] as const;
const CATEGORY_LABELS: Record<string, string> = {
  polar: 'Polar',
  hyper_arid: 'Hyper-arid',
  high_relief: 'High relief',
  remote: 'Remote',
  moderate_relief: 'Moderate relief',
  other: 'Other',
};
const CLASS_LABELS: Record<GeneratedRegion['classification'], string> = {
  new: 'New',
  nearby: 'Catalogue-adjacent',
  existing: 'Catalogue overlap',
};
const CLASS_COLORS: Record<GeneratedRegion['classification'], string> = {
  new: '#d9a45b',
  nearby: '#8fa3ad',
  existing: '#f3eee5',
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const FEATURE_ROWS: { key: string; label: string; unit: string; digits: number }[] = [
  { key: 'tempMeanC', label: 'Mean annual temp', unit: '°C', digits: 1 },
  { key: 'precipYearMm', label: 'Annual precip', unit: 'mm', digits: 0 },
  { key: 'reliefM', label: 'Local relief', unit: 'm', digits: 0 },
  { key: 'slopeDeg', label: 'Mean slope', unit: '°', digits: 1 },
  { key: 'elevationM', label: 'Elevation', unit: 'm', digits: 0 },
  { key: 'accessKm', label: 'Nearest airport', unit: 'km', digits: 0 },
];

function fmt(value: number | null | undefined, digits = 1, unit = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(digits)}${unit}`;
}

function classColor(classification: GeneratedRegion['classification']) {
  return CLASS_COLORS[classification];
}

function ratioLabel(earth: number | undefined, reference: number | undefined) {
  if (!earth || !reference) return '–';
  const ratio = earth / reference;
  return `${ratio.toFixed(2)}×`;
}

function EnrichedDossier({
  site,
  thermal,
  planet,
  reference,
}: {
  site: EnrichmentSite;
  thermal: ThermalBlock | null;
  planet: { '400m': PlanetStat; '463m': PlanetStat } | null;
  reference: { moon: PlanetReference; mars: PlanetReference };
}) {
  if (!site.imagery || !site.terrain || !site.power) return null;
  const stats = site.terrain.stats;
  const annual = site.power.annual;
  const monthly = site.power.monthly;
  const temperatures = monthly.T2M ?? [];
  const precipitation = monthly.PRECTOTCORR ?? [];
  const maxPrecip = Math.max(1, ...precipitation.filter((value): value is number => value !== null));
  const comparison = site.comparison;
  const sensitivity = comparison?.profileSensitivity
    ? Math.max(...Object.values(comparison.profileSensitivity).map((item) => item.maxDelta))
    : null;

  return (
    <>
      <div className="gen-section">
        <div className="disc-missing-head">Satellite imagery: Sentinel-2 L2A</div>
        <figure className="gen-imagery">
          <img src={site.imagery.file} alt={`Sentinel-2 window at ${site.name}`} loading="lazy" />
          <figcaption>
            {site.imagery.date} / Cloud {site.imagery.cloud.toFixed(2)}% / {site.imagery.scene}
          </figcaption>
        </figure>
        <div className="gen-enriched-grid">
          <div><span>Resolution</span><b>{site.imagery.mpp} m native</b><i>{site.imagery.bands}</i></div>
          <div><span>Window</span><b>{site.imagery.width} × {site.imagery.height} px</b><i>{site.imagery.coverage}</i></div>
        </div>
        <p className="gen-why-note">{site.imagery.processing}. {site.imagery.credit}.</p>
      </div>

      <div className="gen-section">
        <div className="disc-missing-head">Detailed terrain: Copernicus GLO-30</div>
        {stats ? (
          <div className="gen-stat-grid">
            <div><span>Mean slope</span><b>{stats.meanSlope.toFixed(2)}°</b></div>
            <div><span>P95 slope</span><b>{stats.p95Slope.toFixed(2)}°</b></div>
            <div><span>Relief</span><b>{stats.elevRange.toFixed(0)} m</b></div>
            <div><span>Roughness</span><b>{stats.roughness.toFixed(1)} m</b></div>
            <div><span>Mean elevation</span><b>{fmt(stats.elevMean, 0, ' m')}</b></div>
            <div><span>FLAT &lt; 5°</span><b>{Math.round(stats.flatFraction * 100)}%</b></div>
          </div>
        ) : null}
        <div className="gen-enriched-grid">
          <div><span>Heightmap</span><b>{site.terrain.height} × {site.terrain.width} at {site.terrain.mpp} m</b><i>{site.terrain.widthMeters / 1000} × {site.terrain.heightMeters / 1000} km</i></div>
          <div><span>Voids</span><b>{site.terrain.voidPct?.toFixed(2) ?? '–'}%</b><i>{site.terrain.windowSource}</i></div>
        </div>
        <p className="gen-why-note">
          Native GLO-30 is 30 m; the heightmap is 40 m. Coarse WorldClim relief/slope remain in the screen and are
          shown separately below. This is a 20.48 × 12.8 km window, not the full H3 region.
        </p>
      </div>

      <div className="gen-section">
        <div className="disc-missing-head">Climate: NASA POWER 2001–2020</div>
        <div className="gen-stat-grid">
          <div><span>Mean air temp</span><b>{fmt(annual.tempMeanC, 1, ' °C')}</b></div>
          <div><span>Annual precip</span><b>{fmt(annual.precipYearMm, 0, ' mm')}</b></div>
          <div><span>Humidity</span><b>{fmt(annual.humidityPct, 0, ' %')}</b></div>
          <div><span>Wind</span><b>{fmt(annual.windMs, 1, ' m/s')}</b></div>
          <div><span>Solar</span><b>{fmt(annual.solarKwhM2Day, 2, ' kWh/m²/d')}</b></div>
          <div><span>AOD 550</span><b>{fmt(annual.aerosolAod550, 2)}</b></div>
          <div><span>Pressure</span><b>{fmt(annual.pressureKpa, 1, ' kPa')}</b></div>
          <div><span>Precip seasonality</span><b>{fmt(annual.precipSeasonalityCv, 0, ' % CV')}</b></div>
        </div>
        <div className="gen-month-strip" aria-label="Monthly mean air temperature and precipitation">
          {MONTHS.map((month, index) => (
            <div key={month}>
              <span>{month.slice(0, 1)}</span>
              <b>{temperatures[index] !== null && temperatures[index] !== undefined ? `${temperatures[index]!.toFixed(0)}°` : '–'}</b>
              <i style={{ height: `${4 + (Math.max(0, precipitation[index] ?? 0) / maxPrecip) * 26}px` }} />
            </div>
          ))}
        </div>
        <p className="gen-why-note">
          Bars: monthly precipitation (mm/day). Values: monthly mean air temperature (°C). Monthly normals, not a
          forecast. Source: {site.power.source}.
        </p>
      </div>

      <div className="gen-section">
        <div className="disc-missing-head">Geology: Macrostrat</div>
        {site.macrostrat ? (
          <div className="gen-geology">
            <div><span>Unit</span><b>{site.macrostrat.unit || 'NO UNIT'}</b><i>{site.macrostrat.lith} / {site.macrostrat.age || 'AGE UNKNOWN'}</i></div>
            <div><span>Tags</span><b>{site.macrostrat.tags.length ? site.macrostrat.tags.join(' / ') : 'NONE MAPPED'}</b><i>{site.macrostrat.source}</i></div>
          </div>
        ) : (
          <p className="disc-empty">No mapped unit at this point.</p>
        )}
        {site.nearestAirport ? (
          <p className="gen-why-note">
            Nearest scheduled airport: {site.nearestAirport.name} / {site.nearestAirport.distanceKm.toFixed(0)} km
            straight-line. No road, permit or seasonal access model.
          </p>
        ) : null}
      </div>

      <div className="gen-section">
        <div className="disc-missing-head">Thermal evidence: MODIS 11a1</div>
        {thermal ? (
          <>
            <div className="gen-thermal-grid">
              <div><span>Day LST</span><b>{thermal.day.status} / {thermal.day.nAccepted} dates</b><i>{fmt(thermal.day.meanK, 1, ' K')} / {thermal.day.meanK !== null ? fmt(thermal.day.meanK - 273.15, 1, ' °C') : 'N/A'}</i></div>
              <div><span>Night LST</span><b>{thermal.night.status} / {thermal.night.nAccepted} dates</b><i>{fmt(thermal.night.meanK, 1, ' K')} / {thermal.night.meanK !== null ? fmt(thermal.night.meanK - 273.15, 1, ' °C') : 'N/A'}</i></div>
              <div><span>Paired day−night</span><b>{thermal.pairedDayNight.nPaired} dates</b><i>{fmt(thermal.pairedDayNight.meanDeltaK, 1, ' K')}</i></div>
              <div><span>Air temp</span><b>{thermal.air ? `${fmt(thermal.air.meanK - 273.15, 1, ' °C')}` : 'NO DATA'}</b><i>POWER monthly normal</i></div>
            </div>
            <p className="gen-why-note">
              MODIS 1 km clear-sky skin temperature, day and night separate; QC bits 0-1 accepted. Air temperature is
              not surface temperature. Window {thermal.window} / {thermal.selectedDates} of {thermal.availableDates} dates.
            </p>
          </>
        ) : (
          <p className="disc-empty">NO MODIS SAMPLE. Missing is not evidence of absence.</p>
        )}
      </div>

      {planet ? (
        <div className="gen-section">
          <div className="disc-missing-head">Planetary terrain comparison: Same baseline</div>
          <div className="gen-planet-table">
            <div className="gen-planet-head"><span>Metric</span><b>Earth</b><b>Moon</b><em>Match</em></div>
            <div><span>Relief p95–p5</span><b>{fmt(planet['400m'].reliefP95P5, 0, ' m')}</b><b>{fmt(reference.moon.reliefP95P5, 0, ' m')}</b><em>{ratioLabel(planet['400m'].reliefP95P5, reference.moon.reliefP95P5)}</em></div>
            <div><span>Slope p95</span><b>{fmt(planet['400m'].slopeP95, 2, '°')}</b><b>{fmt(reference.moon.slopeP95, 2, '°')}</b><em>{ratioLabel(planet['400m'].slopeP95, reference.moon.slopeP95)}</em></div>
            <div><span>Roughness</span><b>{fmt(planet['400m'].roughness, 1, ' m')}</b><b>{fmt(reference.moon.roughness, 1, ' m')}</b><em>{ratioLabel(planet['400m'].roughness, reference.moon.roughness)}</em></div>
            <div className="gen-planet-head"><span>Metric</span><b>Earth</b><b>Mars</b><em>Match</em></div>
            <div><span>Relief p95–p5</span><b>{fmt(planet['463m'].reliefP95P5, 0, ' m')}</b><b>{fmt(reference.mars.reliefP95P5, 0, ' m')}</b><em>{ratioLabel(planet['463m'].reliefP95P5, reference.mars.reliefP95P5)}</em></div>
            <div><span>Slope p95</span><b>{fmt(planet['463m'].slopeP95, 2, '°')}</b><b>{fmt(reference.mars.slopeP95, 2, '°')}</b><em>{ratioLabel(planet['463m'].slopeP95, reference.mars.slopeP95)}</em></div>
            <div><span>Roughness</span><b>{fmt(planet['463m'].roughness, 1, ' m')}</b><b>{fmt(reference.mars.roughness, 1, ' m')}</b><em>{ratioLabel(planet['463m'].roughness, reference.mars.roughness)}</em></div>
          </div>
          <p className="gen-why-note">
            Earth 400 m / 463 m from the 40 m Copernicus heightmap; Moon LOLA 400 m and Mars MOLA 463 m references.
            Same 12.8 km window and baseline. Absolute elevation uses different datums and is not a similarity metric.
            This is dimension-specific, not an overall analog score.
          </p>
        </div>
      ) : null}

      {comparison ? (
        <div className="gen-section">
          <div className="disc-missing-head">Coarse screen vs detailed evidence</div>
          <div className="gen-compare">
            <div className="gen-compare-head"><span>Variable</span><b>Coarse</b><b>Detailed</b><em>Delta</em></div>
            <div><span>Mean air temp</span><b>{fmt(comparison.coarse.tempMeanC, 1, ' °C')}</b><b>{fmt(comparison.detailed.tempMeanC, 1, ' °C')}</b><em>{comparison.deltas.tempC > 0 ? '+' : ''}{comparison.deltas.tempC.toFixed(1)} °C</em></div>
            <div><span>Annual precip</span><b>{fmt(comparison.coarse.precipYearMm, 0, ' mm')}</b><b>{fmt(comparison.detailed.precipYearMm, 0, ' mm')}</b><em>{comparison.deltas.precipMm > 0 ? '+' : ''}{comparison.deltas.precipMm.toFixed(0)} mm</em></div>
            <div><span>Relief</span><b>{fmt(comparison.coarse.reliefM, 0, ' m')}</b><b>{fmt(comparison.detailed.reliefM, 0, ' m')}</b><em>{comparison.deltas.reliefRatio?.toFixed(2) ?? '–'}×</em></div>
            <div><span>Mean slope</span><b>{fmt(comparison.coarse.slopeDeg, 2, '°')}</b><b>{fmt(comparison.detailed.slopeDeg, 2, '°')}</b><em>{comparison.deltas.slopeRatio?.toFixed(2) ?? '–'}×</em></div>
            <div><span>Best profile score</span><b>{fmt(comparison.coarse.bestScore, 1)}</b><b>{fmt(comparison.detailed.bestScore, 1)}</b><em>{comparison.deltas.bestScore > 0 ? '+' : ''}{comparison.deltas.bestScore.toFixed(1)}</em></div>
          </div>
          <p className="gen-why-note">
            Coarse: WorldClim 10′ / 92 km relief window. Detailed: NASA POWER point normals and 20.48 × 12.8 km
            Copernicus DEM. {comparison.detailed.bestProfile ? `Detailed best profile: ${comparison.detailed.bestProfile.replace(/_/g, ' ')}.` : ''}{' '}
            {sensitivity !== null ? `Max score change under ±20% weight perturbation: ${sensitivity.toFixed(1)} points.` : ''}{' '}
            15 enriched regions are not a global validation set. Screening scores are not probabilities.
          </p>
        </div>
      ) : null}

      <div className="gen-section">
        <div className="disc-missing-head">Licensing: Redistribution</div>
        <p className="gen-why-note">
          Sentinel-2: {site.licensing.imagery} Copernicus DEM: {site.licensing.terrain} NASA POWER:{' '}
          {site.licensing.power} Macrostrat: {site.licensing.macrostrat}
        </p>
      </div>
    </>
  );
}


function shortCoord(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'}`;
}

export function GeneratedDiscovery({
  onBack,
  onOpenSite,
}: {
  onBack: () => void;
  onOpenSite: (id: string) => void;
}) {
  const [profile, setProfile] = useState<string>('ALL');
  const [category, setCategory] = useState<string>('ALL');
  const [newOnly, setNewOnly] = useState(true);
  const [enrichedOnly, setEnrichedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ region: GeneratedRegion; x: number; y: number } | null>(null);
  const [showMethod, setShowMethod] = useState(false);
  const [world, setWorld] = useState<any>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  useEffect(() => {
    let alive = true;
    fetch('/world-110m.json')
      .then((response) => response.json())
      .then((topo) => {
        if (alive) setWorld(feature(topo, topo.objects.countries));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return data.regions
      .filter((region) => {
        if (newOnly && region.classification !== 'new') return false;
        if (enrichedOnly && !ENRICHED_IDS.has(region.id)) return false;
        if (profile !== 'ALL' && !region.profiles[profile]) return false;
        if (category !== 'ALL' && region.category !== category) return false;
        return true;
      })
      .sort((a, b) => b.bestScore - a.bestScore);
  }, [profile, category, newOnly, enrichedOnly]);

  const selected = useMemo(() => {
    return filtered.find((region) => region.id === selectedId) ?? filtered[0] ?? null;
  }, [filtered, selectedId]);

  const enriched = selected ? enrichmentSite(selected.id) : null;
  const enrichedMeta = selected ? getPromotedMeta(selected.id) : null;
  const thermal = selected ? thermalData.earth[selected.id] ?? null : null;
  const planet = selected ? planetaryData.earth[selected.id] ?? null : null;
  const landscapeGroup = selected ? groupByRegion.get(selected.id) ?? null : null;
  const missingEvidence = enriched
    ? enriched.missing.filter((item) => !(item.startsWith('MODIS') && thermal))
    : selected?.missing ?? [];

  const { path, projection, graticule } = useMemo(() => {
    const projection = geoNaturalEarth1().fitExtent(
      [
        [18, 18],
        [1000 - 18, 560 - 18],
      ],
      { type: 'Sphere' } as any,
    );
    return { path: geoPath(projection), projection, graticule: geoGraticule10() };
  }, []);

  const selectedFootprint = selected?.footprint ? path(selected.footprint) : null;
  const selectedCells = selected
    ? selected.cellGeometry.map((cell) => {
        // d3-geo interprets spherical exterior rings clockwise; H3 boundaries
        // are counterclockwise. Reversing avoids rendering the sphere complement.
        const ring = [...cell.boundary].reverse();
        ring.push(ring[0]);
        return path({ type: 'Polygon', coordinates: [ring] } as any);
      })
    : [];

  const download = () => {
    if (!selected) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            datasetVersion: data.version,
            generatedAt: data.generatedAt,
            kind: 'generated-region',
            region: selected,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `odyssey-generated-${selected.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="disc gen ui">
      <header className="disc-top">
        <div className="disc-brand">
          <span className="ws-brand">
            <span className="orb-mark" aria-hidden="true" />
            ODYSSEY
          </span>
          <b>Generated regions</b>
        </div>
        <div className="disc-top-mid">
          {data.counts.keptRegions} regions found by a global grid screen, {data.counts.newRegions} new, {ENRICHED_IDS.size} with detailed data
        </div>
        <div className="disc-top-right">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
            ← Curated candidates
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowMethod(true)}>
            Method
          </button>
        </div>
      </header>

      <div className="disc-layout">
        <aside className="disc-left">
          <div className="disc-kicker">Generated screen</div>
          <div className="gen-method-summary">
            <b>{data.grid.totalCells.toLocaleString()} H3 cells</b>
            <span>
              {data.grid.usableLandCells.toLocaleString()} Land with data / {data.counts.candidateCells.toLocaleString()} PASSED
            </span>
            <i>
              Generated from {data.grid.index} res {data.grid.resolution} + WorldClim + Natural Earth. No catalogue
              coordinate seeded the search.
            </i>
          </div>

          <div className="disc-kicker gen-kicker">Mission profile</div>
          <div className="disc-reference-tabs gen-profile-tabs">
            <button className={profile === 'ALL' ? 'active' : ''} onClick={() => { setProfile('ALL'); setSelectedId(null); }}>
              All
            </button>
            {PROFILE_ORDER.map((key) => (
              <button
                key={key}
                className={profile === key ? 'active' : ''}
                onClick={() => { setProfile(key); setSelectedId(null); }}
              >
                {PROFILE_LABELS[key]}
              </button>
            ))}
          </div>
          <p className="disc-reference-copy gen-profile-copy">
            Profiles are independent rule sets. A region may pass one, several or none. Missing dimensions reduce
            coverage; they are never imputed.
          </p>

          <div className="disc-filter">
            <div className="disc-filter-head">
              <span>Filter</span>
              <button
                onClick={() => {
                  setProfile('ALL');
                  setCategory('ALL');
                  setNewOnly(true);
                  setEnrichedOnly(false);
                }}
              >
                Reset
              </button>
            </div>
            <button className={`disc-toggle ${newOnly ? 'active' : ''}`} onClick={() => setNewOnly((value) => !value)}>
              <span className="disc-toggle-dot" /> New regions only
            </button>
            <button className={`disc-toggle ${enrichedOnly ? 'active' : ''}`} onClick={() => setEnrichedOnly((value) => !value)}>
              <span className="disc-toggle-dot" /> Enriched only / {ENRICHED_IDS.size}
            </button>
            <div className="gen-cat-row">
              {CATEGORIES.map((item) => (
                <button
                  key={item.key}
                  className={category === item.key ? 'active' : ''}
                  onClick={() => { setCategory(item.key); setSelectedId(null); }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="disc-list-head">
            <span>Generated regions</span>
            <div className="disc-list-actions">
              <span>{filtered.length} Shown</span>
            </div>
          </div>
          <div className="disc-list">
            {filtered.map((region, index) => (
              <button
                key={region.id}
                className={`disc-item gen-item ${selected?.id === region.id ? 'active' : ''}`}
                onClick={() => setSelectedId(region.id)}
              >
                <div className="disc-item-top">
                  <span className="disc-item-rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className="disc-item-name">{region.name}</span>
                  <b style={{ color: region.classification === 'new' ? 'var(--amber)' : 'var(--paper)' }}>
                    {region.bestScore.toFixed(1)}
                  </b>
                </div>
                <div className="disc-item-sub">
                  {CATEGORY_LABELS[region.category] ?? region.category} / {shortCoord(region.lat, region.lon)} /{' '}
                  {region.cellCount} CELLS
                </div>
                <div className="disc-item-meta">
                  <span className={`gen-class gen-class-${region.classification}`}>{CLASS_LABELS[region.classification]}</span>
                  {ENRICHED_IDS.has(region.id) ? <span className="gen-enriched-chip">Enriched</span> : null}
                  <span>{region.rationale?.profileLabel ?? 'No profile'}</span>
                  <span>{Math.round(region.noveltyKm)} KM to catalogue</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 ? (
              <div className="disc-empty">No generated region passes these filters.</div>
            ) : null}
          </div>
        </aside>

        <main className="disc-map">
          <div className="disc-map-hud">
            <div>
              <span className="disc-live-dot gen-live-dot" /> {filtered.length} regions shown
            </div>
            <div>{data.grid.index} Res {data.grid.resolution} / Natural Earth</div>
          </div>
          <svg viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="genGlow">
                <stop offset="0%" stopColor="rgba(217,164,91,0.42)" />
                <stop offset="100%" stopColor="rgba(217,164,91,0)" />
              </radialGradient>
            </defs>
            <path d={path(graticule) || ''} fill="none" stroke="rgba(217,164,91,0.055)" strokeWidth={0.7} />
            {world ? (
              <g>
                {world.features.map((item: any, index: number) => (
                  <path
                    key={index}
                    d={path(item) || ''}
                    fill="rgba(217,164,91,0.035)"
                    stroke="rgba(243,238,229,0.14)"
                    strokeWidth={0.55}
                  />
                ))}
              </g>
            ) : null}

            {controls.map((control) => {
              const point = projection([control.lon, control.lat]);
              if (!point) return null;
              return <circle key={`control-${control.name}`} cx={point[0]} cy={point[1]} r={1.6} fill="rgba(243,238,229,0.24)" />;
            })}
            {seeds.map((seed) => {
              const point = projection([seed.lon, seed.lat]);
              if (!point) return null;
              return <circle key={`seed-${seed.name}`} cx={point[0]} cy={point[1]} r={1.2} fill="rgba(101,230,233,0.28)" />;
            })}

            {selectedFootprint ? (
              <path d={selectedFootprint} fill="rgba(217,164,91,0.17)" stroke="rgba(217,164,91,0.82)" strokeWidth={1.3} />
            ) : null}
            {selectedCells.map((cellPath, index) =>
              cellPath ? (
                <path
                  key={selected?.cellGeometry[index]?.cell ?? index}
                  d={cellPath}
                  fill="none"
                  stroke="rgba(217,164,91,0.38)"
                  strokeWidth={0.7}
                />
              ) : null,
            )}

            {filtered.map((region) => {
              const point = projection([region.lon, region.lat]);
              if (!point) return null;
              const [x, y] = point;
              const active = selected?.id === region.id;
              const radius = active ? 5.6 : 3.4 + (region.bestScore / 100) * 1.6;
              const color = classColor(region.classification);
              const diamond = `M ${x} ${y - radius} L ${x + radius} ${y} L ${x} ${y + radius} L ${x - radius} ${y} Z`;
              return (
                <g
                  key={region.id}
                  className="disc-site"
                  onClick={() => setSelectedId(region.id)}
                  onMouseEnter={(event) => setHover({ region, x: event.clientX, y: event.clientY })}
                  onMouseMove={(event) => setHover({ region, x: event.clientX, y: event.clientY })}
                  onMouseLeave={() => setHover(null)}
                >
                  {active ? (
                    <circle cx={x} cy={y} r={radius + 9} fill="none" stroke={color} strokeWidth={0.9} strokeDasharray="2 3" />
                  ) : null}
                  <circle cx={x} cy={y} r={radius + 4} fill="url(#genGlow)" opacity={active ? 0.95 : 0.28} />
                  <path d={diamond} fill={color} opacity={active ? 1 : 0.82} />
                  {active ? (
                    <text
                      x={x > 840 ? x - 11 : x + 11}
                      y={y < 24 ? y + 18 : y - 9}
                      textAnchor={x > 840 ? 'end' : 'start'}
                      fill="var(--paper)"
                      fontFamily="IBM Plex Mono"
                      fontSize={9}
                      letterSpacing="0.12em"
                    >
                      {region.name}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <div className="disc-map-legend">
            <span><i className="gen-dot new" /> New</span>
            <span><i className="gen-dot nearby" /> Catalogue-adjacent</span>
            <span><i className="gen-dot existing" /> Overlap</span>
            <span><i className="gen-dot footprint" /> Selected footprint</span>
            <span><i className="gen-dot catalogue" /> 146 Catalogue</span>
          </div>
          <div className="disc-map-foot">
            <span>Source: WorldClim 2.1, Natural Earth, OurAirports</span>
            <span>Select a region to inspect its cells and evidence</span>
          </div>
        </main>

        <aside className="disc-right">
          {selected ? (
            <>
              <div className="disc-dossier-head">
                <div className="disc-kicker">Generated region</div>
                <div className="disc-dossier-title">
                  <div>
                    <h2>{selected.name}</h2>
                    <p>Generated label / not a verified place name</p>
                  </div>
                  <div className="disc-badges">
                    <span className={`gen-badge gen-class-${selected.classification}`}>
                      {CLASS_LABELS[selected.classification]}
                    </span>
                    <span className="disc-fragility gen-category">{CATEGORY_LABELS[selected.category] ?? selected.category}</span>
                    {enrichedMeta ? <span className="gen-badge gen-enriched">Enriched</span> : null}
                  </div>
                </div>
                <div className="disc-coords">
                  <MapPin size={11} /> {formatCoord(selected.lat, selected.lon)}
                </div>
              </div>

              <div className="gen-facts">
                <div>
                  <span>Footprint</span>
                  <b>{selected.cellCount} H3 cells</b>
                  <i>{Math.round(selected.areaKm2).toLocaleString()} km²</i>
                </div>
                <div>
                  <span>Representative cell</span>
                  <b className="gen-mono">{selected.representativeCell}</b>
                  <i>H3 res {data.grid.resolution}</i>
                </div>
                <div>
                  <span>Coarse coverage</span>
                  <b>{Math.round(selected.dataCompleteness * 100)}%</b>
                  <i>{Object.keys(selected.features).length} observed covariates</i>
                </div>
                <div>
                  <span>Nearest catalogue</span>
                  <b>{selected.noveltyKm.toFixed(1)} km</b>
                  <i>{selected.nearestExisting.id} / {selected.nearestExisting.kind}</i>
                </div>
              </div>

              {landscapeGroup ? (
                <div className="gen-group-note">
                  <span>Footprint audit / landscape group {landscapeGroup.id}</span>
                  <b>
                    {landscapeGroup.size} regions / {Math.round(landscapeGroup.combinedAreaKm2).toLocaleString()} km²
                  </b>
                  <i>
                    Adjacent footprints within 10 km. Versioned audit grouping; original region IDs and scores are
                    unchanged.
                  </i>
                </div>
              ) : null}

              <div className="gen-section">
                <div className="disc-missing-head">Why this region survived</div>
                {selected.rationale ? (
                  <>
                    <p className="gen-rationale">
                      {selected.rationale.profileLabel} screen / score{' '}
                      <b>{selected.rationale.score.toFixed(1)}</b> / coverage{' '}
                      {Math.round(selected.rationale.coverage * 100)}%
                    </p>
                    <div className="gen-bars">
                      {selected.rationale.strongest.map((dim) => (
                        <div className="gen-bar" key={dim.key}>
                          <span>{DIMENSION_LABELS[dim.key] ?? dim.key}</span>
                          <i><b style={{ width: `${dim.score}%` }} /></i>
                          <b>{Math.round(dim.score)}</b>
                        </div>
                      ))}
                    </div>
                    <p className="gen-why-note">
                      Mean {fmt(selected.rationale.observations.tempMeanC, 1, '°C')} /{' '}
                      {fmt(selected.rationale.observations.precipYearMm, 0, ' mm y⁻¹')} / relief{' '}
                      {fmt(selected.rationale.observations.reliefM, 0, ' m')} / access{' '}
                      {fmt(selected.rationale.observations.accessKm, 0, ' km')}.
                    </p>
                  </>
                ) : (
                  <p className="disc-empty">No profile rationale recorded.</p>
                )}
                <p className="gen-why-note gen-rule-note">
                  Rule-based screening dimensions. A high score is a candidate, not a probability or a measured analog
                  match. The 39-site ML surrogate is not used.
                </p>
              </div>

              {enriched ? (
                <EnrichedDossier
                  site={enriched}
                  thermal={thermal}
                  planet={planet}
                  reference={planetaryData.references}
                />
              ) : null}

              <div className="gen-section">
                <div className="disc-missing-head">Mission-profile screen</div>
                <div className="gen-profile-table">
                  {PROFILE_ORDER.map((key) => {
                    const profileStat = selected.profiles[key];
                    return (
                      <div key={key} className={profileStat ? '' : 'missing'}>
                        <span>{PROFILE_LABELS[key]}</span>
                        <b>{profileStat ? profileStat.max.toFixed(1) : '–'}</b>
                        <i>
                          {profileStat
                            ? `${Math.round(profileStat.coverageMean * 100)}% Coverage / ${profileStat.cells} CELLS`
                            : 'PROFILE GATE NOT MET'}
                        </i>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="gen-section">
                <div className="disc-missing-head">Measured environment</div>
                <div className="gen-feature-table">
                  {FEATURE_ROWS.map((row) => {
                    const stat = selected.features[row.key];
                    const hasData = stat && stat.n > 0 && stat.mean !== null;
                    return (
                      <div key={row.key}>
                        <span>{row.label}</span>
                        <b>{hasData ? fmt(stat.mean, row.digits, row.unit) : 'NO DATA'}</b>
                        <i>
                          {hasData
                            ? `${fmt(stat.min, row.digits)} to ${fmt(stat.max, row.digits)} / n=${stat.n}`
                            : 'not observed in this dataset'}
                        </i>
                      </div>
                    );
                  })}
                </div>
                <p className="gen-why-note">
                  Values are region-level distributions across H3 cells, not a single station measurement. Source:
                  WorldClim 2.1 10′ (1970-2000).
                </p>
              </div>

              <div className="disc-evidence">
                <div className="disc-evidence-head"><Database size={12} /> Evidence: Provenance</div>
                <div className="disc-evidence-grid">
                  {Object.entries(selected.evidence).map(([key, value]) => (
                    <div key={key}>
                      <span>{key}</span>
                      <b>{value}</b>
                    </div>
                  ))}
                </div>
              </div>

              <div className="disc-missing">
                <div className="disc-missing-head">Evidence not collected</div>
                <div className="disc-chips">
                  {missingEvidence.map((item) => <span key={item}>{item}</span>)}
                </div>
                <p className="gen-why-note">
                  Missing evidence is not a negative measurement and is not imputed. It prevents certification, not
                  selection.
                </p>
              </div>

              {enrichedMeta && enriched?.terrain && enriched?.imagery ? (
                <div className="gen-dive gen-dive-ready">
                  <button onClick={() => onOpenSite(selected.id)}>
                    <Orbit size={14} /> Open site orbit
                  </button>
                  <p>
                    Real Sentinel-2 imagery and Copernicus DEM are attached. Site Orbit opens the terrain, imagery,
                    thermal, geology and planetary-comparison layers. The rule score remains evidence, not a
                    probability.
                  </p>
                </div>
              ) : (
                <div className="gen-dive">
                  <button disabled title="No high-resolution terrain or Site Orbit imagery for this generated region">
                    <Orbit size={14} /> DIVE unavailable
                  </button>
                  <p>
                    This region has no high-resolution DEM or Site Orbit imagery yet. Coarse screening can nominate it;
                    DIVE requires local enrichment first.
                  </p>
                </div>
              )}

              <div className="disc-actions">
                <button className="disc-export" onClick={download}>
                  <Download size={14} /> Export region
                </button>
              </div>
            </>
          ) : (
            <div className="disc-empty">No generated region selected.</div>
          )}
        </aside>
      </div>

      <footer className="disc-foot">
        <span>Generated from spatial data / not certified / coarse screen only</span>
        <span>
          Data version {data.version} / {data.generatedAt} / {data.counts.keptRegions} Regions /{' '}
          {data.counts.spatialDuplicatesRemoved} spatial duplicates removed
        </span>
      </footer>

      {hover ? (
        <div className="disc-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <b>{hover.region.name}</b>
          <span>{CLASS_LABELS[hover.region.classification]} / {CATEGORY_LABELS[hover.region.category]}</span>
          <div><span>Score</span><b style={{ color: classColor(hover.region.classification) }}>{hover.region.bestScore.toFixed(1)}</b></div>
          <div><span>Cells</span><b>{hover.region.cellCount}</b></div>
          <div><span>Catalogue</span><b>{hover.region.noveltyKm.toFixed(0)} km</b></div>
        </div>
      ) : null}

      {showMethod ? (
        <div className="disc-drawer disc-method gen-method">
          <div className="disc-drawer-head">
            <div>
              <span>Method: Global generator</span>
              <b>Generate globally. Screen transparently. Cluster locally.</b>
            </div>
            <button onClick={() => setShowMethod(false)}><X size={16} /></button>
          </div>
          <div className="disc-method-body">
            <section>
              <span>Grid</span>
              <b>{data.grid.totalCells.toLocaleString()} H3 cells at resolution {data.grid.resolution}.</b>
              <p>
                H3 is an equal-area hierarchical spatial index. Cell IDs are deterministic. The screen generated{' '}
                {data.grid.landCells.toLocaleString()} land cells from Natural Earth 1:110m and did not read the 39
                curated sites or 107 manual seeds to choose where to look.
              </p>
            </section>
            <section>
              <span>Coarse data</span>
              <b>WorldClim 2.1 10′ / 1970-2000.</b>
              <p>
                Mean annual temperature (bio1), warmest and coldest month (bio5/bio6), annual precipitation (bio12),
                precipitation seasonality (bio15) and elevation. Local relief and slope are computed from a 5×5
                elevation window. Access is straight-line distance to the nearest scheduled large/medium airport
                from OurAirports. Temperature is used in native °C after direct raster verification.
              </p>
            </section>
            <section>
              <span>Screen</span>
              <b>Independent rules for three profiles.</b>
              <p>
                Lunar base, lunar expedition and Mars landing use different weights and gates. Missing dimensions are
                excluded from the weighted mean and reduce coverage; they are never imputed. Current exclusions:{' '}
                {Object.entries(data.screening.exclusions).map(([key, value]) => `${key.replace(/_/g, ' ')} ${value.toLocaleString()}`).join(' / ')}.
              </p>
            </section>
            <section>
              <span>Regions</span>
              <b>Seed-and-grow, then deduplicate.</b>
              <p>
                A region starts at an unassigned high-scoring cell and grows up to two H3 rings through adjacent
                cells within 15 score points of the seed. Regions are capped at 19 cells. Region centers closer than{' '}
                {data.screening.dedupKm} km are deduplicated. The 80 km threshold is about two region diameters and
                prevents multiple candidates for one continuous landscape.
              </p>
            </section>
            <section>
              <span>Novelty</span>
              <b>Distances are measured, not assumed.</b>
              <p>
                Every region is compared with all 146 existing catalogue coordinates. Under 10 km is a catalogue
                overlap; under {data.screening.dedupKm} km is catalogue-adjacent; otherwise it is new. Known locations
                are preserved with an explicit class, not silently discarded. After deduplication the run detected{' '}
                {data.counts.knownExistingAfterDedup} overlaps and {data.counts.knownNearbyAfterDedup} adjacent regions.
                The 80-region display contains {data.counts.existingRegions} overlap and {data.counts.nearbyRegions}{' '}
                adjacent examples; all {data.counts.knownRegionsAudited} known regions remain in the audit list.
              </p>
            </section>
            <section>
              <span>Enrichment</span>
              <b>{ENRICHED_IDS.size} of {data.counts.keptRegions} regions carry detailed evidence.</b>
              <p>
                Sentinel-2 L2A imagery, Copernicus DEM GLO-30 heightmaps, NASA POWER monthly climate, Macrostrat
                geology and MODIS day/night land-surface temperature were attached to a stratified selection of{' '}
                {ENRICHED_IDS.size} regions. The remaining {data.counts.keptRegions - ENRICHED_IDS.size} remain coarse
                screen only. Detailed evidence is shown separately from the coarse screen; it does not retroactively
                change the original scores.
              </p>
            </section>
            <section>
              <span>Footprint audit</span>
              <b>80 km centre dedup is not footprint dedup.</b>
              <p>
                The 80-region catalogue has zero shared H3 cells. However, 50 region pairs have touching footprints and
                17 proposed landscape groups cover 47 of the 80 regions. These are audit groups, not replacements: the
                original IDs, scores and footprints remain unchanged. The revised grouping is stored in
                generatedRegionGroupsV2.json. An antimeridian footprint correction is recorded separately.
              </p>
            </section>
            <section>
              <span>Licensing</span>
              <b>Some sources are not open for commercial redistribution.</b>
              <p>
                WorldClim 2.1 is free for academic and other non-commercial use; redistribution or commercial use
                requires prior permission from WorldClim. Coarse derived fields in this screen are subject to that
                restriction. Natural Earth and OurAirports are public domain. Sentinel-2 is provided under the
                Copernicus Sentinel Data Terms; Copernicus DEM requires attribution to DLR/ESA; NASA POWER and MODIS
                are open with attribution; Macrostrat is CC-BY 4.0.
              </p>
            </section>
            <section className="disc-method-breaks">
              <span>What this screen cannot do</span>
              <p>
                The 10′ screen cannot resolve caves, lava tubes, moraines, mineralogy, regolith or local hazards. The
                enriched subset adds 10 m imagery, 30 m DEM, point climate and mapped geology, but no field validation,
                continuous land cover or permit/seasonal access. The 15 enriched regions are not a global validation
                set. This is a reproducible nomination prototype, not global completeness or a claim that Earth
                reproduces the Moon or Mars.
              </p>
            </section>
          </div>
          <div className="disc-drawer-actions">
            <button onClick={() => setShowMethod(false)}>Back to regions</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
