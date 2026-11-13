import raw from '../data/planetaryReference.json';
import generatedRaw from '../data/generatedPlanetaryReference.json';
import generatedThermalRaw from '../data/generatedThermal.json';
import thermalRaw from '../data/planetaryThermal.json';
import type { ProfileKey, Site } from '../types';
import '../planetary.css';

type Ref = {
  name: string;
  lat: number;
  lon: number;
  source: string;
  datum: string;
  resolutionM: number;
  windowKm: number;
  elevationMean: number;
  reliefP95P5: number;
  slopeMean: number;
  slopeP95: number;
  roughness: number;
};

type EarthStat = {
  elevationMean: number;
  reliefP95P5: number;
  slopeMean: number;
  slopeP95: number;
  roughness: number;
};

type ThermalStatus = 'NO DATA' | 'INSUFFICIENT' | 'LIMITED' | 'MODERATE' | 'STRONGER SAMPLE';
const statusLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

type ThermalPhase = {
  nAccepted: number;
  nGoodQC: number;
  nOtherQC: number;
  nRejected: number;
  status: ThermalStatus;
  meanK: number | null;
  minK: number | null;
  maxK: number | null;
  observations: {
    date: string;
    K: number;
    qc: number;
    qcClass: string;
    itemId: string;
    platform?: string;
    product?: string;
    qcFlags?: {
      rawQC: number;
      mandatoryQA: number;
      bits2_3Raw: number;
      guideC61: { dataQualityBits2_3: number };
      laadsC61: { bit2DataQuality: number; bit3SnowLakeIce: number };
      emissivityErrorBits4_5: number;
      lstErrorBits6_7: number;
      decoderVersion: string;
    };
    timing?: {
      viewTimeLocalHours: number | null;
      viewAngleDeg: number | null;
      clearSkyCoverage: number | null;
    } | null;
  }[];
};

type LunarClass = {
  rangeK: number[] | null;
  support: string;
  source?: string;
  doi?: string;
  class: string;
};

type EarthThermal = {
  window: string;
  hemisphere: string;
  cap: number;
  availableDates: number;
  selectedDates: number;
  selection: string;
  nItems: number;
  nOverlapItems: number;
  nDatesWithMultipleItems: number;
  nOverlapValidResolved: number;
  day: ThermalPhase;
  night: ThermalPhase;
  unpairedDayNightDeltaK: number | null;
  pairedDayNight: {
    nPaired: number;
    meanDeltaK: number | null;
    minDeltaK: number | null;
    maxDeltaK: number | null;
    observations: { date: string; dayK: number; nightK: number; deltaK: number }[];
  };
  spatialSensitivity: {
    phase: string;
    nDates: number;
    meanNeighborhoodStdK: number | null;
    meanAbsCenterNeighborhoodK: number | null;
    maxAbsCenterNeighborhoodK: number | null;
    meanValidPixels: number | null;
    support: string;
  };
  air: { meanK: number; minK: number; maxK: number; source: string; support: string; class: string };
  platformCounts?: {
    day: Record<string, number>;
    night: Record<string, number>;
    pairedSamePlatform: number;
    pairedMixedPlatform: number;
  };
  qcSensitivity?: {
    qc00: { day: { n: number; meanK: number | null }; night: { n: number; meanK: number | null } };
    accepted: { day: { n: number; meanK: number | null }; night: { n: number; meanK: number | null } };
    deltaDayMeanK: number | null;
    deltaNightMeanK: number | null;
  };
  timingSummary?: {
    day: Record<string, {
      n: number;
      meanLocalSolarTimeHours: number | null;
      meanSignedViewAngleDeg: number | null;
      meanAbsoluteViewAngleDeg: number | null;
      directionCounts: Record<string, number>;
      meanRawClearSkyCoverageDN: number | null;
      meanClearSkyCoverageUnclipped: number | null;
      nClearSkyMissing: number;
    } | null>;
    night: Record<string, {
      n: number;
      meanLocalSolarTimeHours: number | null;
      meanSignedViewAngleDeg: number | null;
      meanAbsoluteViewAngleDeg: number | null;
      directionCounts: Record<string, number>;
      meanRawClearSkyCoverageDN: number | null;
      meanClearSkyCoverageUnclipped: number | null;
      nClearSkyMissing: number;
    } | null>;
  } | null;
  polarNote?: string;
};

