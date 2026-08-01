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
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";

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
}

const RING_RADIUS = 44;
const RING_WIDTH = 12;
const RING_THICKNESS = 1.6;

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

const createPanelTextures = (compact: boolean, maxAnisotropy: number) => {
  const width = compact ? 512 : 1024;
  const height = compact ? 128 : 256;
  const baseCanvas = document.createElement("canvas");
  const emissiveCanvas = document.createElement("canvas");
  baseCanvas.width = emissiveCanvas.width = width;
  baseCanvas.height = emissiveCanvas.height = height;

  const base = baseCanvas.getContext("2d");
  const emissive = emissiveCanvas.getContext("2d");
  if (!base || !emissive) {
    throw new Error("Unable to create ringworld texture canvases");
  }

  const random = createRandom(7952026);
  const gradient = base.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0b1a29");
  gradient.addColorStop(0.48, "#18354e");
  gradient.addColorStop(1, "#081421");
  base.fillStyle = gradient;
  base.fillRect(0, 0, width, height);

  emissive.fillStyle = "#000";
  emissive.fillRect(0, 0, width, height);

  const columns = compact ? 32 : 52;
  const rows = 8;
  const cellWidth = width / columns;
  const cellHeight = height / rows;

  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const inset = 1 + random() * 2;
      const x = column * cellWidth + inset;
      const y = row * cellHeight + inset;
      const w = cellWidth - inset * 2;
      const h = cellHeight - inset * 2;
      const brightness = 28 + Math.floor(random() * 34);

      base.fillStyle = `rgb(${brightness - 5}, ${brightness + 8}, ${brightness + 18})`;
      base.fillRect(x, y, w, h);
      base.strokeStyle = random() > 0.55 ? "rgba(101, 184, 226, .18)" : "rgba(255, 255, 255, .07)";
      base.lineWidth = 1;
      base.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

      if ((column + row * 3) % 11 === 0 || random() > 0.92) {
        emissive.fillStyle = random() > 0.75 ? "#d9f8ff" : "#4dd8ff";
        emissive.fillRect(x + w * 0.12, y + h * 0.46, w * 0.76, Math.max(1, height / 180));
      }
    }
  }

  for (let lane = 1; lane < rows; lane += 2) {
    const y = lane * cellHeight;
    base.fillStyle = "rgba(76, 182, 224, .08)";
    base.fillRect(0, y - 1, width, 2);
    emissive.fillStyle = lane === 3 || lane === 5 ? "#54dcff" : "#173b51";
    emissive.fillRect(0, y, width, lane === 3 || lane === 5 ? 2 : 1);
  }

  const baseTexture = new CanvasTexture(baseCanvas);
  baseTexture.colorSpace = SRGBColorSpace;
  baseTexture.wrapS = baseTexture.wrapT = RepeatWrapping;
  baseTexture.repeat.set(3, 1);
  baseTexture.anisotropy = Math.min(maxAnisotropy, compact ? 2 : 8);

  const emissiveTexture = new CanvasTexture(emissiveCanvas);
  emissiveTexture.wrapS = emissiveTexture.wrapT = RepeatWrapping;
  emissiveTexture.repeat.set(3, 1);
  emissiveTexture.anisotropy = Math.min(maxAnisotropy, compact ? 2 : 8);

  return { baseTexture, emissiveTexture };
};

const createGlowTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create data-wisp glow texture");

  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(226, 250, 255, 1)");
  gradient.addColorStop(0.14, "rgba(104, 224, 255, .9)");
  gradient.addColorStop(0.42, "rgba(30, 160, 255, .35)");
  gradient.addColorStop(1, "rgba(0, 70, 160, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
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
        float fresnel = pow(1.0 - facing, 2.4);
        float alpha = (0.025 + fresnel * 0.42) * intensity;
        gl_FragColor = vec4(auraColor * (0.55 + fresnel * 1.3), alpha);
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
  const { compact, reducedMotion, onFrame, onReady } = options;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: !compact,
    alpha: false,
    powerPreference: "high-performance",
  });

  renderer.setClearColor(0x020710, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1 : 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  scene.fog = new Fog(0x020710, 90, 230);

  const camera = new PerspectiveCamera(compact ? 61 : 52, 1, 0.1, 320);
  const world = new Group();
  scene.add(world);

  const hemisphere = new HemisphereLight(0x72cfff, 0x01040a, 1.45);
  const keyLight = new DirectionalLight(0xc7efff, 4.1);
  keyLight.position.set(35, 58, 82);
  const rimLight = new DirectionalLight(0x278dff, 2.2);
  rimLight.position.set(-48, -25, 35);
  if (!compact) scene.add(hemisphere, keyLight, rimLight);

  const radialSegments = compact ? 192 : 384;
  const { baseTexture, emissiveTexture } = createPanelTextures(
    compact,
    renderer.capabilities.getMaxAnisotropy(),
  );
  const glowTexture = createGlowTexture();

  const innerMaterial = compact
    ? new MeshBasicMaterial({
        color: 0x7899ae,
        map: baseTexture,
        side: BackSide,
      })
    : new MeshStandardMaterial({
        color: 0xa8c1d3,
        map: baseTexture,
        emissive: 0x2cbfe9,
        emissiveMap: emissiveTexture,
        emissiveIntensity: 2.8,
        metalness: 0.86,
        roughness: 0.32,
        side: BackSide,
      });
  const hullMaterial = compact
    ? new MeshBasicMaterial({
        color: 0x315875,
        map: baseTexture,
      })
    : new MeshStandardMaterial({
        color: 0x27445d,
        map: baseTexture,
        emissive: 0x0a4f6b,
        emissiveMap: emissiveTexture,
        emissiveIntensity: 0.65,
        metalness: 0.94,
        roughness: 0.4,
      });
  const sideMaterial = compact
    ? new MeshBasicMaterial({
        color: 0x17354e,
        side: DoubleSide,
      })
    : new MeshStandardMaterial({
        color: 0x17354e,
        emissive: 0x082b40,
        emissiveIntensity: 0.7,
        metalness: 0.96,
        roughness: 0.3,
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
    RING_RADIUS + RING_THICKNESS,
    RING_RADIUS + RING_THICKNESS,
    RING_WIDTH,
    radialSegments,
    1,
    true,
  );
  outerGeometry.rotateX(Math.PI / 2);
  const outerHull = new Mesh(outerGeometry, hullMaterial);

  const sideGeometry = new RingGeometry(
    RING_RADIUS,
    RING_RADIUS + RING_THICKNESS,
    radialSegments,
    1,
  );
  const frontRim = new Mesh(sideGeometry, sideMaterial);
  const backRim = new Mesh(sideGeometry, sideMaterial);
  frontRim.position.z = RING_WIDTH / 2;
  backRim.position.z = -RING_WIDTH / 2;
  world.add(innerSurface, outerHull, frontRim, backRim);

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

  const railMaterial = new MeshBasicMaterial({
    color: 0x5adfff,
    transparent: true,
    opacity: 0.48,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const railMaterialSoft = railMaterial.clone();
  railMaterialSoft.opacity = 0.16;
  railMaterialSoft.color.setHex(0xb6efff);

  const rails: Mesh[] = [];
  [-4.7, -2.45, 0, 2.45, 4.7].forEach((z, index) => {
    const geometry = new TorusGeometry(
      RING_RADIUS - 0.07,
      index === 2 ? 0.055 : 0.035,
      5,
      compact ? 160 : 320,
    );
    const rail = new Mesh(geometry, index === 2 ? railMaterial : railMaterialSoft);
    rail.position.z = z;
    rails.push(rail);
    world.add(rail);
  });

  const edgeMaterial = railMaterial.clone();
  edgeMaterial.opacity = 0.34;
  [RING_WIDTH / 2 + 0.03, -RING_WIDTH / 2 - 0.03].forEach((z) => {
    const edge = new Mesh(
      new TorusGeometry(
        RING_RADIUS + RING_THICKNESS * 0.52,
        compact ? 0.11 : 0.09,
        7,
        compact ? 160 : 320,
      ),
      edgeMaterial,
    );
    edge.position.z = z;
    world.add(edge);
  });

  const ribCount = compact ? 56 : 96;
  const ribGeometry = new BoxGeometry(
    (Math.PI * 2 * (RING_RADIUS + RING_THICKNESS + 0.24)) / ribCount * 0.78,
    0.4,
    RING_WIDTH * 0.94,
  );
  const ribMaterial = compact
    ? new MeshBasicMaterial({ color: 0x234861 })
    : new MeshStandardMaterial({
        color: 0x234861,
        emissive: 0x061927,
        metalness: 0.95,
        roughness: 0.35,
      });
  const ribs = new InstancedMesh(ribGeometry, ribMaterial, ribCount);
  const ribMatrix = new Matrix4();
  const ribPosition = new Vector3();
  const ribQuaternion = new Quaternion();
  const ribScale = new Vector3();
  const zAxis = new Vector3(0, 0, 1);
  const ribRandom = createRandom(44012);

  for (let index = 0; index < ribCount; index += 1) {
    const angle = (index / ribCount) * Math.PI * 2;
    const radius = RING_RADIUS + RING_THICKNESS + 0.18;
    ribPosition.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    ribQuaternion.setFromAxisAngle(zAxis, angle + Math.PI / 2);
    ribScale.set(0.72 + ribRandom() * 0.24, 0.75 + ribRandom() * 0.35, 1);
    ribMatrix.compose(ribPosition, ribQuaternion, ribScale);
    ribs.setMatrixAt(index, ribMatrix);
    ribs.setColorAt(
      index,
      index % 13 === 0 ? new Color(0x235a77) : new Color(0x10263a),
    );
  }
  ribs.instanceMatrix.needsUpdate = true;
  if (ribs.instanceColor) ribs.instanceColor.needsUpdate = true;
  world.add(ribs);

  const starCount = compact ? 600 : 1500;
  const starPositions = new Float32Array(starCount * 3);
  const starRandom = createRandom(20260801);
  for (let index = 0; index < starCount; index += 1) {
    const theta = starRandom() * Math.PI * 2;
    const phi = Math.acos(2 * starRandom() - 1);
    const radius = 125 + starRandom() * 125;
    starPositions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    starPositions[index * 3 + 1] = Math.sin(phi) * Math.sin(theta) * radius;
    starPositions[index * 3 + 2] = Math.cos(phi) * radius;
  }
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute("position", new BufferAttribute(starPositions, 3));
  const starMaterial = new PointsMaterial({
    color: 0x9abbd4,
    size: compact ? 0.24 : 0.19,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const stars = new Points(starGeometry, starMaterial);
  scene.add(stars);

  const cameraPath = new CatmullRomCurve3(
    [
      new Vector3(0, 85, 95),
      new Vector3(-4, 58, 78),
      new Vector3(-10, 24, 58),
      new Vector3(-8, -8, 42),
      new Vector3(-3, -28, 23),
      new Vector3(4, -36, 9),
      new Vector3(18, -32, 2),
      new Vector3(31, -20, 0),
      new Vector3(37, -4, 0),
    ],
    false,
    "catmullrom",
    0.36,
  );

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
  const wispMaterial = new PointsMaterial({
    color: 0xbcefff,
    size: compact ? 0.11 : 0.08,
    transparent: true,
    opacity: 0.95,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const wispPoints = new Points(wispGeometry, wispMaterial);
  const wispGlowMaterial = new SpriteMaterial({
    map: glowTexture,
    color: 0x52d7ff,
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const wispGlow = new Sprite(wispGlowMaterial);
  wispGlow.scale.set(6.2, 6.2, 1);
  wisp.add(wispPoints, wispGlow);
  scene.add(wisp);

  const trailCount = compact ? 26 : 44;
  const trailPositions = new Float32Array(trailCount * 3);
  const trailGeometry = new BufferGeometry();
  trailGeometry.setAttribute("position", new BufferAttribute(trailPositions, 3));
  const trailMaterial = new PointsMaterial({
    color: 0x4ed9ff,
    size: compact ? 0.11 : 0.075,
    transparent: true,
    opacity: 0.6,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const trail = new Points(trailGeometry, trailMaterial);
  scene.add(trail);

  let targetProgress = 0;
  let smoothProgress = 0;
  let pointerX = 0;
  let pointerY = 0;
  let smoothPointerX = 0;
  let smoothPointerY = 0;
  let active = true;
  let destroyed = false;
  let prepared = false;
  let hasRendered = false;
  let frame = 0;
  let lastRenderTime = 0;
  let renderUntil = performance.now() + (compact ? 450 : 1200);
  const renderInterval = 1000 / (compact ? 24 : 40);

  const pathPosition = new Vector3();
  const pathTangent = new Vector3();
  const lookTarget = new Vector3();
  const revealTarget = new Vector3();
  const tangentTarget = new Vector3();
  const interiorUp = new Vector3();
  const desiredUp = new Vector3();
  const globalUp = new Vector3(0, 1, 0);
  const wispPosition = new Vector3();
  const pathWispPosition = new Vector3();
  const revealWispPosition = new Vector3(0, 14, 10);

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
    const wispProgress = clamp(progress + 0.075, 0.105, 1);
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

    const approach = smoothstep(0.24, 0.54, smoothProgress);
    revealTarget.set(0, -smoothstep(0.08, 0.44, smoothProgress) * 31, 0);
    tangentTarget.copy(pathPosition).addScaledVector(pathTangent, 20);
    lookTarget.copy(revealTarget).lerp(tangentTarget, approach);

    interiorUp.set(-pathPosition.x, -pathPosition.y, 0);
    if (interiorUp.lengthSq() < 0.001) interiorUp.copy(globalUp);
    interiorUp.normalize();
    desiredUp.copy(globalUp).lerp(interiorUp, smoothstep(0.43, 0.76, smoothProgress)).normalize();
    camera.up.copy(desiredUp);
    camera.lookAt(lookTarget);

    const seconds = time * 0.001;
    emissiveTexture.offset.x = (seconds * 0.006 + smoothProgress * 0.16) % 1;
    baseTexture.offset.x = smoothProgress * 0.025;
    atmosphereMaterial.uniforms.intensity.value =
      0.82 + Math.sin(seconds * 0.8) * 0.08 + smoothstep(0.3, 0.68, smoothProgress) * 0.22;

    updateTrail(smoothProgress);
    wisp.rotation.x = seconds * 0.3;
    wisp.rotation.y = seconds * 0.42;
    wisp.rotation.z = -seconds * 0.18;
    const pulse = 1 + Math.sin(seconds * 2.1) * 0.08;
    wisp.scale.setScalar(pulse * (1.28 - smoothstep(0.18, 0.5, smoothProgress) * 0.28));
    trail.rotation.z = Math.sin(seconds * 0.22) * 0.003;

    const rangeKm = 0.8 + Math.pow(1 - smoothProgress, 1.55) * 63.2;
    const altitudeKm = 0.55 + Math.pow(1 - smoothProgress, 1.2) * 17.95;
    onFrame({
      progress: smoothProgress,
      rangeKm,
      altitudeKm,
      phase: getPhase(smoothProgress),
    });

    renderer.render(scene, camera);
    if (!hasRendered) {
      hasRendered = true;
      onReady?.();
    }

    const isSettling =
      Math.abs(targetProgress - smoothProgress) > 0.0005 ||
      Math.abs(pointerX - smoothPointerX) > 0.002 ||
      Math.abs(pointerY - smoothPointerY) > 0.002;
    if (!reducedMotion && (isSettling || performance.now() < renderUntil)) {
      frame = requestAnimationFrame(render);
    } else {
      frame = 0;
    }
  }

  const resize = (width: number, height: number) => {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.fov = width < 640 ? 64 : 52;
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
    baseTexture.dispose();
    emissiveTexture.dispose();
    glowTexture.dispose();
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
