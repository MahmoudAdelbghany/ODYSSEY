import { motion } from 'framer-motion';
import { ArrowDownRight, Play, Sparkles } from 'lucide-react';
import type { Campaign, ProfileKey, Site } from '../types';
import { Counter } from './Counter';
import { GlobeHero } from './GlobeHero';

type Props = {
  sites: Site[];
  campaign: Campaign;
  profile: ProfileKey;
  modelR2: number;
  onPlayFilm: () => void;
};

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero({ sites, campaign, profile, modelR2, onPlayFilm }: Props) {
  return (
    <section className="hero" id="top">
      <div className="hero-stars" />
      <div className="hero-vignette" />
      <div className="hero-grid" />

      <div className="hero-hud hud-tl">
        <span className="hud-dot" /> ODYSSEY / MISSION PLANNER
        <div style={{ marginTop: 8, color: 'rgba(243,238,229,0.28)' }}>REV 03 / BUILD 2026.11</div>
      </div>
      <div className="hero-hud hud-tr">
        LIVE DATA / NASA POWER
        <div style={{ marginTop: 8, color: 'rgba(243,238,229,0.28)' }}>2001–2020 CLIMATOLOGY</div>
      </div>
      <div className="hero-hud hud-bl">
        SCAN / GLOBAL LAND
        <div style={{ marginTop: 8, color: 'rgba(243,238,229,0.28)' }}>{sites.length} CANDIDATE REGIONS</div>
      </div>
      <div className="hero-hud hud-br">
        EARTH ANALOG DATABASE / {sites.length} SITES
        <div style={{ marginTop: 8, color: 'rgba(243,238,229,0.28)' }}>SCENARIO / {campaign.scenarioLabel?.toUpperCase() ?? 'BALANCED'}</div>
      </div>

      <div className="container hero-inner">
        <div className="hero-copy">
          <motion.div
            className="eyebrow hero-eyebrow"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease }}
          >
            <span className="idx">NASA SPACE APPS 2026</span>
            <span>PLANETARY ANALOG CAMPAIGNS</span>
          </motion.div>

          <h1 className="display hero-title">
            <span className="line">
              <motion.span
                initial={{ y: '110%' }}
                animate={{ y: '0%' }}
                transition={{ duration: 1.1, ease, delay: 0.1 }}
              >
                YOUR NEXT
              </motion.span>
            </span>
            <span className="line">
              <motion.span
                initial={{ y: '110%' }}
                animate={{ y: '0%' }}
                transition={{ duration: 1.1, ease, delay: 0.2 }}
              >
                MISSION STARTS
              </motion.span>
            </span>
            <span className="line">
              <motion.span
                initial={{ y: '110%' }}
                animate={{ y: '0%' }}
                transition={{ duration: 1.1, ease, delay: 0.3 }}
              >
                ON <em>EARTH.</em>
              </motion.span>
            </span>
          </h1>

          <motion.p
            className="hero-sub"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease, delay: 0.55 }}
          >
            Odyssey turns a Moon or Mars mission brief into a time-optimized campaign across
            the right Earth analogs. It shows what each site can test, what it cannot, and
            what must be synthesized.
          </motion.p>

          <motion.div
            className="hero-actions"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease, delay: 0.7 }}
          >
            <a href="#planner" className="btn btn-primary">
              Plan a mission <ArrowDownRight size={16} className="arrow" />
            </a>
            <a href="#agent" className="btn btn-ghost">
              <Sparkles size={14} /> Ask the agent
            </a>
            <button className="btn btn-ghost" onClick={onPlayFilm}>
              <Play size={14} /> Watch the film
            </button>
          </motion.div>

          <motion.div
            className="hero-stats"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.1, delay: 0.9 }}
          >
            <div className="hero-stat">
              <div className="v"><Counter value={sites.length} /></div>
              <div className="k">Candidate regions</div>
            </div>
            <div className="hero-stat">
              <div className="v"><Counter value={6} /></div>
              <div className="k">Analog dimensions</div>
            </div>
            <div className="hero-stat">
              <div className="v"><Counter value={campaign.totalDays} /></div>
              <div className="k">Day campaign</div>
            </div>
            <div className="hero-stat">
              <div className="v"><Counter value={modelR2} decimals={3} /></div>
              <div className="k">Surrogate R²</div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.6, ease, delay: 0.35 }}
          style={{ position: 'relative' }}
        >
          <GlobeHero sites={sites} campaign={campaign} profile={profile} />
        </motion.div>
      </div>

      <div className="scroll-cue">
        <span>SCROLL TO DECOMPOSE</span>
        <div className="rail" />
      </div>
    </section>
  );
}
