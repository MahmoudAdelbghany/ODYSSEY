import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight, Bot, Brain, ChevronRight, Clock, Droplets, FileText, Gem, Globe2, Mountain,
  Orbit, Pause, Play, Route, SlidersHorizontal, Sparkles, Thermometer, Wind,
} from 'lucide-react';
import raw from './data/odyssey.json';
import {
  DIMENSION_LABELS,
  PROFILE_ORDER,
  mlScore,
  mlUncertainty,
  type Campaign,
  type Dimensions,
  type OdysseyData,
  type ProfileKey,
  type Site,
} from './types';
import { MissionGlobe } from './components/MissionGlobe';
import { SiteWalk } from './components/SiteWalk';
import { LiveConditions } from './components/LiveConditions';

const data = raw as unknown as OdysseyData;

const DEFAULT_BRIEF =
  'Plan a permanent lunar south pole base. Prioritize regolith construction, thermal survival, subsurface shielding and continuous power.';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

type LayerId = 'score' | keyof Dimensions;

const LAYERS: { id: LayerId; label: string }[] = [
  { id: 'score', label: 'ML score' },
  { id: 'thermal', label: 'Thermal' },
  { id: 'aridity', label: 'Dry regime' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'geology', label: 'Geology' },
  { id: 'dust', label: 'Dust' },
  { id: 'access', label: 'Access' },
];

const LAYER_ICONS: Record<LayerId, typeof Brain> = {
  score: Sparkles,
  thermal: Thermometer,
  aridity: Droplets,
  terrain: Mountain,
  geology: Gem,
  dust: Wind,
  access: Route,
};

const PHASES = [
  { id: 'brief', label: 'BRIEF', icon: FileText },
  { id: 'analyze', label: 'ANALYZE', icon: Brain },
  { id: 'explore', label: 'EXPLORE', icon: Globe2 },
  { id: 'time', label: 'TIME', icon: Clock },
  { id: 'intervene', label: 'INTERVENE', icon: SlidersHorizontal },
  { id: 'campaign', label: 'CAMPAIGN', icon: Route },
] as const;

type PhaseId = (typeof PHASES)[number]['id'];

const TARGET: Record<ProfileKey, { temp: [number, number]; precip: [number, number] }> = {
  lunar_base: { temp: [-50, 0], precip: [0, 20] },
  mars_landing: { temp: [-80, 0], precip: [0, 30] },
  expedition: { temp: [-20, 20], precip: [0, 30] },
};

const EXP_DESC: Record<string, string> = {
  'Regolith & construction': 'Surface composition, rock distribution, geotechnical stability and construction feedstock.',
  'Thermal & illumination': 'Temperature swing, illumination geometry, power generation and survival.',
  'Subsurface & shielding': 'Caves, lava tubes, overburden and radiation shielding potential.',
  'Dust & aeolian processes': 'Dust loading, wind, abrasion and atmospheric surface processes.',
  'Mineralogy & habitability': 'Alteration minerals, aqueous history and biosignature preservation.',
  'Terrain & rover operations': 'Slope, roughness, obstacles and traversability.',
  'Geological sampling': 'Rock diversity, exposure, sample quality and field access.',
  'Rover navigation': 'Slope, roughness, terrain topology and traversability.',
  'Equipment deployment': 'Surface stability, access, exposure and operational conditions.',
};

const BOOT_STEPS = [
  'PARSING MISSION BRIEF',
  'DECOMPOSING EXPERIMENTS + REQUIREMENTS',
  'SCANNING 39 CANDIDATE REGIONS',
  'RANKING WITH THREE LEARNED MODELS',
  'OPTIMIZING TRAVEL + CAMPAIGN',
];

