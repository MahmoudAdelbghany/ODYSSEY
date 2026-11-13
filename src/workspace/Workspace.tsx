import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type AgentEvent, type RunRow } from '../agent/api';
import type { Site } from '../types';
import { useRun } from './useRun';
import { Badge, Disclosure, SectionHeader } from './ui';
import { CampaignSection, CandidatesSection, GapsSection, MissionSection, ReportSection } from './sections';
import { SiteSection } from './SiteSection';
import { InterventionsSection } from './InterventionsSection';
import { clean, PHASES, TOOL_LABEL } from './labels';

export type SectionKey = 'brief' | 'mission' | 'candidates' | 'site' | 'gaps' | 'interventions' | 'campaign' | 'report';

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'brief', label: 'Brief' },
  { key: 'mission', label: 'Mission' },
  { key: 'candidates', label: 'Candidates' },
  { key: 'site', label: 'Site' },
  { key: 'gaps', label: 'Where Earth fails' },
  { key: 'interventions', label: 'Interventions' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'report', label: 'Report' },
];

export interface GlobeView {
  highlightIds: string[];
  campaignIds: string[];
  showCampaign: boolean;
}

export function Workspace({
  brief,
  onBriefChange,
  runId,
  onRunId,
  sites,
  selectedSiteId,
  onSelectSite,
  onDive,
  onGlobe,
  onOpenDiscovery,
  onExit,
}: {
  brief: string;
  onBriefChange: (text: string) => void;
  runId: string | null;
  onRunId: (id: string | null) => void;
  sites: Site[];
  selectedSiteId: string | null;
  onSelectSite: (id: string) => void;
  onDive: () => void;
  onGlobe: (view: GlobeView) => void;
  onOpenDiscovery: () => void;
  onExit: () => void;
}) {
  const { run, state, events, error } = useRun(runId);
  const [section, setSection] = useState<SectionKey>('mission');
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const running = run?.status === 'running' || run?.status === 'queued';
  const done = run?.status === 'completed';
  const experiments = state?.mission?.experiments ?? [];
  const activeExperiment = experiments.find((e) => e.id === experimentId) ?? experiments[0] ?? null;
  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null;
  const target = state?.parsed?.target ?? 'moon_south_pole';

  const ready: Record<SectionKey, boolean> = {
    brief: true,
    mission: Boolean(state?.mission),
    candidates: Boolean(activeExperiment && state?.candidates[activeExperiment.id]),
    site: Boolean(selectedSite),
    gaps: Object.keys(state?.earthWideGaps ?? {}).length > 0,
    interventions: (state?.interventions.length ?? 0) > 0,
    campaign: Boolean(state?.campaign),
    report: Boolean(done && state?.report),
  };

  const keptKey = (activeExperiment && state?.candidates[activeExperiment.id]?.filter((c) => c.decision !== 'rejected').slice(0, 6).map((c) => c.siteId).join(',')) || '';
  const plan = state?.campaign?.plans.find((p) => p.id === planId) ?? state?.campaign?.plans[0];
  const stopsKey = plan?.stops.map((s) => s.siteId).join(',') ?? '';
  const showCampaign = section === 'campaign';
  const highlightKey = section === 'campaign' ? stopsKey : section === 'site' ? selectedSiteId ?? '' : keptKey;

  useEffect(() => {
    onGlobe({ highlightIds: highlightKey ? highlightKey.split(',') : [], campaignIds: stopsKey ? stopsKey.split(',') : [], showCampaign });
  }, [highlightKey, stopsKey, showCampaign, onGlobe]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [section]);

  const runBrief = run?.brief;
  useEffect(() => {
    if (runBrief) onBriefChange(runBrief);
  }, [runBrief, onBriefChange]);

  const go = (key: SectionKey) => {
    setSection(key);
    setNavOpen(false);
  };
  const openSite = (id: string) => {
    onSelectSite(id);
    go('site');
  };

  const phaseIndex = Math.max(0, PHASES.findIndex((p) => p.key === state?.phase));
  const lastStep = [...events].reverse().find((e) => e.type === 'tool_result');
  const statusText = running
    ? `${PHASES[phaseIndex]?.label ?? 'Working'}${lastStep ? `. Last step: ${TOOL_LABEL[lastStep.payload.tool] ?? lastStep.payload.tool}` : ''}`
    : done
      ? 'Analysis complete'
      : run?.status === 'failed'
        ? 'The analysis stopped before finishing'
        : run?.status === 'cancelled'
          ? 'Analysis cancelled'
          : runId
            ? 'Loading'
            : 'No analysis yet';

  return (
    <div className="ws ui">
      <header className="ws-topbar">
        <button type="button" className="ws-brand" onClick={onExit} aria-label="Back to the start screen">
          <span className="orb-mark" aria-hidden="true" />
          ODYSSEY
        </button>
        <button type="button" className="btn btn-ghost btn-sm ws-menu" onClick={() => setNavOpen((o) => !o)} aria-expanded={navOpen}>
          Sections
        </button>
        <div className="ws-status" aria-live="polite">
          <div className="ws-status-text">
            {running ? <span className="ws-spinner" aria-hidden="true" /> : null}
            <span>{statusText}</span>
          </div>
          {running ? (
            <div className="progress" aria-label={`Step ${phaseIndex + 1} of ${PHASES.length}`}>
              <span style={{ width: `${((phaseIndex + 0.5) / PHASES.length) * 100}%` }} />
            </div>
          ) : null}
        </div>
        <div className="row ws-top-actions">
          {runId ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActivityOpen((o) => !o)} aria-expanded={activityOpen}>
              Activity
            </button>
          ) : null}
          {running && runId ? (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => api.cancel(runId)}>Stop</button>
          ) : null}
          {runId && (run?.status === 'failed' || run?.status === 'cancelled') ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.resume(runId).then(() => onRunId(runId))}>Resume</button>
          ) : null}
        </div>
      </header>

      <nav className={`ws-nav${navOpen ? ' is-open' : ''}`} aria-label="Sections">
        <ol>
          {SECTIONS.map((s, i) => (
            <li key={s.key}>
              <button type="button" aria-current={section === s.key ? 'page' : undefined} onClick={() => go(s.key)} className={ready[s.key] ? 'is-ready' : ''}>
                <span className="ws-nav-num num">{i + 1}</span>
                <span>{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <main className="ws-panel" ref={panelRef}>
        {error ? <div className="notice notice-error">The analysis server did not respond: {error}</div> : null}
        {section === 'brief' ? (
          <BriefSection brief={brief} onBriefChange={onBriefChange} run={run} running={running} onRunId={onRunId} />
        ) : section === 'mission' ? (
          <MissionSection state={state} running={running} />
        ) : section === 'candidates' ? (
          <CandidatesSection state={state} running={running} experimentId={activeExperiment?.id ?? null} onExperiment={setExperimentId} selectedSiteId={selectedSiteId} onSelectSite={onSelectSite} onOpenSite={openSite} onOpenDiscovery={onOpenDiscovery} />
        ) : section === 'site' ? (
          <SiteSection site={selectedSite} state={state} target={target} onDive={onDive} onBack={() => go('candidates')} />
        ) : section === 'gaps' ? (
          <GapsSection state={state} running={running} experimentId={activeExperiment?.id ?? null} onExperiment={setExperimentId} onSelectSite={openSite} />
        ) : section === 'interventions' ? (
          <InterventionsSection state={state} running={running} />
        ) : section === 'campaign' ? (
          <CampaignSection state={state} running={running} planId={plan?.id ?? null} onPlan={setPlanId} onSelectSite={openSite} />
        ) : runId ? (
          <ReportSection runId={runId} state={state} done={done} />
        ) : null}
        <SectionFooter section={section} onGo={go} />
      </main>

      {activityOpen && runId ? <Activity events={events} run={run} phaseIndex={phaseIndex} budgets={state?.budgets ?? null} onClose={() => setActivityOpen(false)} /> : null}
    </div>
  );
}

function SectionFooter({ section, onGo }: { section: SectionKey; onGo: (s: SectionKey) => void }) {
  const i = SECTIONS.findIndex((s) => s.key === section);
  const prev = SECTIONS[i - 1];
  const next = SECTIONS[i + 1];
  return (
    <div className="ws-section-foot">
      {prev ? <button type="button" className="btn btn-ghost" onClick={() => onGo(prev.key)}>← {prev.label}</button> : <span />}
      {next ? <button type="button" className="btn btn-secondary" onClick={() => onGo(next.key)}>{next.label} →</button> : null}
    </div>
  );
}

function BriefSection({ brief, onBriefChange, run, running, onRunId }: { brief: string; onBriefChange: (t: string) => void; run: RunRow | null; running: boolean; onRunId: (id: string | null) => void }) {
  const [planner, setPlanner] = useState<'auto' | 'deterministic'>('auto');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<RunRow[]>([]);
  useEffect(() => {
    api.runs().then((r) => setHistory(r.runs.slice(0, 8))).catch(() => undefined);
  }, [run?.id, run?.status]);
  const changed = run ? brief.trim() !== run.brief.trim() : true;
  const start = () => {
    setBusy(true);
    setErr(null);
    api
      .startRun(brief, planner)
      .then(({ run: r }) => onRunId(r.id))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <SectionHeader title="Brief" />
      <div className="stack">
        <label className="field">
          <span className="field-label">Mission brief</span>
          <textarea className="textarea" rows={5} value={brief} onChange={(e) => onBriefChange(e.target.value)} placeholder="Describe the mission, its experiments and its duration." />
        </label>
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={busy || running || brief.trim().length < 12} onClick={start}>
            {run ? 'Run a new analysis' : 'Analyze mission'}
          </button>
          {running ? <span className="subtle">An analysis is already running.</span> : run && !changed ? <span className="subtle">This brief matches the current analysis.</span> : null}
        </div>
        {err ? <div className="notice notice-error">{err}</div> : null}
        <Disclosure summary="Analysis options">
          <label className="field">
            <span className="field-label">Planner</span>
            <select className="select" value={planner} onChange={(e) => setPlanner(e.target.value as 'auto' | 'deterministic')}>
              <option value="auto">Language model with analysis tools</option>
              <option value="deterministic">Analysis tools only, fixed order</option>
            </select>
          </label>
        </Disclosure>
        {run ? (
          <div className="card">
            <h3 className="card-title">Current analysis</h3>
            <table className="table">
              <tbody>
                <tr><td>Status</td><td className="strong">{run.status}</td></tr>
                <tr><td>Planner</td><td className="strong">{run.planner.replace('llm', 'language model').replace('+deterministic-completion', ', finished by fixed steps')}</td></tr>
                {run.model ? <tr><td>Model</td><td className="strong num">{run.model}</td></tr> : null}
                <tr><td>Started</td><td className="strong">{new Date(run.createdAt).toLocaleString()}</td></tr>
              </tbody>
            </table>
          </div>
        ) : null}
        {history.length ? (
          <Disclosure summary="Previous analyses" meta={`${history.length}`}>
            <ul className="ws-history">
              {history.map((h) => (
                <li key={h.id}>
                  <span>
                    <b>{h.brief.length > 90 ? `${h.brief.slice(0, 90)}…` : h.brief}</b>
                    <span className="subtle">{new Date(h.createdAt).toLocaleString()}, {h.status}</span>
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRunId(h.id)} disabled={h.id === run?.id}>
                    {h.id === run?.id ? 'Open now' : 'Open'}
                  </button>
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}
      </div>
    </>
  );
}

function Activity({ events, run, phaseIndex, budgets, onClose }: { events: AgentEvent[]; run: RunRow | null; phaseIndex: number; budgets: { toolCalls: number; llmTurns: number; searchCalls: number; sourceFetches: number } | null; onClose: () => void }) {
  const steps = useMemo(() => events.filter((e) => e.type === 'tool_result' || e.type === 'llm_turn' || (e.type === 'status' && e.payload?.note) || e.type === 'error'), [events]);
  const [showModel, setShowModel] = useState(false);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [steps.length]);
  const running = run?.status === 'running' || run?.status === 'queued';
  return (
    <aside className="ws-activity ui" aria-label="Agent activity">
      <div className="spread">
        <h2>Activity</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>
      <ol className="ws-phases">
        {PHASES.map((p, i) => (
          <li key={p.key} className={i < phaseIndex || run?.status === 'completed' ? 'is-done' : i === phaseIndex && running ? 'is-now' : ''}>{p.label}</li>
        ))}
      </ol>
      {budgets ? <p className="subtle">{budgets.toolCalls} tool calls, {budgets.searchCalls} searches, {budgets.sourceFetches} sources read, {budgets.llmTurns} model turns.</p> : null}
      <label className="ws-toggle">
        <input type="checkbox" checked={showModel} onChange={(e) => setShowModel(e.target.checked)} /> Show model messages
      </label>
      <ol className="ws-steps">
        {steps.map((e) =>
          e.type === 'llm_turn' ? (
            showModel && e.payload.content ? (
              <li key={e.seq} className="ws-step is-model"><p>{clean(e.payload.content)}</p></li>
            ) : null
          ) : e.type === 'tool_result' ? (
            <li key={e.seq} className={`ws-step${e.payload.ok ? '' : ' is-error'}`}>
              <div className="spread">
                <b>{TOOL_LABEL[e.payload.tool] ?? e.payload.tool}</b>
                <span className="subtle num">{(e.payload.ms / 1000).toFixed(1)} s</span>
              </div>
              <p>{clean(e.payload.ok ? e.payload.summary : e.payload.error)}</p>
              <code className="subtle">{e.payload.tool}</code>
            </li>
          ) : (
            <li key={e.seq} className="ws-step is-note"><p>{clean(e.payload.note ?? e.payload.message)}</p></li>
          ),
        )}
        {running ? <li className="ws-step is-note"><p><span className="ws-spinner" aria-hidden="true" /> Waiting for the next step</p></li> : null}
      </ol>
      <div ref={end} />
      {run?.status === 'failed' && run.error ? <Badge tone="bad">{clean(run.error)}</Badge> : null}
    </aside>
  );
}
