import { useState, type ReactNode } from 'react';

import type { Visual } from './visuals';

/** A cinematic image band with a gradient for legibility and a visible credit. */
export function PlanetaryVisual({ visual, kicker, title, children, height = 220, className = '' }: { visual: Visual; kicker?: string; title?: string; children?: ReactNode; height?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className={`pv pv-${visual.body.toLowerCase()} ${className}`} style={{ minHeight: height }}>
      {!failed ? <img src={visual.src} alt={visual.alt} loading="lazy" decoding="async" style={{ objectPosition: visual.position ?? 'center' }} onError={() => setFailed(true)} /> : null}
      <div className="pv-shade" aria-hidden="true" />
      {kicker || title || children ? (
        <div className="pv-text">
          {kicker ? <span className="pv-kicker">{kicker}</span> : null}
          {title ? <b className="pv-title">{title}</b> : null}
          {children}
        </div>
      ) : null}
      <figcaption className="pv-credit"><a href={visual.url} target="_blank" rel="noreferrer">{visual.credit}</a></figcaption>
    </figure>
  );
}
