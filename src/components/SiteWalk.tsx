import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Gauge, Pause, Play, X } from 'lucide-react';
import * as THREE from 'three';
import type { ProfileKey, Site } from '../types';

type Props = {
  site: Site;
  profile: ProfileKey;
  onClose: () => void;
};

type Sky = {
  top: string;
  horizon: string;
  sun: string;
  rock: string;
  tint: string;
  amplitude: number;
  dust: number;
};

const SKY: Record<ProfileKey, Sky> = {
  lunar_base: {
    top: '#01030a',
    horizon: '#1b2a36',
    sun: '#e6fbff',
    rock: '#59636a',
    tint: '#efe9dd',
    amplitude: 1.45,
    dust: 0.24,
  },
  mars_landing: {
    top: '#190c09',
    horizon: '#c27852',
    sun: '#ffc08c',
    rock: '#6d4a3a',
    tint: '#f2d0b6',
    amplitude: 1.0,
    dust: 0.7,
  },
  expedition: {
    top: '#02050b',
    horizon: '#243642',
    sun: '#e8fbff',
    rock: '#5c6870',
    tint: '#e2e8ea',
    amplitude: 1.2,
    dust: 0.26,
  },
};

const SEG = 256;
const SIZE = 1200;

function hash(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function dotTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.2)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function SiteWalk({ site, profile, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(9);
  const pausedRef = useRef(false);
  const speedRefValue = useRef(9);

  useEffect(() => {
    pausedRef.current = paused;
    if (statusRef.current) statusRef.current.textContent = paused ? 'HOLD' : 'TRAVERSING';
  }, [paused]);

  useEffect(() => {
    speedRefValue.current = speed;
  }, [speed]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const sky = SKY[profile];
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(sky.horizon, 90, 520);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 2400);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.cursor = 'grab';
    mount.appendChild(renderer.domElement);

    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(sky.top) },
        horizonColor: { value: new THREE.Color(sky.horizon) },
        sunColor: { value: new THREE.Color(sky.sun) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPosition = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          float t = smoothstep(-0.02, 0.55, h);
          vec3 col = mix(horizonColor, topColor, t);
          float sun = pow(max(dot(normalize(vWorldPosition), normalize(vec3(-0.55, 0.16, -0.8))), 0.0), 26.0);
          col += sunColor * sun * 0.5;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1600, 40, 24), skyMat);
    scene.add(skyMesh);

    const sunPos = new THREE.Vector3(-520, 160, -760);
    const sun = new THREE.DirectionalLight(new THREE.Color(sky.sun), 2.4);
    sun.position.copy(sunPos);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffe2c4, 2.3);
    fill.position.set(420, 300, 560);
    scene.add(fill);
    const ambient = new THREE.HemisphereLight(new THREE.Color(sky.horizon), new THREE.Color('#2a221c'), 1.35);
    scene.add(ambient);

    const glowTex = glowTexture();
    const dotTex = dotTexture();
    const sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: sky.sun,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sunSprite.position.copy(sunPos.clone().normalize().multiplyScalar(1150));
    sunSprite.scale.set(120, 120, 1);
    scene.add(sunSprite);

    const starsGeo = new THREE.BufferGeometry();
    const starCount = profile === 'mars_landing' ? 400 : 1100;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const r = 1200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.8 + 80;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({
        map: dotTex,
        color: 0xdfefff,
        size: 3.0,
        sizeAttenuation: false,
        transparent: true,
        alphaTest: 0.01,
        opacity: profile === 'mars_landing' ? 0.18 : 0.32,
        depthWrite: false,
      }),
    );
    scene.add(stars);

    let terrain: THREE.Mesh | null = null;
    let heightGrid: Float32Array | null = null;
    let scanUniform: { value: number } | null = null;
    let disposed = false;

    const heightAt = (x: number, z: number) => {
      if (!heightGrid) return 0;
      const u = Math.min(0.999, Math.max(0, (x + SIZE / 2) / SIZE));
      const v = Math.min(0.999, Math.max(0, (z + SIZE / 2) / SIZE));
      const gx = Math.floor(u * SEG);
      const gz = Math.floor(v * SEG);
      return heightGrid[gz * (SEG + 1) + gx] ?? 0;
    };

    const buildTerrain = (image: HTMLImageElement) => {
      if (disposed) return;
      const sample = 256;
      const canvas = document.createElement('canvas');
      canvas.width = sample;
      canvas.height = sample;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0, sample, sample);
      const data = ctx.getImageData(0, 0, sample, sample).data;

      const textureCanvas = document.createElement('canvas');
      textureCanvas.width = 1024;
      textureCanvas.height = 1024;
      const tctx = textureCanvas.getContext('2d')!;
      tctx.drawImage(image, 0, 0, 1024, 1024);
      const map = new THREE.CanvasTexture(textureCanvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = renderer.capabilities.getMaxAnisotropy();
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(2, 2);

      heightGrid = new Float32Array((SEG + 1) * (SEG + 1));
      const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
      geometry.rotateX(-Math.PI / 2);
      const pos = geometry.attributes.position;

      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const u = (x + SIZE / 2) / SIZE;
        const v = (z + SIZE / 2) / SIZE;
        const px = Math.min(sample - 1, Math.max(0, Math.floor(u * sample)));
        const pz = Math.min(sample - 1, Math.max(0, Math.floor(v * sample)));
        const idx = (pz * sample + px) * 4;
        const lum = (data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722) / 255;
        const broad = noise(u * 5.2, v * 5.2) * 0.55 + noise(u * 13, v * 13) * 0.2;
        const ridge = 1 - Math.abs(noise(u * 7.5, v * 7.5) * 2 - 1);
        const height =
          ((lum - 0.46) * 30 + (broad - 0.4) * 20 + ridge * 7 + Math.sin(u * 10.5) * 1.8 + Math.cos(v * 8.4) * 2.2) *
          sky.amplitude;
        const gx = Math.round(u * SEG);
        const gz = Math.round(v * SEG);
        heightGrid[gz * (SEG + 1) + gx] = height;
      }

      // Two smoothing passes remove satellite-image noise from the relief.
      for (let pass = 0; pass < 2; pass += 1) {
        const src = heightGrid as Float32Array;
        const dst = new Float32Array(src.length);
        for (let gz = 0; gz <= SEG; gz += 1) {
          for (let gx = 0; gx <= SEG; gx += 1) {
            let sum = 0;
            let count = 0;
            for (let dz = -1; dz <= 1; dz += 1) {
              for (let dx = -1; dx <= 1; dx += 1) {
                const nz = gz + dz;
                const nx = gx + dx;
                if (nz < 0 || nz > SEG || nx < 0 || nx > SEG) continue;
                sum += src[nz * (SEG + 1) + nx];
                count += 1;
              }
            }
            dst[gz * (SEG + 1) + gx] = sum / count;
          }
        }
        heightGrid = dst;
      }

      const grid = heightGrid as Float32Array;
      for (let i = 0; i < pos.count; i += 1) {
        const u = (pos.getX(i) + SIZE / 2) / SIZE;
        const v = (pos.getZ(i) + SIZE / 2) / SIZE;
        const gx = Math.round(u * SEG);
        const gz = Math.round(v * SEG);
        pos.setY(i, grid[gz * (SEG + 1) + gx] ?? 0);
      }
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();

      const material = new THREE.MeshStandardMaterial({
        map,
        color: new THREE.Color(sky.tint),
        roughness: 0.96,
        metalness: 0.02,
      });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.scanZ = { value: 0 };
        scanUniform = shader.uniforms.scanZ as { value: number };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorld;')
          .replace(
            '#include <worldpos_vertex>',
            '#include <worldpos_vertex>\nvTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
          );
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorld;\nuniform float scanZ;')
          .replace(
            '#include <dithering_fragment>',
            `float contour = abs(fract(vTerrainWorld.y / 5.5) - 0.5);
             float contourLine = smoothstep(0.47, 0.5, contour);
             float gridX = abs(fract(vTerrainWorld.x / 42.0) - 0.5);
             float gridZ = abs(fract(vTerrainWorld.z / 42.0) - 0.5);
             float gridLine = smoothstep(0.478, 0.5, max(gridX, gridZ));
             gl_FragColor.rgb += vec3(0.08, 0.44, 0.48) * (contourLine * 0.32 + gridLine * 0.1);
             float scanBand = exp(-pow((vTerrainWorld.z - scanZ) / 6.0, 2.0));
             gl_FragColor.rgb += vec3(0.22, 0.84, 0.94) * scanBand * 0.18;
             #include <dithering_fragment>`,
          );
      };
      terrain = new THREE.Mesh(geometry, material);
      scene.add(terrain);

      const rockGeo = new THREE.DodecahedronGeometry(1, 0);
      const rockMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(sky.rock),
        roughness: 0.98,
        flatShading: true,
      });
      const rockCount = 120;
      const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
      const mat4 = new THREE.Matrix4();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const trans = new THREE.Vector3();
      for (let i = 0; i < rockCount; i += 1) {
        const x = (Math.random() - 0.5) * SIZE * 0.72;
        const z = (Math.random() - 0.5) * SIZE * 0.72;
        const s = 0.7 + Math.random() * (profile === 'lunar_base' ? 3.4 : 2.6);
        trans.set(x, heightAt(x, z) + s * 0.32, z);
        quat.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
        scale.set(s, s * (0.5 + Math.random()), s);
        mat4.compose(trans, quat, scale);
        rocks.setMatrixAt(i, mat4);
      }
      rocks.instanceMatrix.needsUpdate = true;
      scene.add(rocks);

      if (sky.dust > 0.2) {
        const dustGeo = new THREE.BufferGeometry();
        const dustCount = 900;
        const dustPos = new Float32Array(dustCount * 3);
        for (let i = 0; i < dustCount; i += 1) {
          dustPos[i * 3] = (Math.random() - 0.5) * 900;
          dustPos[i * 3 + 1] = Math.random() * 130 + 4;
          dustPos[i * 3 + 2] = (Math.random() - 0.5) * 900;
        }
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        const dust = new THREE.Points(
          dustGeo,
          new THREE.PointsMaterial({
            map: dotTex,
            color: new THREE.Color(sky.horizon),
            size: 2.2,
            transparent: true,
            alphaTest: 0.01,
            opacity: 0.4,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        scene.add(dust);
      }

    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => buildTerrain(img);
    img.onerror = () => {
      const fallback = document.createElement('canvas');
      fallback.width = 512;
      fallback.height = 512;
      const fctx = fallback.getContext('2d')!;
      fctx.fillStyle = sky.rock;
      fctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 5000; i += 1) {
        const v = 50 + Math.random() * 80;
        fctx.fillStyle = `rgb(${v},${v},${v})`;
        fctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }
      const fallbackImg = new Image();
      fallbackImg.onload = () => buildTerrain(fallbackImg);
      fallbackImg.src = fallback.toDataURL();
    };
    img.src = site.image;

    let yaw = 0;
    let pitch = -0.075;
    let posX = 0;
    let posZ = 470;
    const clock = new THREE.Clock();

    const setSize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(setSize);
    ro.observe(mount);
    setSize();

    const setHud = () => {
      const heading = ((yaw * 180) / Math.PI + 360) % 360;
      if (headingRef.current) headingRef.current.textContent = `${heading.toFixed(0).padStart(3, '0')}°`;
      if (speedRef.current) speedRef.current.textContent = pausedRef.current ? '0.0' : speedRefValue.current.toFixed(1);
      if (altRef.current) altRef.current.textContent = `${Math.round(camera.position.y)} M`;
    };

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();
      if (!pausedRef.current) {
        const forwardX = -Math.sin(yaw);
        const forwardZ = -Math.cos(yaw);
        posX += forwardX * speedRefValue.current * dt;
        posZ += forwardZ * speedRefValue.current * dt;
        if (posZ < -520) {
          posZ = 540;
          posX = (Math.random() - 0.5) * 300;
        }
        if (posX < -560) posX = 560;
        if (posX > 560) posX = -560;
      }
      const ground = heightAt(posX, posZ);
      const targetY = ground + 12 + Math.sin(t * 2.1) * 0.2;
      camera.position.x = posX;
      camera.position.z = posZ;
      camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 3.2);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      if (scanUniform) scanUniform.value = posZ - 55;
      stars.rotation.y = t * 0.006;
      renderer.render(scene, camera);
      setHud();
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.style.cursor = 'grabbing';
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      yaw -= dx * 0.0028;
      pitch = Math.max(-0.5, Math.min(0.32, pitch - dy * 0.0022));
    };
    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      renderer.domElement.style.cursor = 'grab';
      renderer.domElement.releasePointerCapture?.(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = Math.max(3, Math.min(28, speedRefValue.current - e.deltaY * 0.012));
      speedRefValue.current = next;
      setSpeed(next);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((v) => !v);
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        setSpeed((v) => Math.min(28, v + 1));
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        setSpeed((v) => Math.max(3, v - 1));
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);

    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      glowTex.dispose();
      dotTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [site.id, site.image, profile, onClose]);

  return (
    <motion.div
      className="mc-walk"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="mc-walk-image" style={{ backgroundImage: `url(${site.image})` }} />
      <div className="mc-walk-canvas" ref={mountRef} />
      <div className="mc-walk-vignette" />
      <div className="mc-walk-scan" />
      <div className="mc-walk-brackets"><span /><span /><span /><span /></div>

      <div className="mc-walk-top">
        <div>
          <div className="mono">TERRAIN FLYTHROUGH / {site.name.toUpperCase()}</div>
          <div className="mc-walk-sub">SATELLITE-DERIVED RELIEF / NOT A PHOTOGRAPH</div>
        </div>
        <div className="mc-walk-tools">
          <button onClick={() => setPaused((v) => !v)}>
            {paused ? <Play size={13} /> : <Pause size={13} />} {paused ? 'RESUME' : 'PAUSE'}
          </button>
          <div className="mc-walk-speedbox">
            <Gauge size={12} />
            <span>{speed.toFixed(1)}</span>
            <em>THRUST</em>
          </div>
          <button onClick={onClose}><X size={15} /> RETURN TO ORBIT</button>
        </div>
      </div>

      <div className="mc-walk-center">
        <div className="mc-walk-cross"><span /><span /></div>
        <div className="mc-walk-label">LOOK TARGET / TERRAIN SURROGATE</div>
        <div className="mc-walk-hint">DRAG TO LOOK · W/S THRUST · SPACE PAUSE · ESC RETURN</div>
      </div>

      <div className="mc-walk-hud tl">
        {Math.abs(site.lat).toFixed(2)}°{site.lat >= 0 ? 'N' : 'S'} / {Math.abs(site.lon).toFixed(2)}°{site.lon >= 0 ? 'E' : 'W'}
        <div>{site.type.toUpperCase()} / {site.country.toUpperCase()}</div>
      </div>

      <div className="mc-walk-readouts">
        <div><span>HEADING</span><b ref={headingRef}>000°</b></div>
        <div><span>THRUST</span><b ref={speedRef}>9.0</b></div>
        <div><span>ALTITUDE</span><b ref={altRef}>12 M</b></div>
        <div><span>STATE</span><b ref={statusRef} className="green">TRAVERSING</b></div>
      </div>

      <div className="mc-walk-hud br">
        GROUND-LEVEL IMAGERY UNAVAILABLE
        <div>3D RELIEF FROM THE SATELLITE FRAME</div>
      </div>

      <div className="mc-walk-bottom">
        <div>
          <b>Not a real surface photograph.</b> This is a 3D terrain surrogate built from the site's
          satellite frame. Relief, scale and motion are illustrative; a real field walk requires local
          imagery, permits and ground truth.
        </div>
        <button onClick={onClose}>BACK TO MISSION <ArrowRight size={14} /></button>
      </div>
    </motion.div>
  );
}
