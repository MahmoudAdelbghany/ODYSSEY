import { PlanetaryVisual } from './PlanetaryVisual';
import { VISUALS } from './visuals';
import { useEffect, useMemo, useState } from 'react';
import { api, type AgentStateView, type InterventionView, type ModelOutput } from '../agent/api';
import { Badge, Disclosure, Empty, SectionHeader, Segmented } from './ui';
import { clean, INTERVENTION_LABEL } from './labels';

interface Input {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  log?: boolean;
}

const INPUTS: Record<string, Input[]> = {
  gravity_offload_statics: [{ key: 'massKg', label: 'Test article mass', unit: 'kg', min: 10, max: 2000, step: 10 }],
  vacuum_pumpdown_ideal: [
    { key: 'volumeM3', label: 'Chamber volume', unit: 'm³', min: 0.5, max: 500, step: 0.5 },
    { key: 'pumpSpeedLps', label: 'Pumping speed', unit: 'L/s', min: 10, max: 20000, step: 10 },
    { key: 'targetPa', label: 'Target pressure', unit: 'Pa', min: -2, max: 3, step: 0.1, log: true },
  ],
  radiative_equilibrium_plate: [
    { key: 'irradianceWm2', label: 'Solar simulator irradiance', unit: 'W/m²', min: 0, max: 1500, step: 10 },
    { key: 'absorptivity', label: 'Solar absorptivity', unit: '', min: 0.05, max: 1, step: 0.01 },
    { key: 'emissivity', label: 'Infrared emissivity', unit: '', min: 0.05, max: 1, step: 0.01 },
    { key: 'incidenceDeg', label: 'Sun angle from normal', unit: '°', min: 0, max: 89, step: 1 },
    { key: 'shroudK', label: 'Shroud temperature', unit: 'K', min: 20, max: 300, step: 1 },
  ],
  thermal_cycle_protocol: [
    { key: 'lowK', label: 'Cold setpoint', unit: 'K', min: 20, max: 280, step: 1 },
    { key: 'highK', label: 'Hot setpoint', unit: 'K', min: 200, max: 420, step: 1 },
    { key: 'rampKPerMin', label: 'Ramp rate', unit: 'K/min', min: 0.1, max: 10, step: 0.1 },
    { key: 'dwellH', label: 'Hold at each extreme', unit: 'h', min: 0, max: 48, step: 0.5 },
    { key: 'cycles', label: 'Cycles', unit: '', min: 1, max: 20, step: 1 },
  ],
};

const DEFAULTS: Record<string, Record<string, number>> = {
  gravity_offload_statics: { massKg: 200 },
  vacuum_pumpdown_ideal: { volumeM3: 10, pumpSpeedLps: 500, targetPa: 0 },
  radiative_equilibrium_plate: { irradianceWm2: 1361, absorptivity: 0.9, emissivity: 0.85, incidenceDeg: 0, shroudK: 77 },
  thermal_cycle_protocol: { lowK: 77, highK: 250, rampKPerMin: 1, dwellH: 4, cycles: 3 },
};

const OUTPUT_LABEL: Record<string, string> = {
  pumpdownTime: 'Pump-down time',
  equilibriumTemperature: 'Plate temperature',
  offloadForce: 'Offload force',
  offloadFraction: 'Weight removed',
  residualWeight: 'Remaining weight',
};

type Result = ModelOutput & { steps?: Array<{ t_h: number; setpointK: number }>; totalHours?: number; note?: string };

