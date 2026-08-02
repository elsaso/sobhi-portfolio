import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HalfFloatType,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Vector2 } from "three";

export type TraversalPhase =
  | "ORBITAL REVEAL"
  | "RIM APPROACH"
  | "RING INSERTION"
  | "INTERIOR VECTOR";

export interface RingworldFrame {
  progress: number;
  rangeKm: number;
  altitudeKm: number;
  phase: TraversalPhase;
}

export interface RingworldScene {
  setProgress: (value: number) => void;
  setPointer: (x: number, y: number) => void;
  setActive: (value: boolean) => void;
  resize: (width: number, height: number) => void;
  wake: (duration?: number) => void;
  destroy: () => void;
}

interface RingworldOptions {
  compact: boolean;
  reducedMotion: boolean;
  onFrame: (frame: RingworldFrame) => void;
  onReady?: () => void;
  /** Skip camera easing and land directly on this progress (deep links). */
  initialProgress?: number;
}

const RING_RADIUS = 44;
const RING_WIDTH = 12;
const RING_THICKNESS = 2.1;
const OUTER_RADIUS = RING_RADIUS + RING_THICKNESS;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
};

const createRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

/** Seamless-around-the-ring value noise: sampled on the (cos θ, sin θ) circle. */
const createRingNoise = (seed: number) => {
  const random = createRandom(seed);
  const size = 256;
  const grid = new Float32Array(size * size);
  for (let index = 0; index < grid.length; index += 1) grid[index] = random();

  const lattice = (x: number, y: number) =>
    grid[((y & (size - 1)) * size + (x & (size - 1))) >>> 0];

  const noise2 = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = lattice(xi, yi);
    const b = lattice(xi + 1, yi);
    const c = lattice(xi, yi + 1);
    const d = lattice(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  const fbm = (x: number, y: number, octaves: number) => {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    for (let octave = 0; octave < octaves; octave += 1) {
      value += noise2(x * frequency, y * frequency) * amplitude;
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return value;
  };

  /** theta: 0..2π (seamless), lane: across-ring coordinate (any range). */
  return (theta: number, lane: number, scale: number, octaves = 4) => {
    const cx = Math.cos(theta) * scale;
    const sx = Math.sin(theta) * scale;
    return (
      fbm(cx + lane * 1.7 + 31.7, sx - lane * 0.6 + 11.3, octaves) * 0.65 +
      fbm(cx * 2.4 - lane * 0.9 + 73.1, sx * 2.4 + lane * 1.3 + 47.9, Math.max(2, octaves - 2)) * 0.35
    );
  };
};

const makeCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create ringworld texture canvas");
  return { canvas, context };
};

const toTexture = (
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  compact: boolean,
  repeatX = 1,
  srgb = true,
) => {
  const texture = new CanvasTexture(canvas);
  if (srgb) texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, 1);
  texture.anisotropy = Math.min(maxAnisotropy, compact ? 2 : 8);
  return texture;
};

/**
 * Outer armour: large repeating hull sections, recessed trench lanes,
 * mechanical panel seams, cyan energy conduits through selected sections.
 */
const createHullTextures = (compact: boolean, maxAnisotropy: number) => {
  const width = compact ? 512 : 1024;
  const height = compact ? 128 : 256;
  const albedo = makeCanvas(width, height);
  const emissive = makeCanvas(width, height);
  const roughness = makeCanvas(width, height);
  const random = createRandom(7952026);

  const gradient = albedo.context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0a141f");
  gradient.addColorStop(0.42, "#14293c");
  gradient.addColorStop(0.62, "#10202f");
  gradient.addColorStop(1, "#070f19");
  albedo.context.fillStyle = gradient;
  albedo.context.fillRect(0, 0, width, height);

  emissive.context.fillStyle = "#000";
  emissive.context.fillRect(0, 0, width, height);
  roughness.context.fillStyle = "rgb(120, 120, 120)";
  roughness.context.fillRect(0, 0, width, height);

  const sections = 14;
  const rows = 6;
  const sectionWidth = width / sections;
  const rowHeight = height / rows;
  const trenchRows = [1, 4];

  for (let section = 0; section < sections; section += 1) {
    const x0 = section * sectionWidth;
    const tint = 0.86 + random() * 0.28;
    const hasConduit = random() > 0.58;

    for (let row = 0; row < rows; row += 1) {
      const y0 = row * rowHeight;
      const isTrench = trenchRows.includes(row);

      if (isTrench) {
        // Recessed trench lane: dark inset with a lit lower lip.
        albedo.context.fillStyle = "#04090f";
        albedo.context.fillRect(x0, y0, sectionWidth, rowHeight);
        albedo.context.fillStyle = "rgba(148, 196, 226, .10)";
        albedo.context.fillRect(x0, y0 + rowHeight - 1.5, sectionWidth, 1.5);
        albedo.context.fillStyle = "rgba(0, 0, 0, .55)";
        albedo.context.fillRect(x0, y0, sectionWidth, 2);
        roughness.context.fillStyle = "rgb(235, 235, 235)";
        roughness.context.fillRect(x0, y0, sectionWidth, rowHeight);

        if (hasConduit) {
          const conduitY = y0 + rowHeight * 0.52;
          emissive.context.fillStyle = "rgba(38, 190, 240, .85)";
          emissive.context.fillRect(x0 + 3, conduitY, sectionWidth - 6, Math.max(1.2, height / 170));
          // Brighter pulse nodes along the conduit.
          for (let node = 0; node < 3; node += 1) {
            const nx = x0 + sectionWidth * (0.2 + node * 0.3 + random() * 0.08);
            emissive.context.fillStyle = "rgba(214, 248, 255, .95)";
            emissive.context.fillRect(nx, conduitY - 0.5, 2.5, Math.max(2.2, height / 120));
          }
        }
        continue;
      }

      // Armour plates inside the section.
      const plates = 3 + Math.floor(random() * 3);
      const plateWidth = sectionWidth / plates;
      for (let plate = 0; plate < plates; plate += 1) {
        const px = x0 + plate * plateWidth + 1;
        const brightness = Math.floor((26 + random() * 26) * tint);
        albedo.context.fillStyle = `rgb(${brightness}, ${brightness + 9}, ${brightness + 20})`;
        albedo.context.fillRect(px, y0 + 1, plateWidth - 2, rowHeight - 2);
        albedo.context.strokeStyle =
          random() > 0.6 ? "rgba(120, 190, 224, .14)" : "rgba(255, 255, 255, .05)";
        albedo.context.lineWidth = 1;
        albedo.context.strokeRect(px + 0.5, y0 + 1.5, plateWidth - 3, rowHeight - 3);
        const rough = 100 + Math.floor(random() * 90);
        roughness.context.fillStyle = `rgb(${rough}, ${rough}, ${rough})`;
        roughness.context.fillRect(px, y0 + 1, plateWidth - 2, rowHeight - 2);

        if (random() > 0.9) {
          emissive.context.fillStyle = random() > 0.6 ? "rgba(217, 248, 255, .9)" : "rgba(77, 216, 255, .8)";
          emissive.context.fillRect(
            px + plateWidth * 0.2,
            y0 + rowHeight * 0.44,
            plateWidth * 0.55,
            Math.max(1, height / 200),
          );
        }
      }
    }

    // Section separation seam.
    albedo.context.fillStyle = "rgba(0, 0, 0, .6)";
    albedo.context.fillRect(x0, 0, 1.5, height);
    albedo.context.fillStyle = "rgba(170, 214, 240, .08)";
    albedo.context.fillRect(x0 + 1.5, 0, 1, height);
  }

  return {
    albedo: toTexture(albedo.canvas, maxAnisotropy, compact, 4),
    emissive: toTexture(emissive.canvas, maxAnisotropy, compact, 4),
    roughness: toTexture(roughness.canvas, maxAnisotropy, compact, 4, false),
  };
};

