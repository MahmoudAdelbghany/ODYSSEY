import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import raw from './data/odyssey.json';
import type { OdysseyData, ProfileKey, SiteImageryData, SiteTerrainData } from './types';
import { OrbitalPlanet } from './components/OrbitalPlanet';
import { SiteOrbit } from './components/SiteOrbit';
import { DiscoveryMode } from './components/DiscoveryMode';
import { getPromotedImagery, getPromotedMeta, getPromotedSite, getPromotedTerrain, isPromotedRegion } from './generated';
import { decomposeMission, evaluateMission } from './mission';
import { api } from './agent/api';
import { Workspace, type GlobeView } from './workspace/Workspace';
import { GlobeHint } from './workspace/GlobeHint';
import { useGlobeHint } from './workspace/useGlobeHint';
import { About } from './workspace/About';
import { ExploreButton, SearchTicker } from './workspace/ExploreButton';
import globalDiscovery from './data/globalDiscovery.json';
import siteImageryRaw from './data/siteImagery.json';
import siteTerrainRaw from './data/siteTerrain.json';

const data = raw as unknown as OdysseyData;
const siteImagery = siteImageryRaw as unknown as SiteImageryData;
const siteTerrain = siteTerrainRaw as unknown as SiteTerrainData;

const DEFAULT_BRIEF =
  'Plan a seven-day simulated lunar surface expedition that includes geological sampling, rover navigation, equipment deployment, thermal survival and dust mitigation.';

const EXAMPLES: Array<{ label: string; brief: string }> = [
  { label: 'Lunar expedition', brief: DEFAULT_BRIEF },
  { label: 'Lunar south pole base', brief: 'Plan a permanent lunar south pole base. Prioritize regolith construction, thermal survival, subsurface shielding and continuous power.' },
  { label: 'Mars rover and samples', brief: 'Plan a 14-day Mars analog campaign for dusty rover operations, geological sampling and sample return.' },
];

type Mode = 'opening' | 'workspace';

function profileFor(brief: string): ProfileKey {
  const q = brief.toLowerCase();
  if (q.includes('mars')) return 'mars_landing';
  if (q.includes('expedition') || /\b(\d+|seven|fourteen)[- ]day\b/.test(q)) return 'expedition';
  return 'lunar_base';
}

const initialRun = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('run') : null;

function rememberRun(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('run', id);
  else url.searchParams.delete('run');
  window.history.replaceState(null, '', url);
}

