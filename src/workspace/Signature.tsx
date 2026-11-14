import { useEffect, useState } from 'react';
import type { AgentStateView, CandidateView, RunRow } from '../agent/api';
import type { Site } from '../types';
import { Badge, Empty, SectionHeader } from './ui';
import { clean, DECISION } from './labels';
import type { SectionKey } from './Workspace';
import { RankingEvolution } from './Visuals';
import { experimentVisual } from './visuals';

const TARGET_NAME: Record<string, string> = { moon_south_pole: 'Lunar south pole', mars_jezero: 'Mars, Jezero crater' };

/** Mission control: the brief as a mission plan (real parsed values only). */
export function MissionControl({ state, run, onOpenExperiments }: { state: AgentStateView | null; run: RunRow | null; onOpenExperiments?: () => void }) {
  const p = state?.parsed;
  const experiments = state?.mission?.experiments ?? [];
  if (!p || !experiments.length) return null;
  const target = p.target ? TARGET_NAME[p.target] ?? p.target : 'Unresolved target';
  const reqs = experiments.reduce((n, e) => n + e.requirements.length, 0);
  return (
    <section className="mctl card reveal" aria-label="Mission control">
      <span className="mctl-kicker">Mission control</span>
      <h2 className="mctl-title">{target} {p.durationDays ? `· ${p.durationDays}-day` : ''} {p.body === 'Mars' ? 'mission' : 'expedition'}</h2>
      <p className="muted">Your brief becomes {experiments.length} coordinated experiments with {reqs} measurable requirements.</p>
      <div className="mctl-stats">
        <div><b className="num">{p.durationDays ?? '—'}</b><span>{p.durationDays ? 'days' : 'duration not stated'}</span></div>
        <div><b className="num">{experiments.length}</b><span>experiments</span></div>
        <div><b>{p.body}</b><span>target body</span></div>
        <div><b className="num">{run?.status === 'completed' ? 'Done' : run?.status ?? '—'}</b><span>analysis</span></div>
      </div>
      <ol className="mctl-tiles" aria-label="Mission sequence" style={{ ["--n" as string]: Math.min(experiments.length, 6) }}>
        {experiments.map((e, i) => {
          const v = experimentVisual(`${e.id} ${e.name}`, p.body);
          return (
            <li key={e.id} style={{ animationDelay: `${i * 70}ms` }} className="reveal">
              <button type="button" className="mctl-tile" onClick={onOpenExperiments} aria-label={`Open the experiments: ${e.name}`}>
                <img src={v.src} alt={v.alt} loading="lazy" decoding="async" style={{ objectPosition: v.position ?? 'center' }} />
                <span className="mctl-tile-text"><span className="num">{String(i + 1).padStart(2, '0')}</span><b>{e.shortName || e.name}</b></span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="subtle mctl-credit">Context photographs from NASA missions (Apollo, Curiosity, Perseverance, LRO). They illustrate each experiment and are not data from this analysis.</p>
    </section>
  );
}

/** Multi-mission tradeoff explorer: sites × experiments with separate indicators. */
export function TradeoffSection({ state, running, sites, onOpenSite }: { state: AgentStateView | null; running: boolean; sites: Site[]; onOpenSite: (id: string) => void }) {
  const experiments = state?.mission?.experiments ?? [];
  const [showAll, setShowAll] = useState(false);
  const [cell, setCell] = useState<{ siteId: string; expId: string } | null>(null);
  const profile = state?.parsed?.profile ?? 'expedition';
  const rows = (() => {
    const ids = new Set<string>();
    for (const e of experiments) for (const c of state?.candidates[e.id] ?? []) ids.add(c.siteId);
    const rank = (c?: CandidateView) => (c ? ({ viable: 2, downgraded: 1, rejected: 0 } as const)[c.decision] * 1000 + (c.experimentScore ?? 0) : -1);
    return [...ids]
      .map((id) => {
        const per = Object.fromEntries(experiments.map((e) => [e.id, state?.candidates[e.id]?.find((c) => c.siteId === id)]));
        const vals = Object.values(per);
        return { id, name: vals.find(Boolean)?.name ?? id, per, best: Math.max(...vals.map(rank)), usable: vals.filter((c) => c && c.decision !== 'rejected').length };
      })
      .sort((a, b) => b.usable - a.usable || b.best - a.best);
  })();
  if (!experiments.length || !rows.length) {
    return (
      <>
        <SectionHeader title="Tradeoffs" />
        <Empty title="No rankings yet">{running ? 'The matrix appears once sites are ranked for every experiment.' : 'This run has no candidate rankings.'}</Empty>
      </>
    );
  }
  const shown = showAll ? rows : rows.slice(0, 12);
  const sel = cell ? rows.find((r) => r.id === cell.siteId)?.per[cell.expId] : null;
  const selExp = experiments.find((e) => e.id === cell?.expId);
  return (
    <>
      <SectionHeader title="Tradeoffs" lead="Every site against every experiment. A site can suit one experiment and fail another." />
      <div className="tradeoff-legend subtle">
        <span><i className="dot dot-ok" /> Recommended</span><span><i className="dot dot-warn" /> Usable with gaps</span><span><i className="dot dot-bad" /> Rejected</span>
        <span>Number: validated suitability · bar: evidence completeness · <b>?</b> unresolved conditions</span>
      </div>
      <div className="ws-table-wrap tradeoff-wrap">
        <table className="table tradeoff">
          <thead>
            <tr>
              <th>Site</th>
              <th title="Profile-level similarity before mission checks">Screening</th>
              {experiments.map((e) => <th key={e.id}>{e.shortName || e.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const site = sites.find((s) => s.id === r.id);
              const screening = (site?.scores as Record<string, { total: number }> | undefined)?.[profile]?.total;
              return (
                <tr key={r.id}>
                  <td className="strong"><button type="button" className="link" onClick={() => onOpenSite(r.id)}>{r.name.split(',')[0]}</button></td>
                  <td className="num subtle">{screening == null ? '—' : Math.round(screening)}</td>
                  {experiments.map((e) => {
                    const c = r.per[e.id];
                    if (!c) return <td key={e.id} className="subtle">—</td>;
                    const unresolved = c.mismatches.filter((m) => m.comparison.classification === 'missing' || m.comparison.classification === 'incompatible_support').length;
                    const ev = c.rankings.evidenceCompleteness ?? 0;
                    const active = cell?.siteId === r.id && cell.expId === e.id;
                    return (
                      <td key={e.id}>
                        <button type="button" className={`tradeoff-cell is-${c.decision}${active ? ' is-active' : ''}`} onClick={() => setCell(active ? null : { siteId: r.id, expId: e.id })} aria-label={`${r.name}, ${e.name}: ${DECISION[c.decision].label}`}>
                          <b className="num">{c.experimentScore ?? '—'}</b>
                          <span className="tradeoff-bar"><span style={{ width: `${ev}%` }} /></span>
                          {unresolved ? <span className="tradeoff-q num">{unresolved}?</span> : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 12 ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${rows.length} sites`}</button> : null}
      {sel && selExp ? (
        <div className="card reveal ws-gap-top">
          <div className="spread">
            <h3 className="card-title">{sel.name.split(',')[0]} for {selExp.name}</h3>
            <Badge tone={DECISION[sel.decision].tone}>{DECISION[sel.decision].label}</Badge>
          </div>
          <ul className="list">{sel.reasons.slice(0, 5).map((x, i) => <li key={i}>{clean(x)}</li>)}</ul>
          <button type="button" className="btn btn-secondary btn-sm ws-gap-top" onClick={() => onOpenSite(sel.siteId)}>Open the planetary twin</button>
        </div>
      ) : <p className="subtle ws-gap-top">Select a cell to see the scientific reason behind it.</p>}
      {state ? <div className="ws-gap-top"><RankingEvolution state={state} sites={sites} onOpenSite={onOpenSite} /></div> : null}
    </>
  );
}

/** Mission replay: the run's own story, step by step, from recorded state. */
export function ReplaySection({ state, run, onGo }: { state: AgentStateView | null; run: RunRow | null; onGo: (k: SectionKey) => void }) {
  const [shown, setShown] = useState(99);
  const [playing, setPlaying] = useState(false);
  const animating = playing && shown < STEPS_MAX;
  useEffect(() => {
    if (!animating) return;
    const t = window.setTimeout(() => setShown((n) => n + 1), 700);
    return () => window.clearTimeout(t);
  }, [animating, shown]);
  if (!state?.mission) {
    return (
      <>
        <SectionHeader title="Mission replay" />
        <Empty title="Nothing to replay yet">The replay summarises a finished analysis.</Empty>
      </>
    );
  }
  const exps = state.mission.experiments;
  const all = exps.flatMap((e) => state.candidates[e.id] ?? []);
  const count = (d: string) => all.filter((c) => c.decision === d).length;
  const gaps = Object.values(state.earthWideGaps).flat();
  const physical = gaps.filter((g) => g.kind === 'not_reproducible_by_site_choice').length;
  const inv = Object.values(state.evidenceInvestigations ?? {});
  const field = inv.filter((i) => i.outcome === 'field_measurement').length;
  const integ = inv.filter((i) => i.outcome === 'integration_needed').length;
  const verified = state.evidence.filter((e) => e.status === 'supported' || e.status === 'contradicted' || e.status === 'unresolved').length;
  const plan = state.campaign?.plans[0];
  const steps: Array<{ title: string; detail: string; go?: SectionKey }> = [
    { title: 'Mission defined', detail: `"${clean(run?.brief ?? state.brief).slice(0, 140)}${(run?.brief ?? state.brief).length > 140 ? '…' : ''}"`, go: 'brief' },
    { title: 'Objectives and experiments extracted', detail: `${exps.length} experiments, ${exps.reduce((n, e) => n + e.requirements.length, 0)} requirements, each threshold labelled with its source.`, go: 'mission' },
    { title: 'Earth analogs discovered', detail: `${new Set(all.map((c) => c.siteId)).size} curated sites ranked${state.globalRegions.length ? `, ${state.globalRegions.length} regions from the global screen` : ''}.`, go: 'candidates' },
    { title: 'Sites ranked against planetary features', detail: `${count('viable')} recommended, ${count('downgraded')} usable with gaps, ${count('rejected')} rejected across all experiments.`, go: 'tradeoff' },
    { title: 'Scientific assumptions challenged', detail: `${state.evidence.length} sources found, ${verified} read in full and checked word for word.`, go: 'site' },
    { title: 'Evidence-backed limitations identified', detail: `${physical} condition(s) no Earth site reproduces; ${field} need field measurements; ${integ} need a dataset connected.`, go: 'gaps' },
    { title: 'Simulations and mitigation proposed', detail: `${state.interventions.length} controlled-test options, ${state.interventionEvaluations.length} evaluated with first-order models.`, go: 'interventions' },
    { title: 'Mission campaign prepared', detail: plan ? `${plan.stops.length} site(s), ${plan.unresolved.length} open condition(s) carried by the plan.` : 'No campaign was planned.', go: 'campaign' },
  ];
  return (
    <>
      <SectionHeader title="Mission replay" lead="What the analysis did, from your brief to the residual gaps." actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShown(0); setPlaying(true); }}><svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>Replay</button>} />
      <ol className="replay">
        {steps.map((s, i) => (
          <li key={s.title} className={i < shown ? 'is-shown' : ''}>
            <span className="replay-dot" aria-hidden="true" />
            <div>
              <b>{s.title}</b>
              <p className="muted">{s.detail}</p>
              {s.go ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGo(s.go!)}>Open</button> : null}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
const STEPS_MAX = 8;
