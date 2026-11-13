import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CornerDownLeft, Sparkles } from 'lucide-react';
import { PROFILE_ORDER, PROFILE_WEIGHTS, DIMENSION_LABELS, type OdysseyData, type ProfileKey, type Dimensions } from '../types';
import { Reveal } from './Reveal';
import { SectionHead } from './SectionHead';

const PROMPTS: Record<ProfileKey, string> = {
  lunar_base:
    'Plan a permanent lunar south pole base. Prioritize regolith construction, thermal survival, subsurface shielding and continuous power.',
  mars_landing:
    'Plan a Mars landing and exploration campaign. Prioritize dust tolerance, mineralogy, rover terrain and sample return.',
  expedition:
    'Plan a 7-day lunar surface expedition. Prioritize geological sampling, rover navigation and equipment deployment.',
};

const CHIPS: Record<ProfileKey, string[]> = {
  lunar_base: ['PERMANENT', 'SOUTH POLE', '4 SUBSYSTEMS'],
  mars_landing: ['LANDING', 'EXPLORATION', '3 EXPERIMENTS'],
  expedition: ['7 DAYS', 'LUNAR SURFACE', '3 EXPERIMENTS'],
};

function useTypewriter(text: string, speed = 16) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    setTyped('');
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed]);
  return typed;
}

type Props = {
  data: OdysseyData;
  campaign: import('../types').Campaign;
  profile: ProfileKey;
  setProfile: (p: ProfileKey) => void;
  onRun: () => void;
};

export function Planner({ data, campaign, profile, setProfile, onRun }: Props) {
  const typed = useTypewriter(PROMPTS[profile]);
  const weights = PROFILE_WEIGHTS[profile];

  return (
    <section className="section" id="planner" style={{ paddingTop: 40 }}>
      <div className="container">
        <SectionHead
          index="04"
          label="MISSION BRIEF"
          title={<>DESCRIBE THE MISSION.<br />WE DECOMPOSE IT.</>}
          lead="Start with the experiment, not the planet. Odyssey turns a plain-language brief into weighted environmental requirements, then finds the sites that can actually satisfy them."
          right={
            <div className="profile-tabs">
              {PROFILE_ORDER.map((p) => (
                <button
                  key={p}
                  className={`profile-tab ${profile === p ? 'active' : ''}`}
                  onClick={() => setProfile(p)}
                >
                  {data.profiles[p].short}
                </button>
              ))}
            </div>
          }
        />

        <div className="planner-grid">
          <Reveal className="terminal">
            <div className="terminal-bar">
              <div className="terminal-dots"><i /><i /><i /></div>
              <div className="mono" style={{ color: 'var(--paper-faint)' }}>ODYSSEY / MISSION DECOMPOSER</div>
              <div className="mono" style={{ color: 'var(--cyan)' }}>v2.4</div>
            </div>

            <div className="mono" style={{ color: 'var(--paper-faint)', marginBottom: 14 }}>
              MISSION BRIEF / NATURAL LANGUAGE INPUT
            </div>

            <div className="terminal-prompt">
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 2.4vw, 36px)', lineHeight: 1.35, fontWeight: 300 }}>
                {typed}
                <span className="caret" />
              </div>
            </div>

            <div className="terminal-meta">
              {CHIPS[profile].map((c) => (
                <div className="chip" key={c}><span className="dot" />{c}</div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 30, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
              <div className="mono" style={{ color: 'var(--paper-faint)' }}>
                <Sparkles size={12} style={{ verticalAlign: -2, marginRight: 8, color: 'var(--cyan)' }} />
                6 REQUIREMENTS EXTRACTED
              </div>
              <button className="btn" onClick={onRun} style={{ height: 44, padding: '0 18px' }}>
                Run the scan <ArrowRight size={14} className="arrow" />
              </button>
            </div>
          </Reveal>

          <Reveal className="requirements" delay={0.1}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div className="mono" style={{ color: 'var(--paper-faint)' }}>DECOMPOSITION SUMMARY</div>
              <div className="mono" style={{ color: 'var(--green)' }}>● LOCKED</div>
            </div>

            {(Object.keys(weights) as (keyof Dimensions)[]).map((k, i) => (
              <div key={k}>
                <div className="req-row">
                  <div className="req-name">{DIMENSION_LABELS[k]}</div>
                  <div className="req-val">{weights[k]}%</div>
                  <div className="req-bar">
                    <motion.i
                      initial={{ width: 0 }}
                      whileInView={{ width: `${Math.min(100, weights[k] * 4.2)}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.1, delay: 0.15 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="mono" style={{ color: 'var(--paper-faint)' }}>ML TOP CANDIDATES / {campaign.scenarioLabel ?? 'BALANCED'}</div>
              <div className="mono" style={{ color: 'var(--cyan)' }}>3 / {data.sites.length}</div>
            </div>
            <div className="planner-preview">
              {campaign.sites.map((s, i) => (
                <div className="preview-card" key={s.id}>
                  <div className="n">0{i + 1}</div>
                  <div className="name">{s.name}</div>
                  <div className="meta">{s.country} / {s.window.join('–')}</div>
                  <div className="score">{s.score.toFixed(1)}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.12em', color: 'var(--paper-faint)', textTransform: 'uppercase' }}>
              <CornerDownLeft size={12} /> Press run to scan 19 regions
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
