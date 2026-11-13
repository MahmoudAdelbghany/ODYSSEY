import { useMemo } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  DIMENSION_LABELS,
  PROFILE_WEIGHTS,
  mlScore,
  type Dimensions,
  type OdysseyData,
  type ProfileKey,
  type Site,
} from '../types';
import { Reveal } from './Reveal';
import { SectionHead } from './SectionHead';

type Props = {
  data: OdysseyData;
  profile: ProfileKey;
  weights: Dimensions;
  setWeights: (w: Dimensions) => void;
};

function customScore(site: Site, profile: ProfileKey, w: Dimensions) {
  const dims = site.scores[profile].dimensions;
  const total = (Object.keys(w) as (keyof Dimensions)[]).reduce((acc, k) => acc + w[k], 0) || 1;
  return (Object.keys(w) as (keyof Dimensions)[]).reduce((acc, k) => acc + dims[k] * w[k], 0) / total;
}

export function WeightLab({ data, profile, weights, setWeights }: Props) {
  const rows = useMemo(() => {
    return [...data.sites]
      .map((s) => {
        const custom = customScore(s, profile, weights);
        const ml = mlScore(s, profile);
        return { s, custom, ml, delta: custom - ml };
      })
      .sort((a, b) => b.custom - a.custom)
      .slice(0, 10);
  }, [data, profile, weights]);

  const total = (Object.keys(weights) as (keyof Dimensions)[]).reduce((a, k) => a + weights[k], 0);

  return (
    <section className="section" id="weightlab" style={{ paddingTop: 40 }}>
      <div className="container">
        <SectionHead
          index="LAB"
          label="WEIGHT LAB"
          title={<>THE RANKING IS ONLY<br />AS GOOD AS THE WEIGHTS.</>}
          lead="Every analog score is a value judgment. Move the weights and watch the ranking change. The model is not hiding its assumptions; this is the assumption layer, exposed."
          right={
            <button className="btn" onClick={() => setWeights({ ...PROFILE_WEIGHTS[profile] })}>
              <RotateCcw size={13} /> Load {data.profiles[profile].short} defaults
            </button>
          }
        />

        <div className="weight-grid">
          <Reveal>
            <div className="weight-controls">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="mono" style={{ color: 'var(--paper-faint)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SlidersHorizontal size={13} /> DIMENSION WEIGHTS
                </div>
                <div className="mono" style={{ color: total === 100 ? 'var(--green)' : 'var(--amber)' }}>
                  SUM {total} / NORMALIZED
                </div>
              </div>

              {(Object.keys(weights) as (keyof Dimensions)[]).map((k) => (
                <div className="weight-control" key={k}>
                  <div className="weight-control-top">
                    <span>{DIMENSION_LABELS[k]}</span>
                    <b>{weights[k]}</b>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={weights[k]}
                    onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
                    aria-label={DIMENSION_LABELS[k]}
                  />
                </div>
              ))}

              <div className="weight-note">
                <b>Why this matters:</b> a site can be the best analog for one experiment and the
                worst for another. The weights encode the mission, not the map. The agent can set
                these weights from a plain-language brief.
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="weight-ranking">
              <div className="weight-ranking-head">
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>CUSTOM RANK / {data.profiles[profile].short}</div>
                <div className="mono" style={{ color: 'var(--cyan)' }}>TOP 10 / {data.sites.length}</div>
              </div>

              {rows.map((r, i) => (
                <div className="weight-row" key={r.s.id}>
                  <div className={`weight-rank ${i < 3 ? 'top' : ''}`}>{String(i + 1).padStart(2, '0')}</div>
                  <div className="weight-name">
                    <div>{r.s.name}</div>
                    <div className="weight-meta">{r.s.country} / {r.s.type}</div>
                  </div>
                  <div className="weight-score">
                    <b>{r.custom.toFixed(1)}</b>
                    <span>ML {r.ml.toFixed(1)}</span>
                  </div>
                  <div className={`weight-delta ${r.delta >= 0 ? 'up' : 'down'}`}>
                    {r.delta >= 0 ? '+' : ''}{r.delta.toFixed(1)}
                  </div>
                  <div className="weight-bar"><i style={{ width: `${r.custom}%` }} /></div>
                </div>
              ))}

              <div className="weight-foot">
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>
                  DELTA = CUSTOM RUBRIC − LEARNED MODEL
                </div>
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>
                  THE MODEL AND THE RUBRIC SHOULD DISAGREE SOMEWHERE. THAT IS THE POINT.
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