export function InterventionsSection({ state, running, onCampaign }: { state: AgentStateView | null; running: boolean; onCampaign?: () => void }) {
  const options = useMemo(() => {
    const seen = new Map<string, InterventionView>();
    for (const i of state?.interventions ?? []) if (!seen.has(`${i.name}|${i.targetGap}`)) seen.set(`${i.name}|${i.targetGap}`, i);
    return [...seen.values()];
  }, [state?.interventions]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const item = options.find((o) => o.id === selectedId) ?? options[0] ?? null;
  const models = item?.model ? (item.model === 'radiative_equilibrium_plate' ? ['radiative_equilibrium_plate', 'thermal_cycle_protocol'] : [item.model]) : [];
  const [modelChoice, setModelChoice] = useState<string | null>(null);
  const model = modelChoice && models.includes(modelChoice) ? modelChoice : models[0] ?? null;
  const [inputsByModel, setInputsByModel] = useState<Record<string, Record<string, number>>>({});
  const inputs = useMemo(() => (model ? inputsByModel[model] ?? DEFAULTS[model] : {}), [model, inputsByModel]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const targetG = state?.parsed?.body === 'Mars' ? 3.73 : 1.62;

  useEffect(() => {
    if (!model) return;
    const payload: Record<string, number> = { ...inputs };
    if (model === 'gravity_offload_statics') payload.targetG = targetG;
    if (model === 'vacuum_pumpdown_ideal') payload.targetPa = 10 ** inputs.targetPa;
    const timer = window.setTimeout(() => {
      api.simulate(model, payload).then((r) => (setResult(r), setError(null))).catch((e: Error) => setError(e.message));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [inputs, model, targetG]);

  if (!options.length) {
    return (
      <>
        <SectionHeader title="Simulation lab" />
        <Empty title="No interventions yet">
          {running ? 'The agent proposes interventions after it finds conditions no site can reproduce.' : 'This run found no condition that needs a controlled facility.'}
        </Empty>
      </>
    );
  }
  const tag = item ? INTERVENTION_LABEL[item.label] : null;
  return (
    <>
      <PlanetaryVisual visual={VISUALS.chamber} kicker="Simulation lab" title="How can the experiment recover what Earth cannot provide?" height={200} className="pv-hero" />
      <SectionHeader title="Simulation lab" lead="Turn a condition Earth cannot provide into a controlled test you can plan. Outputs are setpoints or first-order models, never measurements." />
      <label className="field">
        <span className="field-label">Condition to recreate</span>
        <select className="select" value={item?.id ?? ''} onChange={(e) => { setSelectedId(e.target.value); setModelChoice(null); }}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.targetGapLabel.split(' (')[0]}: {o.name}</option>
          ))}
        </select>
      </label>
      {item ? (
        <div className="stack ws-gap-top">
          <section className="card lab-plan reveal" aria-label="Proposed test configuration">
            <span className="mctl-kicker">Detected limitation</span>
            <h3 className="lab-title">{item.targetGapLabel.split(' (')[0]}</h3>
            <p className="muted">{item.name}</p>
            <ol className="lab-steps">
              <li><span className="num">01</span><div><b>What the controlled test reproduces</b><p className="muted">{clean(item.reproduces) || 'Not specified'}</p></div></li>
              <li><span className="num">02</span><div><b>Configure the controlled condition</b><p className="muted">{item.controlVariables.length ? item.controlVariables.map((c) => `${c.name}: ${c.target ? `${c.target[0]}${c.target[1] !== c.target[0] ? ` to ${c.target[1]}` : ''} ${c.unit}` : 'to be set'}`).join('; ') : 'Control variables to be defined.'}</p></div></li>
              <li><span className="num">03</span><div><b>Instrument and calibrate</b><p className="muted">{[...item.instrumentation.slice(0, 3), ...item.calibration.slice(0, 1)].join(', ') || 'Not specified'}</p></div></li>
              <li><span className="num">04</span><div><b>Compare results with the target constraints</b><p className="muted">What it still cannot reproduce: {clean(item.cannotReproduce) || 'not specified'}</p></div></li>
            </ol>
            <p className="subtle lab-note">This is a proposed test configuration, not a completed physical simulation or a validated result.</p>
            {onCampaign ? <button type="button" className="btn btn-secondary ws-gap-top" onClick={onCampaign}>See where it fits in the campaign →</button> : null}
          </section>
          <div className="card">
            <div className="spread">
              <h3 className="card-title">{item.name}</h3>
              {tag ? <Badge tone={tag.tone}>{tag.label}</Badge> : null}
            </div>
            <p><b>Reproduces:</b> <span className="muted">{clean(item.reproduces) || 'Not specified'}</span></p>
            <p><b>Cannot reproduce:</b> <span className="muted">{clean(item.cannotReproduce) || 'Not specified'}</span></p>
            {item.controlVariables.length ? (
              <table className="table ws-gap-top">
                <thead><tr><th>Control</th><th>Target</th></tr></thead>
                <tbody>
                  {item.controlVariables.map((c) => (
                    <tr key={c.name}>
                      <td className="strong">{c.name}</td>
                      <td className="num">{c.target ? `${c.target[0]}${c.target[1] !== c.target[0] ? ` to ${c.target[1]}` : ''} ${c.unit}` : 'To be set'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>

          {model ? (
            <div className="card">
              <div className="spread">
                <h3 className="card-title">Try it</h3>
                {models.length > 1 ? (
                  <Segmented label="Model" value={model} options={models.map((m) => ({ value: m, label: m === 'thermal_cycle_protocol' ? 'Cycle schedule' : 'Plate temperature' }))} onChange={(m) => { setModelChoice(m); setResult(null); }} />
                ) : null}
              </div>
              <div className="stack">
                {INPUTS[model].map((s) => (
                  <label key={s.key} className="ws-slider">
                    <span className="spread">
                      <span>{s.label}</span>
                      <b className="num">{s.log ? (10 ** (inputs[s.key] ?? 0)).toPrecision(2) : inputs[s.key]} {s.unit}</b>
                    </span>
                    <input type="range" min={s.min} max={s.max} step={s.step} value={inputs[s.key] ?? s.min} onChange={(e) => setInputsByModel((all) => ({ ...all, [model]: { ...(all[model] ?? DEFAULTS[model]), [s.key]: Number(e.target.value) } }))} />
                  </label>
                ))}
                {model === 'gravity_offload_statics' ? <p className="subtle">Target gravity {targetG} m/s² (NASA fact sheet).</p> : null}
              </div>
              {error ? <div className="notice notice-error ws-gap-top">{error}</div> : null}
              {result ? <ModelResult r={result} /> : null}
            </div>
          ) : (
            <div className="notice">No physical model exists for this option, so ODYSSEY does not compute a response.</div>
          )}

          <Disclosure summary="Limitations and safety">
            <ul className="list">{item.limitations.map((l, i) => <li key={i}>{clean(l)}</li>)}</ul>
            <p className="subtle ws-gap-top">Safety: {item.safety.join(', ')}</p>
            <p className="subtle">Instruments: {item.instrumentation.join(', ')}</p>
            <p className="subtle">{clean(item.cost.note)}</p>
          </Disclosure>
        </div>
      ) : null}
    </>
  );
}

function ModelResult({ r }: { r: Result }) {
  const tag = INTERVENTION_LABEL[r.label];
  if (r.steps) {
    const total = r.totalHours ?? 1;
    const ks = r.steps.map((s) => s.setpointK);
    const lo = Math.min(...ks) - 10;
    const hi = Math.max(...ks) + 10;
    const pts = r.steps.map((s) => `${(s.t_h / total) * 300},${100 - ((s.setpointK - lo) / (hi - lo)) * 100}`).join(' ');
    return (
      <div className="ws-result">
        <div className="spread"><b>Setpoint schedule, {total} h</b>{tag ? <Badge tone={tag.tone}>{tag.label}</Badge> : null}</div>
        <svg viewBox="-4 -6 308 112" className="ws-cycle" role="img" aria-label="Thermal cycle setpoint schedule">
          <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <p className="subtle">{Math.round(lo + 10)} K to {Math.round(hi - 10)} K. Article temperatures must be measured; this tool predicts none.</p>
      </div>
    );
  }
  return (
    <div className="ws-result">
      <div className="spread"><code className="num">{r.equation}</code>{tag ? <Badge tone={tag.tone}>{tag.label}</Badge> : null}</div>
      <div className="ws-stats">
        {Object.entries(r.outputs).map(([k, v]) => (
          <div key={k}>
            <span className="subtle">{OUTPUT_LABEL[k] ?? k}</span>
            <b className="num">{v.value == null ? 'Out of range' : k === 'offloadFraction' ? `${Math.round(v.value * 100)}%` : `${v.value} ${v.unit}`}</b>
          </div>
        ))}
      </div>
      {r.warnings.map((w, i) => <div key={i} className="notice">{clean(w)}</div>)}
      <p className="subtle">Valid for: {clean(r.validity)}</p>
    </div>
  );
}
