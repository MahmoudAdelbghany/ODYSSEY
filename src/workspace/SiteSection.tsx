import { useEffect, useState } from 'react';
import { api, type AgentStateView, type ComparisonView } from '../agent/api';
import type { Site } from '../types';
import { Badge, Disclosure, Empty, SectionHeader } from './ui';
import { clean, comparisonBadge, DECISION, dimensionLabel, EPISTEMIC, fmtValue } from './labels';
import { evaluateRequirement } from '../mission/evaluate';
import terrainRaw from '../data/siteTerrain.json';
import type { SiteTerrainData } from '../types';
import { RequirementEvidenceRow } from './Evidence';

const TERRAIN = (terrainRaw as unknown as SiteTerrainData).sites;

const GROUPS: Array<{ title: string; prefixes: string[] }> = [
  { title: 'Terrain', prefixes: ['terrain.'] },
  { title: 'Temperature', prefixes: ['thermal.'] },
  { title: 'Atmosphere and gravity', prefixes: ['atmosphere.', 'gravity.'] },
  { title: 'Radiation and light', prefixes: ['radiation.', 'illumination.'] },
  { title: 'Geology and resources', prefixes: ['geology.', 'resources.'] },
];

export function SiteSection({ site, state, target, onDive, onBack }: { site: Site | null; state: AgentStateView | null; target: string; onDive: () => void; onBack: () => void }) {
  const [rows, setRows] = useState<ComparisonView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const siteId = site?.id ?? null;

  useEffect(() => {
    if (!siteId) return;
    let alive = true;
    api
      .comparison(siteId, target)
      .then((r) => alive && (setRows(r.comparisons), setError(null)))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [siteId, target]);

  if (!site) {
    return (
      <>
        <SectionHeader title="Site" />
        <Empty title="No site selected" action={<button type="button" className="btn btn-secondary" onClick={onBack}>Choose a candidate</button>}>
          Pick a site in Candidates or on the globe.
        </Empty>
      </>
    );
  }

  const experiments = state?.mission?.experiments ?? [];
  const perExperiment = experiments
    .map((e) => ({ e, c: state?.candidates[e.id]?.find((x) => x.siteId === site.id) }))
    .filter((x) => x.c);
  const COMPARED = new Set(['analog', 'partial', 'mismatch', 'not_naturally_reproducible']);
  const measured = (rows ?? []).filter((r) => COMPARED.has(r.classification));
  const noTarget = (rows ?? []).filter((r) => !COMPARED.has(r.classification) && r.earth.status !== 'MISSING');
  const missingEarth = (rows ?? []).filter((r) => r.earth.status === 'MISSING' && !COMPARED.has(r.classification));
  const coords = `${Math.abs(site.lat).toFixed(2)}°${site.lat >= 0 ? 'N' : 'S'}, ${Math.abs(site.lon).toFixed(2)}°${site.lon >= 0 ? 'E' : 'W'}`;

  return (
    <>
      <SectionHeader
        title={site.name}
        lead={<>{site.country}, {site.type.toLowerCase()} <span className="num subtle">{coords}</span></>}
        actions={<button type="button" className="btn btn-primary" onClick={onDive}>View 3D terrain</button>}
      />
      <div className="stack">
        {perExperiment.length ? (
          <div className="card">
            <h3 className="card-title">Suitability by experiment</h3>
            <div className="ws-expand-list">
              {perExperiment.map(({ e, c }) => (
                <details key={e.id} className="ws-expand-row">
                  <summary>
                    <span className="strong">{e.name}</span>
                    <Badge tone={DECISION[c!.decision].tone}>{DECISION[c!.decision].label}</Badge>
                    <span className="num">{c!.aggregate ?? '–'}</span>
                  </summary>
                  <ul className="list">{c!.reasons.map((r, i) => <li key={i}>{clean(r)}</li>)}</ul>
                </details>
              ))}
            </div>
          </div>
        ) : null}

        {experiments.length ? (
          <div className="card">
            <h3 className="card-title">Requirements at this site</h3>
            <p className="subtle">Each requirement says whether it is met here, how the value was obtained, and what to do when it cannot be evaluated.</p>
            {experiments.map((e, i) => {
              const rows = e.requirements.map((r) => ({ r, ev: evaluateRequirement(r, site, TERRAIN[site.id]) }));
              const open = rows.filter((x) => x.ev.status === 'missing').length;
              return (
                <Disclosure key={e.id} open={i === 0} summary={e.name} meta={open ? `${open} unresolved` : 'all evaluated'}>
                  <div className="ev-list">
                    {rows.map(({ r, ev }) => (
                      <RequirementEvidenceRow key={r.id} r={r} evaluation={ev} evidence={ev.evidence} runId={state?.runId ?? null} investigation={state?.evidenceInvestigations?.[`metric:${r.metric}`]} />
                    ))}
                  </div>
                </Disclosure>
              );
            })}
          </div>
        ) : null}

        {error ? <div className="notice notice-error">Could not load the comparison: {error}</div> : null}
        {rows ? (
          <div className="card">
            <h3 className="card-title">Compared with {target === 'mars_jezero' ? 'Mars (Jezero)' : 'the lunar south pole'}</h3>
            {GROUPS.map((g) => {
              const items = measured.filter((r) => g.prefixes.some((p) => r.dimension.startsWith(p)));
              if (!items.length) return null;
              return (
                <div key={g.title} className="ws-req-group">
                  <h4>{g.title}</h4>
                  <table className="table ws-compare-table">
                    <thead>
                      <tr><th>Condition</th><th>Here</th><th>Target</th><th>Result</th></tr>
                    </thead>
                    <tbody>
                      {items.map((r) => {
                        const c = comparisonBadge(r);
                        const e = EPISTEMIC[r.earth.status];
                        return (
                          <tr key={r.dimension} title={clean(r.reason)}>
                            <td className="strong" title={r.label}>{dimensionLabel(r.dimension, r.label)}<div className="subtle">{e?.label}</div></td>
                            <Value m={r.earth} />
                            <Value m={r.planet} />
                            <td><Badge tone={c.tone}>{c.label}</Badge></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ) : !error ? (
          <p className="subtle">Loading measurements…</p>
        ) : null}

        {noTarget.length ? (
          <Disclosure summary="Measured here, nothing to compare on the target" meta={`${noTarget.length}`}>
            <table className="table ws-compare-table">
              <tbody>
                {noTarget.map((r) => (
                  <tr key={r.dimension}>
                    <td className="strong" title={r.label}>{dimensionLabel(r.dimension, r.label)}<div className="subtle">{EPISTEMIC[r.earth.status]?.label}</div></td>
                    <Value m={r.earth} />
                    <td colSpan={2} className="subtle">{r.classification === 'incompatible_support' ? 'Measured differently on the target' : r.gapOutcome === 'not_applicable' ? clean(r.planet.note) : `Target: ${clean(r.planet.note)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Disclosure>
        ) : null}

        {missingEarth.length ? (
          <Disclosure summary="Not measured at this site" meta={`${missingEarth.length}`}>
            <ul className="ws-plain-list">
              {missingEarth.map((r) => (
                <li key={r.dimension}>
                  <b>{dimensionLabel(r.dimension, r.label)}</b>
                  <span className="muted">{clean(r.earth.note)}</span>
                  {r.earth.nextAction ? <span className="subtle">Next: {clean(r.earth.nextAction)}</span> : null}
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}

        <Disclosure summary="Site notes">
          <p className="muted">{clean(site.summary)}</p>
          {site.macrostrat?.unit ? <p className="subtle">Mapped geology: {site.macrostrat.unit} ({site.macrostrat.source})</p> : null}
          {site.airport ? <p className="subtle">Nearest airport: {site.airport.name}, about {site.airport.groundHours} h by road.</p> : null}
        </Disclosure>
      </div>
    </>
  );
}

function Value({ m }: { m: { value: number | null; range: [number, number] | null; unit: string; note: string } }) {
  const v = fmtValue(m.value, m.range, m.unit);
  return v ? <td className="num">{v}</td> : <td>{clean(m.note) || '–'}</td>;
}
