import { Boxes, Compass, Crosshair, Layers, Search, SlidersHorizontal, Sparkles, Target } from 'lucide-react';
import { Reveal } from './Reveal';
import { SectionHead } from './SectionHead';

const traditional = [
  [Search, 'Search', 'Visual similarity to the target planet.'],
  [Target, 'Execution', 'Single-location, statically bound test.'],
  [Layers, 'Control', 'Accept whatever ambient conditions exist.'],
  [Compass, 'Result', 'Compromise hidden inside the test.'],
];

const odyssey = [
  [Crosshair, 'Search', 'Parametric requirement breakdown and global scan.'],
  [Boxes, 'Execution', 'Optimized multi-location temporal campaign.'],
  [SlidersHorizontal, 'Control', 'Identify missing variables and synthesize them.'],
  [Sparkles, 'Result', 'Every gap named, every site given a job.'],
];

export function Shift() {
  return (
    <section className="section" id="shift" style={{ paddingTop: 40 }}>
      <div className="container">
        <SectionHead
          index="02"
          label="THE SHIFT"
          title={<>STOP SEARCHING<br />FOR ONE PLACE.</>}
          lead="The best planetary analog is not a place. It is a campaign: the right sites, at the right time, for the right experiment."
        />

        <div className="shift-grid">
          <Reveal className="shift-col">
            <div className="shift-label">TRADITIONAL ANALOG SEARCH</div>
            {traditional.map(([Icon, t, d], i) => {
              const I = Icon as typeof Search;
              return (
                <div className="shift-row" key={i}>
                  <div className="shift-icon"><I size={16} strokeWidth={1.3} /></div>
                  <div>
                    <div className="t">{t as string}</div>
                    <div className="d">{d as string}</div>
                  </div>
                </div>
              );
            })}
          </Reveal>

          <Reveal className="shift-col odyssey" delay={0.1}>
            <div className="shift-label" style={{ color: 'var(--cyan)' }}>ODYSSEY PROTOCOL</div>
            {odyssey.map(([Icon, t, d], i) => {
              const I = Icon as typeof Search;
              return (
                <div className="shift-row" key={i}>
                  <div className="shift-icon"><I size={16} strokeWidth={1.3} /></div>
                  <div>
                    <div className="t">{t as string}</div>
                    <div className="d">{d as string}</div>
                  </div>
                </div>
              );
            })}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
