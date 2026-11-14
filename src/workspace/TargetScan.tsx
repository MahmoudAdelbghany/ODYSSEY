import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type ScanBody = 'Moon' | 'Mars';
export interface ScanSite { id: string; lat: number; lon: number }

const TEX: Record<ScanBody | 'Earth', string> = {
  Moon: '/tex/targets/moon_lroc_2k.jpg',
  Mars: '/tex/targets/mars_viking_2k.jpg',
  Earth: '/tex/earth/day_global_2k.jpg',
};
const TINT: Record<ScanBody | 'Earth', string> = { Moon: '#a6e7ff', Mars: '#f28b50', Earth: '#64e4ef' };

/** Unit vector for lat/lon on a three.js SphereGeometry whose texture runs lon -180..180 left to right. */
function toVec(lat: number, lon: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
}
/** Rotation (x tilt, y spin) that turns lat/lon toward the camera (+z). */
function facing(lat: number, lon: number) {
  return { x: THREE.MathUtils.degToRad(Math.max(-62, Math.min(62, lat * 0.75))), y: THREE.MathUtils.degToRad(-(lon + 90)) };
}

const vert = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vPos = normalize(position);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const frag = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  uniform float uFocus;
  uniform float uScanY;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform vec3 uTint;
  uniform vec3 uTarget;
  uniform float uHasTarget;
  uniform vec3 uCam;
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float lat = asin(clamp(vPos.y, -1.0, 1.0));
    float lon = atan(vPos.z, -vPos.x);
    float g = 0.2617994;
    float gl = abs(fract(lat / g + 0.5) - 0.5) * g;
    float go = abs(fract(lon / g + 0.5) - 0.5) * g * cos(lat);
    float grid = (1.0 - smoothstep(0.0, 0.006, gl)) + (1.0 - smoothstep(0.0, 0.006, go));
    // shared scan line: the same sweep crosses both bodies at once
    float sy = (vWorld.y - uCenter.y) / uRadius;
    float band = exp(-pow((sy - uScanY) * 10.0, 2.0));
    float trail = exp(-pow((sy - uScanY + 0.18) * 3.0, 2.0)) * 0.22;
    vec2 q = vec2(lat, lon) / 0.0349066;
    vec2 inCell = abs(fract(q) - 0.5);
    float soft = 1.0 - smoothstep(0.18, 0.42, max(inCell.x, inCell.y));
    float f = hash(floor(q) + floor(uTime * 2.0 + hash(floor(q)) * 4.0));
    float flick = step(0.993 - uPulse * 0.02 - band * 0.05, f) * soft * (0.35 + uPulse * 0.8);
    float d = acos(clamp(dot(vPos, normalize(uTarget)), -1.0, 1.0));
    float ring = (1.0 - smoothstep(0.0, 0.014, abs(d - 0.08 - 0.05 * fract(uTime * 0.6)))) * uHasTarget;
    float ring2 = (1.0 - smoothstep(0.0, 0.01, abs(d - 0.15))) * uHasTarget;
    float rim = pow(1.0 - max(dot(normalize(vNormalW), normalize(uCam - vWorld)), 0.0), 3.0);
    float k = 0.55 + 0.45 * uFocus;
    vec3 col = uTint * (grid * (0.08 + 0.22 * uPulse) + band * 0.7 + trail + flick * 0.7 + rim * 0.55) * k;
    col += vec3(1.0, 0.77, 0.32) * (ring * 0.95 + ring2 * 0.45);
    float a = clamp((grid * (0.1 + 0.25 * uPulse) + band * 0.6 + trail + flick * 0.6 + rim * 0.5) * k + ring + ring2 * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`;

type Body = { group: THREE.Group; planet: THREE.Mesh; overlay: THREE.Mesh; u: Record<string, THREE.IUniform>; tex: THREE.Texture };

function makeBody(kind: ScanBody | 'Earth', renderer: THREE.WebGLRenderer): Body {
  const group = new THREE.Group();
  const tex = new THREE.TextureLoader().load(TEX[kind]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 80), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: kind === 'Earth' ? 0.32 : 0.12 }));
  const u: Record<string, THREE.IUniform> = {
    uTime: { value: 0 }, uPulse: { value: 0 }, uFocus: { value: 1 }, uScanY: { value: 0 },
    uCenter: { value: new THREE.Vector3() }, uRadius: { value: 1 },
    uTint: { value: new THREE.Color(TINT[kind]) }, uTarget: { value: new THREE.Vector3(0, 0, 1) }, uHasTarget: { value: 0 },
    uCam: { value: new THREE.Vector3() },
  };
  const overlay = new THREE.Mesh(
    new THREE.SphereGeometry(1.005, 128, 80),
    new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  planet.add(overlay);
  group.add(planet);
  return { group, planet, overlay, u, tex };
}

/**
 * Dual scan while the agent works: the target body and Earth are swept by one shared scan line and
 * linked by a particle beam from the target site to Earth. Focus alternates between the two bodies.
 * Before ranking, the beam meets Earth where the sweep crosses it; once sites are ranked it cycles through them.
 */
export function TargetScan({ body, lat, lon, pulse, focus, sites, siteIndex }: { body: ScanBody; lat: number; lon: number; pulse: number; focus: 'target' | 'earth'; sites: ScanSite[]; siteIndex: number }) {
  const host = useRef<HTMLDivElement | null>(null);
  const live = useRef({ pulse: 0, focus, sites, siteIndex });
  useEffect(() => { live.current.pulse = 1; }, [pulse]);
  useEffect(() => { live.current.focus = focus; live.current.sites = sites; live.current.siteIndex = siteIndex; }, [focus, sites, siteIndex]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
    camera.position.set(0, 0, 9);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-4, 2, 5);
    scene.add(sun);

    const target = makeBody(body, renderer);
    const earth = makeBody('Earth', renderer);
    scene.add(target.group, earth.group);
    const targetVec = toVec(lat, lon);
    target.u.uTarget.value = targetVec;
    target.u.uHasTarget.value = 1;
    const tFace = facing(lat, lon);
    target.planet.rotation.set(tFace.x, tFace.y, 0, 'XYZ');

    // Ranked Earth sites as dots on the globe.
    const dotGeo = new THREE.BufferGeometry();
    const dotMat = new THREE.PointsMaterial({ color: 0xf5c451, size: 0.07, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const dots = new THREE.Points(dotGeo, dotMat);
    earth.planet.add(dots);
    let dotKey = '';

    // Beam: particles along a quadratic curve from the target site to the Earth point.
    const N = 90;
    const beamPos = new Float32Array(N * 3);
    const beamCol = new Float32Array(N * 3);
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPos, 3));
    beamGeo.setAttribute('color', new THREE.BufferAttribute(beamCol, 3));
    const beamMat = new THREE.PointsMaterial({ size: 0.1, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Points(beamGeo, beamMat);
    scene.add(beam);
    const cT = new THREE.Color(TINT[body]);
    const cE = new THREE.Color(TINT.Earth);
    const tmp = new THREE.Color();

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.position.z = camera.aspect < 1 ? 9 / Math.max(camera.aspect, 0.55) : 9;
      const shift = w > 560 ? Math.min(70, w * 0.1) : 0;
      if (shift) camera.setViewOffset(w, h, -shift, 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    let last = performance.now();
    const start = last;
    let mix = live.current.focus === 'earth' ? 1 : 0; // 0 = target in focus, 1 = Earth in focus
    const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3(), p = new THREE.Vector3();
    const earthRot = { x: 0.25, y: 0 };
    const BIG = 1.5, SMALL = 0.74;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = reduce ? 0 : (now - start) / 1000;
      const L = live.current;
      L.pulse = Math.max(0, L.pulse - dt * 0.9);
      mix += ((L.focus === 'earth' ? 1 : 0) - mix) * Math.min(1, dt * 1.6);
      const e = mix * mix * (3 - 2 * mix);
      // the focused body sits large near the centre, the other smaller to the upper right
      target.group.position.set(THREE.MathUtils.lerp(-0.5, 1.3, e), THREE.MathUtils.lerp(-0.45, 1.55, e), 0);
      target.group.scale.setScalar(THREE.MathUtils.lerp(BIG, SMALL, e));
      earth.group.position.set(THREE.MathUtils.lerp(1.3, -0.5, e), THREE.MathUtils.lerp(1.55, -0.45, e), 0);
      earth.group.scale.setScalar(THREE.MathUtils.lerp(SMALL, BIG, e));
      target.u.uFocus.value = 1 - e;
      earth.u.uFocus.value = e;

      target.planet.rotation.y = tFace.y + (reduce ? 0 : Math.sin(t * 0.12) * 0.5);

      // Earth: face the current ranked site, or spin while screening
      const s = L.sites.length ? L.sites[L.siteIndex % L.sites.length] : null;
      if (s) {
        const f = facing(s.lat, s.lon);
        let dy = f.y - earthRot.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        earthRot.y += dy * Math.min(1, dt * 2.2);
        earthRot.x += (f.x - earthRot.x) * Math.min(1, dt * 2.2);
        earth.u.uTarget.value = toVec(s.lat, s.lon);
        earth.u.uHasTarget.value = 1;
      } else {
        earthRot.y += reduce ? 0 : dt * 0.18;
        earthRot.x += (0.25 - earthRot.x) * Math.min(1, dt);
        earth.u.uHasTarget.value = 0;
      }
      earth.planet.rotation.set(earthRot.x, earthRot.y, 0, 'XYZ');

      const key = L.sites.map((x) => x.id).join(',');
      if (key !== dotKey) {
        dotKey = key;
        const arr = new Float32Array(L.sites.length * 3);
        L.sites.forEach((x, i) => toVec(x.lat, x.lon).multiplyScalar(1.012).toArray(arr, i * 3));
        dotGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        dotGeo.computeBoundingSphere();
      }

      const scan = reduce ? 0.2 : Math.sin(t * 0.5);
      for (const B of [target, earth]) {
        B.u.uTime.value = t;
        B.u.uPulse.value = L.pulse;
        B.u.uScanY.value = scan;
        B.group.getWorldPosition(B.u.uCenter.value as THREE.Vector3);
        B.u.uRadius.value = B.group.scale.x;
        (B.u.uCam.value as THREE.Vector3).copy(camera.position);
      }

      target.group.updateMatrixWorld(true);
      earth.group.updateMatrixWorld(true);
      a.copy(targetVec).multiplyScalar(1.01).applyMatrix4(target.planet.matrixWorld);
      if (s) b.copy(toVec(s.lat, s.lon)).multiplyScalar(1.01).applyMatrix4(earth.planet.matrixWorld);
      else {
        const r = earth.group.scale.x, c = earth.group.position;
        const y = THREE.MathUtils.clamp(scan, -0.95, 0.95);
        b.set(c.x - r * 0.25, c.y + y * r, c.z + Math.sqrt(1 - y * y) * r * 0.97);
      }
      mid.copy(a).add(b).multiplyScalar(0.5);
      mid.z += 1.4;
      mid.y += 0.4;
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const v = 1 - u;
        p.set(v * v * a.x + 2 * v * u * mid.x + u * u * b.x, v * v * a.y + 2 * v * u * mid.y + u * u * b.y, v * v * a.z + 2 * v * u * mid.z + u * u * b.z);
        p.toArray(beamPos, i * 3);
        const flow = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(u * 14 - t * 5 + L.pulse * 3);
        const glow = (0.25 + 0.75 * flow * flow) * (0.65 + L.pulse * 0.6);
        tmp.copy(cT).lerp(cE, u).multiplyScalar(glow);
        beamCol[i * 3] = tmp.r; beamCol[i * 3 + 1] = tmp.g; beamCol[i * 3 + 2] = tmp.b;
      }
      beamGeo.attributes.position.needsUpdate = true;
      beamGeo.attributes.color.needsUpdate = true;
      dotMat.opacity = 0.6 + 0.35 * Math.sin(t * 3);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else { last = performance.now(); raf = requestAnimationFrame(tick); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      for (const B of [target, earth]) {
        B.planet.geometry.dispose();
        (B.planet.material as THREE.Material).dispose();
        B.overlay.geometry.dispose();
        (B.overlay.material as THREE.Material).dispose();
        B.tex.dispose();
      }
      dotGeo.dispose(); dotMat.dispose(); beamGeo.dispose(); beamMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [body, lat, lon]);

  return <div ref={host} className="tscan-canvas" aria-hidden="true" />;
}