const generatedReference = generatedRaw as unknown as {
  earth: Record<string, Record<string, EarthStat>>;
};

const generatedThermal = generatedThermalRaw as unknown as {
  earth: Record<string, EarthThermal>;
};

const thermal = thermalRaw as unknown as {
  generatedAt: string;
  policy: string;
  modis: { product: string; support: string; qc: string; cap: number; statuses: string };
  earth: Record<string, EarthThermal>;
  mars: {
    air: { rangeK: number[]; support: string; source: string; doi: string };
    surface: { rangeK: number[]; support: string; source: string; doi: string };
    diurnalAmplitudeK: number[];
    note: string;
  };
  moon: {
    classes: { polarRange: LunarClass; permanentlyShadowed: LunarClass; illuminatedSlope: LunarClass };
    note: string;
  };
  thermalInertia: { note: string };
  overlapPolicySensitivity?: Record<string, {
    window: string;
    selectedDates: number;
    policies: Record<string, {
      day: { n: number; meanK: number | null };
      night: { n: number; meanK: number | null };
      paired: { n: number; meanDeltaK: number | null };
      deltaVsCurrent?: { dayMeanK: number | null; nightMeanK: number | null; dayCount: number; nightCount: number };
    }>;
  }>;
  qcPolicy?: {
    decoderVersion: string;
    acceptance: string;
    bits2_3: { status: string; guideC61: string; laadsC61: string; usedForAcceptance: boolean };
    note: string;
  };
  qcSensitivitySummary?: {
    qc00Only: { day: number; night: number };
    accepted: { day: number; night: number };
    daySitesQc00: number;
    daySitesAccepted: number;
    nightSitesQc00: number;
    nightSitesAccepted: number;
  };
};

const data = raw as unknown as {
  generatedAt: string;
  method: string;
  references: { moon: Ref; mars: Ref };
  earth: Record<string, Record<string, EarthStat>>;
};

const PROFILE_LABEL: Record<ProfileKey, string> = {
  lunar_base: 'Moon south pole base',
  mars_landing: 'Mars / Jezero landing',
  expedition: 'Lunar surface expedition',
};

function fmt(value: number, digits = 1) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function match(earth: number, reference: number) {
  const ratio = reference === 0 ? 0 : earth / reference;
  if (ratio >= 0.8 && ratio <= 1.25) return { label: 'Close', ratio, tone: 'close' };
  if (ratio >= 0.4 && ratio <= 2.5) return { label: 'Same order', ratio, tone: 'order' };
  return { label: 'Different', ratio, tone: 'different' };
}

function ratioText(value: number) {
  if (value === 0) return '0×';
  if (value < 0.1) return `${value.toFixed(2)}×`;
  if (value < 10) return `${value.toFixed(2)}×`;
  return `${value.toFixed(0)}×`;
}

function Row({
  label,
  earth,
  reference,
  unit,
  digits = 1,
  compare = true,
}: {
  label: string;
  earth: number;
  reference: number;
  unit: string;
  digits?: number;
  compare?: boolean;
}) {
  const result = match(earth, reference);
  return (
    <div className="plan-row">
      <span className="plan-row-label">{label}</span>
      <b className="plan-row-earth">{fmt(earth, digits)} {unit}</b>
      <b className="plan-row-ref">{fmt(reference, digits)} {unit}</b>
      {compare ? (
        <em className={`plan-match ${result.tone}`}>
          {result.label} <i>{ratioText(result.ratio)}</i>
        </em>
      ) : (
        <em className="plan-match datum">Datum</em>
      )}
    </div>
  );
}

