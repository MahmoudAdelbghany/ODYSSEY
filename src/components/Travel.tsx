import { Plane, Route } from 'lucide-react';
import type { OdysseyData } from '../types';
import { Reveal } from './Reveal';
import { SectionHead } from './SectionHead';
import { TravelMap } from './TravelMap';

type Props = {
  data: OdysseyData;
  campaign: import('../types').Campaign;
};

export function Travel({ data, campaign }: Props) {
  const route = campaign.assignments.map((a) => a.site).join(' → ');

  return (
    <section className="section" id="travel" style={{ paddingTop: 40 }}>
      <div className="container">
        <SectionHead
          index="08"
          label="LOGISTICS"
          title={<>THE ROUTE IS<br />PART OF THE SCIENCE.</>}
          lead="The best campaign is not the three highest-scoring sites. It is the best experiment fit per travel day. Odyssey prices every leg, then lets the optimizer trade match score against time and cost."
        />

        <div className="travel-grid">
          <Reveal>
            <TravelMap campaign={campaign} sites={data.sites} />
          </Reveal>

          <Reveal delay={0.1}>
            <div className="travel-side">
              <div className="mono" style={{ color: 'var(--paper-faint)' }}>ROUTE SUMMARY / {campaign.scenarioLabel ?? 'BALANCED'}</div>
              <div className="travel-route">{route}</div>

              <div className="travel-stat-grid">
                <div className="travel-stat">
                  <div className="v">{campaign.travelHours.toFixed(1)}<span>h</span></div>
                  <div className="k">Total travel</div>
                </div>
                <div className="travel-stat">
                  <div className="v">${(campaign.travelCost / 1000).toFixed(1)}<span>k</span></div>
                  <div className="k">Est. cost</div>
                </div>
                <div className="travel-stat">
                  <div className="v">{campaign.travelDays}</div>
                  <div className="k">Travel days</div>
                </div>
                <div className="travel-stat">
                  <div className="v">{campaign.totalDays}</div>
                  <div className="k">Campaign days</div>
                </div>
              </div>

              <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Route size={13} /> LEGS / AIR + GROUND
              </div>
              {campaign.legs.map((leg, i) => (
                <div className="travel-leg" key={`${leg.fromId}-${leg.toId}`}>
                  <div className="travel-leg-index">0{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div className="travel-leg-route">
                      {leg.fromAirport} <span>→</span> {leg.toAirport}
                    </div>
                    <div className="travel-leg-meta">
                      {leg.fromHub} → {leg.toHub} · {leg.km.toLocaleString()} km · {leg.mode}
                    </div>
                  </div>
                  <div className="travel-leg-time">
                    <b>{leg.hours.toFixed(1)}h</b>
                    <span>${leg.cost.toLocaleString()}</span>
                  </div>
                </div>
              ))}

              <div className="travel-note">
                <Plane size={14} color="var(--amber)" />
                <div>
                  <b>Why this route:</b> the optimizer evaluates every 3-site permutation and every
                  experiment assignment, then subtracts a travel penalty. A slightly lower-scoring
                  site can win if it keeps the campaign in one region.
                </div>
              </div>

              <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 18, lineHeight: 1.8 }}>
                TRAVEL MODEL / GREAT-CIRCLE AIRPORT DISTANCE + CONNECTIONS + GROUND TRANSFER + 1 H BUFFER.
                COSTS ARE PLANNING ESTIMATES, NOT QUOTES.
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
