import { useState } from 'react';
import { api, type InvestigationView } from '../agent/api';
import { EVIDENCE_REGISTRY, OUTCOME_LABEL, requirementLevelState, STATE_INFO, thresholdBasis, type EvidenceState, type RequirementEvidence } from '../mission/evidence';
import type { RequirementEvaluation, RequirementSpec } from '../mission';
import { Badge } from './ui';
import { cap, clean, STATE_TONE } from './labels';

const STATUS: Record<string, { label: string; tone: 'ok' | 'info' | 'warn' | 'bad' | 'muted' }> = {
  pass: { label: 'Met', tone: 'ok' },
  partial: { label: 'Partly met', tone: 'info' },
  fail: { label: 'Not met', tone: 'warn' },
  missing: { label: 'Unresolved', tone: 'muted' },
  'not-applicable': { label: 'Not a site property', tone: 'muted' },
};

export function StateBadge({ state }: { state: EvidenceState | string }) {
  const info = STATE_INFO[state as EvidenceState];
  return <Badge tone={STATE_TONE[state] ?? 'muted'}>{info?.label ?? cap(state.replace(/_/g, ' '))}</Badge>;
}

function Facts({ items }: { items: Array<[string, string | null | undefined]> }) {
  return (
    <dl className="ev-facts">
      {items
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{clean(v!)}</dd>
          </div>
        ))}
    </dl>
  );
}

function Sources({ metric }: { metric: string }) {
  const spec = EVIDENCE_REGISTRY[metric];
  if (!spec) return null;
  const tone = { integrated: 'ok', not_integrated: 'warn', rejected: 'muted' } as const;
  const word = { integrated: 'Used', not_integrated: 'Found, not connected', rejected: 'Not suitable' } as const;
  return (
    <div className="ev-sources">
      <Facts
        items={[
          ['Quantity', `${spec.quantity}${spec.unit ? ` (${spec.unit})` : ''}`],
          ['Support', `${spec.spatialSupport}; ${spec.temporalSupport}`],
          ['Resolution needed', spec.requiredResolution],
          ['Method', spec.method],
          ['Validation', spec.validation],
          ['Limitation', spec.limitation],
        ]}
      />
      {spec.datasets.length ? (
        <ul className="ev-datasets">
          {spec.datasets.map((d) => (
            <li key={`${d.id}-${d.status}`}>
              <div className="row">
                <b>{d.name}</b>
                <Badge tone={tone[d.status]} plain>{word[d.status]}</Badge>
              </div>
              <span className="subtle">{d.provider} · {d.resolution} · {d.coverage} · {d.license}</span>
              <span className="muted">{clean(d.reason)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {spec.investigated ? <p className="subtle">Sources reviewed {spec.investigated}.</p> : null}
    </div>
  );
}

export function InvestigationResult({ inv }: { inv: InvestigationView }) {
  return (
    <div className="ev-investigation">
      <div className="row">
        <b>Investigation</b>
        <StateBadge state={inv.state} />
        <span className="subtle">{OUTCOME_LABEL[inv.outcome as keyof typeof OUTCOME_LABEL] ?? inv.outcome}</span>
      </div>
      <p>{clean(inv.conclusion)}</p>
      {inv.alternatives.length ? (
        <>
          <p className="strong">Other locations with this evidence</p>
          <ul className="list">
            {inv.alternatives.map((a) => (
              <li key={a.id}>
                <b>{a.name}</b>, {a.country}: <span className="muted">{clean(a.why)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {inv.searches.map((s, i) => (
        <div key={i} className="ev-search">
          <span className="subtle">Searched: {s.query}</span>
          {s.results.length ? (
            <ul className="list">
              {s.results.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noreferrer">{r.title || r.url}</a> <span className="subtle">unverified lead</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      <p className="muted"><b>Next:</b> {clean(inv.nextAction)}</p>
    </div>
  );
}

export function InvestigateButton({ runId, gapKey, existing, search }: { runId: string | null; gapKey: string; existing?: InvestigationView; search?: boolean }) {
  const [inv, setInv] = useState<InvestigationView | undefined>(existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!runId) return null;
  const run = async (withSearch: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setInv((await api.investigate(runId, gapKey, withSearch)).investigation);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ev-investigate">
      {inv ? <InvestigationResult inv={inv} /> : null}
      <div className="row">
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(false)}>
          {busy ? 'Investigating…' : inv ? 'Investigate again' : 'Investigate this gap'}
        </button>
        {search ? (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(true)}>Also search for sources</button>
        ) : null}
      </div>
      {error ? <p className="notice notice-error">{error}</p> : null}
    </div>
  );
}

/** One requirement, explained. With an evaluation it describes this site; without, the requirement in general. */
export function RequirementEvidenceRow({ r, evaluation, evidence, runId, investigation }: {
  r: RequirementSpec;
  evaluation?: RequirementEvaluation;
  evidence?: RequirementEvidence;
  runId: string | null;
  investigation?: InvestigationView;
}) {
  const state = evidence?.state ?? requirementLevelState(r);
  const spec = EVIDENCE_REGISTRY[r.metric];
  const basis = thresholdBasis(r);
  const status = evaluation ? STATUS[evaluation.status] : null;
  const usable = STATE_INFO[state]?.usable;
  const gapKey = `metric:${r.metric}`;
  return (
    <details className="ev-row">
      <summary>
        <span className="ev-title">
          <span>{cap(clean(r.statement))}</span>
          {evaluation && evaluation.display && evaluation.display !== 'NO DATA' && evaluation.display !== 'SITE-INDEPENDENT' ? (
            <span className="num subtle">{/^[A-Z ]+$/.test(evaluation.display) ? cap(evaluation.display.toLowerCase()) : evaluation.display}</span>
          ) : null}
        </span>
        <span className="row ev-badges">
          {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
          <StateBadge state={state} />
        </span>
      </summary>
      <div className="ev-body">
        <Facts
          items={[
            ['Status', STATE_INFO[state]?.label],
            ['Why', evidence?.why ?? (usable ? spec?.method : r.missingReason ?? spec?.whatMissing)],
            ['What exists', evidence?.exists ?? spec?.whatExists],
            ['What is missing', usable ? null : evidence?.missing ?? spec?.whatMissing],
            ['Next action', usable && state !== 'unvalidated_estimate' ? null : evidence?.next ?? spec?.nextAction],
            ['Source', evidence?.source],
          ]}
        />
        <div className="ev-threshold">
          <span className="subtle">Threshold</span>
          <span>
            <Badge tone={basis.basis === 'user_stated' ? 'info' : basis.basis === 'agent_proposed' ? 'warn' : 'muted'} plain>{basis.label}</Badge> {clean(basis.note)}
          </span>
        </div>
        <details className="ev-more">
          <summary>Sources, support and method</summary>
          <Sources metric={r.metric} />
        </details>
        {!usable && state !== 'not_physically_reproducible' ? (
          <InvestigateButton runId={runId} gapKey={gapKey} existing={investigation} search={spec?.stateWithoutValue === 'source_found_not_integrated' || spec?.stateWithoutValue === 'not_investigated'} />
        ) : null}
      </div>
    </details>
  );
}