export function PlanetaryComparison({
  site,
  profile,
  onClose,
}: {
  site: Site;
  profile: ProfileKey;
  onClose: () => void;
}) {
  const earthSource = { ...data.earth, ...generatedReference.earth };
  const thermalSource = { ...thermal.earth, ...generatedThermal.earth };
  const earth400 = earthSource[site.id]?.['400m'];
  const earth463 = earthSource[site.id]?.['463m'];
  const moon = data.references.moon;
  const mars = data.references.mars;
  const active = profile === 'mars_landing' ? 'mars' : 'moon';

  if (!earth400 || !earth463) {
    return (
      <aside className="planetary-panel">
        <header className="planetary-head">
          <div>
            <span>Planetary reference</span>
            <b>{site.name}</b>
          </div>
          <button onClick={onClose}>Close</button>
        </header>
        <p className="planetary-empty">No same-baseline DEM statistics are available for this site.</p>
      </aside>
    );
  }

  return (
    <aside className="planetary-panel" aria-label="Earth to Moon and Mars terrain comparison">
      <header className="planetary-head">
        <div>
          <span>Planetary reference / same-baseline DEM</span>
          <b>{site.name}</b>
          <i>{PROFILE_LABEL[profile]}</i>
        </div>
        <button onClick={onClose}>Close</button>
      </header>

      <p className="planetary-lead">
        Actual measured topography, not visual similarity. Each pair is compared at the same ~12.8 km
        window and the same DEM baseline. Absolute elevation is shown with its datum but is not treated
        as a cross-body similarity metric.
      </p>

      <section className={`planetary-section ${active === 'moon' ? 'is-active' : ''}`}>
        <div className="planetary-section-head">
          <div>
            <span>Moon / south pole</span>
            <b>{moon.name}</b>
          </div>
          <em>LOLA · 400 m</em>
        </div>
        <div className="planetary-table">
          <div className="planetary-table-head">
            <span>Variable</span>
            <span>Earth / {site.name}</span>
            <span>Moon</span>
            <span>Match</span>
          </div>
          <Row label="Relief (p95–p5)" earth={earth400.reliefP95P5} reference={moon.reliefP95P5} unit="m" digits={1} />
          <Row label="Slope p95" earth={earth400.slopeP95} reference={moon.slopeP95} unit="°" digits={2} />
          <Row label="Roughness" earth={earth400.roughness} reference={moon.roughness} unit="m" digits={1} />
          <Row label="Mean elevation" earth={earth400.elevationMean} reference={moon.elevationMean} unit="m" digits={1} compare={false} />
        </div>
        <div className="planetary-datum">
          EARTH DATUM: MSL / EGM2008 · MOON DATUM: 1737.4 km REFERENCE SPHERE
        </div>
      </section>

      <section className={`planetary-section ${active === 'mars' ? 'is-active' : ''}`}>
        <div className="planetary-section-head">
          <div>
            <span>Mars / Jezero</span>
            <b>{mars.name}</b>
          </div>
          <em>MOLA · 463 m</em>
        </div>
        <div className="planetary-table">
          <div className="planetary-table-head">
            <span>Variable</span>
            <span>Earth / {site.name}</span>
            <span>Mars</span>
            <span>Match</span>
          </div>
          <Row label="Relief (p95–p5)" earth={earth463.reliefP95P5} reference={mars.reliefP95P5} unit="m" digits={1} />
          <Row label="Slope p95" earth={earth463.slopeP95} reference={mars.slopeP95} unit="°" digits={2} />
          <Row label="Roughness" earth={earth463.roughness} reference={mars.roughness} unit="m" digits={1} />
          <Row label="Mean elevation" earth={earth463.elevationMean} reference={mars.elevationMean} unit="m" digits={1} compare={false} />
        </div>
        <div className="planetary-datum">
          Earth datum: Msl / egm2008, Mars datum: Mars areoid (gmm-2b)
        </div>
      </section>

      <section className="planetary-thermal">
        <div className="planetary-section-head">
          <div>
            <span>Thermal / measured</span>
            <b>Day, night and air are separate supports</b>
          </div>
          <em>Kelvin</em>
        </div>
        {(() => {
          const earth = thermalSource[site.id];
          const mars = thermal.mars;
          const moon = thermal.moon;
          const day = earth?.day;
          const night = earth?.night;
          const air = earth?.air;
          const phaseValue = (phase?: { meanK: number | null; status: string }) =>
            phase ? (phase.meanK != null ? `${fmt(phase.meanK, 1)} K` : statusLabel(phase.status)) : 'No data';
          const phaseMeta = (phase?: { status: string; nAccepted: number; nGoodQC: number; nOtherQC: number }) =>
            earth && phase
              ? `${statusLabel(phase.status)}, ${phase.nAccepted}/${earth.selectedDates} dates · good ${phase.nGoodQC} / other ${phase.nOtherQC}`
              : '';
          return (
            <>
              <div className="thermal-row thermal-head">
                <span>Variable</span><span>Earth</span><span>Mars / Jezero</span><span>Moon / south pole</span>
              </div>
              <div className="thermal-row">
                <span>Day surface <small>MODIS 1 km</small></span>
                <b>{phaseValue(day)}<i>{phaseMeta(day)}</i></b>
                <b>{fmt(mars.surface.rangeK[0], 1)}–{fmt(mars.surface.rangeK[1], 1)} K</b>
                <b>{moon.classes.polarRange.rangeK ? `${fmt(moon.classes.polarRange.rangeK[0], 1)}–${fmt(moon.classes.polarRange.rangeK[1], 1)} K` : 'No data'}</b>
              </div>
              <div className="thermal-row">
                <span>Night surface <small>MODIS 1 km</small></span>
                <b>{phaseValue(night)}<i>{phaseMeta(night)}</i></b>
                <b>No data</b>
                <b>No data</b>
              </div>
              <div className="thermal-row">
                <span>Unpaired day–night difference</span>
                <b>{earth?.unpairedDayNightDeltaK != null ? `${fmt(earth.unpairedDayNightDeltaK, 1)} K` : 'No data'}<i>means, not paired</i></b>
                <b>No data</b>
                <b>No data</b>
              </div>
              <div className="thermal-row">
                <span>Paired day–night difference</span>
                <b>
                  {earth?.pairedDayNight.nPaired ? `${fmt(earth.pairedDayNight.meanDeltaK ?? 0, 1)} K` : 'No data'}
                  <i>{earth?.pairedDayNight.nPaired ?? 0} paired dates</i>
                </b>
                <b>No data</b>
                <b>No data</b>
              </div>
              <div className="thermal-row">
                <span>Air temperature</span>
                <b>{air ? `${fmt(air.meanK, 1)} K` : 'No data'}<i>2 m · monthly</i></b>
                <b>{fmt(mars.air.rangeK[0], 1)}–{fmt(mars.air.rangeK[1], 1)} K</b>
                <b>Not defined</b>
              </div>
              <div className="thermal-row">
                <span>Seasonal air amplitude</span>
                <b>{air ? `${fmt(air.maxK - air.minK, 1)} K` : 'No data'}</b>
                <b>No data</b>
                <b>Not defined</b>
              </div>
              <div className="thermal-row">
                <span>Mars diurnal amplitude <small>MEDA only</small></span>
                <b>No data</b>
                <b>{fmt(mars.diurnalAmplitudeK[0], 1)}–{fmt(mars.diurnalAmplitudeK[1], 1)} K</b>
                <b>No data</b>
              </div>
              <div className="thermal-row">
                <span>Thermal inertia</span><b>No data</b><b>No data</b><b>No data</b>
              </div>

              <div className="thermal-badges">
                <span className="thermal-badge measured">MODIS = measured</span>
                <span className="thermal-badge climatology">POWER = climatology</span>
                <span className="thermal-badge published">Diviner = published range</span>
                <span className="thermal-badge insufficient">INSUFFICIENT &lt; 4 DATES</span>
                <span className="thermal-badge missing">No data</span>
              </div>

              <div className="thermal-qc">
                {thermal.qcPolicy ? (
                  <p><b>QC decoder {thermal.qcPolicy.decoderVersion}</b> {thermal.qcPolicy.acceptance} Bits 2–3 are an unresolved documentation conflict: {thermal.qcPolicy.bits2_3.guideC61} in the MOD11 C6.1 guide, versus {thermal.qcPolicy.bits2_3.laadsC61} in the LAADS product specification. Both interpretations are stored per observation and neither is used for acceptance.</p>
                ) : null}
                {earth?.platformCounts ? (
                  <p><b>Platform</b> Day Terra {earth.platformCounts.day.Terra ?? 0} / Aqua {earth.platformCounts.day.Aqua ?? 0}; Night Terra {earth.platformCounts.night.Terra ?? 0} / Aqua {earth.platformCounts.night.Aqua ?? 0}; paired same-platform {earth.platformCounts.pairedSamePlatform} / mixed-platform {earth.platformCounts.pairedMixedPlatform}.</p>
                ) : null}
                {earth?.qcSensitivity ? (
                  <p><b>QC sensitivity</b> QC00-only: day {earth.qcSensitivity.qc00.day.n} dates / {earth.qcSensitivity.qc00.day.meanK ?? '–'} K; night {earth.qcSensitivity.qc00.night.n} / {earth.qcSensitivity.qc00.night.meanK ?? '–'} K. Accepted QC00+01: day {earth.qcSensitivity.accepted.day.n} / {earth.qcSensitivity.accepted.day.meanK ?? '–'} K; night {earth.qcSensitivity.accepted.night.n} / {earth.qcSensitivity.accepted.night.meanK ?? '–'} K. Δday {earth.qcSensitivity.deltaDayMeanK ?? '–'} K; Δnight {earth.qcSensitivity.deltaNightMeanK ?? '–'} K.</p>
                ) : null}
                {earth?.timingSummary ? (
                  <>
                    <p><b>Timing: Local solar</b> Day Terra {earth.timingSummary.day.Terra?.meanLocalSolarTimeHours ?? '–'} h / {earth.timingSummary.day.Terra?.meanSignedViewAngleDeg ?? '–'}° signed / {earth.timingSummary.day.Terra?.meanAbsoluteViewAngleDeg ?? '–'}° abs / cov {earth.timingSummary.day.Terra?.meanRawClearSkyCoverageDN ?? '–'} Dn → {earth.timingSummary.day.Terra?.meanClearSkyCoverageUnclipped ?? '–'}; Aqua {earth.timingSummary.day.Aqua?.meanLocalSolarTimeHours ?? '–'} h / {earth.timingSummary.day.Aqua?.meanSignedViewAngleDeg ?? '–'}° signed / cov {earth.timingSummary.day.Aqua?.meanRawClearSkyCoverageDN ?? '–'} Dn → {earth.timingSummary.day.Aqua?.meanClearSkyCoverageUnclipped ?? '–'}. Night Terra {earth.timingSummary.night.Terra?.meanLocalSolarTimeHours ?? '–'} h / Aqua {earth.timingSummary.night.Aqua?.meanLocalSolarTimeHours ?? '–'} h.</p>
                    <p><b>Time / angle basis</b> Product date is UTC; view time is local solar; local solar date is not derived. Angle = raw DN − 65; negative = east, positive = west; raw 0 = −65°, 65 = 0°, 130 = +65°, 255 = missing. Clear-sky = raw × 0.0005, unclipped; 0 is missing, 1–65535 valid (65535 = 32.7675).</p>
                  </>
                ) : null}
                {thermal.overlapPolicySensitivity?.[site.id] ? (() => {
                  const policies = thermal.overlapPolicySensitivity[site.id].policies;
                  const err = policies.error_aware?.deltaVsCurrent;
                  const terra = policies.terra?.deltaVsCurrent;
                  const aqua = policies.aqua?.deltaVsCurrent;
                  return (
                    <p><b>Overlap policy</b> Error-aware vs current: Δday {err?.dayMeanK ?? '–'} K / Δnight {err?.nightMeanK ?? '–'} K. Terra-only: Δday {terra?.dayMeanK ?? '–'} K / Δnight {terra?.nightMeanK ?? '–'} K (n {terra?.dayCount ?? '–'}/{terra?.nightCount ?? '–'}). Aqua-only: Δday {aqua?.dayMeanK ?? '–'} K / Δnight {aqua?.nightMeanK ?? '–'} K (n {aqua?.dayCount ?? '–'}/{aqua?.nightCount ?? '–'}).</p>
                  );
                })() : null}
                {earth?.polarNote ? <p><b>Polar pixel</b> {earth.polarNote}</p> : null}
              </div>

              <div className="thermal-sources">
                <p><b>Earth day / night</b> {earth ? `${thermal.modis.product} · ${thermal.modis.support} · ${earth.window}; day ${earth.day.nAccepted} accepted, night ${earth.night.nAccepted} accepted.` : 'No MODIS sample.'}</p>
                <p><b>Sampling</b> {earth ? `${earth.cap}-date cap; ${earth.availableDates} available; ${earth.selectedDates} selected; ${earth.nItems} items; ${earth.nOverlapItems} overlap items; ${earth.nDatesWithMultipleItems} dates with multiple items; ${earth.nOverlapValidResolved} dates with overlap-valid pixels resolved by QC then item ID.` : 'No sample.'}</p>
                <p><b>Spatial sensitivity</b> {earth ? `5×5 day neighbourhood: ${earth.spatialSensitivity.nDates} dates; mean neighbourhood std ${earth.spatialSensitivity.meanNeighborhoodStdK ?? '–'} K; mean |centre−neighbourhood| ${earth.spatialSensitivity.meanAbsCenterNeighborhoodK ?? '–'} K; max ${earth.spatialSensitivity.maxAbsCenterNeighborhoodK ?? '–'} K; mean valid pixels ${earth.spatialSensitivity.meanValidPixels ?? '–'}/25. ${earth.spatialSensitivity.support}` : 'No sample.'}</p>
                <p><b>Earth air</b> {air?.source} · {air?.support}</p>
                <p><b>Mars</b> {mars.air.support}. {mars.note}</p>
                <p><b>Moon</b> {moon.classes.polarRange.support}. PSR and illuminated-slope classes are not separately sampled in this repository. {moon.note}</p>
              </div>

              <p className="thermal-caution">
                Status labels are display categories, not confidence levels. MODIS is a 1 km clear-sky surface skin observation; MEDA is a point record at Jezero; Diviner is a published mission-level polar range. Air temperature is not surface temperature, and thermal inertia is not temperature. {thermal.thermalInertia.note}
              </p>
            </>
          );
        })()}
      </section>

      <div className="planetary-note">
        <b>How to read this</b>
        <p>
          CLOSE = within 0.8–1.25× of the planetary reference. SAME ORDER = 0.4–2.5×. DIFFERENT =
          outside that range. A site can match Mars terrain and fail the Moon, or vice versa. This is
          a terrain comparison only.
        </p>
      </div>

      <div className="planetary-breaks">
        <b>Not compared here</b>
        <p>
          Gravity, vacuum or atmospheric pressure, radiation, surface temperature, mineralogy and
          regolith mechanics. Those require separate instruments and are not inferred from topography.
          Earth does not reproduce lunar 1.62 m/s² gravity or the Martian 6 mbar CO2 atmosphere.
        </p>
      </div>

      <footer className="planetary-foot">
        <span>{moon.source}</span>
        <span>{mars.source}</span>
        <span>Data version {data.generatedAt} / ~12.8 KM windows</span>
      </footer>
    </aside>
  );
}