/**
 * Inner surface: a habitable world — oceans, terrain variation, and distant
 * illuminated structures as emissive city clusters.
 */
const createInnerTextures = (compact: boolean, maxAnisotropy: number) => {
  const width = compact ? 512 : 1024;
  const height = compact ? 128 : 256;
  const albedo = makeCanvas(width, height);
  const emissive = makeCanvas(width, height);
  const noise = createRingNoise(615000);
  const random = createRandom(88231);

  const image = albedo.context.createImageData(width, height);
  const data = image.data;
  for (let y = 0; y < height; y += 1) {
    const lane = (y / height - 0.5) * 6;
    const latitudeShade = 1 - Math.abs(y / height - 0.5) * 0.35;
    for (let x = 0; x < width; x += 1) {
      const theta = (x / width) * Math.PI * 2;
      const elevation = noise(theta, lane, 3.1, 4);
      const detail = noise(theta, lane * 3.1, 9.5, 3);
      const e = elevation * 0.78 + detail * 0.22;
      let r: number, g: number, b: number;
      if (e < 0.42) {
        // Deep ocean
        const t = e / 0.42;
        r = 5 + t * 8; g = 22 + t * 22; b = 38 + t * 30;
      } else if (e < 0.48) {
        // Coastal shallows
        const t = (e - 0.42) / 0.06;
        r = 13 + t * 18; g = 44 + t * 22; b = 68 + t * 18;
      } else if (e < 0.63) {
        // Lowland terrain, muted olive / graphite
        const t = (e - 0.48) / 0.15;
        r = 38 + t * 24 + detail * 12;
        g = 52 + t * 20 + detail * 10;
        b = 40 + t * 12;
      } else if (e < 0.76) {
        // Highlands, cold tan / silver
        const t = (e - 0.63) / 0.13;
        r = 56 + t * 30; g = 62 + t * 28; b = 52 + t * 30;
      } else {
        // Peaks
        const t = (e - 0.76) / 0.24;
        r = 86 + t * 46; g = 92 + t * 46; b = 92 + t * 50;
      }
      const index = (y * width + x) * 4;
      data[index] = r * latitudeShade;
      data[index + 1] = g * latitudeShade;
      data[index + 2] = b * latitudeShade;
      data[index + 3] = 255;
    }
  }
  albedo.context.putImageData(image, 0, 0);

  emissive.context.fillStyle = "#000";
  emissive.context.fillRect(0, 0, width, height);
  // Distant illuminated structures: seeded city-light clusters on land.
  let placed = 0;
  let attempts = 0;
  while (placed < (compact ? 24 : 48) && attempts < 600) {
    attempts += 1;
    const cx = random() * width;
    const cy = height * (0.12 + random() * 0.76);
    const theta = (cx / width) * Math.PI * 2;
    const lane = (cy / height - 0.5) * 6;
    if (noise(theta, lane, 3.1, 4) < 0.48) continue; // land only
    const warm = random() > 0.45;
    const dots = compact ? 6 : 14;
    for (let dot = 0; dot < dots; dot += 1) {
      const dx = cx + (random() - 0.5) * 9;
      const dy = cy + (random() - 0.5) * 4;
      emissive.context.fillStyle = warm
        ? `rgba(255, 214, 150, ${0.25 + random() * 0.5})`
        : `rgba(150, 226, 255, ${0.25 + random() * 0.5})`;
      emissive.context.fillRect(dx, dy, 1.1, 1.1);
    }
    placed += 1;
  }

  return {
    albedo: toTexture(albedo.canvas, maxAnisotropy, compact, 2),
    emissive: toTexture(emissive.canvas, maxAnisotropy, compact, 2),
  };
};

