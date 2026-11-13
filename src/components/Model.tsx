import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, BarChart3, Target, TrendingUp } from 'lucide-react';
import { PROFILE_ORDER, type OdysseyData, type ProfileKey } from '../types';
import { Reveal } from './Reveal';
import { SectionHead } from './SectionHead';

type Props = {
  data: OdysseyData;
  profile: ProfileKey;
  setProfile: (p: ProfileKey) => void;
};

const W = 460;
const H = 330;
const MIN = 52;
const MAX = 100;

export function Model({ data, profile, setProfile }: Props) {
  const ml = data.ml.profiles[profile];
  const points = ml.predictions;

  const rankedImportance = useMemo(() => {
    const rows = ml.features.map((f, i) => ({ f, v: ml.importances[i] ?? 0 }));
    return rows.sort((a, b) => b.v - a.v).slice(0, 8);
  }, [ml]);

  const maxImp = Math.max(...rankedImportance.map((r) => r.v), 0.001);

  const sx = (v: number) => 34 + ((v - MIN) / (MAX - MIN)) * (W - 54);
  const sy = (v: number) => H - 34 - ((v - MIN) / (MAX - MIN)) * (H - 54);
  const top3 = new Set(points.slice(0, 3).map((p) => p.id));

  return (
    <section className="section" id="model" style={{ paddingTop: 40 }}>
      <div className="container">
        <SectionHead
          index="09"
          label="MODEL"
          title={<>THE MODEL LEARNED<br />THE RUBRIC.</>}
          lead={`A profile-specific surrogate ranks ${data.sites.length} sites. It is not a black box: the cross-validation, the feature importance, the residuals and the uncertainty are all visible.`}
          right={
            <div className="profile-tabs">
              {PROFILE_ORDER.map((p) => (
                <button key={p} className={`profile-tab ${profile === p ? 'active' : ''}`} onClick={() => setProfile(p)}>
                  {data.profiles[p].short}
                </button>
              ))}
            </div>
          }
        />

        <div className="model-grid">
          <Reveal>
            <div className="model-card">
              <div className="model-card-head">
                <div>
                  <div className="mono" style={{ color: 'var(--paper-faint)' }}>SURROGATE / {data.profiles[profile].short}</div>
                  <div className="model-algo">{ml.algorithm}</div>
                </div>
                <div className="model-badge"><Activity size={12} /> TRAINED</div>
              </div>

              <div className="model-metrics">
                <div className="model-metric">
                  <div className="v" style={{ color: 'var(--green)' }}>{ml.r2.toFixed(3)}</div>
                  <div className="k">R² / 5-fold</div>
                </div>
                <div className="model-metric">
                  <div className="v">{ml.mae.toFixed(2)}</div>
                  <div className="k">MAE / points</div>
                </div>
                <div className="model-metric">
                  <div className="v" style={{ color: 'var(--cyan)' }}>{ml.spearman.toFixed(3)}</div>
                  <div className="k">Spearman ρ</div>
                </div>
                <div className="model-metric">
                  <div className="v" style={{ color: 'var(--amber)' }}>{ml.pairwise.toFixed(3)}</div>
                  <div className="k">Pairwise acc.</div>
                </div>
              </div>

              <div className="model-scatter">
                <div className="mono" style={{ color: 'var(--paper-faint)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>PREDICTED vs ACTUAL</span>
                  <span>N={ml.sites}</span>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`}>
                  <defs>
                    <linearGradient id="scatterLine" x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0%" stopColor="rgba(101,230,233,0.1)" />
                      <stop offset="100%" stopColor="rgba(101,230,233,0.55)" />
                    </linearGradient>
                  </defs>
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                    <g key={t}>
                      <line x1={sx(MIN)} y1={sy(MIN + t * (MAX - MIN))} x2={sx(MAX)} y2={sy(MIN + t * (MAX - MIN))} stroke="rgba(243,238,229,0.06)" strokeWidth={1} />
                      <line x1={sx(MIN + t * (MAX - MIN))} y1={sy(MIN)} x2={sx(MIN + t * (MAX - MIN))} y2={sy(MAX)} stroke="rgba(243,238,229,0.06)" strokeWidth={1} />
                    </g>
                  ))}
                  <line x1={sx(MIN)} y1={sy(MIN)} x2={sx(MAX)} y2={sy(MAX)} stroke="url(#scatterLine)" strokeWidth={1} strokeDasharray="4 5" />
                  {points.map((p, idx) => (
                    <g key={p.id}>
                      <circle
                        cx={sx(p.actual)}
                        cy={sy(p.predicted)}
                        r={top3.has(p.id) ? 4.5 : 2.8}
                        fill={top3.has(p.id) ? 'var(--amber)' : 'var(--cyan)'}
                        opacity={0.9}
                      >
                        <title>{`${p.name} / actual ${p.actual} / predicted ${p.predicted} ±${p.uncertainty}`}</title>
                      </circle>
                      {top3.has(p.id) && idx === 0 ? (
                        <text x={sx(p.actual) + 7} y={sy(p.predicted) - 6} fill="rgba(243,238,229,0.72)" fontFamily="IBM Plex Mono" fontSize={7}>
                          {p.name}
                        </text>
                      ) : null}
                    </g>
                  ))}
                  <text x={W / 2} y={H - 6} textAnchor="middle" fill="rgba(243,238,229,0.35)" fontFamily="IBM Plex Mono" fontSize={7} letterSpacing="0.14em">ACTUAL</text>
                  <text x={10} y={H / 2} textAnchor="middle" fill="rgba(243,238,229,0.35)" fontFamily="IBM Plex Mono" fontSize={7} letterSpacing="0.14em" transform={`rotate(-90 10 ${H / 2})`}>PREDICTED</text>
                </svg>
              </div>

              <div className="model-card-foot">
                <div><Target size={12} /> {ml.cv}</div>
                <div><BarChart3 size={12} /> {ml.trainSize} training rows</div>
                <div><TrendingUp size={12} /> {ml.sites} sites</div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="model-side">
              <div className="mono" style={{ color: 'var(--paper-faint)' }}>FEATURE IMPORTANCE / PERMUTATION</div>
              <div className="importance-list">
                {rankedImportance.map((r, i) => (
                  <div className="importance-row" key={r.f}>
                    <div className="importance-rank">0{i + 1}</div>
                    <div className="importance-name">{r.f}</div>
                    <div className="importance-bar"><motion.i initial={{ width: 0 }} whileInView={{ width: `${(r.v / maxImp) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: i * 0.05 }} /></div>
                    <div className="importance-val">{(r.v * 100).toFixed(1)}%</div>
                  </div>
                ))}
              </div>

              <div className="model-selection">
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>MODEL SELECTION / 5-FOLD R²</div>
                {(ml.candidates ?? []).map((c) => (
                  <div className="candidate-row" key={c.name}>
                    <span>{c.name}</span>
                    <b>{c.r2.toFixed(3)}</b>
                    <em>{ml.algorithm.startsWith(c.name) || (c.name === 'RBF-SVR' && ml.algorithm === 'RBF-SVR') || (c.name === 'ExtraTrees' && ml.algorithm === 'ExtraTreesRegressor') ? 'SELECTED' : ''}</em>
                  </div>
                ))}
              </div>

              <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 26 }}>TOP PREDICTIONS / ± UNCERTAINTY</div>
              {points.slice(0, 5).map((p, i) => (
                <div className="prediction-row" key={p.id}>
                  <div className="prediction-rank">0{i + 1}</div>
                  <div className="prediction-name">{p.name}</div>
                  <div className="prediction-score">{p.predicted.toFixed(1)}<span>±{p.uncertainty.toFixed(1)}</span></div>
                </div>
              ))}

              <div className="model-note">
                <b>Target:</b> {data.ml.target}. <b>Method:</b> {data.ml.method}
              </div>
              <div className="model-note" style={{ color: 'var(--amber)' }}>
                {data.ml.caveat}
              </div>

              <div className="review-box">
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>SCIENTIFIC REVIEW / STATUS</div>
                <div className="review-row"><span>Macrostrat unit cross-check</span><b className="done">DONE</b></div>
                <div className="review-row"><span>Literature analog check</span><b className="done">DONE</b></div>
                <div className="review-row"><span>Planetary geologist sign-off</span><b className="pending">PENDING</b></div>
                <div className="review-row"><span>Field assay of top 3 sites</span><b className="pending">NEXT</b></div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
