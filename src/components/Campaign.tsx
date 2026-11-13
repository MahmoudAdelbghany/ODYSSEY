import { Download, MapPin } from 'lucide-react';
import type { OdysseyData, ProfileKey } from '../types';
import { Reveal } from './Reveal';
import { SectionHead } from './SectionHead';

type Props = {
  data: OdysseyData;
  campaign: import('../types').Campaign;
  profile: ProfileKey;
  scenario: string;
  setScenario: (s: string) => void;
};

const dayArray = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export function Campaign({ data, campaign, profile, scenario, setScenario }: Props) {
  const days = dayArray(campaign.totalDays);
  const validation = data.validation[profile];
  const siteConf = campaign.sites.length
    ? campaign.sites.reduce((acc, cs) => acc + (data.sites.find((x) => x.id === cs.id)?.scores[profile].confidence ?? 0.8), 0) / campaign.sites.length
    : 0.8;
  const dataConf = siteConf * 100;
  const travelScore = Math.max(0, 100 - campaign.travelHours * 1.1);
  const fitScore = Math.min(100, campaign.match / 3);
  const facilityScore = Math.max(0, 100 - campaign.interventions.length * 12);
  const readiness = Math.round(0.35 * dataConf + 0.25 * travelScore + 0.25 * fitScore + 0.15 * facilityScore);

  const download = () => {
    const payload = {
      project: 'Odyssey',
      profile: campaign.name,
      generatedAt: data.generatedAt,
      campaign,
      validation,
      sources: data.source,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `odyssey-${profile}-campaign.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="section" id="campaign" style={{ paddingTop: 40 }}>
      <div className="container">
        <SectionHead
          index="07"
          label="CAMPAIGN"
          title={<>THE CAMPAIGN,<br />NOT THE SITE.</>}
          lead="The output is not a pin on a map. It is a sequenced plan: which experiment runs where, in which month, with which missing conditions handled by a facility."
        />

        <div className="scenario-bar">
          <div className="mono" style={{ color: 'var(--paper-faint)' }}>SCENARIO</div>
          {Object.keys(data.campaignVariants?.[profile] ?? {}).map((name) => (
            <button
              key={name}
              className={`scenario-btn ${scenario === name ? 'active' : ''}`}
              onClick={() => setScenario(name)}
            >
              {data.campaignVariants?.[profile]?.[name]?.scenarioLabel ?? name}
            </button>
          ))}
          <div className="scenario-note">{campaign.scenarioNote}</div>
        </div>

        <Reveal>
          <div className="campaign-grid">
            <div className="gantt">
              <div className="gantt-head">
                <div>
                  <div className="mono" style={{ color: 'var(--paper-faint)' }}>CAMPAIGN TIMELINE / {campaign.totalDays} DAYS / {campaign.scenarioLabel ?? 'BALANCED'}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginTop: 6 }}>{campaign.name}</div>
                </div>
                <div className="mono" style={{ color: 'var(--cyan)' }}>● OPTIMIZED</div>
              </div>

              <div className="gantt-days" style={{ gridTemplateColumns: `repeat(${campaign.totalDays}, 1fr)` }}>
                {days.map((d) => (
                  <div className="gantt-day" key={d}>{d % 2 === 1 ? d : ''}</div>
                ))}
              </div>

              <div className="gantt-track">
                {campaign.timeline.map((item, i) => {
                  const start = item.day;
                  const len = item.days ?? 1;
                  return (
                    <div className="gantt-row" key={`${item.label}-${i}`}>
                      <div className="gantt-label" title={item.label}>
                        <span style={{ color: item.type === 'travel' ? 'var(--amber)' : item.type === 'field' ? 'var(--cyan)' : 'var(--paper-dim)' }}>
                          {item.type === 'travel' ? '→' : item.type === 'field' ? '◆' : '·'}
                        </span>{' '}
                        {item.label}
                      </div>
                      <div className="gantt-bar" style={{ gridTemplateColumns: `repeat(${campaign.totalDays}, 1fr)` }}>
                        {days.map((d) => {
                          const active = d >= start && d < start + len;
                          return (
                            <div className={`gantt-block ${item.type}`} key={d} title={active ? `${item.label} / day ${d}` : ''}>
                              {active ? <i /> : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="gantt-legend">
                <div className="legend travel"><i /> Travel</div>
                <div className="legend field"><i /> Field</div>
                <div className="legend analysis"><i /> Analysis</div>
                <div className="legend buffer"><i /> Contingency</div>
              </div>
            </div>

            <div className="campaign-mobile">
              <div className="mono" style={{ color: 'var(--paper-faint)', marginBottom: 8 }}>CAMPAIGN TIMELINE / MOBILE</div>
              {campaign.timeline.map((item, i) => (
                <div className="cm-row" key={`${item.label}-m-${i}`}>
                  <div className="cm-day">
                    DAY {String(item.day).padStart(2, '0')}
                    {item.days && item.days > 1 ? `–${String(item.day + item.days - 1).padStart(2, '0')}` : ''}
                  </div>
                  <div>
                    <div className="cm-label">{item.label}</div>
                    <div className="cm-type" style={{ color: item.type === 'field' ? 'var(--cyan)' : item.type === 'travel' ? 'var(--amber)' : 'var(--paper-faint)' }}>
                      {item.type}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="campaign-side">
              <div className="mono" style={{ color: 'var(--paper-faint)' }}>CAMPAIGN SUMMARY</div>

              <div className="campaign-stat"><span className="k">Sites</span><span className="v">{campaign.sites.length}</span></div>
              <div className="campaign-stat"><span className="k">Experiments</span><span className="v">{campaign.assignments.length}</span></div>
              <div className="campaign-stat"><span className="k">Duration</span><span className="v">{campaign.totalDays} days</span></div>
              <div className="campaign-stat"><span className="k">Travel</span><span className="v" style={{ color: 'var(--amber)' }}>{campaign.travelHours?.toFixed(1) ?? ', '} h</span></div>
              <div className="campaign-stat"><span className="k">Est. travel cost</span><span className="v">${(campaign.travelCost ?? 0).toLocaleString()}</span></div>
              <div className="campaign-stat"><span className="k">Top-3 stability</span><span className="v" style={{ color: 'var(--green)' }}>{validation.top3Stability}%</span></div>

              <div className="readiness">
                <div className="readiness-head">
                  <span className="mono" style={{ color: 'var(--paper-faint)' }}>CAMPAIGN READINESS</span>
                  <b>{readiness}<span>/100</span></b>
                </div>
                <div className="readiness-bar"><i style={{ width: `${readiness}%` }} /></div>
                <div className="readiness-row"><span>Data confidence</span><b className="ok">{dataConf.toFixed(0)}%</b></div>
                <div className="readiness-row"><span>Travel feasibility</span><b className={travelScore > 60 ? 'ok' : 'warn'}>{travelScore.toFixed(0)}</b></div>
                <div className="readiness-row"><span>Experiment fit</span><b>{fitScore.toFixed(0)}</b></div>
                <div className="readiness-row"><span>Facility gaps</span><b className="warn">{campaign.interventions.length}</b></div>
                <div className="readiness-row"><span>Geologist review</span><b className="warn">PENDING</b></div>
              </div>

              <div className="facility">
                <div className="t">FACILITY-ONLY CONDITIONS</div>
                <div className="c">
                  {campaign.interventions.map((m) => (
                    <div className="chip amber" key={m}><span className="dot" />{m}</div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>TRAVEL / LEGS</div>
                {campaign.legs?.map((leg, i) => (
                  <div className="leg-row" key={`${leg.fromId}-${leg.toId}`}>
                    <div className="leg-index">0{i + 1}</div>
                    <div>
                      <div className="leg-route">{leg.fromAirport} → {leg.toAirport}</div>
                      <div className="leg-meta">{leg.fromHub} → {leg.toHub} · {leg.km.toLocaleString()} km · {leg.mode}</div>
                    </div>
                    <div className="leg-time">
                      <b>{leg.hours.toFixed(1)}h</b>
                      <span>${leg.cost.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>ASSIGNMENTS / ML + RULE</div>
                {campaign.assignments.map((a) => (
                  <div key={a.experiment} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12 }}>
                    <MapPin size={12} color="var(--cyan)" style={{ marginTop: 3 }} />
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--paper)' }}>{a.experiment}</div>
                      <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 3 }}>{a.site} / {a.window.join('–')} / FIT {a.fit.toFixed(0)} / ML {a.score.toFixed(1)} / RULE {a.ruleScore?.toFixed(1) ?? ', '}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button className="btn" onClick={download} style={{ width: '100%', marginTop: 24 }}>
                <Download size={14} /> Download plan
              </button>
              <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 14, lineHeight: 1.7 }}>
                Windows computed from NASA POWER monthly climatology. Travel, synthesis and contingency are explicit.
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