function clamp(v: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

function monthScore(site: Site, profile: ProfileKey, month: number) {
  const t = site.monthly.temp[month] ?? site.climate.tempMean;
  const p = site.monthly.precip[month] ?? site.climate.precipDay;
  const target = TARGET[profile];
  const mid = (target.temp[0] + target.temp[1]) / 2;
  const scale = Math.max(10, (target.temp[1] - target.temp[0]) * 0.6);
  const ts = Math.exp(-Math.pow((t - mid) / scale, 2));
  const ps = Math.exp(-Math.pow((p - target.precip[0]) / 6, 2));
  return clamp(0.72 * ts + 0.28 * ps);
}

function suggestionsFor(site: Site, profile: ProfileKey) {
  const d = site.scores[profile];
  const out: string[] = [];
  if (d.dimensions.thermal < 70) out.push('Extend the ambient thermal cycle with a thermal vacuum chamber.');
  if (d.dimensions.dust < 70) out.push('Add a dust chamber or aerosol injection to match the target dust load.');
  if (d.dimensions.geology < 70) out.push('Pair with a second site for the missing mineralogy.');
  if (d.dimensions.access < 60) out.push('Add 2–3 buffer days and confirm evacuation routes.');
  if (d.dimensions.aridity < 70) out.push('Add a controlled humidity/volatile test.');
  return out.slice(0, 3);
}

function readiness(profile: ProfileKey, campaign: Campaign) {
  const avg = campaign.sites.length
    ? campaign.sites.reduce((a, s) => a + (data.sites.find((x) => x.id === s.id)?.scores[profile].confidence ?? 0.8), 0) / campaign.sites.length
    : 0.8;
  const dataConf = avg * 100;
  const travel = Math.max(0, 100 - campaign.travelHours * 1.1);
  const fit = Math.min(100, campaign.match / 3);
  const facility = Math.max(0, 100 - campaign.interventions.length * 12);
  return Math.round(0.35 * dataConf + 0.25 * travel + 0.25 * fit + 0.15 * facility);
}

type MissionControlProps = {
  onOpenBriefing: (hash?: string) => void;
  initialStarted?: boolean;
  initialPhase?: PhaseId;
};

export default function MissionControl({
  onOpenBriefing,
  initialStarted = false,
  initialPhase = 'analyze',
}: MissionControlProps) {
  const [started, setStarted] = useState(initialStarted);
  const [booting, setBooting] = useState(false);
  const [bootStep, setBootStep] = useState(0);
  const [phase, setPhase] = useState<PhaseId>(initialPhase);
  const [profile, setProfile] = useState<ProfileKey>('lunar_base');
  const [selectedId, setSelectedId] = useState<string>(
    data.campaigns.lunar_base.sites[0]?.id ?? data.sites[0].id,
  );
  const [scenario, setScenario] = useState('balanced');
  const [month, setMonth] = useState(5);
  const [layer, setLayer] = useState<LayerId>('score');
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [profilePinned, setProfilePinned] = useState(false);
  const [command, setCommand] = useState('');
  const [narration, setNarration] = useState(
    'Mission control online. Define a mission brief, then initialize the analog search.',
  );
  const [walkOpen, setWalkOpen] = useState(false);

  const activeCampaign = useMemo(
    () => data.campaignVariants?.[profile]?.[scenario] ?? data.campaigns[profile],
    [profile, scenario],
  );
  const selected = useMemo(
    () => data.sites.find((s) => s.id === selectedId) ?? data.sites[0],
    [selectedId],
  );
  const topSites = useMemo(
    () => [...data.sites].sort((a, b) => mlScore(b, profile) - mlScore(a, profile)),
    [profile],
  );

  useEffect(() => {
    const variants = data.campaignVariants?.[profile];
    if (variants && !variants[scenario] && variants.balanced) setScenario('balanced');
    const c = variants?.[scenario] ?? variants?.balanced ?? data.campaigns[profile];
    if (c.sites[0]) setSelectedId(c.sites[0].id);
  }, [profile, scenario]);

  useEffect(() => {
    if (!booting) return;
    const timers = BOOT_STEPS.map((_, i) => window.setTimeout(() => setBootStep(i + 1), 900 + i * 1050));
    const done = window.setTimeout(() => {
      setBooting(false);
      setBootStep(0);
      setPhase('analyze');
      setNarration(`Analysis complete. ${data.sites.length} regions ranked, travel optimized. Select a site or ask Odyssey where to go.`);
    }, 900 + BOOT_STEPS.length * 1050 + 500);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(done);
    };
  }, [booting]);

  const start = () => {
    const q = brief.toLowerCase();
    const parsedProfile: ProfileKey = q.includes('mars')
      ? 'mars_landing'
      : q.includes('expedition') || q.includes('seven-day') || q.includes('7-day')
        ? 'expedition'
        : q.includes('lunar') || q.includes('moon') || q.includes('south pole')
          ? 'lunar_base'
          : profile;
    const nextProfile = profilePinned ? profile : parsedProfile;
    const variants = data.campaignVariants?.[nextProfile];
    const nextScenario = variants?.[scenario] ? scenario : 'balanced';
    const nextCampaign = variants?.[nextScenario] ?? data.campaigns[nextProfile];
    setProfile(nextProfile);
    setScenario(nextScenario);
    setStarted(true);
    setBooting(true);
    setBootStep(0);
    setSelectedId(nextCampaign.sites[0]?.id ?? data.sites[0].id);
    setNarration(
      nextProfile === 'mars_landing'
        ? 'Brief parsed: Mars surface operations. Ranking dusty, rocky, cold terrestrial analogs.'
        : nextProfile === 'expedition'
          ? 'Brief parsed: short lunar expedition. Ranking field geology, rover terrain and deployment access.'
          : 'Brief parsed: permanent lunar base. Ranking construction, thermal survival and shielding analogs.',
    );
  };

  const selectSite = (id: string) => {
    const s = data.sites.find((x) => x.id === id);
    setSelectedId(id);
    setPhase('explore');
    if (s) setNarration(`Flying to ${s.name}. ${s.type}, ${s.country}. Reading the dossier.`);
  };

  const runCommand = (qArg?: string) => {
    const q = (qArg ?? command).trim().toLowerCase();
    if (!q) return;
    setCommand('');
    const dims: (keyof Dimensions)[] = ['geology', 'terrain', 'thermal', 'dust', 'access'];
    const wanted: keyof Dimensions | null =
      dims.find((d) => q.includes(d)) ??
      (q.includes('sample') ? 'geology' : q.includes('rover') ? 'terrain' : q.includes('temperature') ? 'thermal' : null);
    if (wanted) {
      const site = [...data.sites].sort(
        (a, b) => b.scores[profile].dimensions[wanted] - a.scores[profile].dimensions[wanted],
      )[0];
      setSelectedId(site.id);
      setPhase('explore');
      setLayer(wanted);
      setNarration(`Selecting ${site.name}: strongest ${DIMENSION_LABELS[wanted]} in the current profile.`);
      return;
    }
    if (q.includes('when') || q.includes('season') || q.includes('month') || q.includes('time')) {
      setPhase('time');
      setNarration(`Temporal analysis opened for ${selected.name}. The current window is ${selected.windows[profile].join('–')}.`);
      return;
    }
    if (q.includes('missing') || q.includes('break') || q.includes('gap') || q.includes('intervene')) {
      setPhase('intervene');
      setNarration(`Intervention lab opened. Earth can provide the analog; the facility must provide the rest.`);
      return;
    }
    if (q.includes('campaign') || q.includes('route') || q.includes('travel')) {
      setPhase('campaign');
      setNarration(`Campaign view opened: ${activeCampaign.assignments.map((a) => a.site).join(' → ')}.`);
      return;
    }
    if (q.includes('why')) {
      const strongest = (Object.entries(selected.scores[profile].dimensions).sort((a, b) => b[1] - a[1])[0][0]) as keyof Dimensions;
      setPhase('explore');
      setLayer(strongest);
      setNarration(`${selected.name} scores ${mlScore(selected, profile).toFixed(1)} / 100. Strongest dimension: ${DIMENSION_LABELS[strongest]}. The globe is showing that layer.`);
      return;
    }
    if (q.includes('best') || q.includes('recommend') || q.includes('where')) {
      const site = topSites[0];
      setSelectedId(site.id);
      setPhase('explore');
      setNarration(`Top-ranked analog for this profile: ${site.name}, ${site.country}. Model score ${mlScore(site, profile).toFixed(1)} / 100.`);
      return;
    }
    setPhase('analyze');
    setNarration('I can select a site by dimension, open a time window, show what breaks, or build the campaign. Try “best geology”, “when should we go”, “what is missing”, or “build the campaign”.');
  };

  const openingView = (
    <>
        <div className="mc-opening-vignette" />
        <div className="mc-opening">
          <div className="mc-opening-top">
            <div className="mc-brand">
              <span className="mc-logo-mark" />
              <span className="mc-logo-word">ODYSSEY</span>
            </div>
            <div className="mc-opening-top-right">
              <div className="mc-system-online"><span /> SYSTEM ONLINE</div>
              <div className="mono" style={{ color: 'var(--paper-faint)' }}>EARTH / SOL 001</div>
              <button className="mc-opening-link" onClick={() => onOpenBriefing()}>BRIEFING ↗</button>
            </div>
          </div>

          <div className="mc-opening-rail">
            {PHASES.map((p, i) => (
              <div className={`mc-opening-rail-item ${i === 0 ? 'active' : ''}`} key={p.id}>
                <span>{String(i + 1).padStart(2, '0')}</span>
              </div>
            ))}
          </div>

          <div className="mc-opening-telemetry">
            <div className="mc-opening-telemetry-head">EARTH ANALOG SYSTEM / LIVE</div>
            <div>
              <span>MISSION CLASS</span>
              <b>{data.profiles[profile].short}</b>
            </div>
            <div>
              <span>CANDIDATE REGIONS</span>
              <b>{String(data.sites.length).padStart(2, '0')}</b>
            </div>
            <div>
              <span>MODEL FIT / R²</span>
              <b>{data.ml.profiles[profile].r2.toFixed(3)}</b>
            </div>
            <div>
              <span>CAMPAIGN SCENARIOS</span>
              <b>04</b>
            </div>
            <div>
              <span>LIVE SOURCES</span>
              <b>12</b>
            </div>
          </div>

          <div className="mc-opening-copy">
            <div className="eyebrow"><span className="idx">MISSION 001</span><span>PLANETARY ANALOG INTELLIGENCE</span></div>
            <h1 className="display mc-opening-title">
              WHERE SHOULD<br />HUMANITY PRACTICE<br />EXPLORING<br /><em>ANOTHER WORLD?</em>
            </h1>
            <p className="mc-opening-sub">
              Define a planetary mission. Let Odyssey discover where on Earth it can be tested.
            </p>

            <div className="mc-profile-tabs">
              {PROFILE_ORDER.map((p) => (
                <button
                  key={p}
                  className={`mc-profile-tab ${profile === p ? 'active' : ''}`}
                  onClick={() => { setProfile(p); setProfilePinned(true); }}
                >
                  {data.profiles[p].short}
                </button>
              ))}
            </div>

            <div className="mc-brief-box">
              <div className="mono" style={{ color: 'var(--paper-faint)' }}>MISSION BRIEF / NATURAL LANGUAGE</div>
              <textarea
                value={brief}
                onChange={(e) => { setBrief(e.target.value); setProfilePinned(false); }}
                rows={3}
                aria-label="Mission brief"
              />
              <div className="mc-examples">
                {[
                  'Plan a seven-day simulated lunar surface expedition involving geological sampling, rover navigation and equipment deployment.',
                  'Find the best Mars analog for dusty rover operations and sample return.',
                  'Build the tightest multi-site campaign for a lunar south pole base.',
                ].map((x) => (
                  <button
                    key={x}
                    onClick={() => {
                      setBrief(x);
                      setProfilePinned(true);
                      const q = x.toLowerCase();
                      if (q.includes('mars')) setProfile('mars_landing');
                      else if (q.includes('expedition')) setProfile('expedition');
                      else setProfile('lunar_base');
                    }}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <button className="mc-initialize" onClick={start}>
                INITIALIZE MISSION <ArrowRight size={16} />
              </button>
            </div>

          </div>

          <div className="mc-opening-sequence">
            {PHASES.map((p, i) => (
              <div className={i === 0 ? 'active' : ''} key={p.id}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <b>{p.label}</b>
              </div>
            ))}
            <em>MISSION SEQUENCE / 06 PHASES</em>
          </div>

          <div className="mc-opening-foot">
            <span>ODYSSEY / MISSION CONTROL / REV 2050.4</span>
            <span>PLANETARY ANALOG INTELLIGENCE / NASA SPACE APPS 2026</span>
          </div>
        </div>
    </>
  );

  const bootView = (
    <>
        <div className="mc-boot-vignette" />
        <div className="mc-boot">
          <div className="mc-boot-orb">
            <div className="mc-boot-ring r1" />
            <div className="mc-boot-ring r2" />
            <div className="mc-boot-ring r3" />
            <div className="mc-boot-core" />
          </div>
          <div className="mono" style={{ color: 'var(--cyan)' }}>MISSION INTELLIGENCE / ANALYZING</div>
          <h2 className="display mc-boot-title">{data.profiles[profile].name}</h2>
          <div className="mc-boot-steps">
            {BOOT_STEPS.map((s, i) => (
              <div className={`mc-boot-step ${bootStep > i ? 'done' : bootStep === i ? 'active' : ''}`} key={s}>
                <span>{bootStep > i ? '✓' : String(i + 1).padStart(2, '0')}</span>
                <b>{s}</b>
                <em>{bootStep > i ? 'COMPLETE' : bootStep === i ? 'RUNNING' : 'QUEUED'}</em>
              </div>
            ))}
          </div>
          <div className="mc-boot-progress"><i style={{ width: `${(bootStep / BOOT_STEPS.length) * 100}%` }} /></div>
          <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 14 }}>
            REAL DATA / REAL MODEL / EXPLICIT LIMITS
          </div>
        </div>
    </>
  );

  const PhaseIcon = (PHASES.find((p) => p.id === phase)?.icon ?? Brain) as typeof Brain;
  const globePhase = !started ? 'brief' : booting ? 'analyze' : phase;

  return (
    <div className={`mc ${!started ? 'mc-opening-mode' : booting ? 'mc-boot-mode' : ''}`}>
      <div className="mc-stars" />
      <MissionGlobe
        sites={data.sites}
        campaign={activeCampaign}
        profile={profile}
        selectedId={selectedId}
        month={month}
        phase={globePhase}
        layer={layer}
        onSelect={selectSite}
      />

      {!started ? openingView : booting ? bootView : (
        <>
      <div className="mc-vignette" />

      {phase === 'explore' ? <LayerDock layer={layer} setLayer={setLayer} /> : null}

      <header className="mc-top">
        <div className="mc-brand">
          <span className="mc-logo-mark" />
          <span className="mc-logo-word">ODYSSEY</span>
        </div>
        <div className="mc-top-center">
          <div className="mono" style={{ color: 'var(--paper-faint)' }}>MISSION CONTROL</div>
          <div className="mono" style={{ color: 'var(--paper)', fontSize: 9 }}>EARTH ANALOG PROGRAM / MISSION 001</div>
        </div>
        <div className="mc-profile-tabs mc-top-profile">
          {PROFILE_ORDER.map((p) => (
            <button
              key={p}
              className={`mc-profile-tab ${profile === p ? 'active' : ''}`}
              onClick={() => {
                setProfile(p);
                setProfilePinned(true);
                setNarration(`Profile changed to ${data.profiles[p].name}. Re-ranking the planet.`);
              }}
            >
              {data.profiles[p].short}
            </button>
          ))}
        </div>
        <div className="mc-top-right">
          <div className="mc-live"><span /> LIVE / {data.sites.length} SITES / 3 MODELS</div>
          <button className="mc-briefing-btn" onClick={() => onOpenBriefing()}>BRIEFING <ArrowRight size={11} /></button>
        </div>
      </header>

      <nav className="mc-rail">
        {PHASES.map((p, i) => {
          const Icon = p.icon as typeof Brain;
          return (
            <button
              key={p.id}
              className={`mc-rail-btn ${phase === p.id ? 'active' : ''}`}
              onClick={() => setPhase(p.id)}
            >
              <span className="mc-rail-num">{String(i + 1).padStart(2, '0')}</span>
              <Icon size={15} strokeWidth={1.4} />
              <span className="mc-rail-label">{p.label}</span>
            </button>
          );
        })}
        <div className="mc-rail-sys">
          <div>SYS</div>
          <div>{data.sites.length} SITES</div>
          <div>3 MODELS</div>
          <div>4 SCENARIOS</div>
        </div>
      </nav>

      <aside className="mc-panel">
        <div className="mc-panel-head">
          <div className="mc-panel-ghost">
            {String(PHASES.findIndex((p) => p.id === phase) + 1).padStart(2, '0')}
          </div>
          <div className="mc-panel-sweep" key={phase} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="mono" style={{ color: 'var(--paper-faint)' }}>
              PHASE {String(PHASES.findIndex((p) => p.id === phase) + 1).padStart(2, '0')} / {phase.toUpperCase()}
            </div>
            <div className="mc-panel-title"><PhaseIcon size={16} /> {phase === 'explore' ? selected.name : PHASES.find((p) => p.id === phase)?.label}</div>
          </div>
          <div className="mc-panel-status"><span /> {started ? 'ONLINE' : 'STANDBY'}</div>
        </div>
        <div className="mc-panel-body">
          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              {phase === 'brief' && (
                <BriefPanel
                  brief={brief}
                  setBrief={setBrief}
                  profile={profile}
                  setProfile={(p) => { setProfile(p); setProfilePinned(true); }}
                  onStart={start}
                  onAgent={() => onOpenBriefing('#agent')}
                />
              )}
              {phase === 'analyze' && (
                <AnalyzePanel
                  data={data}
                  profile={profile}
                  topSites={topSites}
                  onSelect={selectSite}
                  onBriefing={onOpenBriefing}
                />
              )}
              {phase === 'explore' && (
                <ExplorePanel
                  site={selected}
                  profile={profile}
                  campaign={activeCampaign}
                  layer={layer}
                  setLayer={setLayer}
                  onWalk={() => setWalkOpen(true)}
                  onTime={() => setPhase('time')}
                  onIntervene={() => setPhase('intervene')}
                  onBriefing={() => onOpenBriefing('#dossier')}
                />
              )}
              {phase === 'time' && (
                <TimePanel site={selected} profile={profile} campaign={activeCampaign} month={month} setMonth={setMonth} />
              )}
              {phase === 'intervene' && (
                <IntervenePanel site={selected} profile={profile} campaign={activeCampaign} />
              )}
              {phase === 'campaign' && (
                <CampaignPanel
                  data={data}
                  profile={profile}
                  campaign={activeCampaign}
                  scenario={scenario}
                  setScenario={setScenario}
                  onBriefing={onOpenBriefing}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </aside>

      <div className="mc-hud mc-hud-tl">
        <span className="mc-hud-dot" /> EARTH / SOL 001
        <div>PLANETARY ANALOG DATABASE / REV 2050.4</div>
      </div>
      <div className="mc-hud mc-hud-tr">
        {data.sites.length} SITES / 3 MODELS
        <div>MISSION 001 / {data.profiles[profile].short.toUpperCase()}</div>
      </div>
      <div className="mc-hud mc-hud-bl">
        {Math.abs(selected.lat).toFixed(2)}°{selected.lat >= 0 ? 'N' : 'S'} / {Math.abs(selected.lon).toFixed(2)}°{selected.lon >= 0 ? 'E' : 'W'}
        <div>{selected.country.toUpperCase()} / {selected.type.toUpperCase()}</div>
      </div>
      <div className="mc-hud mc-hud-br">
        SCENARIO / {(activeCampaign.scenarioLabel ?? 'BALANCED').toUpperCase()}
        <div>{MONTHS[month]} / {activeCampaign.totalDays} DAYS / {activeCampaign.travelHours.toFixed(1)} H</div>
      </div>

      <div className="mc-command">
        <div className="mc-command-status">
          <span className="mc-command-dot" /> ODYSSEY / {narration}
        </div>
        <div className="mc-command-bar">
          <Bot size={15} color="var(--cyan)" />
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runCommand(); }}
            placeholder="Ask Odyssey: best geology · when should we go · what is missing · build the campaign"
            aria-label="Ask Odyssey"
          />
          <button onClick={() => runCommand()}><ArrowRight size={14} /></button>
        </div>
        <div className="mc-command-chips">
          {['Best geology', 'When to go', 'What is missing', 'Build campaign', 'Agent'].map((c) => (
            <button
              key={c}
              onClick={() => {
                if (c === 'Agent') { onOpenBriefing('#agent'); return; }
                if (c === 'Best geology') runCommand('best geology');
                else if (c === 'When to go') runCommand('when should we go');
                else if (c === 'What is missing') runCommand('what is missing');
                else runCommand('build the campaign');
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {walkOpen && <SiteWalk site={selected} profile={profile} onClose={() => setWalkOpen(false)} />}
      </AnimatePresence>
        </>
      )}
    </div>
  );

}

function LayerDock({ layer, setLayer }: { layer: LayerId; setLayer: (l: LayerId) => void }) {
  const active = LAYERS.find((l) => l.id === layer) ?? LAYERS[0];
  return (
    <div className="mc-layer-dock">
      <div className="mc-layer-dock-head">
        <div className="mc-kicker">SCIENCE LAYER</div>
        <b>{active.label}</b>
        <span>39 CANDIDATE REGIONS / LIVE RE-COLOR</span>
      </div>
      <div className="mc-layer-dock-list">
        {LAYERS.map((l) => {
          const Icon = LAYER_ICONS[l.id];
          return (
            <button
              key={l.id}
              className={layer === l.id ? 'active' : ''}
              onClick={() => setLayer(l.id)}
            >
              <Icon size={13} strokeWidth={1.5} />
              <span>{l.label}</span>
              <i />
            </button>
          );
        })}
      </div>
      <div className="mc-layer-legend">
        <span>LOW</span>
        <i />
        <span>HIGH</span>
      </div>
    </div>
  );
}

function BriefPanel({
  brief, setBrief, profile, setProfile, onStart, onAgent,
}: {
  brief: string;
  setBrief: (v: string) => void;
  profile: ProfileKey;
  setProfile: (p: ProfileKey) => void;
  onStart: () => void;
  onAgent: () => void;
}) {
  return (
    <div className="mc-stack">
      <div className="mc-kicker">MISSION BRIEF</div>
      <h2 className="mc-h2">ONE BRIEF.<br />THE WHOLE PLANET.</h2>
      <p className="mc-p">Refine the mission, change the profile, or re-run the analysis. The shell parses the brief into a mission class; the full LLM agent in Briefing can re-weight the model.</p>
      <div className="mc-profile-tabs" style={{ marginTop: 18 }}>
        {PROFILE_ORDER.map((p) => (
          <button key={p} className={`mc-profile-tab ${profile === p ? 'active' : ''}`} onClick={() => setProfile(p)}>
            {data.profiles[p].short}
          </button>
        ))}
      </div>
      <div className="mc-brief-box mc-brief-box-panel">
        <div className="mono" style={{ color: 'var(--paper-faint)' }}>MISSION BRIEF / NATURAL LANGUAGE</div>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={5} aria-label="Mission brief" />
        <button className="mc-initialize" onClick={onStart}>RE-INITIALIZE MISSION <ArrowRight size={15} /></button>
      </div>
      <button className="mc-link-btn" onClick={onAgent}><Bot size={13} /> Open the free LLM agent <ArrowRight size={12} /></button>
    </div>
  );
}

function AnalyzePanel({
  data: d, profile, topSites, onSelect, onBriefing,
}: {
  data: OdysseyData;
  profile: ProfileKey;
  topSites: Site[];
  onSelect: (id: string) => void;
  onBriefing: (hash?: string) => void;
}) {
  const ml = d.ml.profiles[profile];
  return (
    <div className="mc-stack">
      <div className="mc-kicker" style={{ color: 'var(--green)' }}>ANALYSIS COMPLETE</div>
      <h2 className="mc-h2">{d.profiles[profile].name}</h2>
      <div className="mc-metrics">
        <div><b>03</b><span>EXPERIMENTS</span></div>
        <div><b>06</b><span>REQUIREMENTS</span></div>
        <div><b>{d.sites.length}</b><span>REGIONS</span></div>
        <div><b>03</b><span>MODELS</span></div>
      </div>
      <div className="mc-kicker" style={{ marginTop: 24 }}>MISSION DECOMPOSITION</div>
      {d.profiles[profile].experiments.map((e, i) => (
        <div className="mc-exp" key={e}>
          <div className="mc-exp-num">0{i + 1}</div>
          <div>
            <div className="mc-exp-title">{e}</div>
            <div className="mc-exp-desc">{EXP_DESC[e] ?? 'Environmental requirements extracted from the brief.'}</div>
          </div>
          <span className="mc-exp-tag">EXP {String(i + 1).padStart(2, '0')}</span>
        </div>
      ))}
      <div className="mc-kicker" style={{ marginTop: 24 }}>LEARNED RANKING / TOP 5</div>
      {topSites.slice(0, 5).map((s, i) => (
        <button className="mc-rank" key={s.id} onClick={() => onSelect(s.id)}>
          <span className="mc-rank-i">{String(i + 1).padStart(2, '0')}</span>
          <span className="mc-rank-name">{s.name}<em>{s.country} / {s.type}</em></span>
          <span className="mc-rank-score">{mlScore(s, profile).toFixed(1)}<em>±{mlUncertainty(s, profile).toFixed(1)}</em></span>
          <ChevronRight size={14} />
        </button>
      ))}
      <div className="mc-model-strip">
        <div><b>{ml.r2.toFixed(3)}</b><span>R²</span></div>
        <div><b>{ml.mae.toFixed(2)}</b><span>MAE</span></div>
        <div><b>{ml.spearman.toFixed(3)}</b><span>SPEARMAN</span></div>
        <button onClick={() => onBriefing('#model')}>MODEL CARD <ArrowRight size={11} /></button>
      </div>
      <button className="mc-link-btn" onClick={() => onBriefing('#agent')}><Bot size={13} /> Ask the free LLM agent <ArrowRight size={12} /></button>
    </div>
  );
}

function ExplorePanel({
  site, profile, campaign, layer, setLayer, onWalk, onTime, onIntervene, onBriefing,
}: {
  site: Site;
  profile: ProfileKey;
  campaign: Campaign;
  layer: LayerId;
  setLayer: (l: LayerId) => void;
  onWalk: () => void;
  onTime: () => void;
  onIntervene: () => void;
  onBriefing: () => void;
}) {
  const d = site.scores[profile];
  const assignment = campaign.assignments.find((a) => a.siteId === site.id);
  const idx = campaign.assignments.findIndex((a) => a.siteId === site.id);
  const leg = idx > 0 ? campaign.legs[idx - 1] : null;
  const suggestions = suggestionsFor(site, profile);
  return (
    <div className="mc-stack">
      <div className="mc-layer-bar">
        <div className="mono" style={{ color: 'var(--cyan)' }}>GLOBE LAYER / {LAYERS.find((x) => x.id === layer)?.label.toUpperCase()}</div>
        <div className="mc-layer-btns">
          {LAYERS.map((l) => {
            const Icon = LAYER_ICONS[l.id];
            return (
              <button
                key={l.id}
                className={layer === l.id ? 'active' : ''}
                onClick={() => setLayer(l.id)}
              >
                <Icon size={10} strokeWidth={1.6} />
                {l.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mc-site-hero">
        <img src={site.image} alt={site.name} />
        <div className="mc-site-hero-tag">SITE / {site.benchmark ? 'BENCHMARK' : 'CANDIDATE'} / {site.country.toUpperCase()}</div>
      </div>
      <div className="mc-kicker">{site.type}</div>
      <h2 className="mc-h2">{site.name}</h2>
      <div className="mc-site-score">
        <b>{mlScore(site, profile).toFixed(1)}</b>
        <span>ML MATCH / 100<br />RULE {d.total.toFixed(1)} / ±{mlUncertainty(site, profile).toFixed(1)}</span>
      </div>
      <div className="mc-dim-grid">
        {(Object.keys(d.dimensions) as (keyof Dimensions)[]).map((k) => (
          <div className="mc-dim" key={k}>
            <div><span>{DIMENSION_LABELS[k]}</span><b>{d.dimensions[k].toFixed(0)}</b></div>
            <div className="mc-dim-bar"><i style={{ width: `${d.dimensions[k]}%` }} /></div>
          </div>
        ))}
      </div>
      {site.macrostrat && <div className="mc-macro">MACROSTRAT / {site.macrostrat.lith || 'mapped unit'} · {site.macrostrat.age || 'age unknown'}</div>}
      <LiveConditions site={site} />
      {assignment && (
        <div className="mc-role">
          <div className="mono" style={{ color: 'var(--cyan)' }}>CAMPAIGN ROLE / {campaign.scenarioLabel ?? 'BALANCED'}</div>
          <b>{assignment.experiment}</b>
          <span>{assignment.window.join('–')} · FIT {assignment.fit.toFixed(0)}</span>
          {leg ? <span>TRAVEL IN / {leg.hours.toFixed(1)} H FROM {leg.fromAirport} · ${leg.cost.toLocaleString()}</span> : <span>CAMPAIGN START / FIRST SITE</span>}
        </div>
      )}
      <div className="mc-suggest">
        <div className="mono" style={{ color: 'var(--cyan)' }}>FIELD SUGGESTIONS</div>
        {suggestions.map((s) => <div key={s}><span>→</span>{s}</div>)}
      </div>
      <div className="mc-actions">
        <button className="mc-action primary" onClick={onWalk}><Orbit size={14} /> WALK THE SITE</button>
        <button className="mc-action" onClick={onTime}><Clock size={14} /> TIME MACHINE</button>
        <button className="mc-action" onClick={onIntervene}><SlidersHorizontal size={14} /> WHAT BREAKS</button>
      </div>
      <button className="mc-link-btn" onClick={onBriefing}>Open full dossier <ArrowRight size={12} /></button>
    </div>
  );
}

function TimePanel({
  site, profile, campaign, month, setMonth,
}: {
  site: Site;
  profile: ProfileKey;
  campaign: Campaign;
  month: number;
  setMonth: (m: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const scores = MONTHS.map((_, i) => monthScore(site, profile, i));
  const best = Math.max(...scores);
  const bestMonth = MONTHS[scores.indexOf(best)];
  const declination = 23.44 * Math.sin((2 * Math.PI * (month + 0.5 - 2.5)) / 12);
  const declLabel = `${declination >= 0 ? '+' : ''}${declination.toFixed(1)}°`;

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setMonth((month + 1) % 12), 1100);
    return () => window.clearInterval(t);
  }, [playing, month, setMonth]);

  return (
    <div className="mc-stack">
      <div className="mc-time-head">
        <div className="mc-kicker">TEMPORAL ENVIRONMENT</div>
        <button className="mc-time-play" onClick={() => setPlaying((v) => !v)}>
          {playing ? <Pause size={10} /> : <Play size={10} />} {playing ? 'PAUSE YEAR' : 'PLAY YEAR'}
        </button>
      </div>
      <h2 className="mc-h2">{MONTHS[month]}<br />{site.name.toUpperCase()}.</h2>
      <div className="mc-p">Monthly suitability for this site and profile. The globe re-colors the 39 candidate points from the same monthly climatology while the bars score the current site.</div>
      <div className="mc-month-bars">
        {scores.map((v, i) => (
          <button key={MONTHS[i]} className={`mc-month ${i === month ? 'active' : ''}`} onClick={() => setMonth(i)}>
            <span className="mc-month-bar"><i style={{ height: `${Math.max(6, v * 100)}%` }} /></span>
            <b>{MONTHS[i]}</b>
          </button>
        ))}
      </div>
      <div className="mc-time-stats">
        <div><b>{(scores[month] * 100).toFixed(0)}</b><span>MONTH SCORE</span></div>
        <div><b>{bestMonth}</b><span>BEST MONTH</span></div>
        <div><b>{site.windows[profile].join('–')}</b><span>FIELD WINDOW</span></div>
      </div>
      <div className="mc-time-decl">
        <span>SOLAR DECLINATION</span>
        <b>{declLabel}</b>
        <em>SEASONAL TERMINATOR SHIFT</em>
      </div>
      <div className="mc-kicker" style={{ marginTop: 24 }}>CAMPAIGN WINDOWS</div>
      {campaign.assignments.map((a) => (
        <div className="mc-window-row" key={a.siteId}>
          <span>{a.site}</span>
          <b>{a.window.join('–')}</b>
        </div>
      ))}
      <div className="mc-note">
        The optimizer already uses these monthly climatologies. Moving the month changes the visual layer and the site score; the campaign window remains the model's recommendation.
      </div>
    </div>
  );
}

function IntervenePanel({ site, profile, campaign }: { site: Site; profile: ProfileKey; campaign: Campaign }) {
  const [on, setOn] = useState<Record<string, boolean>>({});
  const d = site.scores[profile];
  const base = d.total;
  const enabled = Object.values(on).filter(Boolean).length;
  const withInterventions = Math.min(100, base + enabled * 7);
  const gaps = (Object.keys(d.dimensions) as (keyof Dimensions)[]).filter((k) => d.dimensions[k] < 55);
  return (
    <div className="mc-stack">
      <div className="mc-kicker">INTERVENTION LAB</div>
      <h2 className="mc-h2">WHAT EARTH<br />CANNOT PROVIDE.</h2>
      <div className="mc-p">The analog is real. The missing physics is not. Turn interventions on to see how the site becomes a testbed.</div>
      <div className="mc-intervention-score">
        <div><b>{base.toFixed(0)}</b><span>EARTH ONLY</span></div>
        <ArrowRight size={14} />
        <div><b style={{ color: 'var(--green)' }}>{withInterventions.toFixed(0)}</b><span>WITH FACILITY</span></div>
      </div>
      <div className="mc-kicker" style={{ marginTop: 22 }}>CONDITION MATRIX / EARTH</div>
      {(Object.keys(d.dimensions) as (keyof Dimensions)[]).map((k) => {
        const v = d.dimensions[k];
        const status = v > 80 ? 'MATCHED' : v > 55 ? 'PARTIAL' : 'GAP';
        return (
          <div className="mc-condition" key={k}>
            <span>{DIMENSION_LABELS[k]}</span>
            <b className={v > 80 ? 'ok' : v > 55 ? 'warn' : 'bad'}>{status}</b>
            <em>{v.toFixed(0)}</em>
          </div>
        );
      })}
      <div className="mc-kicker" style={{ marginTop: 22 }}>FACILITY / SYNTHETIC</div>
      {[
        ['thermal', 'Thermal vacuum chamber', 'Extends the ambient thermal cycle'],
        ['dust', 'Dust chamber', 'Matches the target aerosol / abrasion load'],
        ['light', 'Solar simulator', 'Matches spectrum and illumination'],
        ['pressure', 'Pressure / vacuum facility', 'Provides the missing atmosphere'],
        ['gravity', 'Gravity offload', 'Parabolic flight / suspension'],
        ['radiation', 'Radiation facility', 'Provides the missing radiation environment'],
      ].map(([k, label, sub]) => (
        <button className={`mc-toggle ${on[k] ? 'on' : ''}`} key={k} onClick={() => setOn((v) => ({ ...v, [k]: !v[k] }))}>
          <span className="mc-toggle-switch"><i /></span>
          <span><b>{label}</b><em>{sub}</em></span>
        </button>
      ))}
      <div className="mc-gaps">
        <div className="mono" style={{ color: 'var(--amber)' }}>EARTH-ONLY GAPS</div>
        {gaps.length ? gaps.map((g) => <span key={g}>{DIMENSION_LABELS[g]}</span>) : <span style={{ color: 'var(--green)' }}>No dimensional gap below the threshold.</span>}
        <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 8 }}>FACILITY-ONLY / {campaign.interventions.join(' · ')}</div>
      </div>
      <div className="mc-note">Planning model, not a physics simulation. Gravity, pressure and radiation remain facility-only.</div>
    </div>
  );
}

function CampaignPanel({
  data: d, profile, campaign, scenario, setScenario, onBriefing,
}: {
  data: OdysseyData;
  profile: ProfileKey;
  campaign: Campaign;
  scenario: string;
  setScenario: (s: string) => void;
  onBriefing: (hash?: string) => void;
}) {
  const variants = (d.campaignVariants?.[profile] ?? {}) as Record<string, Campaign>;
  const score = readiness(profile, campaign);
  return (
    <div className="mc-stack">
      <div className="mc-kicker">MISSION CAMPAIGN</div>
      <h2 className="mc-h2">THREE SITES.<br />ONE CAMPAIGN.</h2>
      <div className="mc-scenarios">
        {Object.keys(variants).map((k) => (
          <button key={k} className={scenario === k ? 'active' : ''} onClick={() => setScenario(k)}>
            {variants[k].scenarioLabel ?? k}
          </button>
        ))}
      </div>
      <div className="mc-p">{campaign.scenarioNote}</div>
      <div className="mc-campaign-sites">
        {campaign.assignments.map((a, i) => (
          <div className="mc-campaign-site" key={a.siteId}>
            <div className="mc-campaign-num">0{i + 1}</div>
            <div>
              <b>{a.site}</b>
              <span>{a.experiment} · {a.window.join('–')}</span>
            </div>
            <em>{a.score.toFixed(1)}</em>
          </div>
        ))}
      </div>
      <div className="mc-legs">
        {campaign.legs.map((leg, i) => (
          <div className="mc-leg" key={`${leg.fromId}-${leg.toId}`}>
            <span>0{i + 1}</span>
            <b>{leg.fromAirport} → {leg.toAirport}</b>
            <em>{leg.hours.toFixed(1)}h · ${leg.cost.toLocaleString()}</em>
          </div>
        ))}
      </div>
      <div className="mc-campaign-stats">
        <div><b>{campaign.totalDays}</b><span>DAYS</span></div>
        <div><b>{campaign.travelHours.toFixed(1)}h</b><span>TRAVEL</span></div>
        <div><b>${(campaign.travelCost / 1000).toFixed(1)}k</b><span>EST. COST</span></div>
        <div><b style={{ color: score > 80 ? 'var(--green)' : 'var(--amber)' }}>{score}</b><span>READINESS</span></div>
      </div>
      <button className="mc-action primary" onClick={() => onBriefing('#campaign')}>OPEN FULL MISSION DOSSIER <ArrowRight size={14} /></button>
      <button className="mc-link-btn" onClick={() => onBriefing('#travel')}>Open route map <Route size={12} /></button>
    </div>
  );
}

