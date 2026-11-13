import { AlertTriangle, ScanLine, Thermometer, Wind } from 'lucide-react';
import { Counter } from './Counter';
import { Reveal } from './Reveal';

export function Problem() {
  return (
    <section className="section" id="problem">
      <div className="container">
        <div className="problem-grid">
          <div className="problem-copy">
            <Reveal>
              <div className="eyebrow">
                <span className="idx">01</span>
                <span>THE PROBLEM</span>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="display h2" style={{ marginTop: 24 }}>
                NO PLACE<br />ON EARTH<br />IS MARS.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="lead" style={{ marginTop: 28 }}>
                Every analog is partial. A site that nails geology can fail on thermal.
                A site that nails thermal can fail on dust. Testing a mission in one place
                forces compromises that hide risk.
              </p>
            </Reveal>
            <Reveal delay={0.22}>
              <div className="pullquote">
                “An analog does not have to match everything.”
                <span style={{ display: 'block', marginTop: 10, fontSize: 11, letterSpacing: '0.2em', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                  NASA Space Apps 2026 challenge statement
                </span>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.15} className="problem-visual">
            <img src="/img/mars_opening_plate.jpg" alt="Mars surface reference" />
            <div className="scanline" />
            <div className="hud-card" style={{ top: 24, left: 24 }}>
              REFERENCE / MARS
              <strong>JEZERO-ANALOG PROFILE</strong>
            </div>
            <div className="hud-card" style={{ top: 24, right: 24, textAlign: 'right' }}>
              ATMOSPHERE
              <strong>0.6 kPa</strong>
            </div>
            <div className="hud-card" style={{ bottom: 24, left: 24 }}>
              GRAVITY
              <strong>0.38 g</strong>
            </div>
            <div className="hud-card" style={{ bottom: 24, right: 24, textAlign: 'right', color: 'var(--amber)' }}>
              PERFECT MATCH
              <strong style={{ color: 'var(--amber)' }}>0.00%</strong>
            </div>
          </Reveal>
        </div>

        <div className="problem-stats">
          <div className="stat-cell">
            <div className="v"><Counter value={1} /></div>
            <div className="k">Site is not a mission</div>
          </div>
          <div className="stat-cell">
            <div className="v"><Counter value={6} /></div>
            <div className="k">Dimensions to match</div>
          </div>
          <div className="stat-cell">
            <div className="v" style={{ color: 'var(--amber)' }}><Counter value={0} /></div>
            <div className="k">Perfect analogs</div>
          </div>
        </div>

        <div className="problem-mini-grid">
          {[
            [Thermometer, 'Thermal', 'Day / night swing, mean temperature'],
            [Wind, 'Dust & aeolian', 'Wind, aridity, surface processes'],
            [ScanLine, 'Terrain', 'Relief, slope, landing geometry'],
            [AlertTriangle, 'What breaks', 'Gravity, pressure, radiation'],
          ].map(([Icon, title, desc], i) => {
            const I = Icon as typeof Thermometer;
            return (
              <div key={i} style={{ background: 'var(--ink)', padding: '22px 24px' }}>
                <I size={16} color="var(--cyan)" strokeWidth={1.4} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 16 }}>{title as string}</div>
                <div style={{ fontSize: 12, color: 'var(--paper-dim)', marginTop: 8, lineHeight: 1.5 }}>{desc as string}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
