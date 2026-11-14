import { useEffect, useMemo, useState } from 'react';
import type { CandidateView, ComparisonView, MeasurementView } from '../agent/api';
import type { Site } from '../types';
import { Badge, Segmented } from './ui';
import { StateBadge } from './Evidence';
import { clean, comparisonBadge, DECISION, dimensionLabel, fmtValue } from './labels';

/** Evidence state of one side of a comparison, in the registry's vocabulary. */
function sideState(m: MeasurementView): string {
  if (m.status === 'MISSING') return m.evidenceState ?? 'not_investigated';
  return ({ MEASURED: 'verified_measurement', PUBLISHED: 'verified_measurement', DERIVED: 'verified_derived', MODELED: 'modelled', ESTIMATED: 'unvalidated_estimate' } as Record<string, string>)[m.status] ?? 'unvalidated_estimate';
}

const LAYERS = [
  { key: 'terrain', label: 'Terrain', prefixes: ['terrain.'] },
  { key: 'thermal', label: 'Thermal', prefixes: ['thermal.'] },
  { key: 'atmosphere', label: 'Atmosphere', prefixes: ['atmosphere.', 'gravity.'] },
  { key: 'geology', label: 'Geology', prefixes: ['geology.', 'resources.'] },
  { key: 'light', label: 'Light', prefixes: ['radiation.', 'illumination.'] },
] as const;

const TARGET_IMAGE: Record<string, { src: string; title: string; credit: string }> = {
  moon_south_pole: { src: '/targets/moon_south_pole_clementine.jpg', title: 'Moon · South polar region', credit: 'Clementine mosaic, NASA/JPL/USGS' },
  mars_jezero: { src: '/targets/mars_jezero_hirise.jpg', title: 'Mars · Jezero crater', credit: 'HiRISE PIA19303, NASA/JPL-Caltech/University of Arizona' },
};

function supportText(m: MeasurementView) {
  const s = m.support;
  if (!s || s.spatial === 'not_applicable') return null;
  const res = s.resolutionM ? (s.resolutionM >= 1000 ? `${Math.round(s.resolutionM / 100) / 10} km` : `${s.resolutionM} m`) : null;
  return [res, s.period].filter(Boolean).join(' · ');
}

function Side({ m, label }: { m: MeasurementView; label: string }) {
  const value = fmtValue(m.value, m.range, m.unit);
  const sup = supportText(m);
  return (
    <div className="twin-side">
      <span className="subtle">{label}</span>
      <b className="num">{value ?? (m.status === 'MISSING' ? '—' : clean(m.note) || 'Qualitative')}{m.uncertainty ? <span className="subtle"> ± {m.uncertainty}</span> : null}</b>
      <StateBadge state={sideState(m)} />
      {sup ? <span className="subtle">{sup}</span> : null}
    </div>
  );
}

