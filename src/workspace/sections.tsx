import { PlanetaryVisual } from './PlanetaryVisual';
import { targetVisual } from './visuals';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type AgentStateView, type CandidateView } from '../agent/api';
import { Badge, Disclosure, Empty, SectionHeader, Segmented } from './ui';
import { clean, comparisonBadge, DECISION, dimensionLabel, EVIDENCE, fmtValue, HANDLING, RANKING_GROUPS, RANKING_LABEL, REQUIREMENT_KIND, scoreColor } from './labels';
import { InvestigateButton, RequirementEvidenceRow, StateBadge } from './Evidence';
import { OUTCOME_LABEL } from '../mission/evidence';

type Experiments = NonNullable<AgentStateView['mission']>['experiments'];

export function ExperimentPicker({ experiments, value, onChange }: { experiments: Experiments; value: string | null; onChange: (id: string) => void }) {
  if (experiments.length < 2) return null;
  return (
    <Segmented
      label="Experiment"
      value={value ?? experiments[0].id}
      options={experiments.map((e) => ({ value: e.id, label: e.shortName || e.name }))}
      onChange={onChange}
    />
  );
}

function waiting(running: boolean, what: string) {
  return running ? `The agent is still working. ${what} will appear here when it is ready.` : `${what} is not available for this run.`;
}

/* 2. Mission */
export function MissionSection({ state, running }: { state: AgentStateView | null; running: boolean }) {
  const experiments = state?.mission?.experiments ?? [];
  if (!state?.parsed || !experiments.length) {
    return (
      <>
        <SectionHeader title="Mission" />
        <Empty title="No experiments yet">{waiting(running, 'The experiment breakdown')}</Empty>
      </>
    );
  }
  const p = state.parsed;
  return (
    <>
      <PlanetaryVisual visual={targetVisual(p.body)} kicker={p.body === 'Mars' ? 'Mars · Jezero crater' : 'Moon · south polar region'} title="What must the mission prove?" height={200} className="pv-hero" />
      <SectionHeader title="Experiments" lead={`${experiments.length} experiments for ${p.body === 'Moon' ? 'the lunar south pole' : p.body === 'Mars' ? 'Mars (Jezero)' : 'an unresolved target'}${p.durationDays ? `, ${p.durationDays} days` : ''}.`} />
      {p.unmatchedIntents.length ? <div className="notice">Not covered by any experiment: {p.unmatchedIntents.join('; ')}</div> : null}
      <div className="stack">
        {experiments.map((e, i) => {
          const sel = p.selections.find((s) => s.archetypeId === e.id);
          const groups = ['required', 'preferred', 'operational', 'facility', 'impossible'].map((kind) => ({ kind, items: e.requirements.filter((r) => r.kind === kind) })).filter((g) => g.items.length);
          return (
            <Disclosure key={e.id} open={i === 0} summary={e.name} meta={`${e.requirements.length} requirements`}>
              {sel?.briefFragment ? <p className="subtle">From the brief: “{sel.briefFragment}”</p> : null}
              <p className="muted">{clean(e.objective)}</p>
              {groups.map((g) => (
                <div key={g.kind} className="ws-req-group">
                  <h4>{REQUIREMENT_KIND[g.kind] ?? g.kind}</h4>
                  <div className="ev-list">
                    {g.items.map((r) => (
                      <RequirementEvidenceRow key={r.id} r={r} runId={state.runId ?? null} investigation={state.evidenceInvestigations?.[`metric:${r.metric}`]} />
                    ))}
                  </div>
                </div>
              ))}
            </Disclosure>
          );
        })}
      </div>
    </>
  );
}

