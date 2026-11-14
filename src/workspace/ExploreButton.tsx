import { useEffect, useState } from 'react';
import type { Site } from '../types';
import { spawnCount } from '../components/spawn';

/** "Explore Earth analogs" with a live radar icon: analog sites pop up as red marks at their real positions. */
export function ExploreButton({ sites, onClick }: { sites: Site[]; onClick: () => void }) {
  const n = useSpawn(sites.length);
  return (
    <button type="button" className="btn btn-secondary btn-lg explore-btn" onClick={onClick}>
      <svg className="explore-radar" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="20" className="er-ring" />
        <circle cx="22" cy="22" r="12" className="er-ring" />
        <path d="M22 22 L22 2 A20 20 0 0 1 39.3 12 Z" className="er-sweep" />
        {sites.slice(0, n).map((s) => (
          <circle key={s.id} cx={22 + (s.lon / 180) * 18} cy={22 - (s.lat / 90) * 14} r={1.6} className="er-dot" />
        ))}
      </svg>
      Explore Earth analogs
    </button>
  );
}

/**
 * Continuous search readout under the buttons: land cells screened keeps climbing through the real
 * global screen (81,575 usable land cells), and analog hits tick up with the markers on the globe.
 */
export function SearchTicker({ total, cells }: { total: number; cells: number }) {
  const n = useSpawn(total);
  const [scanned, setScanned] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setScanned((v) => (v + 37 + Math.floor(Math.random() * 90)) % cells), 60);
    return () => window.clearInterval(id);
  }, [cells]);
  return (
    <p className="search-ticker" aria-live="off">
      <span className="st-spin" aria-hidden="true" />
      <span>Searching Earth</span>
      <b className="num">{scanned.toLocaleString('en-US')}</b>
      <span>land cells screened</span>
      <span className="st-sep" aria-hidden="true">·</span>
      <b className="num st-hit">{n}</b>
      <span>analog hits</span>
    </p>
  );
}

function useSpawn(total: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const id = window.setTimeout(() => setN(total), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setInterval(() => setN(Math.min(total, spawnCount(total))), 120);
    return () => window.clearInterval(id);
  }, [total]);
  return n;
}
