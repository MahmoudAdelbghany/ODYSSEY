import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  mlScore,
  type Campaign,
  type Dimensions,
  type ProfileKey,
  type Site,
} from '../types';

const R = 100;
const DEG = Math.PI / 180;

type LayerId = 'score' | keyof Dimensions;

type Props = {
  sites: Site[];
  campaign: Campaign;
  profile: ProfileKey;
  selectedId: string;
  month: number;
  phase: string;
  layer: LayerId;
  onSelect: (id: string) => void;
};

type Marker = {
  site: Site;
  glow: THREE.Sprite;
  ring: THREE.Sprite;
  targetColor: THREE.Color;
  targetOpacity: number;
};

type ArcPulse = {
  mesh: THREE.Mesh;
  curve: THREE.QuadraticBezierCurve3;
  offset: number;
};

type GlobeApi = {
  update: () => void;
};

function latLngToVec(lat: number, lng: number, radius = R) {
  const phi = (90 - lat) * DEG;
  const theta = (lng + 180) * DEG;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function seasonalScore(site: Site, month: number, profile: ProfileKey) {
  const t = site.monthly.temp[month] ?? site.climate.tempMean;
  const p = site.monthly.precip[month] ?? site.climate.precipDay;
  const ideal = profile === 'mars_landing' ? -45 : profile === 'lunar_base' ? -10 : 0;
  const ts = Math.exp(-Math.pow((t - ideal) / 28, 2));
  const ps = Math.exp(-Math.pow((p - 0.4) / 4, 2));
  return 0.7 * ts + 0.3 * ps;
}

function valueFor(site: Site, profile: ProfileKey, month: number, phase: string, layer: LayerId) {
  if (phase === 'time') return seasonalScore(site, month, profile);
  if (layer === 'score') return mlScore(site, profile) / 100;
  return site.scores[profile].dimensions[layer] / 100;
}

function colorFor(value: number, selected: boolean, benchmark: boolean) {
  if (selected) return '#f3eee5';
  if (value > 0.72) return benchmark ? '#f0c47e' : '#65e6e9';
  if (value > 0.5) return benchmark ? '#d9a45b' : '#8bc9c8';
  if (value > 0.32) return '#6f98a1';
  return '#3d5962';
}

function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.14, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.32, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function waypointTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  ctx.fillStyle = 'rgba(2, 7, 11, 0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.98)';
  ctx.lineWidth = 5;
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function targetTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([3, 7]);
  ctx.beginPath();
  ctx.arc(0, 0, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 74, Math.sin(a) * 74);
    ctx.lineTo(Math.cos(a) * 98, Math.sin(a) * 98);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ringTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(0, 0, 92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 76, Math.sin(a) * 76);
    ctx.lineTo(Math.cos(a) * 108, Math.sin(a) * 108);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGraticule(radius: number, color: string, opacity: number) {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const segment = 96;
  for (let lat = -60; lat <= 60; lat += 30) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segment; i += 1) {
      points.push(latLngToVec(lat, -180 + (i / segment) * 360, radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geo, mat));
  }
  for (let lng = -180; lng < 180; lng += 30) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segment; i += 1) {
      points.push(latLngToVec(-90 + (i / segment) * 180, lng, radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geo, mat));
  }
  return group;
}

