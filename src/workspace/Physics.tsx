import { useId, useState } from 'react';
import type { ComparisonView } from '../agent/api';
import type { Site } from '../types';
import { Segmented } from './ui';

/** Geometry inputs. Latitudes match the app's planetary reference; obliquities are standard values. */
const TARGETS: Record<string, { name: string; short: string; lat: number; obliquity: number; g: number; air: 'none' | 'thin' }> = {
  moon_south_pole: { name: 'Lunar south pole', short: 'Moon', lat: -89.9, obliquity: 1.54, g: 1.62, air: 'none' },
  mars_jezero: { name: 'Jezero crater, Mars', short: 'Mars', lat: 18.44, obliquity: 25.19, g: 3.71, air: 'thin' },
};
const EARTH_OBLIQUITY = 23.44;
const EARTH_G = 9.81;
/** Shackleton crater, about 21 km across and 4.2 km deep (Zuber et al. 2012, Nature 486). */
const CRATER = { widthKm: 21, depthKm: 4.2 };

/** Noon Sun elevation range over a year: 90 - |lat - declination|, declination within ±obliquity. */
function noonRange(lat: number, obliquity: number) {
  const a = Math.abs(lat - obliquity), b = Math.abs(lat + obliquity);
  const far = Math.max(a, b);
  const near = Math.abs(lat) <= obliquity ? 0 : Math.min(a, b);
  return { min: 90 - far, max: 90 - near };
}

type View = 'light' | 'dust';

export function PhysicsDiagrams({ site, target, rows, initial }: { site: Site; target: string; rows: ComparisonView[] | null; initial: View }) {
  const [view, setView] = useState<View>(initial);
  const t = TARGETS[target] ?? TARGETS.moon_south_pole;
  const gRow = rows?.find((r) => r.dimension === 'gravity.surface');
  const gT = gRow?.planet.value ?? t.g;
  const gE = gRow?.earth.value ?? EARTH_G;
  return (
    <section className="card phys reveal" aria-label="Physical mechanisms">
      <div className="spread">
        <h3 className="card-title">Why the physics differs</h3>
        <Segmented label="Mechanism" value={view} options={[{ value: 'light', label: 'Illumination' }, { value: 'dust', label: 'Dust transport' }]} onChange={setView} />
      </div>
      <div key={view} className="phys-body">
        {view === 'light' ? <Illumination site={site} t={t} /> : <Dust site={site} t={t} gT={gT} gE={gE} />}
      </div>
    </section>
  );
}

function SunDial({ label, lat, obliquity, tone }: { label: string; lat: number; obliquity: number; tone: 'target' | 'earth' }) {
  const { min, max } = noonRange(lat, obliquity);
  const R = 70, cx = 84, cy = 90;
  const pt = (deg: number, r = R) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)] as const;
  const lo = Math.max(min, -8), hi = Math.max(max, lo + 0.6);
  const [x1, y1] = pt(lo), [x2, y2] = pt(hi);
  const sun = pt(hi, R + 10);
  return (
    <figure className="phys-dial">
      <svg viewBox="0 0 180 112" role="img" aria-label={`${label}: noon Sun between ${min.toFixed(1)} and ${max.toFixed(1)} degrees above the horizon over a year`}>
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} className="phys-sky" />
        <line x1={cx - R - 8} x2={cx + R + 8} y1={cy} y2={cy} className="phys-horizon" />
        <path d={`M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 0 0 ${x2} ${y2} Z`} className={`phys-band phys-${tone}`} />
        <circle cx={sun[0]} cy={sun[1]} r={5} className="phys-sun" />
        <text x={cx - R - 6} y={cy + 14} className="phys-tick">0°</text>
        <text x={cx + 10} y={cy - R + 10} className="phys-tick">90°</text>
      </svg>
      <figcaption>
        <b>{label}</b>
        <span className="num">Noon Sun {min.toFixed(1)}° to {max.toFixed(1)}°</span>
        <span className="subtle num">lat {lat.toFixed(1)}°, tilt {obliquity}°</span>
      </figcaption>
    </figure>
  );
}