export default function OrbitalExperience(_props: { onOpenBriefing?: (hash?: string) => void }) {
  const [mode, setMode] = useState<Mode>(initialRun ? 'workspace' : 'opening');
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [runId, setRunIdState] = useState<string | null>(initialRun);
  const setRunId = useCallback((id: string | null) => {
    setRunIdState(id);
    rememberRun(id);
  }, []);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [globe, setGlobe] = useState<GlobeView>({ highlightIds: [], campaignIds: [], showCampaign: false });
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [siteOrbit, setSiteOrbit] = useState(false);
  const [diving, setDiving] = useState(false);
  const [siteClosing, setSiteClosing] = useState(false);
  const [promotedSiteId, setPromotedSiteId] = useState<string | null>(null);

  const profile = profileFor(brief);
  const mission = useMemo(() => decomposeMission(brief, profile, data.profiles[profile].short, data.profiles[profile].experiments), [brief, profile]);
  const matrix = useMemo(() => evaluateMission(mission, data.sites, siteTerrain.sites), [mission]);
  const missionScores = useMemo(() => Object.fromEntries(data.sites.map((s) => [s.id, matrix.bySite[s.id]?.score ?? 0])), [matrix]);

  const selected = selectedId ? data.sites.find((s) => s.id === selectedId) ?? null : null;
  const promotedSite = useMemo(() => (promotedSiteId ? getPromotedSite(promotedSiteId) : null), [promotedSiteId]);
  const promotedMeta = useMemo(() => (promotedSiteId ? getPromotedMeta(promotedSiteId) : null), [promotedSiteId]);

  const onGlobe = useCallback((view: GlobeView) => setGlobe(view), []);
  const hint = useGlobeHint();
  const briefRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (mode !== 'opening') return;
    const el = briefRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [mode]);

  const analyze = () => {
    setStarting(true);
    setStartError(null);
    api
      .startRun(brief)
      .then(({ run }) => {
        setRunId(run.id);
        setSelectedId(null);
        setMode('workspace');
      })
      .catch((e: Error) =>
        setStartError(/fetch|HTTP 5/i.test(e.message) ? 'The analysis server is not running. Start it with npm run server, then try again.' : e.message),
      )
      .finally(() => setStarting(false));
  };

  const dive = () => {
    if (!selectedId) return;
    setPromotedSiteId(null);
    setSiteOrbit(true);
    setDiving(true);
    setSiteClosing(false);
    window.setTimeout(() => setDiving(false), 4600);
  };

  const openPromotedSite = (id: string) => {
    if (!isPromotedRegion(id)) return;
    setDiscoveryOpen(false);
    setPromotedSiteId(id);
    setSiteOrbit(true);
    setDiving(true);
    setSiteClosing(false);
    window.setTimeout(() => setDiving(false), 4600);
  };

  const closeSite = () => {
    setSiteClosing(true);
    window.setTimeout(() => {
      setSiteOrbit(false);
      setSiteClosing(false);
      setDiving(false);
      setPromotedSiteId(null);
    }, 560);
  };

  return (
    <div className={`orb${siteOrbit ? ' is-site' : ''} mode-${mode}`}>
      <div className="orb-stars" />
      <div className={mode === 'workspace' ? 'ws-globe' : 'globe-full'} onPointerDownCapture={hint.dismiss} onWheelCapture={hint.dismiss}>
        <OrbitalPlanet
          sites={data.sites}
          profile={profile}
          selectedId={selectedId}
          mode={mode === 'workspace' ? 'discovery' : 'opening'}
          paused={siteOrbit && !diving}
          siteOrbit={siteOrbit}
          rankedIds={matrix.rankedSiteIds}
          missionScores={missionScores}
          highlightIds={globe.highlightIds}
          lensRightInset={40}
          stage={globe.showCampaign ? 'campaign' : 'discovery'}
          sunMonth={null}
          campaignSiteIds={globe.showCampaign ? globe.campaignIds : []}
          onSelect={(id) => setSelectedId(id)}
          lens={null}
          framing={mode === 'workspace' ? 'centered' : 'offset'}
          spawn={mode === 'opening' && !discoveryOpen}
        />
      </div>
      <div className="orb-vignette" />
      {!siteOrbit && hint.visible ? (
        <div className={`hint-layer ${mode === 'workspace' ? 'ws-globe' : 'globe-full'}`}>
          <GlobeHint visible />
        </div>
      ) : null}

      {mode === 'opening' ? (
        <div className="start ui">
          <header className="start-top">
            <span className="ws-brand">
              <span className="orb-mark" aria-hidden="true" />
              ODYSSEY
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAboutOpen(true)}>
              About the project
            </button>
          </header>
          <div className="start-body">
            <span className="start-kicker">Planetary mission intelligence</span>
            <h1>Rehearse the Moon and Mars on Earth.</h1>
            <div className="start-form">
              <label className="field">
                <span className="field-label">Mission brief</span>
                <textarea ref={briefRef} className="textarea" rows={5} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Describe the mission, its experiments and its duration." />
              </label>
              <div className="row start-examples">
                <span className="subtle">Examples:</span>
                {EXAMPLES.map((x) => (
                  <button key={x.label} type="button" className="btn btn-secondary btn-sm" onClick={() => setBrief(x.brief)} aria-pressed={brief === x.brief}>
                    {x.label}
                  </button>
                ))}
              </div>
              {startError ? <div className="notice notice-error">{startError}</div> : null}
              <div className="row">
                <button type="button" className="btn btn-primary btn-lg" onClick={analyze} disabled={starting || brief.trim().length < 12}>
                  {starting ? 'Starting…' : 'Analyze mission →'}
                </button>
                <ExploreButton sites={data.sites} onClick={() => setDiscoveryOpen(true)} />
              </div>
              <SearchTicker total={data.sites.length} cells={globalDiscovery.counts.usableLandCells} />
            </div>
          </div>
        </div>
      ) : (
        <Workspace
          brief={brief}
          onBriefChange={setBrief}
          runId={runId}
          onRunId={setRunId}
          sites={data.sites}
          selectedSiteId={selectedId}
          onSelectSite={setSelectedId}
          onDive={dive}
          onGlobe={onGlobe}
          onOpenDiscovery={() => setDiscoveryOpen(true)}
          onExit={() => {
            setMode('opening');
            rememberRun(null);
          }}
        />
      )}

      {siteOrbit && (promotedSite || selected) ? (
        <SiteOrbit
          site={(promotedSite ?? selected)!}
          profile={profile}
          profileLabel={data.profiles[profile].short}
          rank={promotedSite ? 1 : matrix.rankedSiteIds.indexOf(selected!.id) + 1}
          imagery={promotedSite ? getPromotedImagery(promotedSiteId!) : siteImagery.sites[selected!.id]}
          terrain={promotedSite ? getPromotedTerrain(promotedSiteId!) : siteTerrain.sites[selected!.id]}
          focusExperimentId={null}
          closing={siteClosing}
          onClose={closeSite}
          origin={promotedSite ? 'generated' : 'curated'}
          candidateTotal={39}
          missingDimensions={promotedMeta?.missingDimensions ?? []}
          coarseScore={promotedMeta?.coarseScore}
          cellCount={promotedMeta?.cellCount}
          classification={promotedMeta?.classification}
        />
      ) : null}

      {aboutOpen ? <About onClose={() => setAboutOpen(false)} /> : null}

      {discoveryOpen ? <DiscoveryMode onClose={() => setDiscoveryOpen(false)} onOpenGeneratedSite={openPromotedSite} /> : null}
    </div>
  );
}