function orbitRing(radius: number, color: string, opacity: number, tiltX: number, tiltZ: number) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 240; i += 1) {
    const a = (i / 240) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineDashedMaterial({
    color,
    transparent: true,
    opacity,
    dashSize: 2.5,
    gapSize: 4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  line.rotation.x = tiltX;
  line.rotation.z = tiltZ;
  return line;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function MissionGlobe(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const calloutsRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const travelRef = useRef<HTMLDivElement>(null);
  const lineNameRef = useRef<SVGPathElement>(null);
  const lineScoreRef = useRef<SVGPathElement>(null);
  const lineWindowRef = useRef<SVGPathElement>(null);
  const lineTravelRef = useRef<SVGPathElement>(null);
  const apiRef = useRef<GlobeApi | null>(null);
  const propsRef = useRef(props);

  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.display = 'block';
    wrap.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.65;
    controls.minDistance = 128;
    controls.maxDistance = 850;
    controls.autoRotateSpeed = 0.34;

    const loader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const highRes = window.innerWidth >= 1100 && !/Mobi|Android/i.test(navigator.userAgent);

    const day = loader.load('/tex/2k_earth_daymap.jpg');
    day.colorSpace = THREE.SRGBColorSpace;
    day.anisotropy = maxAniso;
    const night = loader.load('/tex/2k_earth_nightmap.jpg');
    night.colorSpace = THREE.SRGBColorSpace;
    night.anisotropy = maxAniso;
    const clouds = loader.load('/tex/earth_clouds_1024.png');
    clouds.colorSpace = THREE.SRGBColorSpace;
    const spec = loader.load('/tex/earth_specular_2048.jpg');
    spec.colorSpace = THREE.NoColorSpace;

    const sunBase = latLngToVec(10, 34, 1).normalize().add(new THREE.Vector3(0.28, 0.12, 0.12)).normalize();
    const sunCurrent = sunBase.clone();
    const sunTarget = sunBase.clone();

    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: day },
        nightMap: { value: night },
        cloudMap: { value: clouds },
        specMap: { value: spec },
        sunDirection: { value: sunCurrent },
        time: { value: 0 },
        cloudFade: { value: 1 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vUv = uv;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform sampler2D dayMap;
        uniform sampler2D nightMap;
        uniform sampler2D cloudMap;
        uniform sampler2D specMap;
        uniform vec3 sunDirection;
        uniform float time;
        uniform float cloudFade;
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec3 N = normalize(vWorldNormal);
          vec3 L = normalize(sunDirection);
          vec3 V = normalize(cameraPosition - vWorldPosition);
          float sun = dot(N, L);
          float dayMix = smoothstep(-0.14, 0.28, sun);
          vec3 dayColor = texture2D(dayMap, vUv).rgb;
          vec3 nightColor = texture2D(nightMap, vUv).rgb;
          vec3 ambient = dayColor * 0.16;
          vec3 color = mix(nightColor * 1.22 + ambient, dayColor * (0.62 + 0.34 * max(sun, 0.0)), dayMix);

          float cloud = texture2D(cloudMap, vUv + vec2(time * 0.00065, 0.0)).a;
          color = mix(color, vec3(1.0), cloud * 0.34 * cloudFade * smoothstep(-0.18, 0.38, sun));

          float specMask = texture2D(specMap, vUv).r;
          vec3 H = normalize(L + V);
          float specular = pow(max(dot(N, H), 0.0), 54.0) * specMask * 0.55 * dayMix;
          color += vec3(0.55, 0.78, 1.0) * specular;

          float night = smoothstep(0.24, -0.24, sun);
          color += nightColor * night * 0.38;

          float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);
          color += vec3(0.16, 0.42, 0.62) * fresnel * 0.35;

          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    if (highRes) {
      loader.load('/tex/earth_day_8k.jpg', (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAniso;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        earthMat.uniforms.dayMap.value = tex;
        earthMat.needsUpdate = true;
        day.dispose();
      });
      loader.load('/tex/earth_night_8k.jpg', (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAniso;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        earthMat.uniforms.nightMap.value = tex;
        earthMat.needsUpdate = true;
        night.dispose();
      });
    }

    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 110), earthMat);
    earth.rotation.y = 0;
    scene.add(earth);

    const atmosphereMat = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color('#4bbcff') } },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.4);
          gl_FragColor = vec4(glowColor, 1.0) * intensity;
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 80, 60), atmosphereMat);
    scene.add(atmosphere);

    const innerGlowMat = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color('#65e6e9') } },
      vertexShader: atmosphereMat.vertexShader,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.55 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 5.0);
          gl_FragColor = vec4(glowColor, 1.0) * intensity * 0.55;
        }
      `,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const innerGlow = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 80, 60), innerGlowMat);
    scene.add(innerGlow);

    const graticule = createGraticule(R * 1.002, '#65e6e9', 0.07);
    scene.add(graticule);

    const rings = new THREE.Group();
    rings.add(orbitRing(R * 1.22, '#65e6e9', 0.24, Math.PI / 2, 0.18));
    rings.add(orbitRing(R * 1.36, '#d9a45b', 0.14, 1.12, -0.46));
    scene.add(rings);

    const scanPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i += 1) {
      const a = (i / 128) * Math.PI * 2;
      scanPoints.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
    }
    const scanMat = new THREE.LineBasicMaterial({
      color: '#65e6e9',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const scanRing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(scanPoints), scanMat);
    scene.add(scanRing);

    const starsGeo = new THREE.BufferGeometry();
    const starCount = 2200;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const radius = 900 + Math.random() * 900;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      const tint = 0.68 + Math.random() * 0.32;
      colors[i * 3] = tint * 0.85;
      colors[i * 3 + 1] = tint * 0.93;
      colors[i * 3 + 2] = tint;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const starsMat = new THREE.PointsMaterial({
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.85,
      vertexColors: true,
      depthWrite: false,
    });
    const stars = new THREE.Points(starsGeo, starsMat);
    scene.add(stars);

    const glowTex = glowTexture();
    const waypointTex = waypointTexture();
    const ringTex = ringTexture();
    const targetTex = targetTexture();
    const markers = new Map<string, Marker>();
    const hitTargets: THREE.Mesh[] = [];

    for (const site of propsRef.current.sites) {
      const position = latLngToVec(site.lat, site.lon, R + 0.7);
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: new THREE.Color('#65e6e9'),
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.position.copy(position);
      glow.scale.set(6.4, 6.4, 1);
      glow.userData.site = site;
      scene.add(glow);

      const ringMat = new THREE.SpriteMaterial({
        map: waypointTex,
        color: new THREE.Color('#65e6e9'),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: true,
      });
      const ring = new THREE.Sprite(ringMat);
      ring.position.copy(position);
      ring.scale.set(3.1, 3.1, 1);
      ring.userData.site = site;
      scene.add(ring);

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(1.25, 8, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
      );
      hit.position.copy(position);
      hit.userData.site = site;
      scene.add(hit);
      hitTargets.push(hit);

      markers.set(site.id, {
        site,
        glow,
        ring,
        targetColor: new THREE.Color('#65e6e9'),
        targetOpacity: 0.9,
      });
    }

    const beamMat = new THREE.MeshBasicMaterial({
      color: '#65e6e9',
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.4, 6, 8, 1, true), beamMat);
    scene.add(beam);

    const beamTipMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: '#f3eee5',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beamTip = new THREE.Sprite(beamTipMat);
    beamTip.scale.set(4.6, 4.6, 1);
    scene.add(beamTip);

    const selectedMat = new THREE.SpriteMaterial({
      map: ringTex,
      color: '#f3eee5',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const selectedRing = new THREE.Sprite(selectedMat);
    selectedRing.scale.set(17, 17, 1);
    scene.add(selectedRing);

    const targetMat = new THREE.SpriteMaterial({
      map: targetTex,
      color: '#8fe9ec',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
    });
    const targetRing = new THREE.Sprite(targetMat);
    targetRing.scale.set(30, 30, 1);
    scene.add(targetRing);

    const arcGroup = new THREE.Group();
    scene.add(arcGroup);
    const arcPulses: ArcPulse[] = [];
    const arcTargets: THREE.Object3D[] = [];

    let lastSelected = '';
    let lastPhase = '';
    let lastCampaignKey = '';
    let anim: { start: THREE.Vector3; end: THREE.Vector3; t0: number; duration: number } | null = null;

    const clock = new THREE.Clock();
    const mouse = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const pointer = { x: 0, y: 0, downX: 0, downY: 0, downAt: 0 };

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

    const initial = latLngToVec(16, -24, R * (1 + 2.2));
    camera.position.copy(initial);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();

    function altitudeFor(phase: string) {
      if (phase === 'explore') return 0.55;
      if (phase === 'time') return 0.7;
      if (phase === 'intervene') return 0.62;
      if (phase === 'campaign') return 1.9;
      if (phase === 'analyze') return 2.0;
      return 2.2;
    }

    function flyTo(lat: number, lng: number, altitude: number, duration = 1700) {
      anim = {
        start: camera.position.clone(),
        end: latLngToVec(lat, lng, R * (1 + altitude)),
        t0: performance.now(),
        duration,
      };
      controls.autoRotate = false;
    }

    function updateSelected(p: Props) {
      const site = p.sites.find((s) => s.id === p.selectedId) ?? p.sites[0];
      if (!site) return;
      const pos = latLngToVec(site.lat, site.lon, R + 0.8);
      const normal = latLngToVec(site.lat, site.lon, 1).normalize();
      const beamPos = pos.clone().add(normal.clone().multiplyScalar(5));
      beam.position.copy(beamPos);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      beamTip.position.copy(pos.clone().add(normal.clone().multiplyScalar(10)));
      selectedRing.position.copy(pos);
      targetRing.position.copy(pos);
      const name = nameRef.current;
      const score = scoreRef.current;
      const windowEl = windowRef.current;
      const travel = travelRef.current;
      if (name) {
        name.innerHTML = `<span>SITE LOCK</span><b>${site.name}</b><em>${site.country} / ${site.type}</em>`;
      }
      if (score) {
        score.innerHTML = `<span>ML MATCH</span><b>${mlScore(site, p.profile).toFixed(1)}</b><em>/ 100</em>`;
      }
      if (windowEl) {
        windowEl.innerHTML = `<span>FIELD WINDOW</span><b>${site.windows[p.profile].join('–')}</b>`;
      }
      if (travel) {
        const idx = p.campaign.assignments.findIndex((a) => a.siteId === site.id);
        const leg = idx > 0 ? p.campaign.legs[idx - 1] : null;
        travel.innerHTML = leg
          ? `<span>TRAVEL IN</span><b>${leg.hours.toFixed(1)} H</b><em>$${leg.cost.toLocaleString()} / ${leg.fromAirport}</em>`
          : `<span>CAMPAIGN ROLE</span><b>START</b><em>${p.campaign.scenarioLabel ?? 'BALANCED'}</em>`;
      }
    }

    function rebuildArcs(campaign: Campaign) {
      while (arcGroup.children.length) {
        const child = arcGroup.children.pop()!;
        child.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else if (mat) mat.dispose();
        });
      }
      arcPulses.length = 0;
      arcTargets.length = 0;
      campaign.legs.forEach((leg, index) => {
        const a = propsRef.current.sites.find((s) => s.id === leg.fromId);
        const b = propsRef.current.sites.find((s) => s.id === leg.toId);
        if (!a || !b) return;
        const start = latLngToVec(a.lat, a.lon, R + 0.5);
        const end = latLngToVec(b.lat, b.lon, R + 0.5);
        const mid = start.clone().add(end).multiplyScalar(0.5);
        const lift = 10 + start.distanceTo(end) * 0.16;
        mid.normalize().multiplyScalar(R + lift);
        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const tint = index % 2 === 0 ? '#65e6e9' : '#d9a45b';

        const glowGeo = new THREE.TubeGeometry(curve, 80, 1.15, 6, false);
        const glowMat = new THREE.MeshBasicMaterial({
          color: tint,
          transparent: true,
          opacity: 0.12,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.userData.leg = leg;
        arcGroup.add(glow);
        arcTargets.push(glow);

        const coreGeo = new THREE.TubeGeometry(curve, 80, 0.3, 6, false);
        const coreMat = new THREE.MeshBasicMaterial({
          color: tint,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.userData.leg = leg;
        arcGroup.add(core);
        arcTargets.push(core);

        const pulseMat = new THREE.MeshBasicMaterial({
          color: '#f3eee5',
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const pulse = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 12), pulseMat);
        arcGroup.add(pulse);
        arcPulses.push({ mesh: pulse, curve, offset: index * 0.42 });
      });
    }

    function updateMarkers(p: Props) {
      for (const marker of markers.values()) {
        const value = valueFor(marker.site, p.profile, p.month, p.phase, p.layer);
        const selected = marker.site.id === p.selectedId;
        marker.targetColor.set(colorFor(value, selected, Boolean(marker.site.benchmark)));
        marker.targetOpacity = selected ? 1 : 0.7 + value * 0.28;
      }
    }

    function update() {
      const p = propsRef.current;
      const campaignKey = `${p.campaign.scenario ?? 'base'}|${p.campaign.assignments.map((a) => a.siteId).join(',')}`;
      if (campaignKey !== lastCampaignKey) {
        lastCampaignKey = campaignKey;
        rebuildArcs(p.campaign);
      }
      arcGroup.visible = p.phase === 'campaign' || p.phase === 'analyze';
      if (p.phase === 'time') {
        const declination = 23.44 * Math.sin((2 * Math.PI * (p.month + 0.5 - 2.5)) / 12) * DEG;
        const localNoonSite = p.sites.find((s) => s.id === p.selectedId) ?? p.sites[0];
        sunTarget.copy(latLngToVec(declination, (localNoonSite?.lon ?? 34) + 28, 1)).normalize();
      } else {
        sunTarget.copy(sunBase);
      }
      updateMarkers(p);
      if (p.selectedId !== lastSelected || p.phase !== lastPhase) {
        updateSelected(p);
        if (p.phase !== 'brief') {
          if (p.phase === 'campaign') {
            const stops = p.campaign.sites
              .map((c) => p.sites.find((s) => s.id === c.id))
              .filter((s): s is Site => Boolean(s));
            if (stops.length) {
              const lat = stops.reduce((a, s) => a + s.lat, 0) / stops.length;
              const lng = stops.reduce((a, s) => a + s.lon, 0) / stops.length;
              flyTo(lat, lng, altitudeFor(p.phase));
            }
          } else {
            const site = p.sites.find((s) => s.id === p.selectedId) ?? p.sites[0];
            if (site) flyTo(site.lat, site.lon, altitudeFor(p.phase));
          }
        }
        lastSelected = p.selectedId;
        lastPhase = p.phase;
      }
      controls.autoRotate = p.phase === 'brief' || p.phase === 'analyze';
    }

    const showTip = (html: string, x: number, y: number) => {
      const tip = tipRef.current;
      if (!tip) return;
      const rect = renderer.domElement.getBoundingClientRect();
      tip.innerHTML = html;
      tip.style.left = `${x - rect.left + 16}px`;
      tip.style.top = `${y - rect.top + 14}px`;
      tip.style.opacity = '1';
    };

    const hideTip = () => {
      if (tipRef.current) tipRef.current.style.opacity = '0';
    };

    const pickSite = (clientX: number, clientY: number): Site | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(hitTargets, false);
      for (const hit of hits) {
        const site = hit.object.userData.site as Site | undefined;
        if (!site) continue;
        const normal = latLngToVec(site.lat, site.lon, 1).normalize();
        const toCam = camera.position.clone().sub(latLngToVec(site.lat, site.lon, R)).normalize();
        if (normal.dot(toCam) > 0.04) return site;
      }
      return null;
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      const site = pickSite(event.clientX, event.clientY);
      if (site) {
        showTip(
          `<b>${site.name}</b><em>${site.country} / ${site.type}</em><span>${mlScore(site, propsRef.current.profile).toFixed(1)} / 100</span>`,
          event.clientX,
          event.clientY,
        );
        renderer.domElement.style.cursor = 'pointer';
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const arcHits = arcGroup.visible ? raycaster.intersectObjects(arcTargets, false) : [];
      if (arcHits.length) {
        const leg = arcHits[0].object.userData.leg;
        if (leg) {
          showTip(
            `<b>${leg.fromAirport} → ${leg.toAirport}</b><em>${leg.fromName} → ${leg.toName}</em><span>${leg.hours.toFixed(1)} h / $${leg.cost.toLocaleString()}</span>`,
            event.clientX,
            event.clientY,
          );
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      hideTip();
      renderer.domElement.style.cursor = 'grab';
    };

    const onPointerLeave = () => {
      hideTip();
      renderer.domElement.style.cursor = 'grab';
    };

    const onPointerDown = (event: PointerEvent) => {
      pointer.downX = event.clientX;
      pointer.downY = event.clientY;
      pointer.downAt = performance.now();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - pointer.downX, event.clientY - pointer.downY) > 6) return;
      if (performance.now() - pointer.downAt > 650) return;
      const site = pickSite(event.clientX, event.clientY);
      if (site) propsRef.current.onSelect(site.id);
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    apiRef.current = { update };
    update();
    updateSelected(propsRef.current);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const now = performance.now();
      earthMat.uniforms.time.value = elapsed;
      sunCurrent.lerp(sunTarget, 0.035);
      earthMat.uniforms.sunDirection.value.copy(sunCurrent);
      const camDist = camera.position.length();
      earthMat.uniforms.cloudFade.value = THREE.MathUtils.smoothstep(camDist, 165, 300);
      stars.rotation.y = elapsed * 0.004;
      rings.rotation.y = elapsed * 0.018;

      if (anim) {
        const k = Math.min(1, (now - anim.t0) / anim.duration);
        const e = easeInOutCubic(k);
        camera.position.lerpVectors(anim.start, anim.end, e);
        camera.lookAt(0, 0, 0);
        if (k >= 1) {
          anim = null;
          const p = propsRef.current;
          controls.autoRotate = p.phase === 'brief' || p.phase === 'analyze';
        }
      }
      controls.update();

      const viewportH = wrap.clientHeight || 900;
      const worldPerPixel = (2 * Math.tan((camera.fov * DEG) / 2)) / viewportH;
      for (const marker of markers.values()) {
        const glowMat = marker.glow.material as THREE.SpriteMaterial;
        const ringMat = marker.ring.material as THREE.SpriteMaterial;
        glowMat.color.lerp(marker.targetColor, 0.12);
        ringMat.color.lerp(marker.targetColor, 0.12);
        glowMat.opacity += (marker.targetOpacity * 0.4 - glowMat.opacity) * 0.12;
        ringMat.opacity += (marker.targetOpacity - ringMat.opacity) * 0.12;
        const dist = camera.position.distanceTo(marker.ring.position);
        const scaleUnit = worldPerPixel * dist;
        const selected = marker.site.id === propsRef.current.selectedId;
        const glowPx = selected ? 46 : marker.site.benchmark ? 26 : 19;
        const ringPx = selected ? 30 : marker.site.benchmark ? 18 : 13;
        const gs = marker.glow.scale.x + (scaleUnit * glowPx - marker.glow.scale.x) * 0.18;
        const rs = marker.ring.scale.x + ((scaleUnit * ringPx) / 0.375 - marker.ring.scale.x) * 0.18;
        marker.glow.scale.set(gs, gs, 1);
        marker.ring.scale.set(rs, rs, 1);
      }

      const p = propsRef.current;
      const scanTarget = p.phase === 'analyze' ? 0.32 : 0;
      scanMat.opacity += (scanTarget - scanMat.opacity) * 0.06;
      if (p.phase === 'analyze') {
        const y = R * 0.94 - ((elapsed * 0.23) % 1) * R * 1.88;
        scanRing.position.y = y;
        const s = Math.sqrt(Math.max(0.02, 1 - (y / R) ** 2));
        scanRing.scale.set(s, 1, s);
      }

      const selected = p.sites.find((s) => s.id === p.selectedId) ?? p.sites[0];
      if (selected) {
        const pos = latLngToVec(selected.lat, selected.lon, R + 0.8);
        selectedRing.position.copy(pos);
        const selDist = camera.position.distanceTo(pos);
        const selUnit = worldPerPixel * selDist;
        const pulse = selUnit * (64 / 0.72) * (1 + Math.sin(elapsed * 2.2) * 0.05);
        const smoothed = selectedRing.scale.x + (pulse - selectedRing.scale.x) * 0.2;
        selectedRing.scale.set(smoothed, smoothed, 1);
        (selectedRing.material as THREE.SpriteMaterial).opacity = 0.55 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 2.2));
        const normal = latLngToVec(selected.lat, selected.lon, 1).normalize();
        beam.position.copy(pos.clone().add(normal.clone().multiplyScalar(3)));
        beamTip.position.copy(pos.clone().add(normal.clone().multiplyScalar(6)));
        (beam.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.12 * (0.5 + 0.5 * Math.sin(elapsed * 1.7));
        const tipScale = selUnit * 11;
        beamTip.scale.setScalar(tipScale);
        const showTarget = wrap.clientWidth > 900 && (p.phase === 'explore' || p.phase === 'time' || p.phase === 'intervene');
        targetMat.opacity += ((showTarget ? 0.38 : 0) - targetMat.opacity) * 0.08;
        const targetScale = selUnit * (150 / 0.672);
        const ts = targetRing.scale.x + (targetScale - targetRing.scale.x) * 0.2;
        targetRing.scale.set(ts, ts, 1);
        targetMat.rotation = elapsed * 0.05;
        const callouts = calloutsRef.current;
        if (callouts) {
          const projected = pos.clone().project(camera);
          const delta = camera.position.clone().sub(pos).normalize();
          const facing = pos.clone().normalize().dot(delta) > 0.02;
          const show = facing && projected.z < 1 && (p.phase === 'explore' || p.phase === 'time' || p.phase === 'intervene');
          callouts.style.opacity = show ? '1' : '0';
          if (show) {
            const W = wrap.clientWidth;
            const H = wrap.clientHeight;
            const x = (projected.x * 0.5 + 0.5) * W;
            const y = (-projected.y * 0.5 + 0.5) * H;
            const place = (el: HTMLDivElement | null, dx: number, dy: number, w: number, h: number) => {
              if (!el) return null;
              const lx = Math.max(10, Math.min(W - w - 10, x + dx));
              const ly = Math.max(10, Math.min(H - h - 10, y + dy));
              el.style.transform = `translate(${lx}px, ${ly}px)`;
              return { x: lx, y: ly };
            };
            const n = place(nameRef.current, 28, -54, 190, 58);
            const s = place(scoreRef.current, 92, -152, 110, 62);
            const w = place(windowRef.current, -164, 52, 150, 44);
            const t = place(travelRef.current, 78, 94, 160, 54);
            const line = (ref: SVGPathElement | null, pt: { x: number; y: number } | null, ex?: number) => {
              if (!ref || !pt) return;
              const lx = ex ?? pt.x;
              ref.setAttribute(
                'd',
                `M ${x} ${y} L ${x + (lx - x) * 0.42} ${y + (pt.y + 14 - y) * 0.18} L ${lx} ${pt.y + 14}`,
              );
            };
            line(lineNameRef.current, n);
            line(lineScoreRef.current, s);
            line(lineWindowRef.current, w, w ? w.x + 150 : undefined);
            line(lineTravelRef.current, t);
          }
        }
      }

      for (const pulse of arcPulses) {
        const t = (elapsed * 0.13 + pulse.offset) % 1;
        pulse.mesh.position.copy(pulse.curve.getPointAt(t));
      }


      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      apiRef.current = null;
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      glowTex.dispose();
      waypointTex.dispose();
      ringTex.dispose();
      targetTex.dispose();
      day.dispose();
      night.dispose();
      clouds.dispose();
      spec.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === wrap) wrap.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    apiRef.current?.update();
  }, [props.sites, props.campaign, props.profile, props.layer, props.selectedId, props.month, props.phase]);

  return (
    <div className="mc-globe" ref={wrapRef}>
      <div className="mc-globe-glow" />
      <div className="mc-globe-tip" ref={tipRef} />
      <div className="mc-callouts" ref={calloutsRef}>
        <svg className="mc-callout-lines" aria-hidden="true">
          <path ref={lineNameRef} />
          <path ref={lineScoreRef} />
          <path ref={lineWindowRef} />
          <path ref={lineTravelRef} />
        </svg>
        <div className="mc-callout c-name" ref={nameRef} />
        <div className="mc-callout c-score" ref={scoreRef} />
        <div className="mc-callout c-window" ref={windowRef} />
        <div className="mc-callout c-travel" ref={travelRef} />
      </div>
    </div>
  );
}
