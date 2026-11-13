import { useEffect, useMemo, useState } from 'react';
import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { mlScore, type Campaign, type Site } from '../types';

type Props = {
  sites: Site[];
  campaign: Campaign;
  selectedId: string;
  profile: keyof Site['scores'];
  onSelect: (id: string) => void;
};

const W = 1000;
const H = 520;

export function ScanMap({ sites, campaign, selectedId, profile, onSelect }: Props) {
  const [world, setWorld] = useState<any>(null);
  const [hover, setHover] = useState<{ site: Site; x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/world-110m.json')
      .then((r) => r.json())
      .then((topo) => {
        if (!alive) return;
        const land = feature(topo, topo.objects.countries);
        setWorld(land);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const { path, projection, graticule } = useMemo(() => {
    const p = geoNaturalEarth1().fitExtent([[18, 18], [W - 18, H - 18]], { type: 'Sphere' } as any);
    return { path: geoPath(p), projection: p, graticule: geoGraticule10() };
  }, []);

  const topIds = useMemo(() => new Set(campaign.sites.map((s) => s.id)), [campaign]);

  return (
    <div className="map-panel">
      <div className="map-hud tl">
        <span style={{ color: 'var(--green)' }}>●</span> GLOBAL SCAN / LIVE
        <div style={{ marginTop: 6, color: 'rgba(243,238,229,0.28)' }}>NATURAL EARTH / {sites.length} REGIONS</div>
      </div>
      <div className="map-hud tr">
        {sites.length} CANDIDATES
        <div style={{ marginTop: 6, color: 'rgba(243,238,229,0.28)' }}>FILTER / {profile.replace('_', ' ')}</div>
      </div>
      <div className="map-hud bl">
        NASA POWER / OPEN-METEO / GIBS
      </div>
      <div className="map-hud br">
        <span style={{ color: 'var(--cyan)' }}>◆</span> CLICK A SITE TO INSPECT
      </div>
      <div className="map-scan" />

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="siteGlow">
            <stop offset="0%" stopColor="rgba(101,230,233,0.35)" />
            <stop offset="100%" stopColor="rgba(101,230,233,0)" />
          </radialGradient>
        </defs>

        <path d={path(graticule) || ''} fill="none" stroke="rgba(101,230,233,0.055)" strokeWidth={0.7} />
        {world ? (
          <g>
            {world.features.map((f: any, i: number) => (
              <path
                key={i}
                d={path(f) || ''}
                fill="rgba(101,230,233,0.045)"
                stroke="rgba(101,230,233,0.16)"
                strokeWidth={0.55}
              />
            ))}
          </g>
        ) : null}

        {/* campaign connectors */}
        {campaign.assignments.map((a, i) => {
          if (i === 0) return null;
          const prev = campaign.assignments[i - 1];
          const from = sites.find((s) => s.id === prev.siteId);
          const to = sites.find((s) => s.id === a.siteId);
          if (!from || !to) return null;
          const aPt = projection([from.lon, from.lat]);
          const bPt = projection([to.lon, to.lat]);
          if (!aPt || !bPt) return null;
          const mx = (aPt[0] + bPt[0]) / 2;
          const my = (aPt[1] + bPt[1]) / 2 - 40;
          return (
            <path
              key={`arc-${a.siteId}`}
              d={`M ${aPt[0]} ${aPt[1]} Q ${mx} ${my} ${bPt[0]} ${bPt[1]}`}
              fill="none"
              stroke="rgba(101,230,233,0.28)"
              strokeWidth={1}
              strokeDasharray="3 6"
            />
          );
        })}

        {sites.map((s) => {
          const p = projection([s.lon, s.lat]);
          if (!p) return null;
          const [x, y] = p;
          const score = mlScore(s, profile);
          const active = s.id === selectedId;
          const top = topIds.has(s.id);
          const r = 3 + (score / 100) * 3.2;
          return (
            <g
              key={s.id}
              className="map-site"
              onClick={() => onSelect(s.id)}
              onMouseEnter={(e) => setHover({ site: s, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setHover({ site: s, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
            >
              {top ? <circle cx={x} cy={y} r={r + 9} fill="none" stroke="rgba(101,230,233,0.18)" strokeWidth={0.8} /> : null}
              {active ? <circle cx={x} cy={y} r={r + 16} fill="none" stroke="rgba(243,238,229,0.35)" strokeWidth={0.8} /> : null}
              <circle cx={x} cy={y} r={r + 5} fill="url(#siteGlow)" opacity={top ? 0.9 : 0.4} />
              <circle
                className="core"
                cx={x}
                cy={y}
                r={active ? r + 2 : r}
                fill={s.benchmark ? 'var(--amber)' : 'var(--cyan)'}
                opacity={active ? 1 : 0.9}
              />
              {top || active ? (
                <text
                  x={x + 10}
                  y={y - 8}
                  fill={active ? 'var(--paper)' : 'rgba(243,238,229,0.55)'}
                  fontFamily="IBM Plex Mono"
                  fontSize={8}
                  letterSpacing="0.12em"
                  style={{ textTransform: 'uppercase' }}
                >
                  {s.name}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      {hover ? (
        <div
          style={{
            position: 'fixed',
            left: hover.x + 14,
            top: hover.y + 14,
            zIndex: 50,
            pointerEvents: 'none',
            background: 'rgba(3,5,7,0.94)',
            border: '1px solid var(--line-strong)',
            padding: '10px 12px',
            minWidth: 180,
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{hover.site.name}</div>
          <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 4 }}>{hover.site.country} / {hover.site.type}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span className="mono" style={{ color: 'var(--cyan)' }}>MATCH</span>
            <span className="mono">{mlScore(hover.site, profile).toFixed(1)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
