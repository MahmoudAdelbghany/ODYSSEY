import { useEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mlScore, type ProfileKey, type Site } from '../types';
import { spawnCount } from './spawn';

const R = 100;
const DEG = Math.PI / 180;

type Mode = 'opening' | 'initializing' | 'discovery';
type Stage = 'discovery' | 'temporal' | 'interventions' | 'campaign';

type Props = {
  sites: Site[];
  profile: ProfileKey;
  selectedId: string | null;
  mode: Mode;
  paused: boolean;
  siteOrbit: boolean;
  rankedIds: string[];
  missionScores: Record<string, number>;
  highlightIds: string[];
  lensRightInset: number;
  stage: Stage;
  sunMonth: number | null;
  campaignSiteIds: string[];
  onSelect: (id: string) => void;
  lens: ReactNode;
  /** 'centered' frames the planet in the middle of its own column (no room left for a floating lens). */
  framing?: 'offset' | 'centered';
  /** Opening screen: light analog sites one by one (shared clock with the landing counter). */
  spawn?: boolean;
};

type PlanetApi = {
  setMode: (mode: Mode) => void;
  setSelected: (id: string | null) => void;
  setSiteOrbit: (id: string | null) => void;
  setRanking: (ids: string[], scores: Record<string, number>) => void;
  setStage: (stage: Stage, selectedId: string | null) => void;
  setSunMonth: (month: number | null) => void;
  setCampaign: (siteIds: string[]) => void;
  focusCampaign: () => void;
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

function dotTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function OrbitalPlanet({
  sites,
  profile,
  selectedId,
  mode,
  paused,
  siteOrbit,
  rankedIds,
  missionScores,
  highlightIds,
  lensRightInset,
  stage,
  sunMonth,
  campaignSiteIds,
  onSelect,
  lens,
  framing = 'offset',
  spawn = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<PlanetApi | null>(null);
  const propsRef = useRef({
    sites,
    profile,
    selectedId,
    mode,
    paused,
    siteOrbit,
    rankedIds,
    missionScores,
    highlightIds,
    lensRightInset,
    stage,
    sunMonth,
    campaignSiteIds,
    onSelect,
    framing,
    spawn,
  });

  useEffect(() => {
    propsRef.current = {
      sites,
      profile,
      selectedId,
      mode,
      paused,
      siteOrbit,
      rankedIds,
      missionScores,
      highlightIds,
      lensRightInset,
      stage,
      sunMonth,
      campaignSiteIds,
      onSelect,
      framing,
      spawn,
    };
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 6000);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.domElement.style.display = 'block';
    wrap.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.rotateSpeed = 0.35;
    controls.zoomSpeed = 0.5;
    controls.minDistance = R * 1.08;
    controls.maxDistance = R * 5.0;
    controls.autoRotate = false;
    controls.enabled = false;

    const loader = new THREE.TextureLoader();
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const maxTextureSize = renderer.capabilities.maxTextureSize;
    const highRes =
      maxTextureSize >= 4096 &&
      window.innerWidth >= 1000 &&
      !/Mobi|Android/i.test(navigator.userAgent);
    const ultra = highRes && maxTextureSize >= 8192;

    const ownedTextures = new Set<THREE.Texture>();
    let disposed = false;
    const configureEarthTexture = (
      tex: THREE.Texture,
      colorSpace: THREE.ColorSpace,
      repeatS = false,
    ) => {
      tex.colorSpace = colorSpace;
      tex.flipY = false;
      tex.anisotropy = maxAniso;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = true;
      ownedTextures.add(tex);
      return tex;
    };
    const loadEarthTexture = (
      url: string,
      colorSpace: THREE.ColorSpace,
      repeatS = false,
    ) => configureEarthTexture(loader.load(url), colorSpace, repeatS);

    const sunDir = latLngToVec(8, 32, 1).normalize().add(new THREE.Vector3(0.18, 0.1, 0.06)).normalize();
    const sunCurrent = sunDir.clone();

    // NASA Blue Marble 2002 (public domain, NASA Visible Earth / Reto Stöckli,
    // Robert Simmon). The surface is a cloud-free mosaic; the placeholder is a
    // true 2K preview of the same source, replaced by 4K / 8K / 16K tiles.
    const dayPlaceholder = loadEarthTexture('/tex/earth/day_global_2k.jpg', THREE.SRGBColorSpace, true);
    // NASA Black Marble / VIIRS City Lights 2012 via NASA GIBS (public domain).
    const nightMap = loadEarthTexture(
      ultra ? '/tex/earth/night_8k.jpg' : '/tex/earth/night_4k.jpg',
      THREE.SRGBColorSpace,
      true,
    );
    const normalMap = loadEarthTexture('/tex/earth/normal_4k.jpg', THREE.NoColorSpace, true);
    const specMap = loadEarthTexture('/tex/earth/specular_2k.jpg', THREE.NoColorSpace, true);

    // A one-channel cloud density texture keeps the GPU footprint at 33.5 MB
    // for the 8K cloud field instead of 134 MB for an RGBA upload.
    const cloudPlaceholder = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat);
    cloudPlaceholder.needsUpdate = true;
    ownedTextures.add(cloudPlaceholder);

    const shared = {
      nightMap: { value: nightMap },
      cloudMap: { value: cloudPlaceholder as THREE.Texture },
      specMap: { value: specMap },
      normalMap: { value: normalMap },
      sunDirection: { value: sunCurrent },
      time: { value: 0 },
    };

    let cloud4k: THREE.Texture | null = null;
    let cloud8kRequested = false;
    const loadCloudDensity = async (url: string, width: number, height: number) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('cloud canvas unavailable');
      ctx.drawImage(img, 0, 0, width, height);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const data = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i += 1) data[i] = rgba[i * 4];
      const tex = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
      tex.flipY = false;
      tex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = maxAniso;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      return tex;
    };
    const requestCloud8k = () => {
      if (!ultra || cloud8kRequested) return;
      cloud8kRequested = true;
      loadCloudDensity('/tex/earth/clouds_8k.webp', 8192, 4096)
        .then((tex) => {
          if (disposed) {
            tex.dispose();
            return;
          }
          ownedTextures.add(tex);
          shared.cloudMap.value = tex;
          if (cloud4k) {
            ownedTextures.delete(cloud4k);
            cloud4k.dispose();
          }
          cloud4k = tex;
        })
        .catch(() => {
          cloud8kRequested = false;
        });
    };
    loadCloudDensity('/tex/earth/clouds_4k.webp', 4096, 2048)
      .then((tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        ownedTextures.add(tex);
        cloud4k = tex;
        shared.cloudMap.value = tex;
        ownedTextures.delete(cloudPlaceholder);
        cloudPlaceholder.dispose();
      })
      .catch(() => {
        if (disposed) return;
        const fallback = loadEarthTexture('/tex/earth/clouds_4k.png', THREE.NoColorSpace, true);
        shared.cloudMap.value = fallback;
      });

    const earthVertexShader = `
      attribute vec2 uvGlobal;
      varying vec2 vUv;
      varying vec2 vGlobalUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vGlobalUv = uvGlobal;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `;
    const earthFragmentShader = `
      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform sampler2D cloudMap;
      uniform sampler2D specMap;
      uniform sampler2D normalMap;
      uniform vec2 dayUvOffset;
      uniform vec2 dayUvScale;
      uniform float dayInset;
      uniform vec3 sunDirection;
      uniform float time;
      varying vec2 vUv;
      varying vec2 vGlobalUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(sunDirection);
        vec3 V = normalize(cameraPosition - vWorldPosition);

        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 T = cross(up, N);
        T = length(T) > 0.0001 ? normalize(T) : vec3(1.0, 0.0, 0.0);
        vec3 B = normalize(cross(N, T));

        // The equirectangular V axis points south in this mapping. The normal
        // map's green channel was authored V-up, so invert it to keep relief lit
        // from the correct direction.
        vec3 nTex = texture2D(normalMap, vGlobalUv).xyz * 2.0 - 1.0;
        nTex.xy *= 0.7;
        nTex.y = -nTex.y;
        N = normalize(N + T * nTex.x * 0.5 + B * nTex.y * 0.5);

        vec2 dayUv = vUv * dayUvScale + dayUvOffset;
        dayUv = mix(vec2(dayInset), vec2(1.0 - dayInset), dayUv);
        vec3 dayColor = texture2D(dayMap, dayUv).rgb;
        vec3 nightColor = texture2D(nightMap, vGlobalUv).rgb;

        vec2 cloudUv = vGlobalUv + vec2(time * 0.00018, 0.0);
        vec2 shadowOffset = vec2(dot(L, T), -dot(L, B)) * 0.0018;
        float cloudShadow = texture2D(cloudMap, cloudUv + shadowOffset).r;
        float sun = dot(N, L);
        float dayMix = smoothstep(-0.10, 0.22, sun);
        dayColor *= 1.0 - cloudShadow * 0.32 * dayMix;

        float ndl = max(sun, 0.0);
        vec3 lit = dayColor * (0.06 + 0.94 * pow(ndl, 0.9));
        float lowSun = 1.0 - smoothstep(0.0, 0.28, ndl);
        lit *= mix(vec3(1.0), vec3(1.06, 0.95, 0.86), lowSun * 0.55);
        float specMask = texture2D(specMap, vGlobalUv).r;
        lit += vec3(0.006, 0.018, 0.040) * specMask * (0.35 + 0.65 * ndl);
        vec3 ambient = dayColor * 0.035;
        vec3 color = mix(nightColor * 1.05 + ambient * 0.4, lit + ambient, dayMix);

        float cloud = texture2D(cloudMap, cloudUv).r;
        float cloudDensity = smoothstep(0.04, 0.94, cloud);
        vec3 cloudColor = mix(vec3(0.36, 0.45, 0.56), vec3(0.90, 0.93, 0.97), smoothstep(-0.05, 0.25, sun));
        color = mix(color, cloudColor, cloudDensity * 0.48 * smoothstep(-0.10, 0.28, sun));

        vec3 H = normalize(L + V);
        float specular = pow(max(dot(N, H), 0.0), 48.0) * specMask * 0.35 * smoothstep(0.0, 0.18, sun);
        color += vec3(0.62, 0.78, 0.92) * specular;

        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        color += vec3(0.14, 0.31, 0.46) * fresnel * 0.11 * smoothstep(-0.10, 0.40, sun);

        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `;

    const PATCH_COLS = 4;
    const PATCH_ROWS = 2;
    const PATCH_SEGMENTS = 64;
    type EarthPatch = {
      col: number;
      row: number;
      normal: THREE.Vector3;
      material: THREE.ShaderMaterial;
      levels: (THREE.Texture | null)[];
      loading: boolean[];
      desired: number;
      display: number;
      lastUsed: number;
    };
    const patches: EarthPatch[] = [];

    const applyPatchLevel = (patch: EarthPatch) => {
      const highest = patch.levels[2] ? 2 : patch.levels[1] ? 1 : patch.levels[0] ? 0 : -1;
      const level = Math.min(patch.desired, highest);
      if (level === patch.display) return;
      patch.display = level;
      if (level === -1) {
        patch.material.uniforms.dayMap.value = dayPlaceholder;
        patch.material.uniforms.dayUvOffset.value.set(patch.col * 0.25, patch.row * 0.5);
        patch.material.uniforms.dayUvScale.value.set(0.25, 0.5);
        patch.material.uniforms.dayInset.value = 0;
      } else {
        patch.material.uniforms.dayMap.value = patch.levels[level];
        patch.material.uniforms.dayUvOffset.value.set(0, 0);
        patch.material.uniforms.dayUvScale.value.set(1, 1);
        patch.material.uniforms.dayInset.value = 1 / 258;
      }
    };

    const loadPatchLevel = (patch: EarthPatch, level: number) => {
      if (patch.levels[level] || patch.loading[level]) return;
      if (level === 2) {
        const active = patches.filter((p) => p.levels[2] || p.loading[2]);
        if (active.length >= 3) {
          const victim = active
            .filter((p) => p.levels[2] && p.desired < 2)
            .sort((a, b) => a.lastUsed - b.lastUsed)[0];
          if (!victim) return;
          const tex = victim.levels[2];
          victim.levels[2] = null;
          victim.display = -2;
          applyPatchLevel(victim);
          if (tex) {
            ownedTextures.delete(tex);
            tex.dispose();
          }
        }
      }
      patch.loading[level] = true;
      const tex = loader.load(
        `/tex/earth/day_l${level}_r${patch.row}_c${patch.col}.jpg`,
        () => {
          if (disposed) {
            tex.dispose();
            return;
          }
          patch.loading[level] = false;
          patch.levels[level] = tex;
          applyPatchLevel(patch);
        },
        undefined,
        () => {
          patch.loading[level] = false;
        },
      );
      configureEarthTexture(tex, THREE.SRGBColorSpace);
    };

    const buildPatch = (col: number, row: number) => {
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const globalUvs: number[] = [];
      const indices: number[] = [];
      const lonStart = -180 + col * 90;
      const latStart = row === 0 ? 90 : 0;
      const latEnd = row === 0 ? 0 : -90;

      for (let iy = 0; iy <= PATCH_SEGMENTS; iy += 1) {
        const v = iy / PATCH_SEGMENTS;
        const lat = latStart + (latEnd - latStart) * v;
        for (let ix = 0; ix <= PATCH_SEGMENTS; ix += 1) {
          const u = ix / PATCH_SEGMENTS;
          const lon = lonStart + 90 * u;
          const p = latLngToVec(lat, lon, R);
          positions.push(p.x, p.y, p.z);
          normals.push(p.x / R, p.y / R, p.z / R);
          uvs.push(u, v);
          globalUvs.push((col + u) / PATCH_COLS, row === 0 ? v / 2 : 0.5 + v / 2);
        }
      }
      for (let iy = 0; iy < PATCH_SEGMENTS; iy += 1) {
        for (let ix = 0; ix < PATCH_SEGMENTS; ix += 1) {
          const a = iy * (PATCH_SEGMENTS + 1) + ix;
          const b = a + 1;
          const c = a + PATCH_SEGMENTS + 1;
          const d = c + 1;
          indices.push(a, c, b, c, d, b);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute('uvGlobal', new THREE.Float32BufferAttribute(globalUvs, 2));
      geometry.setIndex(indices);
      geometry.computeBoundingSphere();

      const material = new THREE.ShaderMaterial({
        uniforms: {
          ...shared,
          dayMap: { value: dayPlaceholder },
          dayUvOffset: { value: new THREE.Vector2(col * 0.25, row * 0.5) },
          dayUvScale: { value: new THREE.Vector2(0.25, 0.5) },
          dayInset: { value: 0 },
        },
        vertexShader: earthVertexShader,
        fragmentShader: earthFragmentShader,
        side: THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      const patch: EarthPatch = {
        col,
        row,
        normal: latLngToVec(row === 0 ? 45 : -45, -180 + (col + 0.5) * 90, 1).normalize(),
        material,
        levels: [null, null, null],
        loading: [false, false, false],
        desired: 0,
        display: -1,
        lastUsed: 0,
      };
      patches.push(patch);
      loadPatchLevel(patch, 0);
    };

    for (let row = 0; row < PATCH_ROWS; row += 1) {
      for (let col = 0; col < PATCH_COLS; col += 1) buildPatch(col, row);
    }

    const updateEarthLod = () => {
      const dist = camera.position.length() / R;
      const camDir = camera.position.clone().normalize();
      if (dist < 2.4 && ultra) requestCloud8k();
      for (const patch of patches) {
        const centerDot = patch.normal.dot(camDir);
        const facing = centerDot > -0.25;
        let desired = 0;
        if (highRes && facing) {
          if (dist < 2.45) desired = 2;
          else if (dist < 3.45) desired = 1;
        }
        patch.desired = desired;
        if (desired === 2) patch.lastUsed = performance.now();
        if (highRes && facing) {
          if (dist < 3.9) loadPatchLevel(patch, 1);
          if (dist < 2.6 && centerDot > 0.25) loadPatchLevel(patch, 2);
        }
        applyPatchLevel(patch);
      }
    };

    const atmoMat = new THREE.ShaderMaterial({
      uniforms: {
        sunDirection: { value: sunCurrent },
      },
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirection;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec3 N = normalize(vWorldNormal);
          vec3 V = normalize(cameraPosition - vWorldPosition);
          vec3 L = normalize(sunDirection);
          float rim = pow(1.0 - abs(dot(N, V)), 3.8);
          float broad = pow(1.0 - abs(dot(N, V)), 1.5);
          float sun = dot(N, L);
          float day = smoothstep(-0.28, 0.55, sun);
          float terminator = 1.0 - smoothstep(0.0, 0.34, abs(sun));
          vec3 cold = vec3(0.10, 0.25, 0.42);
          vec3 warm = vec3(0.58, 0.35, 0.19);
          vec3 col = mix(cold, warm, terminator * 0.8);
          float intensity = rim * (0.22 + 0.90 * day) + broad * 0.045 * day;
          gl_FragColor = vec4(col * intensity, 1.0);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.042, 96, 64), atmoMat);
    scene.add(atmosphere);

    const starTex = dotTexture();
    const starGeo = new THREE.BufferGeometry();
    const starCount = 2800;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const radius = 1200 + Math.random() * 1400;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      const tint = 0.62 + Math.random() * 0.38;
      colors[i * 3] = tint * (0.86 + Math.random() * 0.14);
      colors[i * 3 + 1] = tint * (0.9 + Math.random() * 0.1);
      colors[i * 3 + 2] = tint;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        map: starTex,
        size: 2.1,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.8,
        alphaTest: 0.01,
        vertexColors: true,
        depthWrite: false,
      }),
    );
    scene.add(stars);

    const sunGlow = dotTexture();
    const sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunGlow,
        color: '#f3d4a6',
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sunSprite.position.copy(sunDir.clone().multiplyScalar(1600));
    sunSprite.scale.set(90, 90, 1);
    scene.add(sunSprite);

    const campaignGroup = new THREE.Group();
    scene.add(campaignGroup);
    let campaignLines: THREE.Line[] = [];
    let campaignReveal = 0;
    let campaignFocusDirection: THREE.Vector3 | null = null;

    const setSunMonth = (month: number | null) => {
      if (month === null) {
        sunCurrent.copy(sunDir);
        sunSprite.position.copy(sunDir.clone().multiplyScalar(1600));
        return;
      }
      const midMonthDay = [16, 46, 75, 105, 136, 166, 197, 228, 258, 289, 319, 350][month] ?? 16;
      const declination = -23.44 * Math.cos((2 * Math.PI * (midMonthDay + 10)) / 365);
      const direction = latLngToVec(declination, 32, 1)
        .normalize()
        .add(new THREE.Vector3(0.18, 0.1, 0.06))
        .normalize();
      sunCurrent.copy(direction);
      sunSprite.position.copy(direction.clone().multiplyScalar(1600));
    };

    const setCampaign = (ids: string[]) => {
      for (const line of campaignLines) {
        campaignGroup.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
      campaignLines = [];
      campaignReveal = 0;
      campaignGroup.visible = ids.length > 1;
      const center = new THREE.Vector3();
      for (const id of ids) {
        const site = sites.find((item) => item.id === id);
        if (site) center.add(latLngToVec(site.lat, site.lon, 1).normalize());
      }
      campaignFocusDirection =
        center.lengthSq() > 0.0001 ? center.normalize() : null;
      for (let index = 0; index < ids.length - 1; index += 1) {
        const from = sites.find((site) => site.id === ids[index]);
        const to = sites.find((site) => site.id === ids[index + 1]);
        if (!from || !to) continue;
        const n1 = latLngToVec(from.lat, from.lon, 1).normalize();
        const n2 = latLngToVec(to.lat, to.lon, 1).normalize();
        const points: THREE.Vector3[] = [];
        for (let step = 0; step <= 64; step += 1) {
          const t = step / 64;
          const point = n1
            .clone()
            .lerp(n2, t)
            .normalize()
            .multiplyScalar(R + 2.4 + 7 * Math.sin(Math.PI * t));
          points.push(point);
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        geometry.setDrawRange(0, 0);
        const material = new THREE.LineBasicMaterial({
          color: '#d4a15c',
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
        });
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        line.userData.full = points.length;
        campaignGroup.add(line);
        campaignLines.push(line);
      }
    };

    const siteData = new Map<
      string,
      {
        site: Site;
        line: THREE.Line;
        material: THREE.LineBasicMaterial;
        tip: THREE.Mesh;
        tipMaterial: THREE.MeshBasicMaterial;
        hit: THREE.Mesh;
        height: number;
        siteY: number;
        lit: boolean;
      }
    >();
    const hitTargets: THREE.Mesh[] = [];
    let rankOrder = new Map(
      (rankedIds.length ? rankedIds : sites.map((site) => site.id)).map((id, index) => [
        id,
        index,
      ]),
    );

    for (const site of sites) {
      const pos = latLngToVec(site.lat, site.lon, R + 0.6);
      const normal = latLngToVec(site.lat, site.lon, 1).normalize();
      const score = missionScores[site.id] ?? mlScore(site, profile);
      const idx = rankOrder.get(site.id) ?? 39;
      const height = 2.2 + (score / 100) * 7.5 + (idx < 5 ? 2.4 : 0);
      const color = idx < 5 ? '#e8d8bd' : '#9db7bd';
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const geo = new THREE.BufferGeometry().setFromPoints([
        pos,
        pos.clone().add(normal.clone().multiplyScalar(height)),
      ]);
      const line = new THREE.Line(geo, material);
      scene.add(line);

      const tipMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.95, 8, 8), tipMaterial);
      tip.position.copy(pos);
      scene.add(tip);

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 8, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
      );
      hit.position.copy(pos);
      hit.userData.site = site;
      scene.add(hit);
      hitTargets.push(hit);

      siteData.set(site.id, {
        site,
        line,
        material,
        tip,
        tipMaterial,
        hit,
        height,
        siteY: latLngToVec(site.lat, site.lon, R).y,
        lit: false,
      });
    }

    const applyRanking = (ids: string[], scores: Record<string, number>) => {
      rankOrder = new Map(ids.map((id, index) => [id, index]));
      for (const [, item] of siteData) {
        const idx = rankOrder.get(item.site.id) ?? 39;
        const score = scores[item.site.id] ?? mlScore(item.site, profile);
        const height = 2.2 + (score / 100) * 7.5 + (idx < 5 ? 2.4 : 0);
        item.height = height;
        const pos = latLngToVec(item.site.lat, item.site.lon, R + 0.6);
        const normal = latLngToVec(item.site.lat, item.site.lon, 1).normalize();
        item.line.geometry.dispose();
        item.line.geometry = new THREE.BufferGeometry().setFromPoints([
          pos,
          pos.clone().add(normal.clone().multiplyScalar(height)),
        ]);
      }
    };

    const reticleMat = new THREE.MeshBasicMaterial({
      color: '#d7b075',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const reticle = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.28, 96), reticleMat);
    scene.add(reticle);

    const reticleDotMat = new THREE.MeshBasicMaterial({
      color: '#f0c78d',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const reticleDot = new THREE.Mesh(new THREE.CircleGeometry(0.48, 24), reticleDotMat);
    scene.add(reticleDot);

    const scanMat = new THREE.LineBasicMaterial({
      color: '#a9c6cb',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const scanPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i += 1) {
      const a = (i / 128) * Math.PI * 2;
      scanPoints.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
    }
    const scanRing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(scanPoints), scanMat);
    scene.add(scanRing);

    const openingTarget = new THREE.Vector3(-42, 0, 0);
    const openingPos = openingTarget.clone().add(latLngToVec(14, -26, R * 3.34));
    camera.position.copy(openingPos);
    controls.target.copy(openingTarget);
    controls.enabled = false;
    camera.lookAt(openingTarget);

    let anim: {
      startDir: THREE.Vector3;
      endDir: THREE.Vector3;
      startRadius: number;
      endRadius: number;
      startTarget: THREE.Vector3;
      endTarget: THREE.Vector3;
      t0: number;
      duration: number;
    } | null = null;
    let openingFree = false;
    const onControlStart = () => {
      openingFree = true;
    };
    const onWheel = () => {
      openingFree = true;
    };
    controls.addEventListener('start', onControlStart);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: true });

    const fly = (endPos: THREE.Vector3, endTarget: THREE.Vector3, duration = 1800) => {
      const startPos = camera.position.clone();
      anim = {
        startDir: startPos.clone().normalize(),
        endDir: endPos.clone().normalize(),
        startRadius: startPos.length(),
        endRadius: endPos.length(),
        startTarget: controls.target.clone(),
        endTarget,
        t0: performance.now(),
        duration,
      };
      controls.enabled = false;
    };

    const screenRight = (normal: THREE.Vector3) => {
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal);
      if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
      return right.normalize();
    };

    const globalNormal = latLngToVec(12, -30, 1).normalize();
    const centered = () => propsRef.current.framing === 'centered';
    const globalPositionOffset = globalNormal.clone().multiplyScalar(R * 3.86);
    const globalPositionCentered = globalNormal.clone().multiplyScalar(R * 4.5);
    const discoveryTargetOffset = screenRight(globalNormal).multiplyScalar(-26);
    const origin = new THREE.Vector3();
    const globalPosition = () => (centered() ? globalPositionCentered : globalPositionOffset).clone();
    const discoveryTarget = () => (centered() ? origin : discoveryTargetOffset).clone();
    const initNormal = latLngToVec(10, -12, 1).normalize();
    const initPosition = initNormal.clone().multiplyScalar(R * 2.72);
    const initTarget = screenRight(initNormal).multiplyScalar(-16);

    const setMode = (next: Mode) => {
      if (next === 'opening') {
        openingFree = false;
        controls.enabled = false;
        fly(openingPos, openingTarget, 2200);
      } else if (next === 'initializing') {
        openingFree = true;
        controls.enabled = false;
        fly(initPosition, initTarget, 5200);
      } else if (next === 'discovery') {
        openingFree = true;
        controls.enabled = false;
        fly(globalPosition(), discoveryTarget(), 2200);
      }
    };

    const selectedCamera = (site: Site, requestedOffset: boolean) => {
      const offset = requestedOffset && !centered();
      const normal = latLngToVec(site.lat, site.lon, 1).normalize();
      const pos = normal.clone().multiplyScalar(R * (centered() ? 3.6 : 3.02));
      const right = screenRight(normal);
      const target = offset ? right.clone().multiplyScalar(-22) : new THREE.Vector3();
      if (offset && camera.aspect < 0.85) {
        const screenUp = new THREE.Vector3().crossVectors(normal, right).normalize();
        target.addScaledVector(screenUp, -34);
      }
      return { pos, target };
    };

    const stageOverviewPosition = latLngToVec(12, -30, 1).normalize().multiplyScalar(R * 4.6);
    const stageOverviewTarget = new THREE.Vector3(0, 0, 0);

    const focusCampaign = () => {
      const direction = campaignFocusDirection ?? latLngToVec(12, -30, 1).normalize();
      fly(direction.clone().multiplyScalar(R * 4.6), stageOverviewTarget, 2400);
    };

    const setStageView = (next: Stage, id: string | null) => {
      if (next === 'discovery') {
        setSelected(id);
        return;
      }
      if (next === 'campaign') {
        focusCampaign();
        return;
      }
      if (next === 'temporal') {
        fly(stageOverviewPosition, stageOverviewTarget, 2600);
        return;
      }
      const site = id ? sites.find((s) => s.id === id) : null;
      if (site) {
        const normal = latLngToVec(site.lat, site.lon, 1).normalize();
        fly(normal.multiplyScalar(R * 3.35), stageOverviewTarget, 2400);
      } else {
        fly(stageOverviewPosition, stageOverviewTarget, 2400);
      }
    };

    const setSelected = (id: string | null) => {
      if (propsRef.current.mode !== 'discovery') return;
      if (propsRef.current.stage !== 'discovery') return;
      if (!id) {
        if (propsRef.current.mode === 'discovery') fly(globalPosition(), discoveryTarget(), 1500);
        return;
      }
      const site = sites.find((s) => s.id === id);
      if (!site) return;
      const cameraPose = selectedCamera(site, true);
      fly(cameraPose.pos, cameraPose.target, 2300);
    };

    const setSiteOrbit = (id: string | null) => {
      if (id) {
        const site = sites.find((s) => s.id === id);
        if (!site) return;
        const normal = latLngToVec(site.lat, site.lon, 1).normalize();
        const pos = normal.clone().multiplyScalar(R * 1.015);
        fly(pos, new THREE.Vector3(0, 0, 0), 4200);
        return;
      }
      if (propsRef.current.mode !== 'discovery') return;
      if (propsRef.current.stage !== 'discovery') {
        setStageView(propsRef.current.stage, propsRef.current.selectedId);
        return;
      }
      const site = propsRef.current.selectedId
        ? sites.find((s) => s.id === propsRef.current.selectedId)
        : null;
      if (site) {
        const cameraPose = selectedCamera(site, true);
        fly(cameraPose.pos, cameraPose.target, 2400);
      } else {
        fly(globalPosition(), discoveryTarget(), 2200);
      }
    };

    apiRef.current = {
      setMode,
      setSelected,
      setSiteOrbit,
      setRanking: applyRanking,
      setStage: setStageView,
      setSunMonth,
      setCampaign,
      focusCampaign,
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let downAt = 0;

    const toPointer = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const canvasEl = renderer.domElement;
    canvasEl.style.cursor = 'grab';
    let dragging = false;
    let hoverQueued = false;
    const siteUnder = (clientX: number, clientY: number) => {
      toPointer(clientX, clientY);
      raycaster.setFromCamera(pointer, camera);
      for (const hit of raycaster.intersectObjects(hitTargets, false)) {
        const site = hit.object.userData.site as Site | undefined;
        if (!site) continue;
        const normal = latLngToVec(site.lat, site.lon, 1).normalize();
        const toCam = camera.position.clone().sub(latLngToVec(site.lat, site.lon, R)).normalize();
        if (normal.dot(toCam) > 0.03) return site;
      }
      return null;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (dragging || hoverQueued) return;
      hoverQueued = true;
      requestAnimationFrame(() => {
        hoverQueued = false;
        const clickable = propsRef.current.mode === 'discovery' && siteUnder(e.clientX, e.clientY);
        canvasEl.style.cursor = clickable ? 'pointer' : 'grab';
      });
    };
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downAt = performance.now();
      dragging = true;
      canvasEl.style.cursor = 'grabbing';
    };
    const endDrag = () => {
      dragging = false;
      canvasEl.style.cursor = 'grab';
    };

    const onPointerUp = (e: PointerEvent) => {
      endDrag();
      if (propsRef.current.mode !== 'discovery') return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7) return;
      if (performance.now() - downAt > 700) return;
      toPointer(e.clientX, e.clientY);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(hitTargets, false);
      for (const hit of hits) {
        const site = hit.object.userData.site as Site | undefined;
        if (!site) continue;
        const normal = latLngToVec(site.lat, site.lon, 1).normalize();
        const toCam = camera.position.clone().sub(latLngToVec(site.lat, site.lon, R)).normalize();
        if (normal.dot(toCam) > 0.03) {
          propsRef.current.onSelect(site.id);
          return;
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', endDrag);

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

    const clock = new THREE.Clock();
    let frame = 0;
    let lodTick = 0;
    let reveal = 0;
    let lastMode = propsRef.current.mode;

    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (propsRef.current.paused) return;
      const elapsed = clock.getElapsedTime();
      const now = performance.now();
      shared.time.value = elapsed;
      if ((lodTick++ & 15) === 0) updateEarthLod();
      if (anim) {
        const k = Math.min(1, (now - anim.t0) / anim.duration);
        const e = easeInOutCubic(k);
        const dir = anim.startDir.clone();
        const turn = new THREE.Quaternion().setFromUnitVectors(anim.startDir, anim.endDir);
        dir.applyQuaternion(new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), turn, e));
        dir.multiplyScalar(anim.startRadius + (anim.endRadius - anim.startRadius) * e);
        camera.position.copy(dir);
        controls.target.lerpVectors(anim.startTarget, anim.endTarget, e);
        camera.lookAt(controls.target);
        if (k >= 1) {
          anim = null;
          if (
            (propsRef.current.mode === 'discovery' && !propsRef.current.siteOrbit) ||
            propsRef.current.mode === 'opening'
          ) {
            controls.enabled = true;
          }
        }
      } else if (propsRef.current.mode === 'opening' && !openingFree) {
        const t = (elapsed % 60) / 60;
        const pos = openingTarget
          .clone()
          .add(latLngToVec(14 - t * 3, -26 + t * 7, R * (3.34 - t * 0.1)));
        camera.position.lerp(pos, 0.008);
        controls.target.copy(openingTarget);
        camera.lookAt(openingTarget);
      }

      if (propsRef.current.mode === 'discovery' || propsRef.current.mode === 'initializing') {
        reveal += 0.012;
      }
      const revealClamped = Math.min(1, reveal);

      if (lastMode !== propsRef.current.mode) {
        lastMode = propsRef.current.mode;
        if (propsRef.current.mode === 'initializing') {
          reveal = 0;
          for (const [, item] of siteData) item.lit = false;
        }
        if (propsRef.current.mode === 'discovery') {
          reveal = 1;
        }
      }

      const scanY = R * 0.96 - ((elapsed * 0.24) % 1) * R * 1.92;
      const markerFade = THREE.MathUtils.smoothstep(camera.position.length() / R, 1.6, 2.4);
      const highlighted = propsRef.current.highlightIds;
      const hasHighlight = highlighted.length > 0;
      for (const [, item] of siteData) {
        const idx = rankOrder.get(item.site.id) ?? 39;
        const selected = item.site.id === propsRef.current.selectedId;
        const inHighlight = highlighted.includes(item.site.id);
        const dimmed = hasHighlight && !inHighlight;
        const discovery = propsRef.current.mode === 'discovery';
        const initializing = propsRef.current.mode === 'initializing';
        if (discovery) item.lit = true;
        if (initializing && scanY <= item.siteY + 7) item.lit = true;
        const spawning = propsRef.current.spawn && propsRef.current.mode === 'opening';
        const spawnOrder = spawning ? propsRef.current.sites.findIndex((x) => x.id === item.site.id) : -1;
        const spawnLit = spawning && spawnOrder >= 0 && spawnOrder < spawnCount(propsRef.current.sites.length);
        const targetOpacity = spawning
          ? (spawnLit ? 0.95 * markerFade : 0)
          : item.lit
            ? (idx < 5 ? 0.9 : 0.36) * revealClamped * markerFade * (dimmed ? 0.18 : 1)
            : 0;
        const boost = selected || inHighlight ? 1.45 : 1;
        item.material.opacity += (targetOpacity - item.material.opacity) * 0.1;
        item.tipMaterial.opacity += (Math.min(1, targetOpacity * boost) - item.tipMaterial.opacity) * 0.1;
        item.material.color.set(
          spawning
            ? '#f2867a'
            : selected
            ? '#e4b57a'
            : inHighlight
              ? '#d4a15c'
              : idx < 5
                ? '#e8d8bd'
                : '#9db7bd',
        );
        item.tipMaterial.color.copy(item.material.color);
      }

      const scanTarget = propsRef.current.mode === 'initializing' ? 0.7 : 0;
      scanMat.opacity += (scanTarget - scanMat.opacity) * 0.05;
      if (propsRef.current.mode === 'initializing') {
        scanRing.position.y = scanY;
        const rr = Math.sqrt(Math.max(0.04, (R + 0.9) ** 2 - scanY * scanY));
        scanRing.scale.set(rr / R, 1, rr / R);
      }

      const selected = propsRef.current.selectedId
        ? siteData.get(propsRef.current.selectedId)
        : null;
      if (
        selected &&
        propsRef.current.mode === 'discovery' &&
        !propsRef.current.siteOrbit &&
        !anim
      ) {
        const pos = latLngToVec(selected.site.lat, selected.site.lon, R + 0.7);
        const normal = latLngToVec(selected.site.lat, selected.site.lon, 1).normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        reticle.position.copy(pos);
        reticle.quaternion.copy(quat);
        reticleDot.position.copy(latLngToVec(selected.site.lat, selected.site.lon, R + 0.78));
        reticleDot.quaternion.copy(quat);
        reticleMat.opacity += (0.85 - reticleMat.opacity) * 0.1;
        reticleDotMat.opacity += (0.9 - reticleDotMat.opacity) * 0.1;
      } else {
        reticleMat.opacity += (0 - reticleMat.opacity) * 0.1;
        reticleDotMat.opacity += (0 - reticleDotMat.opacity) * 0.1;
      }

      const lensEl = lensRef.current;
      if (lensEl) {
        if (
          selected &&
          propsRef.current.mode === 'discovery' &&
          !anim &&
          !propsRef.current.siteOrbit
        ) {
          const pos = latLngToVec(selected.site.lat, selected.site.lon, R + 0.7);
          const projected = pos.clone().project(camera);
          const delta = camera.position.clone().sub(pos).normalize();
          const facing = pos.clone().normalize().dot(delta) > 0.02;
          if (projected.z < 1 && facing) {
            const W = wrap.clientWidth;
            const H = wrap.clientHeight;
            const x = (projected.x * 0.5 + 0.5) * W;
            const y = (-projected.y * 0.5 + 0.5) * H;
            const lensW = W > 1400 ? 380 : W > 1100 ? 330 : 320;
            const lensH = W > 1400 ? 600 : W > 1100 ? 560 : 540;
            const inBand = y > 170 && y < H - 70;
            if (inBand) {
              const leftBoundary = W > 1400 ? 426 : W > 1100 ? 364 : W > 900 ? 308 : 24;
              const inset = W > 1400 ? 444 : W > 1100 ? 392 : W > 900 ? 344 : 24;
              const rightBoundary = W - inset;
              let left = x + 34;
              if (left + lensW > rightBoundary) left = x - lensW - 34;
              left = Math.min(Math.max(leftBoundary, left), rightBoundary - lensW);
              const top = Math.min(Math.max(24, y - 100), Math.max(24, H - lensH - 140));
              lensEl.classList.toggle('is-left', left < x);
              lensEl.classList.add('is-visible');
              lensEl.style.transform = `translate(${left}px, ${top}px)`;
              lensEl.style.opacity = '1';
              lensEl.style.pointerEvents = 'auto';
            } else {
              lensEl.classList.remove('is-visible');
              lensEl.style.opacity = '0';
              lensEl.style.pointerEvents = 'none';
            }
          } else {
            lensEl.classList.remove('is-visible');
            lensEl.style.opacity = '0';
            lensEl.style.pointerEvents = 'none';
          }
        } else {
          lensEl.classList.remove('is-visible');
          lensEl.style.opacity = '0';
          lensEl.style.pointerEvents = 'none';
        }
      }

      if (campaignGroup.visible) {
        campaignReveal = Math.min(1, campaignReveal + 0.012);
        const eased = easeInOutCubic(campaignReveal);
        for (const line of campaignLines) {
          const full = (line.userData.full as number) || 0;
          line.geometry.setDrawRange(0, Math.max(0, Math.floor(full * eased)));
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => setSize();
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', endDrag);
      renderer.domElement.removeEventListener('wheel', onWheel);
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      ownedTextures.forEach((tex) => tex.dispose());
      ownedTextures.clear();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      starTex.dispose();
      sunGlow.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === wrap) wrap.removeChild(renderer.domElement);
    };
    // The scene is built once; live props are read through propsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    apiRef.current?.setStage(stage, selectedId);
  }, [stage, selectedId]);

  useEffect(() => {
    apiRef.current?.setSunMonth(sunMonth);
  }, [sunMonth]);

  useEffect(() => {
    apiRef.current?.setCampaign(stage === 'campaign' ? campaignSiteIds : []);
    if (stage === 'campaign') apiRef.current?.focusCampaign();
  }, [stage, campaignSiteIds]);

  useEffect(() => {
    apiRef.current?.setRanking(rankedIds, missionScores);
  }, [rankedIds, missionScores]);

  const previousSiteOrbit = useRef(false);

  useEffect(() => {
    if (previousSiteOrbit.current === siteOrbit) return;
    previousSiteOrbit.current = siteOrbit;
    apiRef.current?.setSiteOrbit(siteOrbit ? selectedId : null);
  }, [siteOrbit, selectedId]);

  return (
    <div className="orb-planet" ref={wrapRef}>
      <div className="orb-lens-anchor" ref={lensRef}>
        {lens}
      </div>
    </div>
  );
}
