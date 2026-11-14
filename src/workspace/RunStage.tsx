import { useEffect, useMemo, useState } from 'react';
import type { AgentEvent, AgentStateView } from '../agent/api';
import type { Site } from '../types';
import { PHASES, TOOL_LABEL } from './labels';
import { TargetScan, type ScanBody, type ScanSite } from './TargetScan';

const TARGET: Record<string, { body: ScanBody; lat: number; lon: number; label: string; site: string }> = {
  moon_south_pole: { body: 'Moon', lat: -89.9, lon: 0, label: 'Lunar south pole · 89.9°S', site: 'Lunar south pole' },
  mars_jezero: { body: 'Mars', lat: 18.44, lon: 77.45, label: 'Jezero crater · 18.4°N 77.5°E', site: 'Jezero crater' },
};
const FOCUS_MS = 8000;

/**
 * What the globe area shows while an analysis runs: the target body and Earth scanned together,
 * linked by a beam from the target site to Earth. Ranked Earth sites appear as they arrive and the beam
 * steps through them. The panel lists the real pipeline phases and counts from the run state.
 */
export function RunStage({ state, events, running, sites }: { state: AgentStateView | null; events: AgentEvent[]; running: boolean; sites: Site[] }) {
  const t = state?.parsed?.target ? TARGET[state.parsed.target] : undefined;
  const ranked = useMemo<Array<ScanSite & { name: string }>>(() => {
    const seen = new Map<string, ScanSite & { name: string }>();
    for (const list of Object.values(state?.candidates ?? {})) {
      for (const c of list) {
        if (c.decision === 'rejected' || seen.has(c.siteId)) continue;
        const s = sites.find((x) => x.id === c.siteId);
        if (s) seen.set(c.siteId, { id: s.id, lat: s.lat, lon: s.lon, name: s.name.split(',')[0] });
      }
    }
    return [...seen.values()];
  }, [state?.candidates, sites]);
  const handedOff = ranked.length > 0;
  const scanning = running && Boolean(t) && !handedOff;
  // Keep the scene mounted through its fade-out, then release the WebGL context.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setMounted(scanning), scanning ? 0 : 1200);
    return () => window.clearTimeout(id);
  }, [scanning]);
  const [focus, setFocus] = useState<'target' | 'earth'>('target');
  useEffect(() => {
    if (!scanning) return;
    const id = window.setInterval(() => setFocus((f) => (f === 'target' ? 'earth' : 'target')), FOCUS_MS);
    return () => window.clearInterval(id);
  }, [scanning]);
  if (!running) return null;
  const phaseIndex = Math.max(0, PHASES.findIndex((p) => p.key === state?.phase));
  const steps = events.filter((e) => e.type === 'tool_result');
  const last = steps[steps.length - 1];
  const experiments = state?.mission?.experiments ?? [];
  const reqs = experiments.reduce((n, e) => n + e.requirements.length, 0);
  const rankedExps = Object.keys(state?.candidates ?? {}).length;
  const scope = handedOff || focus === 'earth' ? 'earth' : t?.body.toLowerCase() ?? 'earth';
  return (
    <div className="run-stage" aria-live="polite">
      {t && (mounted || scanning) ? (
        <div className={`tscan${scanning ? '' : ' is-out'}`}>
          <TargetScan body={t.body} lat={t.lat} lon={t.lon} pulse={steps.length} focus={handedOff ? 'earth' : focus} sites={ranked} siteIndex={0} />
        </div>
      ) : null}
      <aside className={`run-hud run-${scope}${handedOff ? " is-compact" : ""}`}>
        <span className="run-kicker" key={`${focus}-${handedOff}`}>
          {!t ? 'Reading the brief' : handedOff ? `Earth · ${ranked.length} analog sites ranked` : focus === 'earth' ? 'Screening Earth for analogs' : `Scanning ${t.label}`}
        </span>
        <ol className="run-steps">
          {PHASES.slice(0, -1).map((p, i) => (
            <li key={p.key} className={i < phaseIndex ? 'is-done' : i === phaseIndex ? 'is-now' : ''}>
              <span className="run-dot" aria-hidden="true" />
              {p.label}
            </li>
          ))}
        </ol>
        <dl className="run-stats">
          <div><dt>Experiments</dt><dd className="num">{experiments.length || '—'}</dd></div>
          <div><dt>Requirements</dt><dd className="num">{reqs || '—'}</dd></div>
          <div><dt>Earth sites ranked</dt><dd className="num">{ranked.length || '—'}</dd>{rankedExps ? <small className="run-sub">{rankedExps} of {experiments.length || '?'} experiments ranked</small> : null}</div>
          <div><dt>Sources found</dt><dd className="num">{state?.evidence.length || '—'}</dd></div>
        </dl>
        {last ? <p className="run-last" key={steps.length}><span>Step {steps.length}</span> {TOOL_LABEL[last.payload.tool] ?? last.payload.tool}</p> : null}
      </aside>
    </div>
  );
}
