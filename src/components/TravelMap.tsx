import { useEffect, useMemo, useState } from 'react';
import { geoGraticule10, geoMercator, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Campaign, Site } from '../types';

type Props = {
  campaign: Campaign;
  sites: Site[];
};

const W = 1000;
const H = 520;

export function TravelMap({ campaign, sites }: Props) {
  const [world, setWorld] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    fetch('/world-110m.json')
      .then((r) => r.json())
      .then((topo) => {
        if (alive) setWorld(feature(topo, topo.objects.countries));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const { path, projection, graticule, regional, spanLon, spanLat } = useMemo(() => {
    const coords = campaign.assignments
      .map((a) => sites.find((s) => s.id === a.siteId))
      .filter(Boolean)
      .map((s) => [s!.lon, s!.lat] as [number, number]);
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const sLon = lons.length ? Math.max(...lons) - Math.min(...lons) : 360;
    const sLat = lats.length ? Math.max(...lats) - Math.min(...lats) : 180;
    const isRegional = coords.length > 0 && sLon < 90 && sLat < 55;
    let p;
    if (isRegional) {
      const padLon = Math.max(sLon * 0.45, 5);
      const padLat = Math.max(sLat * 0.45, 4);
      const fitPoints = {
        type: 'MultiPoint',
        coordinates: [
          [Math.min(...lons) - padLon, Math.min(...lats) - padLat],
          [Math.max(...lons) + padLon, Math.max(...lats) + padLat],
          ...coords,
        ],
      };
      p = geoMercator().fitExtent([[40, 40], [W - 40, H - 40]], fitPoints as any);
    } else {
      p = geoNaturalEarth1().fitExtent([[18, 18], [W - 18, H - 18]], { type: 'Sphere' } as any);
    }
    return { path: geoPath(p), projection: p, graticule: geoGraticule10(), regional: isRegional, spanLon: sLon, spanLat: sLat };
  }, [campaign, sites]);

  const nodes = campaign.assignments
    .map((a, i) => {
      const site = sites.find((s) => s.id === a.siteId);
      if (!site) return null;
      const p = projection([site.lon, site.lat]);
      if (!p) return null;
      return { ...site, index: i + 1, x: p[0], y: p[1] };
    })
    .filter(Boolean) as (Site & { index: number; x: number; y: number })[];

  return (
    <div className="travel-map">
      <div className="travel-map-hud tl">
        <span style={{ color: 'var(--green)' }}>●</span> ROUTE / OPTIMIZED
        <div style={{ marginTop: 6, color: 'rgba(243,238,229,0.28)' }}>
          {campaign.sites.length} SITES / {campaign.totalDays} DAYS
        </div>
      </div>
      <div className="travel-map-hud tr">
        {campaign.travelHours.toFixed(1)} H TRAVEL
        <div style={{ marginTop: 6, color: 'rgba(243,238,229,0.28)' }}>
          ${campaign.travelCost.toLocaleString()} EST.
        </div>
      </div>
      <div className="travel-map-hud bl">
        {regional ? 'REGIONAL FIT' : 'GLOBAL FIT'} / {spanLon.toFixed(0)}° × {spanLat.toFixed(0)}°
      </div>
      <div className="travel-map-hud br">ROUTE ORDER / 01 → 02 → 03</div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="routeGlow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="nodeGlow">
            <stop offset="0%" stopColor="rgba(101,230,233,0.5)" />
            <stop offset="100%" stopColor="rgba(101,230,233,0)" />
          </radialGradient>
        </defs>

        <path d={path(graticule) || ''} fill="none" stroke="rgba(101,230,233,0.06)" strokeWidth={0.7} />
        {world ? world.features.map((f: any, i: number) => (
          <path key={i} d={path(f) || ''} fill="rgba(101,230,233,0.04)" stroke="rgba(101,230,233,0.17)" strokeWidth={0.55} />
        )) : null}

        {campaign.legs.map((leg, i) => {
          const a = nodes[i];
          const b = nodes[i + 1];
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 - 55;
          return (
            <g key={`${leg.fromId}-${leg.toId}`}>
              <path
                d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                fill="none"
                stroke="rgba(101,230,233,0.22)"
                strokeWidth={5}
                filter="url(#routeGlow)"
              />
              <path
                d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                fill="none"
                stroke="rgba(101,230,233,0.9)"
                strokeWidth={1.2}
                strokeDasharray="4 7"
              />
              <text
                x={mx}
                y={my - 6 - i * 10}
                textAnchor="middle"
                fill="var(--amber)"
                fontFamily="IBM Plex Mono"
                fontSize={8}
                letterSpacing="0.12em"
              >
                {leg.hours.toFixed(1)} H / ${leg.cost.toLocaleString()}
              </text>
            </g>
          );
        })}

        {nodes.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={28} fill="url(#nodeGlow)" opacity={0.8} />
            <circle cx={n.x} cy={n.y} r={15} fill="none" stroke="rgba(101,230,233,0.35)" strokeWidth={0.8} />
            <circle cx={n.x} cy={n.y} r={10} fill="#03070c" stroke="var(--cyan)" strokeWidth={1.4} />
            <text x={n.x} y={n.y + 3} textAnchor="middle" fill="var(--paper)" fontFamily="IBM Plex Mono" fontSize={8}>
              {String(n.index).padStart(2, '0')}
            </text>
            <text
              x={n.index === 2 ? n.x - 170 : n.x + 17}
              y={n.index === 2 ? n.y + 26 : n.y - 10}
              fill="var(--paper)" fontFamily="IBM Plex Mono" fontSize={8} letterSpacing="0.1em"
            >
              {n.name.toUpperCase()}
            </text>
            <text
              x={n.index === 2 ? n.x - 170 : n.x + 17}
              y={n.index === 2 ? n.y + 38 : n.y + 2}
              fill="rgba(243,238,229,0.45)" fontFamily="IBM Plex Mono" fontSize={7} letterSpacing="0.1em"
            >
              {n.airport?.iata} / {n.airport?.hub}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
