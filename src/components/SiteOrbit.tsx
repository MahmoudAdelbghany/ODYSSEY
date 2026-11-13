import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  DIMENSION_LABELS,
  mlScore,
  mlUncertainty,
  type Dimensions,
  type ProfileKey,
  type Site,
  type SiteImageryInfo,
  type SiteTerrainInfo,
} from '../types';
import type { MissionSpec, SiteMissionResult } from '../mission';
import type { ExperimentTemporalResult } from '../temporal';
import { PlanetaryComparison } from './PlanetaryComparison';

type LayerKey = 'imagery' | 'elevation' | 'slope' | 'thermal' | 'geology' | 'surface';

type Props = {
  site: Site;
  profile: ProfileKey;
  profileLabel: string;
  rank: number;
  imagery?: SiteImageryInfo;
  terrain?: SiteTerrainInfo;
  assignmentExperiment?: string;
  mission?: MissionSpec;
  siteMission?: SiteMissionResult;
  siteTemporal?: Record<string, ExperimentTemporalResult>;
  focusExperimentId?: string | null;
  closing: boolean;
  onClose: () => void;
  onOpenBriefing?: () => void;
  origin?: 'curated' | 'generated';
  candidateTotal?: number;
  missingDimensions?: string[];
  coarseScore?: number;
  cellCount?: number;
  classification?: string;
};

const SITE_STATUS: Record<string, string> = {
  pass: 'Pass',
  partial: 'Partial',
  fail: 'Fail',
  missing: 'No data',
  'not-applicable': 'Facility',
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function niceDistance(meters: number) {
  const power = 10 ** Math.floor(Math.log10(Math.max(1, meters)));
  const n = meters / power;
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * power;
}

function distanceLabel(meters: number) {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} KM`;
  }
  return `${Math.round(meters)} M`;
}

function coordText(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lon).toFixed(2)}°${
    lon >= 0 ? 'E' : 'W'
  }`;
}

