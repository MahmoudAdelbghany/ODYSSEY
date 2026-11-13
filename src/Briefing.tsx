import { useEffect, useMemo, useState } from 'react';
import Lenis from 'lenis';
import raw from './data/odyssey.json';
import type { Dimensions, OdysseyData, ProfileKey } from './types';
import { PROFILE_WEIGHTS } from './types';
import { Grain, Nav, ScrollProgress } from './components/Chrome';
import { Hero } from './components/Hero';
import { Marquee } from './components/Marquee';
import { Problem } from './components/Problem';
import { Shift } from './components/Shift';
import { Agent } from './components/Agent';
import { Planner } from './components/Planner';
import { WeightLab } from './components/WeightLab';
import { Scan } from './components/Scan';
import { Dossier } from './components/Dossier';
import { Sites } from './components/Sites';
import { Campaign } from './components/Campaign';
import { Travel } from './components/Travel';
import { Model } from './components/Model';
import { Validation } from './components/Validation';
import { DataStack } from './components/DataStack';
import { Film } from './components/Film';
import { Footer } from './components/Footer';

const data = raw as unknown as OdysseyData;

type Props = {
  onOpenControl: () => void;
  initialHash?: string;
};

export default function Briefing({ onOpenControl, initialHash }: Props) {
  const [profile, setProfile] = useState<ProfileKey>('lunar_base');
  const [selectedId, setSelectedId] = useState<string>(data.campaigns.lunar_base.sites[0]?.id ?? data.sites[0].id);
  const [filmOpen, setFilmOpen] = useState(false);
  const [labWeights, setLabWeights] = useState<Dimensions>({ ...PROFILE_WEIGHTS.lunar_base });
  const [scenario, setScenario] = useState('balanced');

  const selected = useMemo(
    () => data.sites.find((s) => s.id === selectedId) ?? data.sites[0],
    [selectedId],
  );

  const activeCampaign = useMemo(
    () => data.campaignVariants?.[profile]?.[scenario] ?? data.campaigns[profile],
    [profile, scenario],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!initialHash) return;
    const id = initialHash.replace('#', '');
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [initialHash]);

  useEffect(() => {
    const top = data.campaignVariants?.[profile]?.[scenario]?.sites[0] ?? data.campaigns[profile].sites[0];
    if (top) setSelectedId(top.id);
  }, [profile, scenario]);

  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = filmOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [filmOpen]);

  return (
    <div className="app">
      <Grain />
      <ScrollProgress />
      <Nav />

      <main>
        <Hero
          sites={data.sites}
          campaign={activeCampaign}
          profile={profile}
          modelR2={data.ml.profiles[profile].r2}
          onPlayFilm={() => setFilmOpen(true)}
        />
        <Marquee />
        <Problem />
        <Shift />
        <Agent
          data={data}
          onApply={(p) => {
            setProfile(p);
            document.getElementById('planner')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onApplyWeights={(w, p) => {
            const clamped = Object.fromEntries(
              Object.entries(w).map(([k, v]) => [k, Math.max(0, Math.min(40, Number(v) || 0))]),
            );
            setProfile(p);
            setLabWeights({ ...PROFILE_WEIGHTS[p], ...clamped } as Dimensions);
            document.getElementById('weightlab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
        <Planner
          data={data}
          campaign={activeCampaign}
          profile={profile}
          setProfile={setProfile}
          onRun={() => document.getElementById('scan')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <WeightLab data={data} profile={profile} weights={labWeights} setWeights={setLabWeights} />
        <Scan data={data} campaign={activeCampaign} profile={profile} selectedId={selectedId} setSelectedId={setSelectedId} />

        <section className="section-tight" id="dossier-section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="eyebrow" style={{ marginBottom: 18 }}>
              <span className="idx">SITE DOSSIER</span>
              <span>{selected.name.toUpperCase()}</span>
            </div>
            <Dossier data={data} campaign={activeCampaign} profile={profile} site={selected} />
          </div>
        </section>

        <Sites campaign={activeCampaign} onSelect={setSelectedId} />
        <Campaign data={data} campaign={activeCampaign} profile={profile} scenario={scenario} setScenario={setScenario} />
        <Travel data={data} campaign={activeCampaign} />
        <Model data={data} profile={profile} setProfile={setProfile} />
        <Validation data={data} profile={profile} />
        <DataStack />
        <Film onPlay={() => setFilmOpen(true)} />
      </main>

      <Footer />

      <button className="mode-switch" onClick={onOpenControl}>
        RETURN TO ODYSSEY <span>↗</span>
      </button>

      {filmOpen ? (
        <div className="modal" onClick={() => setFilmOpen(false)} role="dialog" aria-modal="true" aria-label="Odyssey demo film">
          <div className="modal-inner" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setFilmOpen(false)}>Close ✕</button>
            <video src="/odyssey-demo.mp4" controls autoPlay playsInline />
          </div>
        </div>
      ) : null}
    </div>
  );
}