/* 3. Candidates */
export function CandidatesSection({ state, running, experimentId, onExperiment, selectedSiteId, onSelectSite, onOpenSite, onOpenDiscovery }: {
  state: AgentStateView | null;
  running: boolean;
  experimentId: string | null;
  onExperiment: (id: string) => void;
  selectedSiteId: string | null;
  onSelectSite: (id: string) => void;
  onOpenSite: (id: string) => void;
  onOpenDiscovery: () => void;
}) {
  const experiments = state?.mission?.experiments ?? [];
  const active = experiments.find((e) => e.id === experimentId) ?? experiments[0];
  const list: CandidateView[] = (active && state?.candidates[active.id]) || [];
  const kept = list.filter((c) => c.decision !== 'rejected');
  const rejected = list.filter((c) => c.decision === 'rejected');
  const rerank = state?.reranks.filter((r) => r.target === 'candidates' && r.experimentId === active?.id).at(-1);
  const shown = kept.slice(0, 8);
  const at = shown.findIndex((c) => c.siteId === selectedSiteId);
  const firstId = shown[0]?.siteId;
  // Open the best site automatically when the list appears or the experiment changes.
  useEffect(() => {
    if (firstId && at < 0) onSelectSite(firstId);
  }, [firstId, at, onSelectSite]);
  const listRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    listRef.current?.querySelector('.ws-candidate.is-selected')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedSiteId]);
  return (
    <>
      <SectionHeader title="Candidates" lead="Sites that pass the hard limits for each experiment, best first." />
      <ExperimentPicker experiments={experiments} value={active?.id ?? null} onChange={onExperiment} />
      {!list.length ? (
        <Empty title="No ranking yet">{waiting(running, 'The ranking for this experiment')}</Empty>
      ) : (
        <>
          <p className="subtle ws-gap-top">
            {kept.filter((c) => c.decision === 'viable').length} recommended, {kept.filter((c) => c.decision === 'downgraded').length} usable with gaps, {rejected.length} rejected out of {list.length} sites.
          </p>
          <ol className="ws-candidates" ref={listRef}>
            {shown.map((c, i) => (
              <CandidateRow key={c.siteId} c={c} rank={i + 1} total={shown.length} selected={selectedSiteId === c.siteId} onSelect={() => onSelectSite(c.siteId)} onOpen={() => onOpenSite(c.siteId)}
                onPrev={i > 0 ? () => onSelectSite(shown[i - 1].siteId) : undefined}
                onNext={i < shown.length - 1 ? () => onSelectSite(shown[i + 1].siteId) : undefined} />
            ))}
          </ol>
          {rejected.length ? (
            <Disclosure summary="Rejected sites" meta={`${rejected.length}`}>
              <ul className="ws-plain-list">
                {rejected.map((c) => (
                  <li key={c.siteId}>
                    <b>{c.name}</b>
                    <span className="muted">{clean(c.reasons[0])}</span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
          {rerank ? (
            <Disclosure summary="How the order was checked" meta={rerank.kendallTauVsBaseline === 1 ? 'Agrees with baseline' : `τ ${rerank.kendallTauVsBaseline ?? 'n/a'}`}>
              <p className="muted">
                The Reranker weighted each requirement using {rerank.literature.length ? `${rerank.literature.length} papers from Crossref` : 'the default requirement weights'} and reordered only the sites that passed the hard limits.
              </p>
              <table className="table">
                <thead>
                  <tr><th>Requirement</th><th>Weight</th><th>Basis</th></tr>
                </thead>
                <tbody>
                  {Object.entries(rerank.weights).slice(0, 6).map(([k, w]) => (
                    <tr key={k}>
                      <td className="strong">{k.split(':').pop()}</td>
                      <td className="num">{Math.round(w.weight * 100)}%</td>
                      <td>{w.basis === 'literature-informed judgment' ? 'Literature' : w.basis === 'unsourced assumption' ? 'Model judgement' : 'Default'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Disclosure>
          ) : null}
        </>
      )}
      {state?.globalRegions.length ? (
        <Disclosure summary="New regions from the global screen" meta={`${state.globalRegions.length}`}>
          <p className="muted">Coarse climate and elevation screen of all land. These regions are nominations to study, not tested sites.</p>
          <table className="table">
            <thead>
              <tr><th>Region</th><th>Type</th><th>Screen score</th></tr>
            </thead>
            <tbody>
              {state.globalRegions.slice(0, 8).map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.name}<div className="subtle num">{Math.abs(r.lat).toFixed(1)}°{r.lat >= 0 ? 'N' : 'S'}, {Math.abs(r.lon).toFixed(1)}°{r.lon >= 0 ? 'E' : 'W'}</div></td>
                  <td>{r.category}</td>
                  <td className="num">{Math.round(r.profileScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-secondary btn-sm ws-gap-top" onClick={onOpenDiscovery}>Open global discovery screen</button>
        </Disclosure>
      ) : null}
    </>
  );
}

function CandidateRow({ c, rank, total, selected, onSelect, onOpen, onPrev, onNext }: { c: CandidateView; rank: number; total: number; selected: boolean; onSelect: () => void; onOpen: () => void; onPrev?: () => void; onNext?: () => void }) {
  const d = DECISION[c.decision];
  return (
    <li className={`ws-candidate${selected ? ' is-selected' : ''}`}>
      <button type="button" className="ws-candidate-main" onClick={onSelect} aria-pressed={selected}>
        <span className="ws-rank num">{rank}</span>
        <span className="ws-candidate-name">
          <b>{c.name}</b>
          <span className="subtle">{c.country}{c.temporal.window ? `, best window ${c.temporal.window}` : ''}</span>
        </span>
        <Badge tone={d.tone}>{d.label}</Badge>
        <span className="ws-score num" title="Weighted summary of the rankings below. Not a probability.">{c.aggregate ?? '–'}</span>
      </button>
      {selected ? (
        <div className="ws-candidate-detail cand-detail">
          {RANKING_GROUPS.map((g) => (
            <section key={g.title} className="cand-group">
              <h4>{g.title}</h4>
              <div className="cand-tiles" style={{ ['--n' as string]: g.keys.length }}>
                {g.keys.map((k) => {
                  const v = c.rankings[k] ?? null;
                  return (
                    <div key={k} className={`cand-tile${v == null ? ' is-empty' : ''}`} style={v == null ? undefined : { ['--score' as string]: scoreColor(v) }}>
                      <span className="cand-tile-label">{RANKING_LABEL[k]}</span>
                      <b className="num">{v ?? 'No data'}</b>
                      <span className="cand-tile-track"><span style={{ width: `${v ?? 0}%` }} /></span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <ul className="cand-reasons">
            {c.reasons.slice(0, 3).map((r, i) => {
              const kind = /mismatch|violat|reject|below the/i.test(r) ? 'bad' : /no data|unresolved|missing|insufficient/i.test(r) ? 'field' : /marginal|only|partial/i.test(r) ? 'warn' : 'ok';
              return <li key={i} className={`is-${kind}`}>{clean(r)}</li>;
            })}
          </ul>
          <div className="cand-nav">
            <button type="button" className="btn btn-primary btn-sm" onClick={onOpen}>Investigate this site →</button>
            <span className="cand-nav-step">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onPrev} disabled={!onPrev} aria-label="Previous site">←</button>
              <span className="num subtle">{rank} / {total}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onNext} disabled={!onNext}>Next site →</button>
            </span>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/* 5. Where Earth falls short */
export function GapsSection({ state, running, experimentId, onExperiment, onSelectSite }: { state: AgentStateView | null; running: boolean; experimentId: string | null; onExperiment: (id: string) => void; onSelectSite: (id: string) => void }) {
  const experiments = state?.mission?.experiments ?? [];
  const active = experiments.find((e) => e.id === experimentId) ?? experiments[0];
  const list = (active && state?.candidates[active.id]) || [];
  const sites = list.filter((c) => c.decision !== 'rejected').slice(0, 3);
  const gaps = (active && state?.earthWideGaps[active.id]) || [];
  const dims = useMemo(() => [...new Map(sites.flatMap((s) => s.mismatches).map((m) => [m.dimension, m])).values()], [sites]);
  const [focus, setFocus] = useState<string | null>(null);
  const detail = focus ? sites.flatMap((s) => s.mismatches).find((m) => `${m.siteId}|${m.dimension}` === focus) : null;
  const physical = gaps.filter((g) => g.kind === 'not_reproducible_by_site_choice');
  const unknown = gaps.filter((g) => g.kind === 'unresolved_evidence');
  return (
    <>
      <SectionHeader title="Reality gap" lead="Where Earth stops being a good stand-in for the target, and whether it matters for this experiment. Missing evidence is shown as missing, never as a match." />
      <ExperimentPicker experiments={experiments} value={active?.id ?? null} onChange={onExperiment} />
      {!sites.length ? (
        <Empty title="No comparison yet">{waiting(running, 'The comparison')}</Empty>
      ) : (
        <div className="stack ws-gap-top">
          {physical.length ? (
            <div className="card card-alert">
              <h3 className="card-title">No site on Earth closes these</h3>
              <ul className="ws-plain-list">
                {physical.map((g) => (
                  <li key={g.dimension}>
                    <b>{dimensionLabel(g.dimension, g.label)}</b>
                    <span className="muted">{clean(g.why)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {unknown.length
            ? (['integration_needed', 'field_measurement', 'investigation_needed'] as const).map((outcome) => {
                const items = unknown.filter((g) => (g.outcome ?? 'integration_needed') === outcome);
                if (!items.length) return null;
                const lead = {
                  integration_needed: 'A dataset exists for these, but ODYSSEY has not connected it yet. This is not a mismatch.',
                  field_measurement: 'These cannot be measured from orbit at the scale the experiment needs. Measure them on site.',
                  investigation_needed: 'No source investigation has been recorded for these yet.',
                }[outcome];
                return (
                  <div key={outcome} className="card">
                    <h3 className="card-title">{OUTCOME_LABEL[outcome]}</h3>
                    <p className="subtle">{lead}</p>
                    <div className="ev-list">
                      {items.map((g) => (
                        <details key={g.dimension} className="ev-row">
                          <summary>
                            <span className="ev-title">
                              <span className="strong">{dimensionLabel(g.dimension, g.label)}</span>
                              <span className="subtle">{g.gapSide === 'target' ? 'Missing for the target reference' : g.gapSide === 'both' ? 'Missing on Earth and for the target' : 'Missing at Earth sites'}</span>
                            </span>
                          </summary>
                          <div className="ev-body">
                            {g.nextAction ? <p className="muted"><b>Next:</b> {clean(g.nextAction)}</p> : null}
                            <InvestigateButton runId={state?.runId ?? null} gapKey={`dimension:${g.dimension}`} existing={state?.evidenceInvestigations?.[`dimension:${g.dimension}`]} search />
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                );
              })
            : null}
          <div className="card">
            <h3 className="card-title">How the top sites compare</h3>
            <div className="ws-table-wrap">
            <table className="table ws-gap-table">
              <thead>
                <tr>
                  <th>Condition</th>
                  {sites.map((s) => (
                    <th key={s.siteId}>
                      <button type="button" className="link" onClick={() => onSelectSite(s.siteId)}>{s.name.split(',')[0]}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dims.map((d) => (
                  <tr key={d.dimension}>
                    <td className="strong">
                      {dimensionLabel(d.dimension, d.label)}
                      {d.importance === 'critical' ? <div className="subtle">Critical</div> : null}
                    </td>
                    {(() => {
                      const all = sites.map((s) => s.mismatches.find((x) => x.dimension === d.dimension));
                      const first = all[0];
                      if (first && all.every((m) => m && m.comparison.classification === first.comparison.classification)) {
                        const c = comparisonBadge(first.comparison);
                        const key = `${first.siteId}|${first.dimension}`;
                        return (
                          <td colSpan={sites.length}>
                            <button type="button" className={`ws-cell ws-cell-wide${focus === key ? ' is-focus' : ''}`} onClick={() => setFocus(key)}>
                              <Badge tone={c.tone}>{c.label}</Badge>
                              <span className="subtle">at all {sites.length === 3 ? 'three' : sites.length} sites</span>
                            </button>
                          </td>
                        );
                      }
                      return null;
                    })() ?? sites.map((s) => {
                      const m = s.mismatches.find((x) => x.dimension === d.dimension);
                      if (!m) return <td key={s.siteId}>–</td>;
                      const c = comparisonBadge(m.comparison);
                      const key = `${m.siteId}|${m.dimension}`;
                      return (
                        <td key={s.siteId}>
                          <button type="button" className={`ws-cell${focus === key ? ' is-focus' : ''}`} onClick={() => setFocus(key)}>
                            <Badge tone={c.tone}>{c.label}</Badge>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          {detail ? (
            <div className="card">
              <h3 className="card-title">{dimensionLabel(detail.dimension, detail.label)} at {sites.find((s) => s.siteId === detail.siteId)?.name}</h3>
              <div className="ws-compare">
                <div>
                  <span className="subtle">Earth</span>
                  <b className="num">{fmtValue(detail.comparison.earth.value, detail.comparison.earth.range, detail.comparison.earth.unit) ?? (detail.comparison.earth.status === 'MISSING' ? <StateBadge state={detail.comparison.earthState ?? 'not_investigated'} /> : clean(detail.comparison.earth.note) || 'Qualitative')}</b>
                  <span className="subtle">{clean(detail.comparison.earth.source)}</span>
                </div>
                <div>
                  <span className="subtle">Target</span>
                  <b className="num">{fmtValue(detail.comparison.planet.value, detail.comparison.planet.range, detail.comparison.planet.unit) ?? (detail.comparison.planet.status === 'MISSING' ? <StateBadge state={detail.comparison.targetState ?? 'not_investigated'} /> : clean(detail.comparison.planet.note) || 'Qualitative')}</b>
                  <span className="subtle">{clean(detail.comparison.planet.source)}</span>
                </div>
              </div>
              <p>{clean(detail.comparison.reason)}</p>
              <p className="muted"><b>Next step:</b> {detail.comparison.nextAction ? clean(detail.comparison.nextAction) : `${HANDLING[detail.handling] ?? detail.handling}. ${clean(detail.why)}`}</p>
            </div>
          ) : (
            <p className="subtle">Select a result to see both measurements and their sources.</p>
          )}
        </div>
      )}
    </>
  );
}

/* 7. Campaign */
export function CampaignSection({ state, running, planId, onPlan, onSelectSite, onReport }: { state: AgentStateView | null; running: boolean; planId: string | null; onPlan: (id: string) => void; onSelectSite: (id: string) => void; onReport?: () => void }) {
  const campaign = state?.campaign;
  if (!campaign) {
    return (
      <>
        <SectionHeader title="Campaign" />
        <Empty title="No campaign yet">{waiting(running, 'The campaign')}</Empty>
      </>
    );
  }
  const plan = campaign.plans.find((p) => p.id === planId) ?? campaign.plans[0];
  const NAME: Record<string, string> = { 'SCIENCE-FIRST': 'Best science', 'LOGISTICS-FIRST': 'Least travel', 'INTERVENTION-LIGHT': 'Fewest facilities' };
  return (
    <>
      <SectionHeader title="Campaign" lead="Three ways to run the experiments. Each optimises a different priority under the same hard limits." />
      <Segmented label="Campaign plan" value={plan?.id ?? ''} options={campaign.plans.map((p) => ({ value: p.id, label: NAME[p.label] ?? p.label }))} onChange={onPlan} />
      {plan ? (
        <div className="stack ws-gap-top">
          <div className="ws-stats">
            <div><span className="subtle">Sites</span><b className="num">{plan.stops.length}</b></div>
            <div><span className="subtle">Travel</span><b className="num">{plan.metrics.travelHours} h</b></div>
            <div><span className="subtle">Weakest fit</span><b className="num">{Math.round(plan.metrics.minFit)}</b></div>
            <div><span className="subtle">Open gaps</span><b className="num">{plan.metrics.residualCount}</b></div>
          </div>
          <div className="camp-strip" aria-label="Campaign sites">
            {plan.stops.map((s, i) => (
              <button key={s.siteId} type="button" className="camp-tile reveal" style={{ animationDelay: `${i * 80}ms` }} onClick={() => onSelectSite(s.siteId)}>
                <img src={`/sites/close/${s.siteId}.jpg`} alt={`Satellite view of ${s.siteName}`} loading="lazy" onError={(e) => { const img = e.currentTarget; if (!img.src.endsWith(`/sites/${s.siteId}.jpg`)) img.src = `/sites/${s.siteId}.jpg`; }} />
                <span><span className="num">{i + 1}</span> {s.siteName.split(',')[0]}</span>
              </button>
            ))}
          </div>
          <p className="subtle">Site imagery: Copernicus Sentinel-2 (ESA), or MODIS Terra (NASA GIBS) where no Sentinel-2 crop exists.</p>
          <ol className="ws-timeline">
            {plan.stops.map((s, i) => (
              <li key={s.siteId}>
                <div className="spread">
                  <button type="button" className="ws-stop-name" onClick={() => onSelectSite(s.siteId)}>
                    <span className="num">{i + 1}</span> {s.siteName}
                  </button>
                  <span className="subtle">{s.window}</span>
                </div>
                <p className="subtle">{s.country}{s.travelFromPrevious ? `, ${s.travelFromPrevious.hours} h from the previous stop` : ''}</p>
                <ul className="ws-plain-list">
                  {s.experiments.map((x) => (
                    <li key={x.id}>
                      <span className="spread"><b>{x.name}</b><span className="num subtle">fit {x.staticFit}</span></span>
                      {x.interventions.length ? <span className="subtle">With: {x.interventions.map((v) => v.replace(/_/g, ' ')).join(', ')}</span> : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          {plan.unresolved.length ? (
            <Disclosure summary="Open conditions in this plan" meta={`${plan.unresolved.length}`}>
              <ul className="list">{plan.unresolved.map((u, i) => <li key={i}>{clean(u)}</li>)}</ul>
            </Disclosure>
          ) : null}
          {campaign.infeasible.length ? (
            <div className="card card-alert">
              <h3 className="card-title">Experiments no plan can host</h3>
              <ul className="list">{campaign.infeasible.map((x) => <li key={x.experimentId}>{x.experimentName}: {x.reasons.join('; ')}</li>)}</ul>
            </div>
          ) : null}
          {onReport ? <button type="button" className="btn btn-primary btn-lg" onClick={onReport}>Generate the mission report →</button> : null}
        </div>
      ) : null}
    </>
  );
}

/* 8. Report */
export function ReportSection({ runId, state, done }: { runId: string; state: AgentStateView | null; done: boolean }) {
  const report = state?.report;
  const [category, setCategory] = useState('site_evaluation');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const evidence = state?.evidence ?? [];
  const order = ['contradicted', 'supported', 'unresolved', 'retrieved', 'retrieval_failed', 'pending_review'];
  const groups = order.map((s) => ({ s, items: evidence.filter((e) => e.status === s) })).filter((g) => g.items.length);
  if (!done || !report) {
    return (
      <>
        <SectionHeader title="Report" />
        <Empty title="The report is not ready">It is written when the analysis finishes.</Empty>
      </>
    );
  }
  return (
    <>
      <SectionHeader
        title="Report"
        actions={
          <>
            <a className="btn btn-primary" href={api.reportUrl(runId, 'md')}>Download plan</a>
            <a className="btn btn-secondary" href={api.reportUrl(runId, 'json')}>Download data</a>
          </>
        }
      />
      <div className="stack">
        <div className="card">
          <h3 className="card-title">Summary</h3>
          <p>{clean(report.narrative.summary)}</p>
          {report.narrative.keyFindings.length ? (
            <>
              <h4 className="ws-subhead">Key findings</h4>
              <ul className="list">{report.narrative.keyFindings.slice(0, 6).map((f, i) => <li key={i}>{clean(f)}</li>)}</ul>
            </>
          ) : null}
          <p className="subtle ws-gap-top">Written by the language model. Figures and decisions come from the analysis tools.{report.narrative.check !== 'all identifiers recognised' ? ` Check: ${report.narrative.check}.` : ''}</p>
        </div>
        <Disclosure open summary="What could not be established" meta={`${report.narrative.cannotEstablish.length + report.unresolved.length}`}>
          <ul className="list">{[...report.narrative.cannotEstablish, ...report.unresolved].slice(0, 16).map((f, i) => <li key={i}>{clean(f)}</li>)}</ul>
        </Disclosure>
        {report.narrative.nextMeasurements.length ? (
          <Disclosure summary="Measurements that would improve the plan" meta={`${report.narrative.nextMeasurements.length}`}>
            <ul className="list">{report.narrative.nextMeasurements.map((f, i) => <li key={i}>{clean(f)}</li>)}</ul>
          </Disclosure>
        ) : null}
        <Disclosure summary="Sources" meta={`${evidence.length}`}>
          {state?.contradictions.length ? <div className="notice notice-error">{state.contradictions.length} source{state.contradictions.length > 1 ? 's' : ''} contradict a reference value.</div> : null}
          {groups.map((g) => (
            <div key={g.s} className="ws-source-group">
              <h4><Badge tone={EVIDENCE[g.s]?.tone}>{EVIDENCE[g.s]?.label ?? g.s}</Badge> <span className="subtle">{g.items.length}</span></h4>
              <ul className="ws-sources">
                {g.items.map((e) => (
                  <li key={e.id}>
                    <a href={e.url} target="_blank" rel="noreferrer">{e.source?.title ?? e.title}</a>
                    <span className="subtle">{new URL(e.url).hostname}{e.source?.publishedDate ? `, ${e.source.publishedDate}` : ''}</span>
                    {(e.verifications ?? []).map((v) => (
                      <div key={v.quantity} className="ws-verification">
                        <span>{v.quantity}: <Badge tone={EVIDENCE[v.status]?.tone}>{EVIDENCE[v.status]?.label ?? v.status}</Badge></span>
                        {v.claims.slice(0, 1).map((c, i) => <blockquote key={i} className="quote">{c.quote}</blockquote>)}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Disclosure>
        <Disclosure summary="Scientific rules applied">
          <ul className="list">{report.integrity.map((f, i) => <li key={i}>{clean(f)}</li>)}</ul>
        </Disclosure>
        <div className="card">
          <h3 className="card-title">Send a correction</h3>
          <div className="stack">
            <label className="field">
              <span className="field-label">Type</span>
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="site_evaluation">Site evaluation</option>
                <option value="scientific_correction">Scientific correction</option>
                <option value="preference">Preference</option>
                <option value="test_outcome">Field test result</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Details</span>
              <textarea className="textarea" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
            </label>
            <div className="row">
              <button type="button" className="btn btn-secondary" disabled={details.trim().length < 4} onClick={() => api.feedback(runId, category, details).then(() => { setSent('Saved for review. It does not change any result automatically.'); setDetails(''); }).catch((e: Error) => setSent(e.message))}>
                Submit correction
              </button>
              {sent ? <span className="subtle">{sent}</span> : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