/** Priority 1: Earth analog and planetary target side by side, with linked feature layers. */
export function TwinViewer({ site, target, rows, layer: layerProp, onLayer }: { site: Site; target: string; rows: ComparisonView[] | null; layer?: (typeof LAYERS)[number]['key']; onLayer?: (l: (typeof LAYERS)[number]['key']) => void }) {
  const [ownLayer, setOwnLayer] = useState<(typeof LAYERS)[number]['key']>('terrain');
  const layer = layerProp ?? ownLayer;
  const setLayer = onLayer ?? setOwnLayer;
  const [open, setOpen] = useState<string | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const earthSrc = failedFor === site.id ? `/sites/${site.id}.jpg` : `/sites/close/${site.id}.jpg`;
  const t = TARGET_IMAGE[target] ?? TARGET_IMAGE.moon_south_pole;
  const def = LAYERS.find((l) => l.key === layer)!;
  const items = (rows ?? []).filter((r) => def.prefixes.some((p) => r.dimension.startsWith(p)) && (r.earth.status !== 'MISSING' || r.planet.status !== 'MISSING') && r.gapOutcome !== 'not_applicable');
  const counts = useMemo(() => {
    const c = { match: 0, partial: 0, gap: 0, impossible: 0, open: 0 };
    for (const r of rows ?? []) {
      if (r.classification === 'analog') c.match++;
      else if (r.classification === 'partial') c.partial++;
      else if (r.classification === 'mismatch') c.gap++;
      else if (r.classification === 'not_naturally_reproducible') c.impossible++;
      else if (r.gapOutcome !== 'not_applicable') c.open++;
    }
    return c;
  }, [rows]);
  return (
    <section className="card twin reveal" id="planetary-twin" aria-label="Planetary twin viewer">
      <div className="spread">
        <h3 className="card-title">Planetary twin</h3>
        <span className="subtle">{counts.match} match · {counts.partial} partial · {counts.gap} differ · {counts.impossible} impossible on Earth · {counts.open} unresolved</span>
      </div>
      <div className="twin-images">
        <figure>
          <img src={earthSrc} alt={`Satellite view of ${site.name}`} onError={() => setFailedFor(site.id)} />
          <figcaption><b className="tw-earth">Earth analog</b><span>{site.name} · {site.country}</span><span className="subtle">{earthSrc.includes('/close/') ? 'Sentinel-2, ESA Copernicus' : 'MODIS Terra, NASA GIBS'}</span></figcaption>
        </figure>
        <figure>
          <img src={t.src} alt={t.title} />
          <figcaption><b className="tw-target">Planetary target</b><span>{t.title}</span><span className="subtle">{t.credit}</span></figcaption>
        </figure>
      </div>
      <p className="subtle twin-note">Images are visual references and are not spatially matched. The values below are compared only where quantity and support match.</p>
      <Segmented label="Feature layer" value={layer} options={LAYERS.map((l) => ({ value: l.key, label: l.label }))} onChange={(v) => { setLayer(v); setOpen(null); }} />
      {rows === null ? <p className="subtle">Loading measurements…</p> : !items.length ? <p className="subtle">No measurement in this layer for this site or target.</p> : (
        <ul className="twin-rows" key={layer}>
          {items.map((r) => {
            const c = comparisonBadge(r);
            const isOpen = open === r.dimension;
            return (
              <li key={r.dimension} className={isOpen ? 'is-open' : ''}>
                <button type="button" className="twin-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.dimension)}>
                  <span className="strong twin-dim">{dimensionLabel(r.dimension, r.label)}</span>
                  <Side m={r.earth} label="Earth" />
                  <Side m={r.planet} label="Target" />
                  <span className="twin-result"><Badge tone={c.tone}>{c.label}</Badge></span>
                </button>
                {isOpen ? (
                  <div className="twin-detail">
                    <p>{clean(r.reason)}</p>
                    <dl className="ev-facts">
                      <div><dt>Earth source</dt><dd>{clean(r.earth.source)}</dd></div>
                      {r.earth.support?.description ? <div><dt>Earth support</dt><dd>{clean(r.earth.support.description)}</dd></div> : null}
                      <div><dt>Target source</dt><dd>{clean(r.planet.source)}</dd></div>
                      {r.planet.support?.description ? <div><dt>Target support</dt><dd>{clean(r.planet.support.description)}</dd></div> : null}
                      <div><dt>Comparison</dt><dd>{clean(r.supportNote)}</dd></div>
                      {r.nextAction ? <div><dt>Next</dt><dd>{clean(r.nextAction)}</dd></div> : null}
                    </dl>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Priority 2: show what a headline similarity hides, using the run's own checks. */
export function ChallengeMatch({ site, candidate, experimentName, profile }: { site: Site; candidate: CandidateView; experimentName: string; profile: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step === 0 || step >= 4) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), 650);
    return () => window.clearTimeout(t);
  }, [step]);
  const screening = (site.scores as Record<string, { total: number }> | undefined)?.[profile]?.total ?? null;
  const critical = candidate.mismatches.filter((m) => m.importance === 'critical');
  const by = (cls: string) => critical.filter((m) => m.comparison.classification === cls);
  const unresolved = candidate.mismatches.filter((m) => m.comparison.classification === 'missing' || m.comparison.classification === 'incompatible_support');
  const integration = unresolved.filter((m) => m.comparison.gapOutcome === 'integration_needed');
  const field = unresolved.filter((m) => m.comparison.gapOutcome === 'field_measurement');
  const hard = candidate.reasons.filter((r) => /violates|No climatological window|Insufficient evidence|below the/.test(r));
  const decision = DECISION[candidate.decision];
  const evidence = candidate.rankings.evidenceCompleteness;
  return (
    <section className="card challenge reveal" aria-label="Challenge this match">
      <div className="spread">
        <h3 className="card-title">Challenge this match</h3>
        <span className="subtle">{experimentName}</span>
      </div>
      <div className="challenge-scores">
        <div><span className="subtle">Screening similarity</span><b className="num">{screening == null ? '—' : Math.round(screening)}</b><span className="subtle">Profile-level fit before any mission check</span></div>
        <div className={step >= 4 ? 'is-final' : ''}><span className="subtle">Validated suitability</span><b className="num">{step >= 4 ? candidate.experimentScore ?? '—' : '?'}</b><span className="subtle">{step >= 4 ? decision.label : 'After hard limits and evidence checks'}</span></div>
        <div><span className="subtle">Evidence completeness</span><b className="num">{evidence == null ? '—' : `${evidence}%`}</b><span className="subtle">Share of the required evidence present</span></div>
        <div className="is-muted"><span className="subtle">Stress-test value</span><b className="num">—</b><span className="subtle">Not yet computed by ODYSSEY</span></div>
      </div>
      {step === 0 ? (
        <button type="button" className="btn btn-primary btn-lg challenge-go" onClick={() => setStep(1)}><svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z M9 12l2 2 4-4" /></svg>Challenge this match</button>
      ) : (
        <ol className="challenge-steps">
          <li className={step >= 1 ? 'is-shown' : ''}>
            <b>Hard limits</b>
            <span>{hard.length ? clean(hard[0]) : 'No required limit is violated.'}</span>
          </li>
          <li className={step >= 2 ? 'is-shown' : ''}>
            <b>Critical conditions against the target</b>
            <span>
              {critical.length} checked: {by('analog').length} match, {by('partial').length} partial, {by('mismatch').length} differ, {by('not_naturally_reproducible').length} impossible on Earth.
              {by('mismatch')[0] ? ` Largest gap: ${dimensionLabel(by('mismatch')[0].dimension, by('mismatch')[0].label)}.` : ''}
            </span>
          </li>
          <li className={step >= 3 ? 'is-shown' : ''}>
            <b>Evidence that is not there</b>
            <span>{unresolved.length ? `${unresolved.length} condition(s) unresolved: ${field.length} need a field measurement, ${integration.length} need a dataset connected. Missing data is never counted as a match.` : 'Every checked condition has evidence on both sides.'}</span>
          </li>
          <li className={step >= 4 ? 'is-shown' : ''}>
            <b>Verdict</b>
            <span><Badge tone={decision.tone}>{decision.label}</Badge> {screening != null && candidate.experimentScore != null ? `Screening similarity ${Math.round(screening)} becomes a validated suitability of ${candidate.experimentScore} for this experiment.` : ''}</span>
          </li>
        </ol>
      )}
    </section>
  );
}
