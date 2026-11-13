import { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { mlScore, type Campaign, type Site, type ProfileKey } from '../types';

type Props = {
  sites: Site[];
  campaign: Campaign;
  profile: ProfileKey;
};

export function GlobeHero({ sites, campaign, profile }: Props) {
  const globeRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(600);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      setSize(Math.min(el.clientWidth, el.clientHeight));
    });
    ro.observe(el);
    setSize(Math.min(el.clientWidth, el.clientHeight));
    return () => ro.disconnect();
  }, []);

  const points = useMemo(
    () =>
      sites.map((s) => ({
        ...s,
        color: s.benchmark ? '#d9a45b' : '#65e6e9',
        score: mlScore(s, profile),
      })),
    [sites, profile],
  );

  const top = useMemo(
    () => [...sites].sort((a, b) => mlScore(b, profile) - mlScore(a, profile)).slice(0, 3),
    [sites, profile],
  );

  const arcs = useMemo(() => {
    const c = campaign.assignments;
    const out: any[] = [];
    for (let i = 0; i < c.length - 1; i++) {
      const a = sites.find((s) => s.id === c[i].siteId);
      const b = sites.find((s) => s.id === c[i + 1].siteId);
      if (a && b) {
        out.push({
          startLat: a.lat, startLng: a.lon,
          endLat: b.lat, endLng: b.lon,
          color: ['rgba(101,230,233,0.05)', 'rgba(101,230,233,0.75)'],
        });
      }
    }
    return out;
  }, [campaign, sites]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.32;
    controls.enableZoom = false;
    controls.enablePan = false;
    try {
      const mat = g.globeMaterial();
      mat.color = new THREE.Color('#6f8794');
      mat.emissive = new THREE.Color('#061019');
      mat.emissiveIntensity = 0.22;
      mat.shininess = 0.55;
    } catch {
      /* noop */
    }
  }, []);

  return (
    <div className="hero-globe" ref={wrapRef}>
      <div className="globe-glow" />
      <Globe
        ref={globeRef}
        width={size}
        height={size}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="/tex/earth_day_8k.jpg"
        atmosphereColor="#65e6e9"
        atmosphereAltitude={0.18}
        pointsData={points}
        pointLat="lat"
        pointLng="lon"
        pointColor="color"
        pointAltitude={(d: any) => 0.008 + (d.score / 100) * 0.035}
        pointRadius={(d: any) => (d.benchmark ? 0.32 : 0.24)}
        pointsMerge={false}
        arcsData={arcs}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor="color"
        arcStroke={0.45}
        arcDashLength={0.35}
        arcDashGap={0.25}
        arcDashAnimateTime={4200}
        ringsData={top}
        ringLat="lat"
        ringLng="lon"
        ringColor={() => 'rgba(101,230,233,0.55)'}
        ringMaxRadius={2.6}
        ringPropagationSpeed={1.1}
        ringRepeatPeriod={2400}
        enablePointerInteraction={false}
        animateIn={false}
        onGlobeReady={() => {
          const g = globeRef.current;
          if (g) g.pointOfView({ lat: 18, lng: -26, altitude: 1.92 }, 0);
        }}
      />
    </div>
  );
}
