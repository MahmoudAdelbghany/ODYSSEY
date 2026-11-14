import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AgentStateView, ComparisonView } from '../agent/api';
import { DIMENSION_LABELS, PROFILE_WEIGHTS, type Dimensions, type ProfileKey, type Site } from '../types';
import { Badge, Segmented, SectionHeader } from './ui';
import { clean, DECISION, dimensionLabel, fmtValue } from './labels';

export type TwinLayer = 'terrain' | 'thermal' | 'atmosphere' | 'geology' | 'light';
const DIM_LAYER: Record<keyof Dimensions, TwinLayer | null> = { thermal: 'thermal', aridity: 'atmosphere', terrain: 'terrain', geology: 'geology', dust: 'atmosphere', access: null };
const PROFILE_NAME: Record<ProfileKey, string> = { lunar_base: 'Lunar base', mars_landing: 'Mars landing', expedition: 'Expedition' };

/** Why the screening similarity is what it is: exact weighted sum of the six stored dimension scores. */
export function SimilarityBreakdown({ site, profile, layer, onLayer }: { site: Site; profile: ProfileKey; layer: TwinLayer; onLayer: (l: TwinLayer) => void }) {
  const score = site.scores[profile];
  const w = PROFILE_WEIGHTS[profile];
  const keys = Object.keys(w) as Array<keyof Dimensions>;
  const parts = keys.map((k) => ({ k, value: score.dimensions[k], weight: w[k], pts: (score.dimensions[k] * w[k]) / 100 }));
  const best = [...parts].sort((a, b) => b.value - a.value)[0];
  const worst = [...parts].sort((a, b) => a.value - b.value)[0];
  const sum = parts.reduce((n, p) => n + p.pts, 0);
  return (
    <section className="card simb reveal" aria-label="Similarity breakdown">
      <div className="spread">
        <h3 className="card-title">Why {Math.round(score.total)}?</h3>
        <span className="subtle">Screening similarity · {PROFILE_NAME[profile]} profile</span>
      </div>
      <p className="subtle">Each bar is the dimension's match score (0–100). Its weight in this profile turns it into points; the points add up to the total.</p>
      <ul className="simb-rows">
        {parts.map((p) => {
          const target = DIM_LAYER[p.k];
          const active = target != null && target === layer;
          const tone = p.value < 55 ? 'warn' : 'sci';
          return (
            <li key={p.k}>
              <button type="button" className={`simb-row${active ? ' is-active' : ''}`} disabled={!target} onClick={() => target && onLayer(target)} title={target ? 'Show these measurements in the planetary twin' : 'Access has no planetary counterpart'}>
                <span className="simb-label">{DIMENSION_LABELS[p.k]}</span>
                <span className="simb-track"><span className={`simb-fill tone-${tone}`} style={{ width: `${p.value}%` }} /></span>
                <span className="num simb-val">{Math.round(p.value)}</span>
                <span className="num subtle simb-pts">× {p.weight}% = {p.pts.toFixed(1)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="simb-foot">
        <span className="num">Sum {sum.toFixed(1)} → stored total {score.total}</span>
        <span className="subtle">Strongest: {DIMENSION_LABELS[best.k]} ({Math.round(best.value)}). Weakest: {DIMENSION_LABELS[worst.k]} ({Math.round(worst.value)}).</span>
        {score.missing.length ? <span className="subtle">Below 55: {score.missing.join(', ')}.</span> : null}
        <span className="subtle">Method: range matching of NASA POWER climate, relief and mapped geology against the profile's envelope, weighted per profile. This is a screening score; the mission checks below can lower it.</span>
      </div>
    </section>
  );
}

/** Physical mismatches the site cannot fix, with the run's own recommended interventions. */
export function RealityCheck({ rows, state, onOpenLab }: { rows: ComparisonView[] | null; state: AgentStateView | null; onOpenLab?: () => void }) {
  const items = (rows ?? []).filter((r) => r.classification === 'not_naturally_reproducible');
  if (!items.length) return null;
  const show = (m: ComparisonView['earth']) => {
    const v = fmtValue(m.value, m.range, m.unit);
    if (v) return v;
    const note = clean(m.note);
    if (m.status === 'MISSING') return 'Not measured';
    return note && note.length <= 40 ? note : 'Qualitative only';
  };
  return (
    <section className="card rc reveal" aria-label="Scientific reality check">
      <div className="spread">
        <h3 className="card-title">Scientific reality check</h3>
        <span className="subtle">{items.length} condition(s) no Earth site reproduces</span>
      </div>
      <div className="rc-list">
        {items.map((r) => {
          const fixes = (state?.interventions ?? []).filter((i) => i.targetGap === r.dimension);
          const names = [...new Set(fixes.map((f) => f.name))];
          return (
            <article key={r.dimension} className="rc-item">
              <div className="rc-vals">
                <div><span className="subtle">Target</span><b className={r.planet.value == null ? 'is-text' : 'num'}>{show(r.planet)}</b></div>
                <span className="rc-vs" aria-hidden="true">≠</span>
                <div><span className="subtle">This site</span><b className={r.earth.value == null ? 'is-text' : 'num'}>{show(r.earth)}</b></div>
              </div>
              <ScaleDiagram r={r} />
              <div className="rc-body">
                <b className="rc-title">Physical mismatch: {dimensionLabel(r.dimension, r.label).toLowerCase()}</b>
                <p className="muted">{clean(r.reason)}</p>
                {names.length ? (
                  <p className="rc-fix"><span className="subtle">Proposed in this run: </span>{names.join('; ')}{onOpenLab ? <> · <button type="button" className="link" onClick={onOpenLab}>Open the simulation lab</button></> : null}</p>
                ) : <p className="subtle">No controlled test was proposed for this condition in this run.</p>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Before/after ranking: screening order versus the backend's validated order for one experiment. */
export function RankingEvolution({ state, sites, onOpenSite }: { state: AgentStateView; sites: Site[]; onOpenSite: (id: string) => void }) {
  const experiments = state.mission?.experiments ?? [];
  const profile = (state.parsed?.profile ?? 'expedition') as ProfileKey;
  const [expId, setExpId] = useState(experiments[0]?.id ?? '');
  const [view, setView] = useState<'before' | 'after'>('after');
  const [sel, setSel] = useState<string | null>(null);
  const list = state.candidates[expId] ?? [];
  const screening = (id: string) => sites.find((s) => s.id === id)?.scores[profile]?.total ?? null;
  const before = useMemo(() => [...list].sort((a, b) => (screening(b.siteId) ?? -1) - (screening(a.siteId) ?? -1)), [list]); // eslint-disable-line react-hooks/exhaustive-deps
  const beforeRank = new Map(before.map((c, i) => [c.siteId, i + 1]));
  const afterRank = new Map(list.map((c, i) => [c.siteId, i + 1]));
  const shown = (view === 'after' ? list : before).slice(0, 10);
  const refs = useRef(new Map<string, HTMLLIElement>());
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    refs.current.forEach((el, id) => {
      const top = el.offsetTop;
      const old = prev.current.get(id);
      if (old != null && old !== top && !reduce) el.animate([{ transform: `translateY(${old - top}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(0.22,1,0.36,1)' });
      prev.current.set(id, top);
    });
  }, [view, expId]);
  const rerank = state.reranks.find((r) => r.experimentId === expId && r.status === 'ranked');
  const selC = list.find((c) => c.siteId === sel);
  return (
    <section className="card rk reveal" aria-label="Ranking evolution">
      <div className="spread">
        <h3 className="card-title">Ranking evolution</h3>
        <Segmented label="Ranking" value={view} options={[{ value: 'before', label: 'Before validation' }, { value: 'after', label: 'After validation' }]} onChange={setView} />
      </div>
      {experiments.length > 1 ? <Segmented label="Experiment" value={expId} options={experiments.map((e) => ({ value: e.id, label: e.shortName || e.name }))} onChange={(v) => { setExpId(v); setSel(null); }} /> : null}
      <p className="subtle">Before: order by screening similarity. After: the order the analysis returned, by its ranking score (terrain, thermal, geology, operations, suitability, evidence and intervention components) once hard limits were checked. Arrows show the change between the two.</p>
      <ol className="rk-list">
        {shown.map((c) => {
          const b = beforeRank.get(c.siteId)!;
          const a = afterRank.get(c.siteId)!;
          const move = b - a;
          const rank = view === 'after' ? a : b;
          return (
            <li key={c.siteId} ref={(el) => { if (el) refs.current.set(c.siteId, el); else refs.current.delete(c.siteId); }}>
              <button type="button" className={`rk-row${sel === c.siteId ? ' is-active' : ''}`} onClick={() => setSel(sel === c.siteId ? null : c.siteId)}>
                <span className="rk-rank num">#{rank}</span>
                <span className="rk-name"><b>{c.name.split(',')[0]}</b><span className="subtle">{view === 'after' ? `Ranking score ${c.aggregate ?? '—'} · suitability ${c.experimentScore ?? '—'} · ${DECISION[c.decision].label}` : `Screening ${Math.round(screening(c.siteId) ?? 0)}`}</span></span>
                <span className={`rk-move num ${move > 0 ? 'is-up' : move < 0 ? 'is-down' : ''}`} aria-label={move ? `${Math.abs(move)} places ${move > 0 ? 'up' : 'down'} after validation` : 'No change'}>
                  {move > 0 ? `▲ ${move}` : move < 0 ? `▼ ${-move}` : '–'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {selC ? (
        <div className="rk-detail reveal">
          <div className="spread"><b>{selC.name.split(',')[0]}: #{beforeRank.get(selC.siteId)} → #{afterRank.get(selC.siteId)}</b><Badge tone={DECISION[selC.decision].tone}>{DECISION[selC.decision].label}</Badge></div>
          <ul className="list">{selC.reasons.slice(0, 3).map((x, i) => <li key={i}>{clean(x)}</li>)}</ul>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenSite(selC.siteId)}>Open the planetary twin</button>
        </div>
      ) : null}
      {rerank ? <p className="subtle">A language-model re-ranking was also checked for this experiment: Kendall τ = {rerank.kendallTauVsBaseline ?? '—'} against the rule-based order{rerank.kendallTauVsBaseline === 1 ? ' (identical order)' : ''}.</p> : null}
    </section>
  );
}

/* ---------- Feature relationships (Earth, across curated sites) ---------- */

const FEATURES: Array<{ key: string; label: string; unit: string; group: 'thermal' | 'atmosphere' | 'terrain'; get: (s: Site) => number | undefined }> = [
  { key: 'tempMean', label: 'Mean air temp.', unit: '°C', group: 'thermal', get: (s) => s.climate.tempMean },
  { key: 'tempAmp', label: 'Daily temp. range', unit: '°C', group: 'thermal', get: (s) => s.climate.tempAmp },
  { key: 'solar', label: 'Solar irradiance', unit: 'kWh/m²/day', group: 'thermal', get: (s) => s.climate.solar },
  { key: 'precipYear', label: 'Annual precipitation', unit: 'mm', group: 'atmosphere', get: (s) => s.climate.precipYear },
  { key: 'humidity', label: 'Relative humidity', unit: '%', group: 'atmosphere', get: (s) => s.climate.humidity },
  { key: 'wind', label: 'Wind speed', unit: 'm/s', group: 'atmosphere', get: (s) => s.climate.wind },
  { key: 'aerosol', label: 'Aerosol optical depth', unit: '', group: 'atmosphere', get: (s) => s.climate.aerosol },
  { key: 'elevation', label: 'Elevation', unit: 'm', group: 'terrain', get: (s) => s.climate.elevation },
  { key: 'relief', label: 'Local relief', unit: 'm', group: 'terrain', get: (s) => s.climate.relief },
];

function ranks(v: number[]) {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(v.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
function pearson(a: number[], b: number[]) {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
/** Two-sided p for Spearman rho via the t approximation (normal tail; fine for n >= 20). */
function pValue(r: number, n: number) {
  if (n < 4 || Math.abs(r) >= 1) return 0;
  const t = Math.abs(r) * Math.sqrt((n - 2) / (1 - r * r));
  const z = t * (1 - 1 / (4 * (n - 2))) / Math.sqrt(1 + (t * t) / (2 * (n - 2)));
  const p = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const k = 1 / (1 + 0.2316419 * z);
  const tail = p * k * (0.31938153 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))));
  return 2 * tail;
}

type Pair = { a: number; b: number; rho: number; n: number; p: number };
const GROUP_COLOR = { thermal: 'var(--warn)', atmosphere: 'var(--sci)', terrain: 'var(--ok)' } as const;

export function RelationsSection({ sites }: { sites: Site[] }) {
  const [threshold, setThreshold] = useState(0.5);
  const [node, setNode] = useState<number | null>(null);
  const [pair, setPair] = useState<[number, number] | null>(null);
  const [body, setBody] = useState<'earth' | 'moon' | 'mars'>('earth');
  const matrix = useMemo(() => {
    const out: Pair[] = [];
    for (let a = 0; a < FEATURES.length; a++)
      for (let b = a + 1; b < FEATURES.length; b++) {
        const xs: number[] = [], ys: number[] = [];
        for (const s of sites) {
          const x = FEATURES[a].get(s), y = FEATURES[b].get(s);
          if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); }
        }
        const rho = xs.length > 3 ? pearson(ranks(xs), ranks(ys)) : 0;
        out.push({ a, b, rho, n: xs.length, p: pValue(rho, xs.length) });
      }
    return out;
  }, [sites]);
  const get = (a: number, b: number) => matrix.find((m) => (m.a === Math.min(a, b) && m.b === Math.max(a, b)))!;
  const edges = matrix.filter((m) => Math.abs(m.rho) >= threshold);
  const R = 140, C = 180;
  const pos = FEATURES.map((_, i) => { const t = (i / FEATURES.length) * Math.PI * 2 - Math.PI / 2; return [C + R * Math.cos(t), C + R * Math.sin(t)] as const; });
  const isOnPair = (m: Pair) => pair && m.a === Math.min(...pair) && m.b === Math.max(...pair);
  const touches = (m: Pair) => node == null || m.a === node || m.b === node;
  const selPair = pair ? get(pair[0], pair[1]) : null;
  const pick = (a: number, b: number) => { setPair([a, b]); setNode(null); };
  return (
    <>
      <SectionHeader title="Feature relationships" lead="How measured Earth conditions move together across the curated analog sites. Pick a feature or a pair to inspect the data behind it." />
      <div className="row rel-controls">
        <Segmented label="Planetary body" value={body} options={[{ value: 'earth', label: 'Earth' }, { value: 'moon', label: 'Moon' }, { value: 'mars', label: 'Mars' }]} onChange={setBody} />
        <label className="rel-slider subtle">Show |ρ| ≥ <b className="num">{threshold.toFixed(1)}</b>
          <input type="range" min={0.3} max={0.9} step={0.1} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </label>
      </div>
      {body !== 'earth' ? (
        <div className="card reveal">
          <h3 className="card-title">Not available for the {body === 'moon' ? 'Moon' : 'Mars'}</h3>
          <p className="muted">ODYSSEY stores one reference value per condition for each target region, not a set of locations, so no correlation can be computed there. This needs per-location target rasters (for example LOLA slope and Diviner temperature samples), which are not connected yet.</p>
        </div>
      ) : (
        <div className="rel-grid">
          <div className="card rel-graph">
            <svg viewBox="-70 0 500 360" role="img" aria-label={`Network of ${edges.length} feature relationships with |rho| at least ${threshold}`}>
              {edges.map((m) => {
                const on = touches(m);
                const hot = isOnPair(m);
                return (
                  <line key={`${m.a}-${m.b}`} x1={pos[m.a][0]} y1={pos[m.a][1]} x2={pos[m.b][0]} y2={pos[m.b][1]}
                    stroke={m.rho > 0 ? 'var(--sci)' : 'var(--field)'} strokeWidth={hot ? 7 : 1 + Math.abs(m.rho) * 5}
                    strokeOpacity={on ? 0.35 + Math.abs(m.rho) * 0.6 : 0.08} className="rel-edge"
                    onClick={() => pick(m.a, m.b)}>
                    <title>{`${FEATURES[m.a].label} – ${FEATURES[m.b].label}: ρ = ${m.rho.toFixed(2)}, n = ${m.n}`}</title>
                  </line>
                );
              })}
              {FEATURES.map((f, i) => {
                const dim = node != null && node !== i && !edges.some((m) => (m.a === node && m.b === i) || (m.b === node && m.a === i));
                const sel = node === i || (pair && pair.includes(i));
                return (
                  <g key={f.key} className={`rel-node${dim ? ' is-dim' : ''}${sel ? ' is-sel' : ''}`} transform={`translate(${pos[i][0]} ${pos[i][1]})`} onClick={() => { setNode(node === i ? null : i); setPair(null); }} tabIndex={0} role="button" aria-label={f.label} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNode(node === i ? null : i); setPair(null); } }}>
                    <circle r={sel ? 13 : 10} fill="var(--surface-2)" stroke={GROUP_COLOR[f.group]} strokeWidth={2.5} />
                    {(() => { const dx = pos[i][0] - C, dy = pos[i][1] - C, d = Math.hypot(dx, dy) || 1; const lx = (dx / d) * 24, ly = (dy / d) * 24 + 4; return <text x={lx} y={ly} textAnchor={Math.abs(dx) < 20 ? 'middle' : dx > 0 ? 'start' : 'end'}>{f.label}</text>; })()}
                  </g>
                );
              })}
            </svg>
            <div className="tradeoff-legend subtle">
              <span><i className="dot" style={{ background: 'var(--sci)' }} /> Rise together</span>
              <span><i className="dot" style={{ background: 'var(--field)' }} /> One rises, other falls</span>
              <span>Node ring: <span style={{ color: 'var(--warn)' }}>thermal</span> · <span style={{ color: 'var(--sci)' }}>atmosphere</span> · <span style={{ color: 'var(--ok)' }}>terrain</span></span>
            </div>
          </div>
          <div className="card rel-heat">
            <table className="rel-table" aria-label="Spearman correlation matrix">
              <thead><tr><th />{FEATURES.map((f) => <th key={f.key} scope="col" title={f.label}><span>{f.label}</span></th>)}</tr></thead>
              <tbody>
                {FEATURES.map((f, i) => (
                  <tr key={f.key}>
                    <th scope="row">{f.label}</th>
                    {FEATURES.map((g, j) => {
                      if (i === j) return <td key={g.key} className="rel-diag" />;
                      const m = get(i, j);
                      const hot = isOnPair(m) || (node != null && (i === node || j === node));
                      const col = m.rho > 0 ? '102,199,244' : '183,156,255';
                      return (
                        <td key={g.key}>
                          <button type="button" className={`rel-cell${hot ? ' is-hot' : ''}`} style={{ background: `rgba(${col},${Math.abs(m.rho) * 0.85})` }} onClick={() => pick(i, j)} aria-label={`${f.label} and ${g.label}: rho ${m.rho.toFixed(2)}`}>
                            <span className="num">{Math.abs(m.rho) < 0.05 ? '0' : m.rho.toFixed(1).replace('0.', '.').replace('-.', '−.')}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {body === 'earth' && selPair ? <PairDetail sites={sites} m={selPair} /> : body === 'earth' && node != null ? (
        <div className="card reveal ws-gap-top">
          <h3 className="card-title">{FEATURES[node].label}</h3>
          <ul className="list">
            {matrix.filter((m) => m.a === node || m.b === node).sort((x, y) => Math.abs(y.rho) - Math.abs(x.rho)).slice(0, 4).map((m) => {
              const other = m.a === node ? m.b : m.a;
              return <li key={other}><button type="button" className="link" onClick={() => pick(node, other)}>{FEATURES[other].label}</button>: ρ = <span className="num">{m.rho.toFixed(2)}</span> (n = {m.n})</li>;
            })}
          </ul>
        </div>
      ) : body === 'earth' ? <p className="subtle ws-gap-top">Select a feature or a heatmap cell.</p> : null}
      <p className="subtle ws-gap-top">Method: Spearman rank correlation over the curated sites with both values (NASA POWER climatology, relief from the site DEM), computed in the browser from the loaded site data. The sites were chosen as analogs, not sampled at random, so these are associations within this set, not Earth-wide relationships or causes.</p>
    </>
  );
}

function PairDetail({ sites, m }: { sites: Site[]; m: Pair }) {
  const fa = FEATURES[m.a], fb = FEATURES[m.b];
  const pts = sites.map((s) => ({ s, x: fa.get(s), y: fb.get(s) })).filter((p): p is { s: Site; x: number; y: number } => p.x != null && p.y != null);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const W = 520, H = 220, P = 34;
  const sx = (v: number) => P + ((v - x0) / (x1 - x0 || 1)) * (W - P * 2);
  const sy = (v: number) => H - P + -((v - y0) / (y1 - y0 || 1)) * (H - P * 2);
  const strength = Math.abs(m.rho) >= 0.7 ? 'strong' : Math.abs(m.rho) >= 0.4 ? 'moderate' : 'weak';
  return (
    <div className="card reveal ws-gap-top" aria-live="polite">
      <div className="spread">
        <h3 className="card-title">{fa.label} × {fb.label}</h3>
        <span className="num subtle">ρ = {m.rho.toFixed(2)} · n = {m.n} · p ≈ {m.p < 0.001 ? '<0.001' : m.p.toFixed(3)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="rel-scatter" role="img" aria-label={`Scatter of ${fa.label} against ${fb.label} for ${m.n} sites`}>
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="var(--border-strong)" />
        <line x1={P} y1={P} x2={P} y2={H - P} stroke="var(--border-strong)" />
        <text x={W / 2} y={H - 6} textAnchor="middle">{fa.label}{fa.unit ? ` (${fa.unit})` : ''}</text>
        <text x={10} y={H / 2} textAnchor="middle" transform={`rotate(-90 10 ${H / 2})`}>{fb.label}{fb.unit ? ` (${fb.unit})` : ''}</text>
        {pts.map((p) => <circle key={p.s.id} cx={sx(p.x)} cy={sy(p.y)} r={4.5} className="rel-pt"><title>{`${p.s.name}: ${p.x} ${fa.unit}, ${p.y} ${fb.unit}`}</title></circle>)}
      </svg>
      <p className="muted">A {strength} {m.rho >= 0 ? 'positive' : 'negative'} association across these sites. Hover a point for the site and its two values.</p>
    </div>
  );
}

/** Measured values on a shared axis: linear when close, logarithmic when orders of magnitude apart. */
function ScaleDiagram({ r }: { r: ComparisonView }) {
  const e = r.earth.value, t = r.planet.value;
  if (e == null || t == null || e <= 0 || t <= 0 || r.earth.unit !== r.planet.unit) return null;
  const unit = r.earth.unit;
  const ratio = Math.max(e, t) / Math.min(e, t);
  const W = 400, L = 64, Rm = 16, span = W - L - Rm;
  const log = ratio > 50;
  const lo = log ? Math.floor(Math.log10(Math.min(e, t))) : 0;
  const hi = log ? Math.ceil(Math.log10(Math.max(e, t))) : Math.max(e, t);
  const x = (v: number) => L + (log ? (Math.log10(v) - lo) / (hi - lo || 1) : v / hi) * span;
  const ticks = log ? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((_, i, a) => a.length <= 7 || i % Math.ceil((a.length - 1) / 6) === 0) : [];
  const fmt = (v: number) => fmtValue(v, null, unit) ?? String(v);
  return (
    <div className="rc-diagram">
      <svg viewBox={`0 0 ${W} ${log ? 86 : 70}`} role="img" aria-label={`${dimensionLabel(r.dimension, r.label)}: target ${fmt(t)}, this site ${fmt(e)}${log ? `, about ${Math.round(Math.log10(ratio))} orders of magnitude apart` : ''}`}>
        <text x={0} y={20} className="rc-d-lab">Target</text>
        {log ? <><line x1={L} x2={W - Rm} y1={16} y2={16} className="rc-d-rail" /><circle cx={x(t)} cy={16} r={6} className="rc-d-target-pt" /></> : <rect x={L} y={9} width={Math.max(2, x(t) - L)} height={14} rx={3} className="rc-d-target" />}
        <text x={x(t) > W - 110 ? x(t) - 12 : x(t) + 12} y={20} className="rc-d-val" textAnchor={x(t) > W - 110 ? 'end' : 'start'}>{fmt(t)}</text>
        <text x={0} y={46} className="rc-d-lab">This site</text>
        {log ? <><line x1={L} x2={W - Rm} y1={42} y2={42} className="rc-d-rail" /><circle cx={x(e)} cy={42} r={6} className="rc-d-earth-pt" /></> : <rect x={L} y={35} width={Math.max(2, x(e) - L)} height={14} rx={3} className="rc-d-earth" />}
        <text x={x(e) > W - 110 ? x(e) - 12 : x(e) + 12} y={46} className="rc-d-val" textAnchor={x(e) > W - 110 ? 'end' : 'start'}>{fmt(e)}</text>
        {log ? ticks.map((d) => (
          <g key={d}>
            <line x1={x(10 ** d)} x2={x(10 ** d)} y1={56} y2={61} stroke="var(--border-strong)" />
            <text x={x(10 ** d)} y={76} textAnchor="middle" className="rc-d-tick">10{d < 0 ? '⁻' : ''}{String(Math.abs(d)).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]).join('')}</text>
          </g>
        )) : null}
        {log ? <line x1={L} x2={W - Rm} y1={58} y2={58} stroke="var(--border-strong)" /> : null}
      </svg>
      <p className="subtle">
        {log ? `Logarithmic scale (${unit}): the two values are about ${Math.round(Math.log10(ratio))} orders of magnitude apart.` : `Linear scale (${unit}). Ratio ${ratio.toFixed(2)}.`}
        {r.dimension === 'gravity.surface' ? ` A 100 kg rover weighs ${Math.round(100 * e)} N here and ${Math.round(100 * t)} N on the target (W = m·g), which changes wheel load and traction.` : ''}
      </p>
    </div>
  );
}