/** Side walls: radial armour plating with sparse emissive markers. */
const createSideTextures = (compact: boolean, maxAnisotropy: number) => {
  const size = compact ? 256 : 512;
  const albedo = makeCanvas(size, size);
  const emissive = makeCanvas(size, size);
  const random = createRandom(31174);
  const center = size / 2;

  albedo.context.fillStyle = "#0a1622";
  albedo.context.fillRect(0, 0, size, size);
  emissive.context.fillStyle = "#000";
  emissive.context.fillRect(0, 0, size, size);

  // Concentric plating rings.
  for (let radius = 8; radius < center * 1.45; radius += 5 + random() * 7) {
    const brightness = 14 + random() * 22;
    albedo.context.strokeStyle = `rgba(${brightness}, ${brightness + 10}, ${brightness + 22}, .8)`;
    albedo.context.lineWidth = 1 + random() * 2.4;
    albedo.context.beginPath();
    albedo.context.arc(center, center, radius, 0, Math.PI * 2);
    albedo.context.stroke();
  }
  // Radial spokes.
  const spokes = 72;
  for (let spoke = 0; spoke < spokes; spoke += 1) {
    const angle = (spoke / spokes) * Math.PI * 2;
    albedo.context.strokeStyle = spoke % 6 === 0 ? "rgba(0,0,0,.65)" : "rgba(0,0,0,.3)";
    albedo.context.lineWidth = spoke % 6 === 0 ? 2 : 1;
    albedo.context.beginPath();
    albedo.context.moveTo(center + Math.cos(angle) * center * 0.9, center + Math.sin(angle) * center * 0.9);
    albedo.context.lineTo(center + Math.cos(angle) * center * 1.42, center + Math.sin(angle) * center * 1.42);
    albedo.context.stroke();
  }
  // Sparse emissive arc slits near the outer rim.
  for (let slit = 0; slit < 22; slit += 1) {
    const angle = random() * Math.PI * 2;
    const span = 0.02 + random() * 0.05;
    emissive.context.strokeStyle = random() > 0.5 ? "rgba(88, 220, 255, .9)" : "rgba(210, 246, 255, .9)";
    emissive.context.lineWidth = 1.4;
    emissive.context.beginPath();
    emissive.context.arc(center, center, center * (0.965 + random() * 0.03), angle, angle + span);
    emissive.context.stroke();
  }

  return {
    albedo: toTexture(albedo.canvas, maxAnisotropy, compact),
    emissive: toTexture(emissive.canvas, maxAnisotropy, compact),
  };
};

/** Soft cloud bands for the inner atmosphere layer (seamless wrap). */
const createCloudTexture = (compact: boolean, maxAnisotropy: number) => {
  const width = compact ? 256 : 512;
  const height = compact ? 64 : 128;
  const { canvas, context } = makeCanvas(width, height);
  const noise = createRingNoise(40211);
  const image = context.createImageData(width, height);
  const data = image.data;
  for (let y = 0; y < height; y += 1) {
    const lane = (y / height - 0.5) * 2.2;
    for (let x = 0; x < width; x += 1) {
      const theta = (x / width) * Math.PI * 2;
      const cover = noise(theta, lane, 2.2, 4);
      const alpha = smoothstep(0.52, 0.78, cover) * 165;
      const index = (y * width + x) * 4;
      data[index] = 198;
      data[index + 1] = 224;
      data[index + 2] = 240;
      data[index + 3] = alpha;
    }
  }
  context.putImageData(image, 0, 0);
  return toTexture(canvas, maxAnisotropy, compact);
};

const createGlowTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create glow texture");

  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(226, 250, 255, 1)");
  gradient.addColorStop(0.14, "rgba(104, 224, 255, .9)");
  gradient.addColorStop(0.42, "rgba(30, 160, 255, .35)");
  gradient.addColorStop(1, "rgba(0, 70, 160, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
};

const createStarGlowTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create star glow texture");

  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255, 250, 235, 1)");
  gradient.addColorStop(0.08, "rgba(255, 240, 205, .95)");
  gradient.addColorStop(0.3, "rgba(255, 214, 150, .28)");
  gradient.addColorStop(1, "rgba(120, 170, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  return new CanvasTexture(canvas);
};