function fmt(value: number | null | undefined, digits = 1, unit = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(digits)}${unit}`;
}

const ELEVATION_GRADIENT =
  'linear-gradient(90deg,#243630 0%,#384f42 25%,#667054 48%,#a39166 70%,#d6c199 88%,#f5eddb 100%)';
const SLOPE_GRADIENT =
  'linear-gradient(90deg,#1e292d 0%,#2e4d57 30%,#66765e 58%,#a88c61 80%,#e6cfa8 100%)';

export function SiteOrbit({
  site,
  profile,
  profileLabel,
  rank,
  imagery,
  terrain,
  assignmentExperiment,
  mission,
  siteMission,
  siteTemporal,
  focusExperimentId,
  closing,
  onClose,
  origin = 'curated',
  candidateTotal = 39,
  missingDimensions = [],
  coarseScore,
  cellCount,
  classification,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const scaleBarRef = useRef<HTMLElement>(null);
  const scaleLabelRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLElement>(null);
  const layerRef = useRef<LayerKey>('imagery');
  const [layer, setLayer] = useState<LayerKey>('imagery');
  const [revealed, setRevealed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [missionOpen, setMissionOpen] = useState(false);
  const [planetaryOpen, setPlanetaryOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(focusExperimentId ?? null);
  const [terrainAvailable, setTerrainAvailable] = useState(Boolean(terrain));
  layerRef.current = layer;

  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 1300);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setFocusId(focusExperimentId ?? null);
  }, [focusExperimentId]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uMode.value =
      layer === 'elevation' ? 1 : layer === 'slope' ? 2 : 0;
  }, [layer]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const wrap = canvasRef.current;
    if (!wrap) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 10, 200000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.rotateSpeed = 0.42;
    controls.zoomSpeed = 0.6;
    controls.minDistance = 12000;
    controls.maxDistance = 60000;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = 1.36;
    controls.enabled = false;

    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const loader = new THREE.TextureLoader();
    let frame = 0;
    let cancelled = false;
    let intro = true;
    let introStart = 0;
    let tick = 0;
    let sitePoint = new THREE.Vector3();
    let startSph = new THREE.Spherical(38000, 0.52, 0.55);
    let endSph = new THREE.Spherical(15500, 0.38, 0.15);

    const setSize = () => {
      const w = wrap.clientWidth || 1;
      const h = wrap.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(setSize);
    ro.observe(wrap);
    setSize();

    const mapUrl = imagery?.file ?? site.image;
    const imagePromise = new Promise<THREE.Texture>((resolve, reject) => {
      const texture = loader.load(
        mapUrl,
        () => resolve(texture),
        undefined,
        () => reject(new Error('site image unavailable')),
      );
      texture.flipY = false;
      texture.colorSpace = THREE.NoColorSpace;
      texture.anisotropy = maxAniso;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
    });

    const imageW = imagery?.width ?? 2048;
    const imageH = imagery?.height ?? 1280;
    const widthMeters = terrain?.widthMeters ?? imageW * (imagery?.mpp ?? 10);
    const heightMeters = terrain?.heightMeters ?? imageH * (imagery?.mpp ?? 10);
    const cols = terrain?.width ?? 512;
    const rows = terrain?.height ?? 320;

    const heightPromise = (async () => {
      if (!terrain) return { heights: new Float32Array(cols * rows), flat: true };
      try {
        const response = await fetch(terrain.file);
        if (!response.ok) throw new Error(`heightmap ${response.status}`);
        const buffer = await response.arrayBuffer();
        const heights = new Float32Array(buffer);
        if (heights.length !== cols * rows) throw new Error('heightmap size mismatch');
        return { heights, flat: false };
      } catch {
        return { heights: new Float32Array(cols * rows), flat: true };
      }
    })();

    Promise.all([imagePromise, heightPromise])
      .then(([map, heightResult]) => {
        if (cancelled) {
          map.dispose();
          return;
        }
        const { heights, flat } = heightResult;
        if (flat) setTerrainAvailable(false);

        const siteU = imagery ? imagery.sitePx[0] / imagery.width : 0.5;
        const siteV = imagery ? imagery.sitePx[1] / imagery.height : 0.5;
        const siteIx = Math.round(siteU * (cols - 1));
        const siteIy = Math.round(siteV * (rows - 1));
        const siteHeight = heights[siteIy * cols + siteIx] ?? 0;
        sitePoint = new THREE.Vector3(
          (siteU - 0.5) * widthMeters,
          siteHeight,
          (siteV - 0.5) * heightMeters,
        );

        const positions = new Float32Array(cols * rows * 3);
        const uvs = new Float32Array(cols * rows * 2);
        for (let iy = 0; iy < rows; iy += 1) {
          const v = iy / (rows - 1);
          for (let ix = 0; ix < cols; ix += 1) {
            const u = ix / (cols - 1);
            const index = iy * cols + ix;
            positions[index * 3] = (u - 0.5) * widthMeters;
            positions[index * 3 + 1] = heights[index] ?? 0;
            positions[index * 3 + 2] = (v - 0.5) * heightMeters;
            uvs[index * 2] = u;
            uvs[index * 2 + 1] = v;
          }
        }
        const indices = new Uint32Array((cols - 1) * (rows - 1) * 6);
        let ptr = 0;
        for (let iy = 0; iy < rows - 1; iy += 1) {
          for (let ix = 0; ix < cols - 1; ix += 1) {
            const a = iy * cols + ix;
            const b = a + 1;
            const c = a + cols;
            const d = c + 1;
            indices[ptr++] = a;
            indices[ptr++] = c;
            indices[ptr++] = b;
            indices[ptr++] = b;
            indices[ptr++] = c;
            indices[ptr++] = d;
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeBoundingSphere();

        const heightTexture = new THREE.DataTexture(
          heights,
          cols,
          rows,
          THREE.RedFormat,
          THREE.FloatType,
        );
        heightTexture.flipY = false;
        heightTexture.colorSpace = THREE.NoColorSpace;
        heightTexture.minFilter = THREE.NearestFilter;
        heightTexture.magFilter = THREE.NearestFilter;
        heightTexture.wrapS = THREE.ClampToEdgeWrapping;
        heightTexture.wrapT = THREE.ClampToEdgeWrapping;
        heightTexture.needsUpdate = true;

        const material = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: map },
            heightMap: { value: heightTexture },
            uMode: { value: layerRef.current === 'elevation' ? 1 : layerRef.current === 'slope' ? 2 : 0 },
            uMin: { value: terrain?.min ?? 0 },
            uMax: { value: terrain?.max ?? 1 },
            uMpp: { value: terrain?.mpp ?? 40 },
            uTexel: { value: new THREE.Vector2(1 / cols, 1 / rows) },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D map;
            uniform sampler2D heightMap;
            uniform int uMode;
            uniform float uMin;
            uniform float uMax;
            uniform float uMpp;
            uniform vec2 uTexel;
            varying vec2 vUv;

            vec3 elevationRamp(float t) {
              vec3 c0 = vec3(0.140, 0.215, 0.200);
              vec3 c1 = vec3(0.220, 0.310, 0.260);
              vec3 c2 = vec3(0.400, 0.440, 0.330);
              vec3 c3 = vec3(0.640, 0.570, 0.400);
              vec3 c4 = vec3(0.840, 0.760, 0.600);
              vec3 c5 = vec3(0.960, 0.930, 0.860);
              if (t < 0.25) return mix(c0, c1, t / 0.25);
              if (t < 0.48) return mix(c1, c2, (t - 0.25) / 0.23);
              if (t < 0.70) return mix(c2, c3, (t - 0.48) / 0.22);
              if (t < 0.88) return mix(c3, c4, (t - 0.70) / 0.18);
              return mix(c4, c5, (t - 0.88) / 0.12);
            }

            vec3 slopeRamp(float t) {
              vec3 c0 = vec3(0.120, 0.160, 0.180);
              vec3 c1 = vec3(0.180, 0.300, 0.340);
              vec3 c2 = vec3(0.400, 0.460, 0.370);
              vec3 c3 = vec3(0.660, 0.550, 0.380);
              vec3 c4 = vec3(0.900, 0.810, 0.660);
              if (t < 0.30) return mix(c0, c1, t / 0.30);
              if (t < 0.58) return mix(c1, c2, (t - 0.30) / 0.28);
              if (t < 0.80) return mix(c2, c3, (t - 0.58) / 0.22);
              return mix(c3, c4, (t - 0.80) / 0.20);
            }

            void main() {
              vec3 color = texture2D(map, vUv).rgb;
              if (uMode == 1) {
                float h = texture2D(heightMap, vUv).r;
                float t = clamp((h - uMin) / max(1.0, uMax - uMin), 0.0, 1.0);
                t = pow(t, 0.55);
                color = elevationRamp(t);
                color = mix(color, texture2D(map, vUv).rgb, 0.18);
                float hl = texture2D(heightMap, vUv - vec2(uTexel.x, 0.0)).r;
                float hr = texture2D(heightMap, vUv + vec2(uTexel.x, 0.0)).r;
                float hu = texture2D(heightMap, vUv + vec2(0.0, uTexel.y)).r;
                float hd = texture2D(heightMap, vUv - vec2(0.0, uTexel.y)).r;
                vec3 n = normalize(vec3(hl - hr, 2.0 * uMpp, hu - hd));
                float shade = 0.68 + 0.32 * max(dot(n, normalize(vec3(-0.55, 1.0, 0.35))), 0.0);
                color *= shade;
                float interval = 100.0;
                float contour = abs(fract(h / interval + 0.5) - 0.5) * interval;
                float width = max(fwidth(h), 0.01);
                float line = 1.0 - smoothstep(0.0, width * 2.0, contour);
                color = mix(color, vec3(0.90, 0.78, 0.58), line * 0.42);
              } else if (uMode == 2) {
                float hl = texture2D(heightMap, vUv - vec2(uTexel.x, 0.0)).r;
                float hr = texture2D(heightMap, vUv + vec2(uTexel.x, 0.0)).r;
                float hu = texture2D(heightMap, vUv + vec2(0.0, uTexel.y)).r;
                float hd = texture2D(heightMap, vUv - vec2(0.0, uTexel.y)).r;
                float dx = (hr - hl) / (2.0 * uMpp);
                float dz = (hd - hu) / (2.0 * uMpp);
                float slope = degrees(atan(sqrt(dx * dx + dz * dz)));
                float st = clamp(slope / 45.0, 0.0, 1.0);
                st = pow(st, 0.42);
                color = slopeRamp(st);
                color = mix(color, texture2D(map, vUv).rgb, 0.16);
                vec3 n = normalize(vec3(hl - hr, 2.0 * uMpp, hu - hd));
                float shade = 0.68 + 0.32 * max(dot(n, normalize(vec3(-0.55, 1.0, 0.35))), 0.0);
                color *= shade;
              }
              float edge = smoothstep(0.0, 0.105, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
              gl_FragColor = vec4(color, edge);
            }
          `,
          transparent: true,
          depthWrite: true,
          side: THREE.FrontSide,
        });
        materialRef.current = material;

        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        scene.add(mesh);

        controls.target.copy(sitePoint);
        const setCamera = (sph: THREE.Spherical) => {
          const offset = new THREE.Vector3().setFromSpherical(sph);
          camera.position.copy(sitePoint).add(offset);
          camera.lookAt(sitePoint);
        };
        setCamera(startSph);
        introStart = performance.now();
        setLoaded(true);

        const scaleFor = (dist: number) => {
          const vertical = 2 * dist * Math.tan((camera.fov * Math.PI) / 360);
          const mpp = vertical / Math.max(1, wrap.clientHeight);
          const nice = niceDistance(120 * mpp);
          return { width: nice / mpp, label: distanceLabel(nice) };
        };

        const animate = () => {
          frame = requestAnimationFrame(animate);
          if (cancelled) return;
          const now = performance.now();
          if (intro) {
            const raw = Math.min(1, (now - introStart) / 3400);
            const e = easeInOutCubic(raw);
            const sph = new THREE.Spherical(
              startSph.radius + (endSph.radius - startSph.radius) * e,
              startSph.phi + (endSph.phi - startSph.phi) * e,
              startSph.theta + (endSph.theta - startSph.theta) * e,
            );
            setCamera(sph);
            if (raw >= 1) {
              intro = false;
              controls.enabled = true;
              controls.update();
            }
          } else {
            controls.update();
          }
          if (tick % 8 === 0) {
            const dist = camera.position.distanceTo(sitePoint);
            const scale = scaleFor(dist);
            if (scaleBarRef.current) scaleBarRef.current.style.width = `${clamp(scale.width, 34, 170)}px`;
            if (scaleLabelRef.current) scaleLabelRef.current.textContent = `${scale.label} (APPROX)`;
            if (altRef.current) altRef.current.textContent = `${(dist / 1000).toFixed(1)} KM`;
          }
          tick += 1;
          renderer.render(scene, camera);
        };
        animate();
      })
      .catch(() => {
        if (!cancelled) setLoaded(false);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else if (material) material.dispose();
      });
      materialRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentElement === wrap) wrap.removeChild(renderer.domElement);
    };
    // The terrain scene is rebuilt only when the site changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id, imagery?.file, terrain?.file]);

  const dims = (
    Object.entries(site.scores[profile].dimensions) as [keyof Dimensions, number][]
  )
    .filter(([key]) => !missingDimensions.includes(key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const score = mlScore(site, profile);
  const uncertainty = mlUncertainty(site, profile);
  const rule = site.scores[profile].total;
  const missionFit = siteMission?.score ?? null;
  const missionCoverage = siteMission?.coverage ?? 0;
  const focusedExperiment =
    mission?.experiments.find((experiment) => experiment.id === focusId) ??
    mission?.experiments.find((experiment) => experiment.id === focusExperimentId) ??
    mission?.experiments.find((experiment) => experiment.id === siteMission?.bestExperimentId) ??
    mission?.experiments[0] ??
    null;
  const focusedResult =
    focusedExperiment && siteMission ? siteMission.experiments[focusedExperiment.id] : null;
  const thermalAvailable = Number.isFinite(site.climate.tempMean);
  const geologyAvailable = Boolean(site.macrostrat);
  const imageDate = imagery?.date ?? '2026';
  const cloud = imagery?.cloud;
  const year = imageDate.slice(0, 4);

  const layers: {
    key: LayerKey;
    index: string;
    label: string;
    available: boolean;
  }[] = [
    { key: 'imagery', index: '01', label: 'Orbital imagery', available: Boolean(imagery) },
    { key: 'elevation', index: '02', label: 'Elevation', available: terrainAvailable },
    { key: 'slope', index: '03', label: 'Slope', available: terrainAvailable },
    { key: 'thermal', index: '04', label: 'Thermal', available: thermalAvailable },
    { key: 'geology', index: '05', label: 'Geology', available: geologyAvailable },
    {
      key: 'surface',
      index: '06',
      label: 'Surface / access',
      available: Number.isFinite(site.access),
    },
  ];

  const activeLayer = layers.find((l) => l.key === layer) ?? layers[0];
  const demNote = terrain
    ? `${terrain.source} · ${terrain.date} · ${terrain.mpp} M HEIGHTMAP`
    : 'DEM unavailable, satellite only';

  const labelForLayer = {
    imagery: 'Sentinel-2 L2A / true color',
    elevation: 'Copernicus DEM / elevation',
    slope: 'Derived from Copernicus DEM',
    thermal: 'NASA POWER / point observation',
    geology: 'Macrostrat / mapped unit',
    surface: 'NASA POWER / operational indices',
  }[layer];

  const legend = (() => {
    if (layer === 'elevation') {
      return {
        head: 'Elevation / metres',
        min: terrain ? `${Math.round(terrain.min)}` : 'N/A',
        max: terrain ? `${Math.round(terrain.max)}` : 'N/A',
        gradient: ELEVATION_GRADIENT,
        source: demNote,
        note: terrain
          ? 'Copernicus DEM GLO-30, 30 m source, 100 m contours, gamma 0.55 display stretch'
          : 'No terrain DEM for this site',
      };
    }
    if (layer === 'slope') {
      return {
        head: 'Surface slope / degrees',
        min: '0°',
        max: '45°+',
        gradient: SLOPE_GRADIENT,
        source: demNote,
        note: 'Derived from DEM, 30 m smoothing, gamma 0.42 display stretch, not a measurement',
      };
    }
    if (layer === 'thermal') {
      return {
        head: 'Thermal / point observation',
        values: [
          ['Mean', fmt(site.climate.tempMean, 1, ' °C')],
          ['Max', fmt(site.climate.tempMax, 1, ' °C')],
          ['Min', fmt(site.climate.tempMin, 1, ' °C')],
          ['Precip', fmt(site.climate.precipDay, 2, ' Mm/d')],
        ],
        source: 'NASA POWER / 2001–2020',
        note: 'Point at site, no spatial thermal raster, not field-measured',
      };
    }
    if (layer === 'geology') {
      return {
        head: 'Geology: Mapped unit',
        values: site.macrostrat
          ? [
              ['Unit', site.macrostrat.unit],
              ['Lith', site.macrostrat.lith],
              ['Age', site.macrostrat.age],
            ]
          : [['Unit', 'No mapped unit']],
        source: site.macrostrat?.source ?? 'No Macrostrat coverage',
        note: 'Point at site, not a continuous geological surface',
      };
    }
    if (layer === 'surface') {
      return {
        head: 'Surface / operational indices',
        values: [
          ['Aridity', fmt(site.climate.precipYear, 0, ' Mm/y')],
          ['Humidity', fmt(site.climate.humidity, 0, '%')],
          ['Dust', fmt(site.dust, 2, ' / 1')],
          ['Access', fmt(site.access, 2, ' / 1')],
          ['Water', fmt(site.water, 2, ' / 1')],
        ],
        source: 'NASA POWER 2001–2020 / expert features',
        note: 'Point / derived indices, no spatial raster',
      };
    }
    return {
      head: 'Orbital imagery / true color',
      values: [
        ['Sensor', 'Sentinel-2 L2A'],
        ['Date', imageDate],
        ['Cloud', cloud !== undefined ? `${cloud.toFixed(2)}%` : 'N/A'],
        ['Pixel', '10 M'],
      ],
      source: 'ESA Copernicus / b04 b03 b02 surface reflectance',
      note: 'Contains modified Copernicus sentinel data, 10 m native / max zoom',
    };
  })();

  return (
    <div
      className={`sitev siteorbit${origin === 'generated' ? ' siteorbit-generated' : ''}${revealed ? ' is-revealed' : ''}${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-label={`${site.name} site orbit`}
    >
      <div className="siteorbit-bg" />
      <div className="siteorbit-canvas" ref={canvasRef} />
      <div className="sitev-vignette" />

      {!loaded ? (
        <div className="sitev-loading">
          <span className="orb-init-dot" />
          <span>Acquiring terrain / Sentinel-2 + Copernicus DEM</span>
        </div>
      ) : null}

      <header className="sitev-top">
        <div className="orb-brand">
          <span className="orb-mark" />
          <span>ODYSSEY</span>
        </div>
        <div className="orb-op">
          <b>3D terrain</b>
        </div>
        <div className="sitev-actions">
            <>
            <button
              className="siteorbit-planetary-toggle"
              onClick={() => {
                setPlanetaryOpen((open) => !open);
                setMissionOpen(false);
              }}
            >
              {planetaryOpen ? 'Hide target comparison' : 'Compare with target'}
            </button>
            {mission && siteMission ? (
              <button
                className="siteorbit-mission-toggle"
                onClick={() => {
                  setMissionOpen((open) => !open);
                  setPlanetaryOpen(false);
                }}
              >
                {missionOpen ? 'Hide mission' : 'Mission'}
              </button>
            ) : null}
            </>
          <a
            href={`https://earth.google.com/web/@${site.lat},${site.lon},0a,12000d,35y`}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open in Google Earth
          </a>
          <button className="sitev-back" onClick={onClose}>← Back</button>
        </div>
      </header>

      <nav className="siteorbit-layers" aria-label="Scientific layers">
        <span className="siteorbit-layers-label">Scientific layers</span>
        {layers.map((item) => (
          <button
            key={item.key}
            className={layer === item.key ? 'active' : ''}
            disabled={!item.available}
            onClick={() => item.available && setLayer(item.key)}
          >
            <span>{item.index}</span>
            <b>{item.label}</b>
            {!item.available ? <em>No data</em> : null}
          </button>
        ))}
      </nav>

      <div className="siteorbit-reticle" aria-hidden="true">
        <span>Site</span>
      </div>

      {layer === 'thermal' || layer === 'geology' || layer === 'surface' ? (
        <>
          <svg
            className="siteorbit-leader"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M50 50 L58 50 L58 34" />
          </svg>
          <div className="siteorbit-anchor">
          <div className="siteorbit-anchor-copy">
            <div className="siteorbit-anchor-head">
              {layer === 'thermal'
                ? 'Thermal / NASA POWER'
                : layer === 'geology'
                  ? 'Geology: Macrostrat'
                  : 'Surface / operational indices'}
            </div>
            {layer === 'thermal' ? (
              <>
                <div className="siteorbit-anchor-row">
                  <span>Mean</span>
                  <b>{fmt(site.climate.tempMean, 1, ' °C')}</b>
                </div>
                <div className="siteorbit-anchor-row">
                  <span>Max / min</span>
                  <b>
                    {fmt(site.climate.tempMax, 1, '°')} / {fmt(site.climate.tempMin, 1, '°C')}
                  </b>
                </div>
                <div className="siteorbit-anchor-row">
                  <span>Precip</span>
                  <b>{fmt(site.climate.precipDay, 2, ' Mm/d')}</b>
                </div>
                <div className="siteorbit-anchor-note">
                  Point observation / 2001–2020
                  <br />
                  No spatial thermal raster on this view
                </div>
              </>
            ) : layer === 'geology' ? (
              <>
                <div className="siteorbit-anchor-row">
                  <span>Unit</span>
                  <b>{site.macrostrat?.unit ?? 'No mapped unit'}</b>
                </div>
                <div className="siteorbit-anchor-row">
                  <span>Lith / age</span>
                  <b>
                    {site.macrostrat?.lith ?? 'N/A'} / {site.macrostrat?.age ?? 'N/A'}
                  </b>
                </div>
                <div className="siteorbit-anchor-note">
                  Point at site / Macrostrat cc-by 4.0
                  <br />
                  Not a continuous geological surface
                </div>
              </>
            ) : (
              <>
                <div className="siteorbit-anchor-row">
                  <span>Aridity</span>
                  <b>{fmt(site.climate.precipYear, 0, ' Mm/y')}</b>
                </div>
                <div className="siteorbit-anchor-row">
                  <span>Dust / access</span>
                  <b>
                    {fmt(site.dust, 2)} / {fmt(site.access, 2)}
                  </b>
                </div>
                <div className="siteorbit-anchor-row">
                  <span>Water</span>
                  <b>{fmt(site.water, 2, ' / 1')}</b>
                </div>
                <div className="siteorbit-anchor-note">
                  Point / derived indices
                  <br />
                  No spatial raster on this view
                </div>
              </>
            )}
          </div>
        </div>
        </>
      ) : null}

      <div className="sitev-id siteorbit-id">
        {origin === 'generated' ? <div className="sitev-kicker">Generated region, {profileLabel}</div> : null}
        <h1>{site.name}</h1>
        <div className="sitev-sub">
          {site.country} / {site.type}
        </div>
        <p className="siteorbit-summary">{site.summary}</p>

        {origin === 'generated' ? (
        <>
        <div className="sitev-facts">
          <div>
            <span>{origin === 'generated' ? 'Detailed screen' : 'Mission fit'}</span>
            <b>
              {origin === 'generated'
                ? rule.toFixed(1)
                : missionFit !== null
                  ? missionFit.toFixed(1)
                  : '–'}{' '}
              <em>
                {origin === 'generated'
                  ? `${Math.round(site.scores[profile].confidence * 100)}% COVERAGE`
                  : `${Math.round(missionCoverage * 100)}% DATA`}
              </em>
            </b>
          </div>
          <div>
            <span>ML match / context</span>
            <b>{origin === 'generated' ? 'Not used' : `${score.toFixed(1)} ±${uncertainty.toFixed(1)}`}</b>
          </div>
          <div>
            <span>{origin === 'generated' ? 'Coarse screen' : 'Rule score'}</span>
            <b>
              {origin === 'generated'
                ? coarseScore !== undefined
                  ? `${coarseScore.toFixed(1)} / 100`
                  : '–'
                : `${rule.toFixed(1)} / 100`}
            </b>
          </div>
          <div>
            <span>Field window</span>
            <b>{site.windows[profile].length ? site.windows[profile].join('–') : 'No window'}</b>
          </div>
          <div>
            <span>{origin === 'generated' ? 'H3 footprint' : 'Strongest scored'}</span>
            <b>
              {origin === 'generated'
                ? `${cellCount ?? '–'} CELLS`
                : siteMission?.bestExperimentId
                  ? mission?.experiments.find((e) => e.id === siteMission.bestExperimentId)?.shortName ??
                    '–'
                  : '–'}
            </b>
          </div>
          <div>
            <span>Campaign</span>
            <b>{origin === 'generated' ? 'Not in campaign' : assignmentExperiment ?? 'Unassigned'}</b>
          </div>
        </div>

        <div className="siteorbit-dims">
          {dims.map(([key, value]) => (
            <div key={key}>
              <span>{DIMENSION_LABELS[key]}</span>
              <b>{value.toFixed(0)}</b>
              <div className="siteorbit-bar">
                <i style={{ width: `${clamp(value, 0, 100)}%` }} />
              </div>
              <em>Model</em>
            </div>
          ))}
        </div>

        <div className="siteorbit-why">
          {origin === 'generated' ? (
            <>
              <span>Why /</span> Generated {classification ?? 'Region'} · {cellCount ?? '–'} H3 CELLS ·
              COARSE SCREEN {coarseScore !== undefined ? coarseScore.toFixed(1) : '–'} · Detailed screen{' '}
              {rule.toFixed(1)} · ML NOT USED
            </>
          ) : (
            <>
              <span>Why /</span> Mission rank {String(rank).padStart(2, '0')} Of {candidateTotal} · Fit{' '}
              {missionFit !== null ? missionFit.toFixed(1) : '–'} · Data{' '}
              {Math.round(missionCoverage * 100)}%, ML context {score.toFixed(1)}
            </>
          )}
        </div>
        <div className="siteorbit-limits">
          <span>Limitations /</span>{' '}
          {origin === 'generated'
            ? `RULE-BASED SCREEN, NOT A PROBABILITY · DEM 30 M / HEIGHTMAP 40 M · IMAGERY ${imageDate}${
                cloud !== undefined ? ` / CLOUD ${cloud.toFixed(2)}%` : ''
              } · POWER MONTHLY NORMALS · NO FIELD VALIDATION.`
            : `ML SURROGATE, NOT FIELD-VALIDATED · DEM 30 M · IMAGERY ${imageDate}${
                cloud !== undefined ? ` / CLOUD ${cloud.toFixed(2)}%` : ''
              } · POINT CLIMATE / GEOLOGY, NOT SPATIAL FIELDS.`}
          {terrain && terrain.voidPct > 0.5
            ? ` · DEM VOIDS ${terrain.voidPct.toFixed(1)}% FILLED.`
            : ''}
          {!terrainAvailable ? ' · Terrain unavailable, satellite only.' : ''}
        </div>
        </>
        ) : null}
        <div className="siteorbit-exp" hidden={origin !== 'generated'}>
          <span>Experiments /</span>{' '}
          {mission && siteMission
            ? mission.experiments
                .map((experiment) => {
                  const result = siteMission.experiments[experiment.id];
                  return `${experiment.shortName} ${
                    result?.score !== null && result?.score !== undefined
                      ? result.score.toFixed(0)
                      : '–'
                  }`;
                })
                .join(' · ')
            : assignmentExperiment ?? 'No experiment assignment'}
          {site.tags.length ? `. Targets: ${site.tags.slice(0, 4).join(' · ')}` : ''}
        </div>
        <div className="sitev-credit">
          Contains modified Copernicus Sentinel data {year} (ESA). DEM © DLR/ESA. Macrostrat CC-BY 4.0.
        </div>
      </div>

      {planetaryOpen ? (
        <PlanetaryComparison site={site} profile={profile} onClose={() => setPlanetaryOpen(false)} />
      ) : null}

      <div className="siteorbit-legend">
        <div className="siteorbit-legend-head">
          {labelForLayer} <span>{activeLayer?.index}</span>
        </div>
        {'values' in legend && legend.values ? (
          <div className="siteorbit-legend-values">
            {legend.values.map(([key, value]) => (
              <div key={key}>
                <span>{key}</span>
                <b>{value}</b>
              </div>
            ))}
          </div>
        ) : null}
        {'gradient' in legend && legend.gradient ? (
          <>
            <div className="siteorbit-legend-bar" style={{ background: legend.gradient }} />
            <div className="siteorbit-legend-ends">
              <span>{legend.min}</span>
              <span>{legend.max}</span>
            </div>
          </>
        ) : null}
        <div className="siteorbit-legend-source">{legend.source}</div>
        <div className="siteorbit-legend-note">{legend.note}</div>
      </div>

      {!planetaryOpen && mission && siteMission ? (
        <>
          <div className={`siteorbit-mission${missionOpen ? ' is-open' : ''}`}>
            <div className="siteorbit-mission-head">
              <span>
                MISSION / {mission.target} / {mission.experiments.length} EXPERIMENTS
              </span>
              <span>{Math.round(missionCoverage * 100)}% Data</span>
            </div>
            <div className="siteorbit-mission-fit">
              <b>{missionFit !== null ? missionFit.toFixed(1) : '–'}</b>
              <span>
                Mission fit / 100
                <br />
                Priority-weighted, evidence-adjusted
              </span>
            </div>
            <div className="siteorbit-mission-list">
              {mission.experiments.map((experiment) => {
                const result = siteMission.experiments[experiment.id];
                return (
                  <button
                    key={experiment.id}
                    type="button"
                    className={focusedExperiment?.id === experiment.id ? 'focus' : ''}
                    onClick={() => setFocusId(experiment.id)}
                    aria-pressed={focusedExperiment?.id === experiment.id}
                  >
                    <span className="idx">{String(experiment.index).padStart(2, '0')}</span>
                    <span className="name">
                      {experiment.shortName}
                      <em className={result?.missing.length ? 'has-gap' : ''}>
                        {result?.missing.length
                          ? `${result.missing.length} NO DATA`
                          : result?.status}
                        {' · '}
                        {siteTemporal?.[experiment.id]
                          ? `${siteTemporal[experiment.id].feasibility} ${
                              siteTemporal[experiment.id].bestWindow?.label ?? ''
                            }`
                          : 'No temporal'}
                      </em>
                    </span>
                    <span className="score">{result?.score?.toFixed(0) ?? '–'}</span>
                    <span className="bar">
                      <i style={{ width: `${Math.min(100, Math.max(0, result?.score ?? 0))}%` }} />
                    </span>
                  </button>
                );
              })}
            </div>
            {focusedExperiment && focusedResult ? (
              <div className="siteorbit-mission-req">
                <div className="head">
                  EXP {String(focusedExperiment.index).padStart(2, '0')} /{' '}
                  {focusedExperiment.shortName} /{' '}
                  {focusedResult.score !== null ? focusedResult.score.toFixed(1) : '–'}
                  {' · '}
                  {siteTemporal?.[focusedExperiment.id]
                    ? `${siteTemporal[focusedExperiment.id].feasibility} ${
                        siteTemporal[focusedExperiment.id].bestWindow?.label ?? 'No window'
                      }`
                    : 'No temporal'}
                </div>
                {focusedExperiment.requirements.map((requirement) => {
                  const evaluation = focusedResult.evaluations.find(
                    (item) => item.requirementId === requirement.id,
                  );
                  const status = evaluation?.status ?? 'missing';
                  return (
                    <div className="row" key={requirement.id}>
                      <span className="req-label">
                        <i className={`req-src ${requirement.source}`}>
                          {requirement.kind === 'facility' || requirement.kind === 'impossible'
                            ? ''
                            : requirement.source === 'brief'
                              ? 'B'
                              : 'I'}
                        </i>
                        {requirement.shortLabel}
                        <small>{requirement.statement}</small>
                      </span>
                      <b>
                        {evaluation?.status === 'missing' ||
                        evaluation?.status === 'not-applicable'
                          ? '–'
                          : evaluation?.display ?? '–'}
                      </b>
                      <em className={`siteorbit-status status-${status}`}>
                        {status === 'not-applicable'
                          ? requirement.kind === 'impossible'
                            ? 'Not possible'
                            : 'Facility'
                          : SITE_STATUS[status] ?? status}
                      </em>
                    </div>
                  );
                })}
                <div className="siteorbit-mission-key">
                  <span><b>B</b> Stated in brief</span>
                  <span><b>I</b> Threshold inferred</span>
                </div>
                <div className="note">
                  {focusedExperiment.source === 'brief'
                    ? 'Experiment stated in brief'
                    : 'Experiment inferred from profile'}{' '}
                  · FIT IS EVIDENCE-ADJUSTED, NOT PROOF · NO DATA IS NOT A PASS
                </div>
              </div>
            ) : null}
            <div className="siteorbit-mission-foot">
              ML score is context, not requirement evidence. Missing data is never imputed.
            </div>
          </div>
        </>
      ) : null}

      <div className="sitev-foot siteorbit-foot">
        <div className="sitev-scale">
          <i ref={scaleBarRef} style={{ width: 90 }} />
          <span ref={scaleLabelRef}>1.0 KM (approx)</span>
        </div>
        <span className="siteorbit-alt">
          ORBIT <b ref={altRef}>20.0 KM</b>
        </span>
        <span>Drag to orbit / scroll to change altitude</span>
        <span>{coordText(site.lat, site.lon)}</span>
      </div>
    </div>
  );
}