function CraterShadow({ label, sunDeg, tone }: { label: string; sunDeg: number; tone: 'target' | 'earth' }) {
  const clip = useId().replace(/:/g, '');
  const W = 300, top = 18, k = 2; // vertical exaggeration x2
  const sx = (km: number) => 20 + (km / CRATER.widthKm) * (W - 40);
  const depthPx = (CRATER.depthKm / CRATER.widthKm) * (W - 40) * k;
  const floorY = top + depthPx;
  const shadowKm = sunDeg > 0 ? CRATER.depthKm / Math.tan((sunDeg * Math.PI) / 180) : Infinity;
  const lit = Math.max(0, CRATER.widthKm - shadowKm);
  const shadowEnd = sx(Math.min(CRATER.widthKm, shadowKm));
  const rayY = (x: number) => top + (x - sx(0)) * Math.tan((Math.max(sunDeg, 0) * Math.PI) / 180) * k;
  const crater = `M 0 ${top} L ${sx(0)} ${top} L ${sx(2.5)} ${floorY} L ${sx(18.5)} ${floorY} L ${sx(21)} ${top} L ${W} ${top}`;
  return (
    <figure className="phys-crater">
      <svg viewBox={`0 0 ${W} ${floorY + 22}`} role="img" aria-label={`${label}: at the highest noon Sun the rim shadow reaches ${Number.isFinite(shadowKm) ? `${shadowKm.toFixed(1)} km` : 'the whole crater'}; ${lit.toFixed(1)} of 21 km of the profile is lit`}>
        <defs><clipPath id={clip}><path d={`M ${sx(0)} ${top} L ${sx(2.5)} ${floorY} L ${sx(18.5)} ${floorY} L ${sx(21)} ${top} Z`} /></clipPath></defs>
        <path d={`${crater} L ${W} ${floorY + 22} L 0 ${floorY + 22} Z`} className="phys-ground" />
        <path clipPath={`url(#${clip})`} d={`M ${sx(0)} ${top} L ${shadowEnd} ${Math.min(rayY(shadowEnd), floorY)} L ${shadowEnd} ${floorY + 1} L ${sx(0)} ${floorY + 1} Z`} className="phys-shadow" />
        {lit > 0 ? <line x1={shadowEnd} x2={sx(18.5)} y1={floorY} y2={floorY} className={`phys-lit phys-${tone}-stroke`} /> : null}
        <line x1={sx(0)} y1={top} x2={shadowEnd} y2={Math.min(rayY(shadowEnd), floorY)} className="phys-ray" />
      </svg>
      <figcaption>
        <b>{label}</b>
        <span className="muted">{!Number.isFinite(shadowKm) || shadowKm >= CRATER.widthKm ? `Rim shadow ${Number.isFinite(shadowKm) ? `${Math.round(shadowKm)} km` : '∞'} at the highest noon Sun: floor never lit` : shadowKm < 2.5 ? `Rim shadow ${shadowKm.toFixed(1)} km at the highest noon Sun: floor fully sunlit` : `Rim shadow ${shadowKm.toFixed(1)} km at the highest noon Sun: floor partly sunlit`}</span>
      </figcaption>
    </figure>
  );
}

function Illumination({ site, t }: { site: Site; t: (typeof TARGETS)[string] }) {
  const target = noonRange(t.lat, t.obliquity);
  const earth = noonRange(site.lat, EARTH_OBLIQUITY);
  return (
    <>
      <div className="phys-row">
        <SunDial label={t.name} lat={t.lat} obliquity={t.obliquity} tone="target" />
        <SunDial label={site.name.split(',')[0]} lat={site.lat} obliquity={EARTH_OBLIQUITY} tone="earth" />
      </div>
      <p className="muted">
        {t.short === 'Moon'
          ? `The Moon's spin axis is tilted only ${t.obliquity}°, so at the pole the Sun never climbs more than about ${target.max.toFixed(1)}° above the horizon. At ${site.name.split(',')[0]} it reaches ${earth.max.toFixed(0)}° every year.`
          : `Jezero's noon Sun ranges ${target.min.toFixed(0)}° to ${target.max.toFixed(0)}°; ${site.name.split(',')[0]} ranges ${earth.min.toFixed(0)}° to ${earth.max.toFixed(0)}°. Mars' ${t.obliquity}° tilt is close to Earth's, so seasonal light is broadly comparable.`}
      </p>
      <div className="phys-row">
        <CraterShadow label={`A Shackleton-size crater at the ${t.short === 'Moon' ? 'lunar pole' : 'target'}`} sunDeg={target.max} tone="target" />
        <CraterShadow label={`The same crater at ${site.name.split(',')[0]}'s latitude`} sunDeg={earth.max} tone="earth" />
      </div>
      <p className="subtle">Schematic from geometry only: noon Sun elevation = 90° − |latitude − solar declination|, declination within ± axial tilt. The crater uses Shackleton's proportions (about 21 km wide, 4.2 km deep; Zuber et al. 2012), drawn with vertical exaggeration ×2. Terrain around real craters, and the Sun's position away from noon, change the exact shadow.</p>
    </>
  );
}