const createAtmosphereMaterial = () =>
  new ShaderMaterial({
    uniforms: {
      auraColor: { value: new Color(0x43d7ff) },
      intensity: { value: 1.0 },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vViewDirection;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vViewDirection = normalize(cameraPosition - worldPosition.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 auraColor;
      uniform float intensity;
      varying vec3 vWorldNormal;
      varying vec3 vViewDirection;

      void main() {
        float facing = abs(dot(normalize(vWorldNormal), normalize(vViewDirection)));
        float fresnel = pow(1.0 - facing, 2.6);
        float alpha = (0.012 + fresnel * 0.26) * intensity;
        gl_FragColor = vec4(auraColor * (0.5 + fresnel * 1.25), alpha);
      }
    `,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

export const createRingworldScene = (
  canvas: HTMLCanvasElement,
  options: RingworldOptions,
): RingworldScene => {
  const { compact, reducedMotion, onFrame, onReady, initialProgress } = options;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });

  renderer.setClearColor(0x020710, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1 : 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new Scene();
  scene.fog = new Fog(0x020710, 110, 320);

  const camera = new PerspectiveCamera(compact ? 61 : 52, 1, 0.1, 420);
  const world = new Group();
  scene.add(world);

  const hemisphere = new HemisphereLight(0x72cfff, 0x01040a, 1.3);
  const keyLight = new DirectionalLight(0xc7efff, 3.6);
  keyLight.position.set(35, 58, 82);
  const rimLight = new DirectionalLight(0x278dff, 2.1);
  rimLight.position.set(-48, -25, 35);
  const coreLight = new PointLight(0xbfe6ff, 0, 0, 2);
  coreLight.position.set(0, 0, 0);
  scene.add(hemisphere, keyLight, rimLight, coreLight);

  const radialSegments = compact ? 192 : 384;
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const hull = createHullTextures(compact, maxAnisotropy);
  const inner = createInnerTextures(compact, maxAnisotropy);
  const side = createSideTextures(compact, maxAnisotropy);
  const cloudTexture = createCloudTexture(compact, maxAnisotropy);
  const glowTexture = createGlowTexture();
  const starGlowTexture = createStarGlowTexture();

  // --- Ring structure -------------------------------------------------------

  const innerMaterial = new MeshStandardMaterial({
    color: 0xb4c8d6,
    map: inner.albedo,
    emissive: 0xffffff,
    emissiveMap: inner.emissive,
    emissiveIntensity: 1.25,
    metalness: 0.08,
    roughness: 0.94,
    side: BackSide,
  });

  const hullMaterial = new MeshStandardMaterial({
    color: 0x9fb6c6,
    map: hull.albedo,
    emissive: 0xffffff,
    emissiveMap: hull.emissive,
    emissiveIntensity: 1.9,
    metalness: 0.88,
    roughness: 0.46,
    roughnessMap: hull.roughness,
  });

  const sideMaterial = new MeshStandardMaterial({
    color: 0x8ba3b5,
    map: side.albedo,
    emissive: 0xffffff,
    emissiveMap: side.emissive,
    emissiveIntensity: 1.5,
    metalness: 0.94,
    roughness: 0.38,
    side: DoubleSide,
  });

  const innerGeometry = new CylinderGeometry(
    RING_RADIUS,
    RING_RADIUS,
    RING_WIDTH,
    radialSegments,
    compact ? 8 : 16,
    true,
  );
  innerGeometry.rotateX(Math.PI / 2);
  const innerSurface = new Mesh(innerGeometry, innerMaterial);

  const outerGeometry = new CylinderGeometry(
    OUTER_RADIUS,
    OUTER_RADIUS,
    RING_WIDTH,
    radialSegments,
    1,
    true,
  );
  outerGeometry.rotateX(Math.PI / 2);
  const outerHull = new Mesh(outerGeometry, hullMaterial);

  const sideGeometry = new RingGeometry(RING_RADIUS, OUTER_RADIUS, radialSegments, 1);
  const frontRim = new Mesh(sideGeometry, sideMaterial);
  const backRim = new Mesh(sideGeometry, sideMaterial);
  frontRim.position.z = RING_WIDTH / 2;
  backRim.position.z = -RING_WIDTH / 2;
  world.add(innerSurface, outerHull, frontRim, backRim);

  // Structural collar bands wrapping the hull.
  const collarMaterial = compact
    ? new MeshBasicMaterial({ color: 0x1c3346 })
    : new MeshStandardMaterial({
        color: 0x223d52,
        metalness: 0.95,
        roughness: 0.3,
        emissive: 0x061927,
      });
  [-3.9, -1.2, 1.2, 3.9].forEach((z) => {
    const collar = new Mesh(
      new TorusGeometry(OUTER_RADIUS + 0.1, 0.17, 8, compact ? 160 : 320),
      collarMaterial,
    );
    collar.position.z = z;
    world.add(collar);
  });

  // Faint luminous trim at both side edges.
  const trimMaterial = new MeshBasicMaterial({
    color: 0x59d9ff,
    transparent: true,
    opacity: 0.26,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  [RING_WIDTH / 2 + 0.02, -RING_WIDTH / 2 - 0.02].forEach((z) => {
    const trim = new Mesh(
      new TorusGeometry(OUTER_RADIUS + 0.02, 0.03, 5, compact ? 160 : 320),
      trimMaterial,
    );
    trim.position.z = z;
    world.add(trim);
  });

  // Mechanical ribs around the outer hull.
  const ribCount = compact ? 56 : 128;
  const ribGeometry = new BoxGeometry(
    ((Math.PI * 2 * (OUTER_RADIUS + 0.24)) / ribCount) * 0.72,
    0.42,
    RING_WIDTH * 0.94,
  );
  const ribMaterial = compact
    ? new MeshBasicMaterial({ color: 0x234861 })
    : new MeshStandardMaterial({
        color: 0x2a4a63,
        emissive: 0x061927,
        metalness: 0.95,
        roughness: 0.34,
      });
  const ribs = new InstancedMesh(ribGeometry, ribMaterial, ribCount);
  const instanceMatrix = new Matrix4();
  const instancePosition = new Vector3();
  const instanceQuaternion = new Quaternion();
  const instanceScale = new Vector3();
  const zAxis = new Vector3(0, 0, 1);
  const ribRandom = createRandom(44012);

  for (let index = 0; index < ribCount; index += 1) {
    const angle = (index / ribCount) * Math.PI * 2;
    const radius = OUTER_RADIUS + 0.18;
    instancePosition.set(Math.cos(angle) * radius, Math.sin(angle) * radius, (ribRandom() - 0.5) * 0.5);
    instanceQuaternion.setFromAxisAngle(zAxis, angle + Math.PI / 2);
    instanceScale.set(0.72 + ribRandom() * 0.26, 0.7 + ribRandom() * 0.45, 0.85 + ribRandom() * 0.3);
    instanceMatrix.compose(instancePosition, instanceQuaternion, instanceScale);
    ribs.setMatrixAt(index, instanceMatrix);
    ribs.setColorAt(
      index,
      index % 13 === 0 ? new Color(0x2a617e) : new Color(0x142c40),
    );
  }
  ribs.instanceMatrix.needsUpdate = true;
  if (ribs.instanceColor) ribs.instanceColor.needsUpdate = true;
  world.add(ribs);

  // Hull greebles: small machinery blocks on selected sections.
  const greebleCount = compact ? 40 : 150;
  const greebleGeometry = new BoxGeometry(0.55, 0.34, 0.85);
  const greebleMaterial = compact
    ? new MeshBasicMaterial({ color: 0x1d3a50 })
    : new MeshStandardMaterial({
        color: 0x27455c,
        metalness: 0.9,
        roughness: 0.42,
      });
  const greebles = new InstancedMesh(greebleGeometry, greebleMaterial, greebleCount);
  const greebleRandom = createRandom(90210);
  for (let index = 0; index < greebleCount; index += 1) {
    const angle = greebleRandom() * Math.PI * 2;
    const radius = OUTER_RADIUS + 0.16;
    instancePosition.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      (greebleRandom() - 0.5) * (RING_WIDTH - 1.4),
    );
    instanceQuaternion.setFromAxisAngle(zAxis, angle + Math.PI / 2);
    instanceScale.set(
      0.5 + greebleRandom() * 1.6,
      0.5 + greebleRandom() * 1.2,
      0.5 + greebleRandom() * 1.8,
    );
    instanceMatrix.compose(instancePosition, instanceQuaternion, instanceScale);
    greebles.setMatrixAt(index, instanceMatrix);
    greebles.setColorAt(
      index,
      new Color().setHSL(0.56, 0.24 + greebleRandom() * 0.12, 0.1 + greebleRandom() * 0.1),
    );
  }
  greebles.instanceMatrix.needsUpdate = true;
  if (greebles.instanceColor) greebles.instanceColor.needsUpdate = true;
  world.add(greebles);

  // Fresnel aura hugging the inner surface.
  const atmosphereGeometry = new CylinderGeometry(
    RING_RADIUS - 0.32,
    RING_RADIUS - 0.32,
    RING_WIDTH + 1.2,
    compact ? 128 : 256,
    1,
    true,
  );
  atmosphereGeometry.rotateX(Math.PI / 2);
  const atmosphereMaterial = createAtmosphereMaterial();
  const atmosphere = new Mesh(atmosphereGeometry, atmosphereMaterial);
  world.add(atmosphere);

  // Cloud layer drifting above the inner terrain.
  const cloudGeometry = new CylinderGeometry(
    RING_RADIUS - 0.6,
    RING_RADIUS - 0.6,
    RING_WIDTH * 0.94,
    compact ? 128 : 256,
    1,
    true,
  );
  cloudGeometry.rotateX(Math.PI / 2);
  const cloudMaterial = new MeshBasicMaterial({
    map: cloudTexture,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: BackSide,
  });
  const clouds = new Mesh(cloudGeometry, cloudMaterial);
  world.add(clouds);

  // Central star: layered glow sprites + a point light for the interior.
  const starCore = new Sprite(
    new SpriteMaterial({
      map: starGlowTexture,
      color: 0xfff4dc,
      transparent: true,
      opacity: 0.95,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  starCore.scale.set(5, 5, 1);
  const starHalo = new Sprite(
    new SpriteMaterial({
      map: starGlowTexture,
      color: 0xcfe4ff,
      transparent: true,
      opacity: 0.2,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  starHalo.scale.set(15, 15, 1);
  world.add(starCore, starHalo);

  // Navigation lights: steady ring + a blinking set.
  const navLightCount = compact ? 24 : 48;
  const navPositions = new Float32Array(navLightCount * 3);
  for (let index = 0; index < navLightCount; index += 1) {
    const angle = (index / navLightCount) * Math.PI * 2;
    const radius = OUTER_RADIUS + 0.14;
    navPositions[index * 3] = Math.cos(angle) * radius;
    navPositions[index * 3 + 1] = Math.sin(angle) * radius;
    navPositions[index * 3 + 2] = index % 2 === 0 ? RING_WIDTH / 2 - 0.4 : -RING_WIDTH / 2 + 0.4;
  }
  const navGeometry = new BufferGeometry();
  navGeometry.setAttribute("position", new BufferAttribute(navPositions, 3));
  const navMaterial = new PointsMaterial({
    color: 0x9fe4ff,
    map: glowTexture,
    size: compact ? 0.22 : 0.16,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const navLights = new Points(navGeometry, navMaterial);
  world.add(navLights);

  const blinkCount = compact ? 6 : 12;
  const blinkPositions = new Float32Array(blinkCount * 3);
  for (let index = 0; index < blinkCount; index += 1) {
    const angle = (index / blinkCount) * Math.PI * 2 + 0.13;
    const radius = OUTER_RADIUS + 0.34;
    blinkPositions[index * 3] = Math.cos(angle) * radius;
    blinkPositions[index * 3 + 1] = Math.sin(angle) * radius;
    blinkPositions[index * 3 + 2] = index % 2 === 0 ? RING_WIDTH / 2 + 0.1 : -RING_WIDTH / 2 - 0.1;
  }
  const blinkGeometry = new BufferGeometry();
  blinkGeometry.setAttribute("position", new BufferAttribute(blinkPositions, 3));
  const blinkMaterial = new PointsMaterial({
    color: 0xd8f6ff,
    map: glowTexture,
    size: compact ? 0.34 : 0.26,
    transparent: true,
    opacity: 0.9,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const blinkLights = new Points(blinkGeometry, blinkMaterial);
  world.add(blinkLights);

  // Moving energy signals travelling along the hull conduits.
  const signalLanes = [-3.9, 1.2, 4.6];
  const signalTrails = compact ? 8 : 14;
  const signals = signalLanes.map((z, laneIndex) => {
    const group = new Group();
    const head = new Sprite(
      new SpriteMaterial({
        map: glowTexture,
        color: laneIndex === 1 ? 0xbdf3ff : 0x52d7ff,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    head.scale.set(1.7, 1.7, 1);
    const trailPositions = new Float32Array(signalTrails * 3);
    const trailGeometry = new BufferGeometry();
    trailGeometry.setAttribute("position", new BufferAttribute(trailPositions, 3));
    const trailPoints = new Points(
      trailGeometry,
      new PointsMaterial({
        color: 0x4ed9ff,
        map: glowTexture,
        size: compact ? 0.12 : 0.09,
        transparent: true,
        opacity: 0.55,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    group.add(head, trailPoints);
    world.add(group);
    return {
      head,
      trailGeometry,
      trailPositions,
      radius: OUTER_RADIUS + 0.22,
      z,
      speed: (laneIndex % 2 === 0 ? 1 : -1) * (0.05 + laneIndex * 0.016),
      phase: laneIndex * 2.2,
    };
  });

  // --- Starfield: two parallax layers ----------------------------------------

  const buildStarLayer = (
    count: number,
    minRadius: number,
    maxRadius: number,
    size: number,
    opacity: number,
    seed: number,
  ) => {
    const positions = new Float32Array(count * 3);
    const random = createRandom(seed);
    for (let index = 0; index < count; index += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const radius = minRadius + random() * (maxRadius - minRadius);
      positions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[index * 3 + 1] = Math.sin(phi) * Math.sin(theta) * radius;
      positions[index * 3 + 2] = Math.cos(phi) * radius;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: 0x9abbd4,
      map: glowTexture,
      size,
      transparent: true,
      opacity,
      depthWrite: false,
      fog: false,
    });
    const points = new Points(geometry, material);
    scene.add(points);
    return points;
  };

  const starsFar = buildStarLayer(
    compact ? 750 : 2200, 150, 290, compact ? 0.3 : 0.22, 0.5, 20260801,
  );
  const starsNear = buildStarLayer(
    compact ? 130 : 340, 95, 150, compact ? 0.42 : 0.34, 0.75, 5551212,
  );

  // --- Flight path -----------------------------------------------------------

  const cameraPath = new CatmullRomCurve3(
    [
      new Vector3(0, 88, 108), // orbital reveal: full ring against deep space
      new Vector3(-5, 58, 90),
      new Vector3(-13, 24, 66), // rim approach: graze the outer hull
      new Vector3(-21, -6, 47),
      new Vector3(-14, -28, 30),
      new Vector3(-2, -38, 16), // ring insertion: thread the open center
      new Vector3(10, -38, 7),
      new Vector3(24, -30, 4), // interior vector: surface curves overhead
      new Vector3(33, -18, 2),
      new Vector3(37, -8, 2),
    ],
    false,
    "catmullrom",
    0.36,
  );

  // Foreground guide wisp + trail along the flight path.
  const wisp = new Group();
  const wispCount = compact ? 80 : 170;
  const wispPositions = new Float32Array(wispCount * 3);
  const wispRandom = createRandom(117);
  for (let index = 0; index < wispCount; index += 1) {
    const angle = wispRandom() * Math.PI * 2;
    const radius = Math.pow(wispRandom(), 1.8) * 1.25;
    wispPositions[index * 3] = Math.cos(angle) * radius;
    wispPositions[index * 3 + 1] = (wispRandom() - 0.5) * 1.8;
    wispPositions[index * 3 + 2] = Math.sin(angle) * radius * 0.65;
  }
  const wispGeometry = new BufferGeometry();
  wispGeometry.setAttribute("position", new BufferAttribute(wispPositions, 3));
  const wispPoints = new Points(
    wispGeometry,
    new PointsMaterial({
      color: 0xbcefff,
      map: glowTexture,
      size: compact ? 0.11 : 0.08,
      transparent: true,
      opacity: 0.75,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  const wispGlow = new Sprite(
    new SpriteMaterial({
      map: glowTexture,
      color: 0x52d7ff,
      transparent: true,
      opacity: 0.4,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  wispGlow.scale.set(3.2, 3.2, 1);
  wisp.add(wispPoints, wispGlow);
  scene.add(wisp);

  const trailCount = compact ? 26 : 44;
  const trailPositions = new Float32Array(trailCount * 3);
  const trailGeometry = new BufferGeometry();
  trailGeometry.setAttribute("position", new BufferAttribute(trailPositions, 3));
  const trail = new Points(
    trailGeometry,
    new PointsMaterial({
      color: 0x4ed9ff,
      map: glowTexture,
      size: compact ? 0.11 : 0.075,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  scene.add(trail);

  // Ambient dust hugging the flight path for foreground parallax.
  const dustCount = compact ? 90 : 240;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustRandom = createRandom(60422);
  const dustSample = new Vector3();
  for (let index = 0; index < dustCount; index += 1) {
    cameraPath.getPointAt(dustRandom(), dustSample);
    dustPositions[index * 3] = dustSample.x + (dustRandom() - 0.5) * 7;
    dustPositions[index * 3 + 1] = dustSample.y + (dustRandom() - 0.5) * 7;
    dustPositions[index * 3 + 2] = dustSample.z + (dustRandom() - 0.5) * 7;
  }
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute("position", new BufferAttribute(dustPositions, 3));
  const dust = new Points(
    dustGeometry,
    new PointsMaterial({
      color: 0x8fc7e8,
      map: glowTexture,
      size: compact ? 0.09 : 0.06,
      transparent: true,
      opacity: 0.5,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  scene.add(dust);

  // --- Post-processing -------------------------------------------------------

  const renderTarget = new WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    samples: compact ? 0 : 4,
    type: HalfFloatType,
  });
  const composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new Vector2(
      compact ? window.innerWidth / 2 : window.innerWidth,
      compact ? window.innerHeight / 2 : window.innerHeight,
    ),
    compact ? 0.5 : 0.42,
    0.55,
    0.82,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // --- State ------------------------------------------------------------------

  let targetProgress = 0;
  let smoothProgress = 0;
  if (typeof initialProgress === "number" && !reducedMotion) {
    targetProgress = clamp(initialProgress, 0, 1);
    smoothProgress = targetProgress;
  }
  let pointerX = 0;
  let pointerY = 0;
  let smoothPointerX = 0;
  let smoothPointerY = 0;
  let active = true;
  let destroyed = false;
  let prepared = false;
  let hasRendered = false;
  let frame = 0;
  let ambientTimer = 0;
  let lastRenderTime = 0;
  let renderUntil = performance.now() + (compact ? 450 : 1400);
  const renderInterval = 1000 / (compact ? 24 : 40);

  const pathPosition = new Vector3();
  const pathTangent = new Vector3();
  const lookTarget = new Vector3();
  const revealTarget = new Vector3();
  const tangentTarget = new Vector3();
  const surfaceTarget = new Vector3();
  const interiorUp = new Vector3();
  const desiredUp = new Vector3();
  const globalUp = new Vector3(0, 1, 0);
  const wispPosition = new Vector3();
  const pathWispPosition = new Vector3();
  const revealWispPosition = new Vector3(0, 16, 12);

  const getPhase = (progress: number): TraversalPhase => {
    if (progress < 0.2) return "ORBITAL REVEAL";
    if (progress < 0.45) return "RIM APPROACH";
    if (progress < 0.72) return "RING INSERTION";
    return "INTERIOR VECTOR";
  };

  const wake = (duration = 500) => {
    if (destroyed || reducedMotion || !prepared) return;
    renderUntil = Math.max(renderUntil, performance.now() + duration);
    if (active && frame === 0) frame = requestAnimationFrame(render);
  };

  const updateTrail = (progress: number) => {
    const wispProgress = clamp(progress + 0.075, 0.105, 0.93);
    const insertionBlend = smoothstep(0.16, 0.38, progress);
    for (let index = 0; index < trailCount; index += 1) {
      const offset = (index / Math.max(trailCount - 1, 1)) * 0.065;
      const sampleProgress = clamp(wispProgress - offset, 0, 1);
      const point = cameraPath.getPointAt(sampleProgress);
      point.lerp(revealWispPosition, (1 - insertionBlend) * (index / trailCount));
      trailPositions[index * 3] = point.x;
      trailPositions[index * 3 + 1] = point.y;
      trailPositions[index * 3 + 2] = point.z;
    }
    const attribute = trailGeometry.getAttribute("position") as BufferAttribute;
    attribute.needsUpdate = true;
    cameraPath.getPointAt(wispProgress, pathWispPosition);
    wispPosition.lerpVectors(revealWispPosition, pathWispPosition, insertionBlend);
    wisp.position.copy(wispPosition);
  };

  const updateSignals = (seconds: number) => {
    for (const signal of signals) {
      const angle = seconds * signal.speed + signal.phase;
      signal.head.position.set(
        Math.cos(angle) * signal.radius,
        Math.sin(angle) * signal.radius,
        signal.z,
      );
      for (let index = 0; index < signalTrails; index += 1) {
        const trailAngle = angle - Math.sign(signal.speed) * index * 0.004;
        signal.trailPositions[index * 3] = Math.cos(trailAngle) * signal.radius;
        signal.trailPositions[index * 3 + 1] = Math.sin(trailAngle) * signal.radius;
        signal.trailPositions[index * 3 + 2] = signal.z;
      }
      const attribute = signal.trailGeometry.getAttribute("position") as BufferAttribute;
      attribute.needsUpdate = true;
    }
  };

  function render(time = 0) {
    if (destroyed) return;
    if (!active && !reducedMotion) {
      frame = 0;
      return;
    }
    if (!reducedMotion && time - lastRenderTime < renderInterval) {
      frame = requestAnimationFrame(render);
      return;
    }
    lastRenderTime = time;

    smoothProgress += (targetProgress - smoothProgress) * (reducedMotion ? 1 : 0.095);
    smoothPointerX += (pointerX - smoothPointerX) * 0.055;
    smoothPointerY += (pointerY - smoothPointerY) * 0.055;

    cameraPath.getPointAt(smoothProgress, pathPosition);
    cameraPath.getTangentAt(smoothProgress, pathTangent);
    camera.position.copy(pathPosition);
    camera.position.x += smoothPointerX * (1 - smoothProgress * 0.45) * 0.72;
    camera.position.y -= smoothPointerY * (1 - smoothProgress * 0.35) * 0.5;

    // Look-at choreography: origin → flight tangent → deck ahead curving up.
    const approach = smoothstep(0.2, 0.5, smoothProgress);
    const interiorBlend = smoothstep(0.58, 0.85, smoothProgress);
    revealTarget.set(0, -smoothstep(0.06, 0.4, smoothProgress) * 26, 0);
    tangentTarget.copy(pathPosition).addScaledVector(pathTangent, 20);
    const azimuth = Math.atan2(pathPosition.y, pathPosition.x);
    surfaceTarget.set(
      Math.cos(azimuth + 0.55) * (RING_RADIUS - 1),
      Math.sin(azimuth + 0.55) * (RING_RADIUS - 1),
      2.2,
    );
    lookTarget.copy(revealTarget).lerp(tangentTarget, approach).lerp(surfaceTarget, interiorBlend);

    interiorUp.set(-pathPosition.x, -pathPosition.y, 0);
    if (interiorUp.lengthSq() < 0.001) interiorUp.copy(globalUp);
    interiorUp.normalize();
    desiredUp.copy(globalUp).lerp(interiorUp, smoothstep(0.42, 0.78, smoothProgress)).normalize();
    camera.up.copy(desiredUp);
    camera.lookAt(lookTarget);

    const seconds = time * 0.001;
    cloudTexture.offset.x = (seconds * 0.0018) % 1;
    clouds.rotation.z = seconds * 0.004;
    atmosphereMaterial.uniforms.intensity.value =
      0.55 + Math.sin(seconds * 0.8) * 0.06 + smoothstep(0.3, 0.68, smoothProgress) * 0.45;
    coreLight.intensity = (compact ? 4500 : 8000) * smoothstep(0.42, 0.8, smoothProgress);
    starsFar.rotation.z = seconds * 0.0022;
    starsNear.rotation.z = -seconds * 0.004;
    dust.rotation.z = seconds * 0.006;
    blinkMaterial.opacity = 0.25 + 0.65 * Math.max(0, Math.sin(seconds * 2.2));

    updateTrail(smoothProgress);
    updateSignals(seconds);
    wisp.rotation.x = seconds * 0.3;
    wisp.rotation.y = seconds * 0.42;
    wisp.rotation.z = -seconds * 0.18;
    const pulse = 1 + Math.sin(seconds * 2.1) * 0.08;
    wisp.scale.setScalar(pulse * (1.28 - smoothstep(0.18, 0.5, smoothProgress) * 0.28));

    const rangeKm = 0.8 + Math.pow(1 - smoothProgress, 1.55) * 63.2;
    const altitudeKm = 0.55 + Math.pow(1 - smoothProgress, 1.2) * 17.95;
    onFrame({
      progress: smoothProgress,
      rangeKm,
      altitudeKm,
      phase: getPhase(smoothProgress),
    });

    composer.render();

    if (!hasRendered) {
      hasRendered = true;
      onReady?.();
    }

    const isSettling =
      Math.abs(targetProgress - smoothProgress) > 0.0005 ||
      Math.abs(pointerX - smoothPointerX) > 0.002 ||
      Math.abs(pointerY - smoothPointerY) > 0.002;
    if (reducedMotion) {
      frame = 0;
    } else if (isSettling || performance.now() < renderUntil) {
      frame = requestAnimationFrame(render);
    } else if (active && !compact) {
      // Ambient tick: keep clouds, signals, and star parallax alive at low rate.
      ambientTimer = window.setTimeout(() => {
        frame = requestAnimationFrame(render);
      }, 220);
    } else {
      frame = 0;
    }
  }

  const resize = (width: number, height: number) => {
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / Math.max(height, 1);
    camera.fov = width < 640 ? 71 : 52;
    camera.updateProjectionMatrix();
    wake(350);
  };

  const setProgress = (value: number) => {
    targetProgress = reducedMotion ? 0 : clamp(value, 0, 1);
    wake(700);
  };

  const setPointer = (x: number, y: number) => {
    if (compact || reducedMotion) return;
    pointerX = clamp(x, -1, 1);
    pointerY = clamp(y, -1, 1);
    wake(320);
  };

  const setActive = (value: boolean) => {
    active = value;
    if (active) wake(400);
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(frame);
    window.clearTimeout(ambientTimer);

    scene.traverse((object) => {
      const candidate = object as Mesh | Points | Sprite;
      if ("geometry" in candidate && candidate.geometry instanceof BufferGeometry) {
        candidate.geometry.dispose();
      }
      if ("material" in candidate) {
        const materials = Array.isArray(candidate.material)
          ? candidate.material
          : [candidate.material];
        materials.forEach((material) => material?.dispose());
      }
    });
    [
      hull.albedo,
      hull.emissive,
      hull.roughness,
      inner.albedo,
      inner.emissive,
      side.albedo,
      side.emissive,
      cloudTexture,
      glowTexture,
      starGlowTexture,
    ].forEach((texture) => texture.dispose());
    composer.dispose();
    renderer.dispose();
  };

  resize(window.innerWidth, window.innerHeight);
  updateTrail(0);
  cameraPath.getPointAt(0, camera.position);
  camera.up.copy(globalUp);
  camera.lookAt(0, 0, 0);

  renderer
    .compileAsync(scene, camera)
    .catch(() => undefined)
    .then(() => {
      if (destroyed) return;
      prepared = true;
      frame = requestAnimationFrame(render);
    });

  return {
    setProgress,
    setPointer,
    setActive,
    resize,
    wake,
    destroy,
  };
};
