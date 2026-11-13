import { useEffect, useMemo, useState } from 'react';
import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { Check, Database, Download, MapPin, Minus, Plus, X } from 'lucide-react';
import raw from '../data/discovery.json';
import generatedRaw from '../data/globalDiscovery.json';
import odysseyRaw from '../data/odyssey.json';
import { GeneratedDiscovery } from './GeneratedDiscovery';
import {
  REFERENCES,
  formatCoord,
  gradeLabel,
  monthlyScores,
  scoreCandidate,
} from '../discovery/engine';
import type {
  CandidateScore,
  DiscoveryCandidate,
  DiscoveryData,
  ReferenceKey,
} from '../discovery/types';
import '../discovery.css';
import '../discovery-theme.css';

const data = raw as unknown as DiscoveryData;
const controls = (odysseyRaw as unknown as { sites: { lat: number; lon: number; name: string }[] }).sites;
const generatedCount = (generatedRaw as unknown as { regions: unknown[] }).regions.length;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const SHORTLIST_KEY = 'odyssey.discovery.shortlist.v1';

type Category = 'ALL' | 'IMPACT' | 'POLAR' | 'VOLCANIC' | 'SUBSURFACE' | 'ARID';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'IMPACT', label: 'Impact' },
  { key: 'POLAR', label: 'Polar' },
  { key: 'VOLCANIC', label: 'Volcanic' },
  { key: 'SUBSURFACE', label: 'Cave / mine' },
  { key: 'ARID', label: 'Arid' },
];

function categoryOf(c: DiscoveryCandidate): Category {
  const tags = new Set(c.tags.map((t) => t.toLowerCase()));
  if (tags.has('impact')) return 'IMPACT';
  if (tags.has('ice') || tags.has('glacier')) return 'POLAR';
  if (tags.has('volcanic') || tags.has('basalt')) return 'VOLCANIC';
  if (tags.has('cave') || tags.has('mine') || tags.has('subsurface')) return 'SUBSURFACE';
  return 'ARID';
}

function loadShortlist(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(SHORTLIST_KEY) || '[]');
    return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function scoreColor(score: number) {
  if (score >= 75) return 'var(--cyan)';
  if (score >= 60) return 'var(--amber)';
  if (score >= 45) return '#8fa3ad';
  return '#4d5d66';
}

function mismatchFor(reference: ReferenceKey) {
  return reference === 'lunar_south_pole'
    ? 'Earth cannot reproduce the lunar vacuum, 1.62 m/s² gravity, the radiation environment, regolith thickness, or true permanent-shadow illumination.'
    : 'Earth cannot reproduce the 6 mbar CO2 atmosphere, 3.71 m/s² gravity, the radiation environment, global dust storms, or the oxidant chemistry of the Martian surface.';
}