function Dust({ site, t, gT, gE }: { site: Site; t: (typeof TARGETS)[string]; gT: number; gE: number }) {
  const [v, setV] = useState(1.5);
  const ang = (45 * Math.PI) / 180;
  const flight = (g: number) => ({ range: (v * v * Math.sin(2 * ang)) / g, height: (v * v * Math.sin(ang) ** 2) / (2 * g), time: (2 * v * Math.sin(ang)) / g });
  const T = flight(gT), E = flight(gE);
  const W = 520, H = 170, x0 = 20, base = H - 26;
  const scale = (W - 40) / Math.max(T.range, 0.01);
  const path = (f: ReturnType<typeof flight>) => `M ${x0} ${base} Q ${x0 + (f.range * scale) / 2} ${base - 2 * f.height * scale} ${x0 + f.range * scale} ${base}`;
  const slow = 4;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return (
    <>
      <label className="rel-slider subtle">Grain launch speed <b className="num">{v.toFixed(1)} m/s</b> at 45°
        <input type="range" min={0.5} max={3} step={0.1} value={v} onChange={(e) => setV(Number(e.target.value))} />
      </label>
      <svg viewBox={`0 0 ${W} ${H}`} className="phys-dust" role="img" aria-label={`A grain launched at ${v.toFixed(1)} metres per second travels ${T.range.toFixed(2)} m on the ${t.short} and ${E.range.toFixed(2)} m on Earth without air drag`}>
        <line x1={x0 - 10} x2={W - 6} y1={base} y2={base} className="phys-horizon" />
        <path d={path(T)} className="phys-traj phys-target-stroke" />
        <path d={path(E)} className="phys-traj phys-earth-stroke" />
        {!reduce ? (
          <>
            <circle r={4} className="phys-grain phys-target-fill"><animateMotion dur={`${(T.time * slow).toFixed(2)}s`} repeatCount="indefinite" path={path(T)} /></circle>
            <circle r={4} className="phys-grain phys-earth-fill"><animateMotion dur={`${(E.time * slow).toFixed(2)}s`} repeatCount="indefinite" path={path(E)} /></circle>
          </>
        ) : null}
        <text x={x0 + T.range * scale} y={base + 16} textAnchor="end" className="phys-tick">{T.range.toFixed(2)} m</text>
        <text x={Math.max(x0 + E.range * scale, 50)} y={base + 16} textAnchor="middle" className="phys-tick">{E.range.toFixed(2)} m</text>
      </svg>
      <div className="phys-stats">
        <div><span className="subtle">{t.short} (g = {gT})</span><b className="num">{T.range.toFixed(2)} m · {T.height.toFixed(2)} m high · {T.time.toFixed(2)} s</b></div>
        <div><span className="subtle">Earth (g = {gE})</span><b className="num">{E.range.toFixed(2)} m · {E.height.toFixed(2)} m high · {E.time.toFixed(2)} s</b></div>
      </div>
      <p className="subtle">Ballistic flight: range = v²·sin 2θ / g, flight time = 2v·sin θ / g. {t.air === 'none' ? 'With no air on the Moon this is exact. On Earth, air drag shortens the path, strongly for fine dust, so the Earth curve is an upper bound.' : 'Air drag is ignored for both, so both curves are upper bounds; it matters most for fine dust.'} Animation slowed {slow}×.</p>
      <div className="phys-mech">
        <div><b className="phys-earth-text">Earth · {site.name.split(',')[0]}</b><span>Wind lifts and carries dust; mean wind here {site.climate.wind} m/s (NASA POWER). Air slows and suspends fine grains.</span></div>
        <div><b className="phys-target-text">{t.short}</b><span>{t.air === 'none' ? 'No atmosphere, so no wind. Dust moves only when something throws it (wheels, boots, impacts, exhaust plumes) and flies on pure ballistic arcs. Charged, jagged grains cling to surfaces, as on the Apollo suits.' : 'A thin CO₂ atmosphere still moves dust: wind and dust devils lift it and global storms can veil the Sun, but lifting grains takes stronger winds than on Earth.'}</span></div>
      </div>
    </>
  );
}
