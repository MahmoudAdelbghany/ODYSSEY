import { Play } from 'lucide-react';
import { Reveal } from './Reveal';

type Props = {
  onPlay: () => void;
};

export function Film({ onPlay }: Props) {
  return (
    <section className="film" id="film">
      <img src="/img/mars_opening_plate.jpg" alt="Mars surface from the Odyssey demo" />
      <div className="container film-content">
        <div>
          <Reveal>
            <div className="eyebrow" style={{ color: 'rgba(243,238,229,0.7)' }}>
              <span className="idx">12</span>
              <span>THE DEMO CUT</span>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="film-title" style={{ marginTop: 22 }}>
              64 SECONDS.<br />THE WHOLE PRODUCT.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="lead" style={{ marginTop: 22, color: 'rgba(243,238,229,0.72)' }}>
              Mission Control, the science layers, a 3D terrain walk, a travel-aware
              campaign, and the proof that it runs.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.2}>
          <button className="play" onClick={onPlay} aria-label="Play the Odyssey demo cut">
            <Play size={30} strokeWidth={1.2} />
          </button>
        </Reveal>
      </div>
    </section>
  );
}