export function DiscoveryMode({
  onClose,
  onOpenGeneratedSite,
}: {
  onClose: () => void;
  onOpenGeneratedSite: (id: string) => void;
}) {
  const [reference, setReference] = useState<ReferenceKey>('lunar_south_pole');
  const [rankMode, setRankMode] = useState<'mean' | 'weak'>('mean');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(0);
  const [minCoverage, setMinCoverage] = useState(0);
  const [category, setCategory] = useState<Category>('ALL');
  const [novelOnly, setNovelOnly] = useState(false);
  const [sarOnly, setSarOnly] = useState(false);
  const [hover, setHover] = useState<{ candidate: DiscoveryCandidate; score: CandidateScore; x: number; y: number } | null>(null);
  const [shortlist, setShortlist] = useState<string[]>(loadShortlist);
  const [toast, setToast] = useState<string | null>(null);
  const [showShortlist, setShowShortlist] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const [showGenerated, setShowGenerated] = useState(false);
  const [world, setWorld] = useState<any>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !showGenerated) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, showGenerated]);

  useEffect(() => {
    let alive = true;
    fetch('/world-110m.json')
      .then((r) => r.json())
      .then((topo) => {
        if (!alive) return;
        setWorld(feature(topo, topo.objects.countries));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify(shortlist));
  }, [shortlist]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const scored = useMemo(
    () =>
      data.candidates
        .map((candidate) => ({ candidate, score: scoreCandidate(candidate, reference) }))
        .sort((a, b) =>
          rankMode === 'weak' ? b.score.weakLink - a.score.weakLink : b.score.total - a.score.total,
        ),
    [reference, rankMode],
  );

  const filtered = useMemo(
    () =>
      scored.filter(({ candidate, score }) => {
        if (score.total < minScore) return false;
        if (score.coverage < minCoverage) return false;
        if (novelOnly && score.noveltyGrade !== 'N2') return false;
        if (sarOnly && !candidate.sar) return false;
        if (category !== 'ALL' && categoryOf(candidate) !== category) return false;
        return true;
      }),
    [scored, minScore, minCoverage, novelOnly, sarOnly, category],
  );

  const selected = useMemo(() => {
    const found = filtered.find((item) => item.candidate.id === selectedId);
    return found ?? filtered[0] ?? scored[0];
  }, [filtered, selectedId, scored]);

  const stats = useMemo(() => {
    const n2 = scored.filter((item) => item.score.noveltyGrade === 'N2').length;
    const highCoverage = scored.filter((item) => item.score.coverage >= 0.6).length;
    const mean = scored.reduce((sum, item) => sum + item.score.total, 0) / Math.max(1, scored.length);
    const sar = scored.filter((item) => item.candidate.sar).length;
    return { n2, highCoverage, mean, sar };
  }, [scored]);

  const { path, projection, graticule } = useMemo(() => {
    const p = geoNaturalEarth1().fitExtent(
      [
        [18, 18],
        [1000 - 18, 560 - 18],
      ],
      { type: 'Sphere' } as any,
    );
    return { path: geoPath(p), projection: p, graticule: geoGraticule10() };
  }, []);

  const toggleShortlist = (candidate: DiscoveryCandidate) => {
    const exists = shortlist.includes(candidate.id);
    setShortlist((prev) =>
      exists ? prev.filter((id) => id !== candidate.id) : [...prev, candidate.id],
    );
    setToast(exists ? `${candidate.name} removed from shortlist` : `${candidate.name} promoted to field-review shortlist`);
  };

  const dossierPayload = (candidate: DiscoveryCandidate, score: CandidateScore) => ({
    id: candidate.id,
    name: candidate.name,
    country: candidate.country,
    coordinates: [candidate.lat, candidate.lon],
    reference,
    score: score.total,
    weakLink: score.weakLink,
    distance: score.distance,
    sensitivity: score.sensitivity,
    coreCoverage: score.coverage,
    noveltyGrade: score.noveltyGrade,
    robustness: score.robustness,
    nearestControl: candidate.nearestControl,
    window: score.window,
    dimensions: score.dimensions,
    missing: score.missing,
    evidence: candidate.evidence,
    geology: candidate.geology,
    airport: candidate.airport,
    climate: candidate.climate,
    terrain: candidate.terrain,
    sar: candidate.sar ?? null,
  });

  const download = (payload: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportShortlist = () => {
    const payload = shortlist
      .map((id) => data.candidates.find((c) => c.id === id))
      .filter((c): c is DiscoveryCandidate => Boolean(c))
      .map((candidate) => dossierPayload(candidate, scoreCandidate(candidate, reference)));
    download(
      { exportedAt: new Date().toISOString(), reference, kind: 'shortlist', candidates: payload },
      `odyssey-discovery-shortlist-${reference}.json`,
    );
    setToast(`Exported ${payload.length} candidate dossier${payload.length === 1 ? '' : 's'}`);
  };

  const exportScreen = () => {
    const payload = filtered.map(({ candidate, score }) => dossierPayload(candidate, score));
    download(
      {
        exportedAt: new Date().toISOString(),
        reference,
        kind: 'screen',
        generatedAt: data.generatedAt,
        candidates: payload,
      },
      `odyssey-discovery-screen-${reference}.json`,
    );
    setToast(`Exported ${payload.length} screened candidates`);
  };

  const monthly = selected ? monthlyScores(selected.candidate, reference) : [];
  const rankedDims = selected
    ? selected.score.dimensions.filter((d) => d.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    : [];
  const strongest = rankedDims[0];
  const weakest = rankedDims[rankedDims.length - 1];
  const shortlisted = shortlist
    .map((id) => data.candidates.find((c) => c.id === id))
    .filter((c): c is DiscoveryCandidate => Boolean(c));

  return (
    <div className="disc ui">
      <header className="disc-top">
        <div className="disc-brand">
          <span className="ws-brand">
            <span className="orb-mark" aria-hidden="true" />
            ODYSSEY
          </span>
          <b>Global discovery</b>
        </div>
        <div className="disc-top-mid">
          <span>{data.candidates.length} candidate sites beyond the 39 curated ones, {stats.sar} with radar imagery</span>
        </div>
        <div className="disc-top-right">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setShowGenerated(true);
              setShowShortlist(false);
              setShowMethod(false);
            }}
          >
            Generated regions ({generatedCount})
          </button>
          <button type="button" className="btn btn-ghost btn-sm" aria-pressed={showMethod} onClick={() => { setShowMethod((v) => !v); setShowShortlist(false); }}>
            Method
          </button>
          <button type="button" className="btn btn-ghost btn-sm" aria-pressed={showShortlist} onClick={() => { setShowShortlist((v) => !v); setShowMethod(false); }}>
            Shortlist ({shortlist.length})
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </header>

      <div className="disc-layout">
        <aside className="disc-left">
          <div className="disc-kicker">Reference profile</div>
          <div className="disc-reference-tabs">
            {(Object.keys(REFERENCES) as ReferenceKey[]).map((key) => (
              <button
                key={key}
                className={reference === key ? 'active' : ''}
                onClick={() => { setReference(key); setSelectedId(null); }}
              >
                {REFERENCES[key].short}
              </button>
            ))}
          </div>
          <p className="disc-reference-copy">{REFERENCES[reference].description}</p>
          <div className="disc-targets">
            {REFERENCES[reference].targetSummary.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>

          <div className="disc-stat-grid">
            <div>
              <span>Candidates</span>
              <b>{scored.length}</b>
            </div>
            <div>
              <span>Mean fit</span>
              <b>{stats.mean.toFixed(1)}</b>
            </div>
            <div>
              <span>SAR evidence</span>
              <b>{stats.sar}</b>
            </div>
            <div>
              <span>N2 grade</span>
              <b>{stats.n2}</b>
            </div>
          </div>

          <div className="disc-filter">
            <div className="disc-filter-head">
              <span>Filter</span>
              <button onClick={() => { setMinScore(0); setMinCoverage(0); setNovelOnly(false); setSarOnly(false); setCategory('ALL'); }}>
                Reset
              </button>
            </div>
            <label>
              <span>Min fit <b>{minScore}</b></span>
              <input type="range" min={0} max={90} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
            </label>
            <label>
              <span>Min core coverage <b>{Math.round(minCoverage * 100)}%</b></span>
              <input type="range" min={0} max={0.9} step={0.1} value={minCoverage} onChange={(e) => setMinCoverage(Number(e.target.value))} />
            </label>
            <button className={`disc-toggle ${novelOnly ? 'active' : ''}`} onClick={() => setNovelOnly((v) => !v)}>
              <span className="disc-toggle-dot" /> N2 strong only
            </button>
            <button className={`disc-toggle ${sarOnly ? 'active' : ''}`} onClick={() => setSarOnly((v) => !v)}>
              <span className="disc-toggle-dot" /> SAR evidence only
            </button>
            <div className="disc-categories">
              {CATEGORIES.map((item) => (
                <button key={item.key} className={category === item.key ? 'active' : ''} onClick={() => setCategory(item.key)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="disc-list-head">
            <span>Ranked candidates</span>
            <div className="disc-list-actions">
              <span>{filtered.length} Shown</span>
              <button onClick={exportScreen}>Export screen</button>
            </div>
          </div>
          <div className="disc-rank-toggle">
            <span>Rank by</span>
            <button className={rankMode === 'mean' ? 'active' : ''} onClick={() => setRankMode('mean')}>
              Compensatory
            </button>
            <button className={rankMode === 'weak' ? 'active' : ''} onClick={() => setRankMode('weak')}>
              Weak-link
            </button>
          </div>
          <div className="disc-list">
            {filtered.map(({ candidate, score }, index) => (
              <button
                key={candidate.id}
                className={`disc-item ${selected?.candidate.id === candidate.id ? 'active' : ''}`}
                onClick={() => setSelectedId(candidate.id)}
              >
                <div className="disc-item-top">
                  <span className="disc-item-rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className="disc-item-name">{candidate.name}</span>
                  <b style={{ color: scoreColor(score.total) }}>{score.total.toFixed(1)}</b>
                </div>
                <div className="disc-item-sub">{candidate.country} / {candidate.type}</div>
                <div className="disc-item-meta">
                  <span>{score.noveltyGrade} / {score.robustness}</span>
                  <span>Wl {score.weakLink.toFixed(0)}</span>
                  <span>{Math.round(score.coverage * 100)}% Core</span>
                  {candidate.sar ? <span className="disc-sar-chip">SAR</span> : null}
                  <span>{score.window?.label ?? 'NO WINDOW'}</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 ? (
              <div className="disc-empty">No candidates pass these filters. Lower the fit or evidence threshold.</div>
            ) : null}
          </div>
        </aside>

        <main className="disc-map">
          <div className="disc-map-hud">
            <div>
              <span className="disc-live-dot" /> {filtered.length} candidates shown
            </div>
            <div>{REFERENCES[reference].short} / Natural Earth</div>
          </div>
          <svg viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="discGlow">
                <stop offset="0%" stopColor="rgba(101,230,233,0.4)" />
                <stop offset="100%" stopColor="rgba(101,230,233,0)" />
              </radialGradient>
            </defs>
            <path d={path(graticule) || ''} fill="none" stroke="rgba(101,230,233,0.055)" strokeWidth={0.7} />
            {world ? (
              <g>
                {world.features.map((f: any, i: number) => (
                  <path key={i} d={path(f) || ''} fill="rgba(101,230,233,0.045)" stroke="rgba(101,230,233,0.16)" strokeWidth={0.55} />
                ))}
              </g>
            ) : null}

            {controls.map((c) => {
              const p = projection([c.lon, c.lat]);
              if (!p) return null;
              return <circle key={c.name} cx={p[0]} cy={p[1]} r={1.7} fill="rgba(243,238,229,0.24)" />;
            })}

            {filtered.map(({ candidate, score }) => {
              const p = projection([candidate.lon, candidate.lat]);
              if (!p) return null;
              const [x, y] = p;
              const active = selected?.candidate.id === candidate.id;
              const r = 2.4 + (score.total / 100) * 4.4;
              return (
                <g
                  key={candidate.id}
                  className="disc-site"
                  onClick={() => setSelectedId(candidate.id)}
                  onMouseEnter={(e) => setHover({ candidate, score, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => setHover({ candidate, score, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHover(null)}
                >
                  {score.noveltyGrade === 'N2' ? (
                    <circle cx={x} cy={y} r={r + 7} fill="none" stroke="rgba(101,230,233,0.2)" strokeWidth={0.8} />
                  ) : null}
                  {active ? <circle cx={x} cy={y} r={r + 14} fill="none" stroke="rgba(243,238,229,0.4)" strokeWidth={0.9} /> : null}
                  <circle cx={x} cy={y} r={r + 5} fill="url(#discGlow)" opacity={active ? 0.95 : 0.35} />
                  <circle cx={x} cy={y} r={active ? r + 1.5 : r} fill={scoreColor(score.total)} opacity={active ? 1 : 0.85} />
                  {active ? (
                    <text x={x + 11} y={y - 9} fill="var(--paper)" fontFamily="IBM Plex Mono" fontSize={9} letterSpacing="0.12em">
                      {candidate.name}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <div className="disc-map-legend">
            <span><i className="disc-dot n2" /> N2 strong</span>
            <span><i className="disc-dot control" /> 39 Controls</span>
            <span><i className="disc-dot low" /> Low fit</span>
            <span><i className="disc-dot high" /> High fit</span>
          </div>
          <div className="disc-map-foot">
            <span>Source: NASA POWER, Copernicus DEM, Macrostrat, OurAirports</span>
            <span>Click a candidate to open dossier</span>
          </div>
        </main>

        <aside className="disc-right">
          {selected ? (
            <>
              <div className="disc-dossier-head">
                <div className="disc-kicker">Candidate dossier</div>
                <div className="disc-dossier-title">
                  <div>
                    <h2>{selected.candidate.name}</h2>
                    <p>{selected.candidate.country} / {selected.candidate.type}</p>
                  </div>
                  <div className="disc-badges">
                    <span className={`disc-grade grade-${selected.score.noveltyGrade.toLowerCase()}`}>
                      {gradeLabel(selected.score.noveltyGrade)}
                    </span>
                    <span className={`disc-fragility ${selected.score.robustness}`}>
                      {selected.score.robustness}
                    </span>
                  </div>
                </div>
                <div className="disc-coords"><MapPin size={11} /> {formatCoord(selected.candidate.lat, selected.candidate.lon)}</div>
              </div>

              <div className="disc-score-hero">
                <div>
                  <b style={{ color: scoreColor(selected.score.total) }}>{selected.score.total.toFixed(1)}</b>
                  <span>/ 100 Analog fit</span>
                </div>
                <div>
                  <b>{Math.round(selected.score.coverage * 100)}%</b>
                  <span>Core dimensions</span>
                </div>
                <div>
                  <b>{selected.candidate.noveltyKm.toFixed(0)} km</b>
                  <span>Nearest control</span>
                  <i>{selected.candidate.nearestControl?.name ?? '–'}</i>
                </div>
              </div>

              <div className="disc-score-modes">
                <div>
                  <span>Compensatory</span>
                  <b style={{ color: scoreColor(selected.score.total) }}>{selected.score.total.toFixed(1)}</b>
                  <i>weighted mean</i>
                </div>
                <div>
                  <span>Weak-link</span>
                  <b style={{ color: scoreColor(selected.score.weakLink) }}>{selected.score.weakLink.toFixed(1)}</b>
                  <i>weighted distance</i>
                </div>
                <div>
                  <span>Sensitivity</span>
                  <b>{selected.score.sensitivity.low.toFixed(0)}–{selected.score.sensitivity.high.toFixed(0)}</b>
                  <i>evidence tolerance</i>
                </div>
              </div>

              {strongest && weakest ? (
                <div className="disc-contrast">
                  <div>
                    <span>Strongest analogy</span>
                    <b>{strongest.label}</b>
                    <i>{strongest.value}</i>
                  </div>
                  <div>
                    <span>Weakest link</span>
                    <b>{weakest.label}</b>
                    <i>{weakest.value}</i>
                  </div>
                </div>
              ) : null}

              <div className="disc-dims">
                {selected.score.dimensions.map((dim) => (
                  <div className="disc-dim" key={dim.key} title={`${dim.source}. ${dim.note}`}>
                    <div className="disc-dim-head">
                      <span>{dim.label}</span>
                      <b>{dim.score === null ? 'NO DATA' : Math.round(dim.score * 100)}</b>
                    </div>
                    <div className="disc-dim-bar">
                      <i
                        style={{
                          width: `${dim.score === null ? 0 : Math.round(dim.score * 100)}%`,
                          background: dim.score === null ? 'transparent' : scoreColor((dim.score ?? 0) * 100),
                        }}
                      />
                    </div>
                    <div className="disc-dim-val">{dim.value}</div>
                  </div>
                ))}
              </div>
              <p className="disc-score-note">
                Compensatory = weighted mean. Weak-link = weighted distance in loss space; a single fatal
                mismatch lowers it. Sensitivity band = deterministic evidence tolerance, not a confidence
                interval.
              </p>

              <div className="disc-window">
                <div className="disc-window-head">
                  <span>Best climatological window</span>
                  <b>{selected.score.window?.label ?? 'NONE'}</b>
                </div>
                <div className="disc-months">
                  {MONTHS.map((month, i) => {
                    const value = monthly[i];
                    const active = selected.score.window?.months.includes(i);
                    return (
                      <div key={month} className={`disc-month ${active ? 'active' : ''}`}>
                        <i style={{ height: `${Math.max(4, (value ?? 0) * 100)}%`, background: value === null ? 'transparent' : scoreColor((value ?? 0) * 100) }} />
                        <span>{month.slice(0, 1)}</span>
                      </div>
                    );
                  })}
                </div>
                <p>{selected.score.window?.note ?? 'No monthly window computed.'}</p>
                {Math.abs(selected.candidate.lat) > 60 && selected.score.window ? (
                  <p className="disc-warning">
                    POLAR SITE / the selected window may be polar night. Illumination and access season are not
                    modeled; check solar geometry before using this window.
                  </p>
                ) : null}
              </div>

              <div className="disc-evidence">
                <div className="disc-evidence-head"><Database size={12} /> Evidence: Provenance</div>
                <div className="disc-evidence-grid">
                  {Object.entries(selected.candidate.evidence).map(([key, value]) => (
                    <div key={key}>
                      <span>{key}</span>
                      <b>{value.source}</b>
                      <i>{value.resolution} / {value.class}</i>
                    </div>
                  ))}
                </div>
              </div>

              <div className="disc-geology">
                <div>
                  <span>Mapped geology</span>
                  <b>{selected.candidate.geology?.lith || 'NO UNIT'}</b>
                  <i>{selected.candidate.geology?.unit || 'Macrostrat lookup unavailable'}</i>
                </div>
                <div>
                  <span>Access</span>
                  <b>{selected.candidate.airport ? `${selected.candidate.airport.km.toFixed(0)} km` : 'NO AIRPORT'}</b>
                  <i>{selected.candidate.airport?.name || 'No scheduled airport within dataset'}</i>
                </div>
              </div>

              {selected.candidate.sar ? (
                <div className="disc-sar-block">
                  <div className="disc-sar-head">
                    <span>RADARSAT-1: Historical SAR</span>
                    <b>{selected.candidate.sar.acquired}</b>
                  </div>
                  <div className="disc-sar-body">
                    <img src={selected.candidate.sar.thumbnail} alt={`RADARSAT-1 scene at ${selected.candidate.name}`} loading="lazy" />
                    <div className="disc-sar-meta">
                      <div><span>Beam</span><b>{selected.candidate.sar.beamMode}</b></div>
                      <div><span>Incidence</span><b>{selected.candidate.sar.incidenceAngle ? `${selected.candidate.sar.incidenceAngle}°` : 'N/A'}</b></div>
                      <div><span>Texture</span><b>σ {selected.candidate.sar.texture.std.toFixed(1)} / H {selected.candidate.sar.texture.entropy.toFixed(2)}</b></div>
                      <div><span>Support</span><b>{selected.candidate.sar.frameProduct ? 'L1 frame sample' : 'browse only'}</b></div>
                    </div>
                  </div>
                  <p>{selected.candidate.sar.support}</p>
                </div>
              ) : null}

              <div className="disc-missing">
                <div className="disc-missing-head">What this candidate does not have</div>
                <div className="disc-chips">
                  {selected.score.missing.map((item) => <span key={item}>{item}</span>)}
                </div>
              </div>

              <div className="disc-breaks">
                <div className="disc-missing-head">Where the analogy breaks</div>
                <p>{mismatchFor(reference)}</p>
                <a
                  className="disc-lit"
                  href={`https://scholar.google.com/scholar?q=${encodeURIComponent(
                    `"${selected.candidate.name}" Mars OR Moon analog`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  OPEN LITERATURE CHECK ↗
                </a>
              </div>

              <div className="disc-actions">
                <button className={`disc-promote ${shortlist.includes(selected.candidate.id) ? 'active' : ''}`} onClick={() => toggleShortlist(selected.candidate)}>
                  {shortlist.includes(selected.candidate.id) ? <Check size={14} /> : <Plus size={14} />}
                  {shortlist.includes(selected.candidate.id) ? 'On shortlist' : 'Add to shortlist'}
                </button>
                <button className="disc-export" onClick={exportShortlist} disabled={shortlist.length === 0}>
                  <Download size={14} /> Export
                </button>
              </div>
            </>
          ) : (
            <div className="disc-empty">No candidate selected.</div>
          )}
        </aside>
      </div>

      <footer className="disc-foot">
        <span>Discovery is not certification / global layers rank and exclude / local measurements certify</span>
        <span>Data version {data.generatedAt} / {data.count} Candidates / 0 of 39 controls</span>
      </footer>

      {hover ? (
        <div className="disc-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <b>{hover.candidate.name}</b>
          <span>{hover.candidate.country} / {hover.candidate.type}</span>
          <div><span>Fit</span><b style={{ color: scoreColor(hover.score.total) }}>{hover.score.total.toFixed(1)}</b></div>
          <div><span>Core</span><b>{Math.round(hover.score.coverage * 100)}%</b></div>
          <div><span>Grade</span><b>{hover.score.noveltyGrade}</b></div>
        </div>
      ) : null}

      {toast ? <div className="disc-toast">{toast}</div> : null}

      {showShortlist ? (
        <div className="disc-drawer">
          <div className="disc-drawer-head">
            <div>
              <span>Field-review shortlist</span>
              <b>{shortlisted.length} candidate{shortlisted.length === 1 ? '' : 's'} ready for dossier review</b>
            </div>
            <button onClick={() => setShowShortlist(false)}><X size={16} /></button>
          </div>
          <div className="disc-drawer-list">
            {shortlisted.map((candidate) => {
              const score = scoreCandidate(candidate, reference);
              return (
                <div key={candidate.id} className="disc-drawer-item">
                  <div>
                    <b>{candidate.name}</b>
                    <span>{candidate.country} / {candidate.type}</span>
                  </div>
                  <div>
                    <b>{score.total.toFixed(1)}</b>
                    <span>{Math.round(score.coverage * 100)}% Core</span>
                  </div>
                  <button onClick={() => toggleShortlist(candidate)}><Minus size={13} /></button>
                </div>
              );
            })}
            {shortlisted.length === 0 ? <div className="disc-empty">Promote candidates from the dossier to build a field-review shortlist.</div> : null}
          </div>
          <div className="disc-drawer-actions">
            <button onClick={exportShortlist} disabled={shortlist.length === 0}><Download size={14} /> Export JSON</button>
            <button onClick={() => setShortlist([])} disabled={shortlist.length === 0}>Clear</button>
          </div>
        </div>
      ) : null}

      {showMethod ? (
        <div className="disc-drawer disc-method">
          <div className="disc-drawer-head">
            <div>
              <span>Method: Three tiers</span>
              <b>Rank globally. Refine regionally. Certify locally.</b>
            </div>
            <button onClick={() => setShowMethod(false)}><X size={16} /></button>
          </div>
          <div className="disc-method-body">
            <section>
              <span>Screen</span>
              <b>Global layers rank and exclude.</b>
              <p>
                {data.candidates.length} candidates outside the 39 controlled sites, deliberately spanning
                under-studied regions and process endmembers. None is within 80 km of a control. NASA POWER
                climatology, Copernicus DEM GLO-90 terrain, Macrostrat geology and OurAirports access. A high
                score is a candidate, not a discovery; literature and catalog review is the next gate.
              </p>
              <p className="disc-method-note">
                Scoring / per-dimension 0–1, weighted by the reference profile, missing dimensions masked.
                Two composites: compensatory weighted mean, and weak-link weighted distance (diagonal
                Mahalanobis-style loss). The sensitivity band uses expert-assigned per-dimension tolerances
                (0.05–0.15 score units) for reanalysis resolution, 90 m DSM, mapped geology and access
                distance. It is a deterministic evidence tolerance, not a confidence interval. Neither score
                is a probability. Fragility: weakest dimension below 30 = fragile, 30–50 = mixed, 50+ =
                robust. N2 is the screening tier, not a claim that every dimension is strong.
              </p>
            </section>
            <section>
              <span>Refine</span>
              <b>Regional sensors confirm context.</b>
              <p>
                EMIT and ASTER archive for mineral species; Sentinel-2 and Landsat for land cover and thermal
                baselines; Sentinel-1 for all-weather structure; GEDI and ICESat-2 for sparse structure and ice.
                RADARSAT-1 historical SAR is attached to six Canadian/polar candidates as segment/frame texture,
                explicitly not a local AOI measurement. Missing evidence stays missing.
              </p>
            </section>
            <section>
              <span>Certify</span>
              <b>Local measurements certify.</b>
              <p>
                LiDAR or RTK terrain, a met mast, soil pits, geotechnical tests, field mapping, permits and
                community consent. A promoted candidate enters a field-review shortlist, not a mission plan.
              </p>
            </section>
            <section>
              <span>Continuous</span>
              <b>New data produces new candidates.</b>
              <p>
                STAC-first catalog, incremental tile cache, candidate versioning, review queue and publication
                gate. The pipeline in <code>scripts/discover_candidates.py</code> is reproducible; the 39
                controls are re-scored as controls, never used as the search universe.
              </p>
            </section>
            <section className="disc-method-breaks">
              <span>What Earth cannot reproduce</span>
              <p>
                Lunar vacuum, 1.62 m/s² gravity, the radiation environment, regolith thickness and true
                permanent-shadow illumination. Martian 6 mbar CO2 atmosphere, 3.71 m/s² gravity, global dust
                storms and surface oxidants. Every dossier states these residual gaps.
              </p>
            </section>
          </div>
          <div className="disc-drawer-actions">
            <button onClick={() => setShowMethod(false)}>Back to dossier</button>
          </div>
        </div>
      ) : null}

      {showGenerated ? (
        <GeneratedDiscovery
          onBack={() => setShowGenerated(false)}
          onOpenSite={onOpenGeneratedSite}
        />
      ) : null}
    </div>
  );
}
