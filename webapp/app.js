const canvas = document.getElementById("scene");
const axisCanvas = document.getElementById("axisIndicator");
const viewCubeCanvas = document.getElementById("viewCube");
const cameraModeSelect = document.getElementById("cameraMode");
const viewReadout = document.getElementById("viewReadout");
const emergencyStopButton = document.getElementById("emergencyStop");
const driverStatusButton = document.getElementById("driverStatusButton");
const driverSettingsButton = document.getElementById("driverSettingsButton");
const homeZButton = document.getElementById("homeZButton");
const popupLayer = document.getElementById("popupLayer");
const apiStatus = document.getElementById("apiStatus");
const apiStatusState = document.getElementById("apiStatusState");
const apiStatusTime = document.getElementById("apiStatusTime");
const viewport = document.querySelector(".viewport");

if (!canvas || !viewport) {
  throw new Error("Missing #scene canvas or .viewport container.");
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (err) {
  console.error("WebGL init failed", err);
}

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
}

const scene = new THREE.Scene();

let axisRenderer = null;
let axisScene = null;
let axisCamera = null;
let viewCubeRenderer = null;
let viewCubeScene = null;
let viewCubeCamera = null;
let viewCube = null;
let viewCubeMesh = null;
let viewCubeLabels = [];
const viewCubeRaycaster = new THREE.Raycaster();
const viewCubePointer = new THREE.Vector2();
const axisViewDirection = new THREE.Vector3();
const dragRaycaster = new THREE.Raycaster();
const dragPointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const dragState = {
  active: false,
  type: null,
};

const perspectiveCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 12000);
const orthoSize = 800;
const orthographicCamera = new THREE.OrthographicCamera(
  -orthoSize,
  orthoSize,
  orthoSize,
  -orthoSize,
  0.1,
  12000
);
let camera = perspectiveCamera;

const dragPrecision = 3;
const orbit = {
  radius: 839.7430400525388,
  theta: THREE.MathUtils.degToRad(134.4),
  phi: THREE.MathUtils.degToRad(14.9),
  target: new THREE.Vector3(85.88210895080977, 160.27452657907472, 0),
  isDragging: false,
  isPanning: false,
  startX: 0,
  startY: 0,
  startTheta: 0,
  startPhi: 0,
  panStartX: 0,
  panStartY: 0,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInputValue(value, inputEl, snapStep = true) {
  const min = parseFloat(inputEl.min);
  const max = parseFloat(inputEl.max);
  const step = parseFloat(inputEl.step) || 0;
  let next = clamp(value, min, max);
  if (snapStep && step > 0) {
    next = Math.round(next / step) * step;
  }
  return clamp(next, min, max);
}

function updateCamera() {
  const cosPhi = Math.cos(orbit.phi);
  camera.position.set(
    orbit.target.x + orbit.radius * cosPhi * Math.cos(orbit.theta),
    orbit.target.y + orbit.radius * Math.sin(orbit.phi),
    orbit.target.z + orbit.radius * cosPhi * Math.sin(orbit.theta)
  );
  camera.lookAt(orbit.target);
}

function updateCameraProjection(width, height) {
  const aspect = width / height;
  perspectiveCamera.aspect = aspect;
  perspectiveCamera.updateProjectionMatrix();

  orthographicCamera.left = -orthoSize * aspect;
  orthographicCamera.right = orthoSize * aspect;
  orthographicCamera.top = orthoSize;
  orthographicCamera.bottom = -orthoSize;
  orthographicCamera.updateProjectionMatrix();
}

function setCameraMode(mode) {
  camera = mode === "orthographic" ? orthographicCamera : perspectiveCamera;
  if (camera === orthographicCamera) {
    orthographicCamera.zoom = 2.0;
    orthographicCamera.updateProjectionMatrix();
  }
  updateCamera();
}

function snapDirection(direction) {
  const absX = Math.abs(direction.x);
  const absY = Math.abs(direction.y);
  const absZ = Math.abs(direction.z);
  if (absX >= absY && absX >= absZ) {
    return new THREE.Vector3(Math.sign(direction.x) || 1, 0, 0);
  }
  if (absY >= absX && absY >= absZ) {
    return new THREE.Vector3(0, Math.sign(direction.y) || 1, 0);
  }
  return new THREE.Vector3(0, 0, Math.sign(direction.z) || 1);
}

function setOrbitToDirection(direction) {
  const dir = direction.clone().normalize();
  orbit.theta = Math.atan2(dir.z, dir.x);
  const phi = Math.asin(clamp(dir.y, -1, 1));
  orbit.phi = clamp(phi, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  updateCamera();
}

const pressedKeys = new Set();
let lastFrameTime = performance.now();
let lastReadoutWidth = 0;
let lastReadoutHeight = 0;

function updateKeyMovement(delta) {
  if (!pressedKeys.size) {
    return;
  }
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() === 0) {
    return;
  }
  forward.normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
  const move = new THREE.Vector3();
  if (pressedKeys.has("w")) {
    move.add(forward);
  }
  if (pressedKeys.has("s")) {
    move.sub(forward);
  }
  if (pressedKeys.has("d")) {
    move.add(right);
  }
  if (pressedKeys.has("a")) {
    move.sub(right);
  }
  if (move.lengthSq() === 0) {
    return;
  }
  const speed = camera === orthographicCamera ? 200 / orthographicCamera.zoom : 250;
  move.normalize().multiplyScalar(speed * delta);
  orbit.target.add(move);
  updateCamera();
}

function syncEmergencyStopSizing() {
  if (!viewReadout || !emergencyStopButton) {
    return;
  }
  const rect = viewReadout.getBoundingClientRect();
  const nextWidth = Math.round(rect.width);
  const nextHeight = Math.round(rect.height);
  if (!nextWidth || !nextHeight) {
    return;
  }
  if (nextWidth !== lastReadoutWidth || nextHeight !== lastReadoutHeight) {
    emergencyStopButton.style.width = `${nextWidth}px`;
    emergencyStopButton.style.height = `${nextHeight * 2}px`;
    lastReadoutWidth = nextWidth;
    lastReadoutHeight = nextHeight;
  }
}

function updateViewReadout() {
  if (!viewReadout) {
    return;
  }
  const pos = camera.position;
  const thetaDeg = THREE.MathUtils.radToDeg(orbit.theta);
  const phiDeg = THREE.MathUtils.radToDeg(orbit.phi);
  viewReadout.textContent = `View x:${pos.x.toFixed(1)} z:${pos.y.toFixed(1)} y:${pos.z.toFixed(1)} | θ:${thetaDeg.toFixed(1)}° φ:${phiDeg.toFixed(1)}°`;
  syncEmergencyStopSizing();
}

function panCamera(dx, dy) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const up = new THREE.Vector3().copy(camera.up).normalize();
  const scale = camera === orthographicCamera ? 6 / orthographicCamera.zoom : orbit.radius * 0.002;
  const offset = new THREE.Vector3()
    .addScaledVector(right, -dx * scale)
    .addScaledVector(up, dy * scale);
  orbit.target.add(offset);
  updateCamera();
}

updateCamera();
const ambient = new THREE.AmbientLight(0xffffff, 0.01);
scene.add(ambient);

const hemisphere = new THREE.HemisphereLight(0xffffff, 0x1a1d24, 0.2);
scene.add(hemisphere);

const sunLight = new THREE.DirectionalLight(0xfff1d6, 1);
sunLight.position.set(900, 900, 700);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.bias = -0.00035;
sunLight.shadow.normalBias = 0.02;
sunLight.shadow.camera.near = 200;
sunLight.shadow.camera.far = 2800;
sunLight.shadow.camera.left = -900;
sunLight.shadow.camera.right = 900;
sunLight.shadow.camera.top = 900;
sunLight.shadow.camera.bottom = -900;
scene.add(sunLight);

const sunTarget = new THREE.Object3D();
sunTarget.position.set(0, 0, 0);
scene.add(sunTarget);
sunLight.target = sunTarget;

const fillLight = new THREE.PointLight(0xffb86c, 0.18, 900);
fillLight.position.set(-220, 260, 300);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x86c9ff, 0.22);
rimLight.position.set(-420, 320, -340);
scene.add(rimLight);
sunTarget.updateMatrixWorld();

function createEnvironmentTexture() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;

  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, "#ffffff");
  skyGradient.addColorStop(0.2, "#f5f7ff");
  skyGradient.addColorStop(0.28, "#1d2d55");
  skyGradient.addColorStop(0.38, "#2b47aa");
  skyGradient.addColorStop(0.5, "#3163e8");
  skyGradient.addColorStop(0.6, "#2e92f4");
  skyGradient.addColorStop(0.7, "#2bc1ff");
  skyGradient.addColorStop(0.78, "#33e0f4");
  skyGradient.addColorStop(0.86, "#3bffea");
  skyGradient.addColorStop(0.93, "#9df0b4");
  skyGradient.addColorStop(1, "#ffe17e");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  const sun = ctx.createRadialGradient(
    width * 0.74,
    height * 0.22,
    0,
    width * 0.74,
    height * 0.22,
    height * 0.85
  );
  sun.addColorStop(0, "rgba(255, 215, 170, 0.4)");
  sun.addColorStop(0.4, "rgba(255, 215, 170, 0.22)");
  sun.addColorStop(0.75, "rgba(255, 215, 170, 0.08)");
  sun.addColorStop(1, "rgba(255, 215, 170, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSkyTexture() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;

  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, "#ffffff");
  skyGradient.addColorStop(0.2, "#f5f7ff");
  skyGradient.addColorStop(0.28, "#1b246f");
  skyGradient.addColorStop(0.32, "#2634b8");
  skyGradient.addColorStop(0.45, "#3b4aff");
  skyGradient.addColorStop(0.55, "#3183ff");
  skyGradient.addColorStop(0.64, "#26bcff");
  skyGradient.addColorStop(0.72, "#31deff");
  skyGradient.addColorStop(0.8, "#3bffff");
  skyGradient.addColorStop(0.86, "#9dfcbd");
  skyGradient.addColorStop(0.92, "#fff87b");
  skyGradient.addColorStop(0.97, "#ffc789");
  skyGradient.addColorStop(1, "#ff9696");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = "screen";

  const aurora = ctx.createLinearGradient(
    width * 0.1,
    height * 0.2,
    width * 0.9,
    height * 0.7
  );
  aurora.addColorStop(0, "rgba(160, 245, 255, 0)");
  aurora.addColorStop(0.3, "rgba(160, 245, 255, 0.32)");
  aurora.addColorStop(0.55, "rgba(220, 140, 255, 0.28)");
  aurora.addColorStop(0.8, "rgba(220, 140, 255, 0.18)");
  aurora.addColorStop(1, "rgba(220, 140, 255, 0)");
  ctx.fillStyle = aurora;
  ctx.fillRect(0, 0, width, height);

  const horizonGlow = ctx.createLinearGradient(0, height * 0.6, 0, height * 0.95);
  horizonGlow.addColorStop(0, "rgba(255, 210, 140, 0)");
  horizonGlow.addColorStop(0.4, "rgba(255, 210, 140, 0.24)");
  horizonGlow.addColorStop(0.7, "rgba(255, 210, 140, 0.48)");
  horizonGlow.addColorStop(1, "rgba(255, 210, 140, 0)");
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, 0, width, height);

  const sun = ctx.createRadialGradient(
    width * 0.22,
    height * 0.72,
    0,
    width * 0.22,
    height * 0.72,
    height * 0.36
  );
  sun.addColorStop(0, "rgba(255, 242, 198, 1)");
  sun.addColorStop(0.35, "rgba(255, 210, 140, 0.65)");
  sun.addColorStop(0.7, "rgba(255, 170, 110, 0.32)");
  sun.addColorStop(1, "rgba(255, 170, 110, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, width, height);

  const bloom = ctx.createRadialGradient(
    width * 0.78,
    height * 0.35,
    0,
    width * 0.78,
    height * 0.35,
    height * 0.5
  );
  bloom.addColorStop(0, "rgba(150, 210, 255, 0.4)");
  bloom.addColorStop(0.5, "rgba(150, 210, 255, 0.18)");
  bloom.addColorStop(1, "rgba(150, 210, 255, 0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, width, height);

  let seed = 142857;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < 18; i += 1) {
    const cx = rand() * width;
    const cy = height * (0.18 + rand() * 0.5);
    const rx = 180 + rand() * 520;
    const ry = 30 + rand() * 90;
    const alpha = 0.025 + rand() * 0.06;
    const tint = rand();
    let tintColor = "255, 255, 255";
    if (tint > 0.72) {
      tintColor = "120, 210, 255";
    } else if (tint < 0.28) {
      tintColor = "255, 170, 210";
    }
    ctx.fillStyle = `rgba(${tintColor}, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rand() * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  const haze = ctx.createLinearGradient(0, height * 0.62, 0, height);
  haze.addColorStop(0, "rgba(255, 224, 188, 0)");
  haze.addColorStop(0.55, "rgba(255, 224, 188, 0.12)");
  haze.addColorStop(1, "rgba(255, 224, 188, 0.26)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWoodTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const base = { r: 154, g: 104, b: 65 };
  const plankCount = 9;
  const plankWidth = size / plankCount;
  const clampChannel = (value) => Math.min(255, Math.max(0, Math.round(value)));

  for (let i = 0; i < plankCount; i += 1) {
    const x = Math.round(i * plankWidth);
    const shade = (Math.random() - 0.5) * 26;
    ctx.fillStyle = `rgb(${clampChannel(base.r + shade)}, ${clampChannel(
      base.g + shade
    )}, ${clampChannel(base.b + shade)})`;
    ctx.fillRect(x, 0, Math.ceil(plankWidth) + 1, size);

    const grainCount = 26;
    for (let g = 0; g < grainCount; g += 1) {
      const gx = x + Math.random() * plankWidth;
      const gy = Math.random() * size;
      const length = 40 + Math.random() * 120;
      const wobble = (Math.random() - 0.5) * 6;
      ctx.strokeStyle = `rgba(72, 45, 24, ${0.06 + Math.random() * 0.16})`;
      ctx.lineWidth = 0.8 + Math.random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(
        gx + wobble,
        gy + length * 0.5,
        gx + (Math.random() - 0.5) * 3,
        gy + length
      );
      ctx.stroke();
    }

    const knotCount = Math.random() > 0.6 ? 2 : 1;
    for (let k = 0; k < knotCount; k += 1) {
      const kx = x + plankWidth * (0.2 + Math.random() * 0.6);
      const ky = size * (0.15 + Math.random() * 0.7);
      const radius = 6 + Math.random() * 10;
      const knot = ctx.createRadialGradient(kx, ky, 2, kx, ky, radius);
      knot.addColorStop(0, "rgba(82, 52, 30, 0.65)");
      knot.addColorStop(1, "rgba(82, 52, 30, 0)");
      ctx.fillStyle = knot;
      ctx.beginPath();
      ctx.arc(kx, ky, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const nickCount = 6;
    for (let n = 0; n < nickCount; n += 1) {
      const nx = x + Math.random() * plankWidth;
      const ny = Math.random() * size;
      const length = 6 + Math.random() * 14;
      ctx.strokeStyle = "rgba(54, 36, 22, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(nx - length * 0.5, ny);
      ctx.lineTo(nx + length * 0.5, ny);
      ctx.stroke();
    }
  }

  for (let i = 0; i <= plankCount; i += 1) {
    const x = Math.round(i * plankWidth);
    ctx.fillStyle = "rgba(40, 28, 18, 0.35)";
    ctx.fillRect(x, 0, 2, size);
  }

  const noise = ctx.getImageData(0, 0, size, size);
  const data = noise.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    data[i] = clampChannel(data[i] + n);
    data[i + 1] = clampChannel(data[i + 1] + n);
    data[i + 2] = clampChannel(data[i + 2] + n);
  }
  ctx.putImageData(noise, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createFloorSheenTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const glow = ctx.createRadialGradient(
    size * 0.55,
    size * 0.45,
    size * 0.05,
    size * 0.55,
    size * 0.45,
    size * 0.65
  );
  glow.addColorStop(0, "rgba(255, 241, 214, 0.6)");
  glow.addColorStop(1, "rgba(255, 241, 214, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const environmentTexture = createEnvironmentTexture();
scene.environment = environmentTexture;

const skyTexture = createSkyTexture();
skyTexture.mapping = THREE.UVMapping;
skyTexture.needsUpdate = true;
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(5000, 48, 32),
  new THREE.MeshBasicMaterial({
    map: skyTexture,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  })
);
skyDome.renderOrder = -10;
skyDome.frustumCulled = false;
scene.add(skyDome);

const floorSize = 1440;
const floorThickness = 12;
const woodTexture = createWoodTexture();
if (renderer) {
  woodTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
}
const woodMaterial = new THREE.MeshStandardMaterial({
  map: woodTexture,
  roughness: 0.78,
  metalness: 0.06,
  bumpMap: woodTexture,
  bumpScale: 3,
  envMapIntensity: 0.45,
});
const woodFloor = new THREE.Mesh(
  new THREE.BoxGeometry(floorSize, floorThickness, floorSize),
  woodMaterial
);
woodFloor.receiveShadow = true;
scene.add(woodFloor);

const floorSheen = new THREE.Mesh(
  new THREE.PlaneGeometry(floorSize, floorSize),
  new THREE.MeshPhysicalMaterial({
    map: createFloorSheenTexture(),
    color: 0xffffff,
    transparent: true,
    opacity: 0.18,
    roughness: 0.15,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.5,
    depthWrite: false,
  })
);
floorSheen.rotation.x = -Math.PI / 2;
floorSheen.renderOrder = 1;
floorSheen.receiveShadow = true;
scene.add(floorSheen);

const floorGrid = new THREE.GridHelper(floorSize, 12, 0xffffff, 0xffffff);
floorGrid.material.opacity = 0.08;
floorGrid.material.transparent = true;
floorGrid.material.depthWrite = false;
floorGrid.renderOrder = 2;
scene.add(floorGrid);


const baseFrameColor = 0x0d0f12;
const xAxisColor = 0xe74c3c;
const yAxisColor = 0x2ecc71;
const zAxisColor = 0x2c7be5;
const pAxisColor = 0x8e44ad;
const rAxisColor = 0x4cb06f;
const apiMarkerColor = 0x39ff14;
const labelLineColor = 0x111111;
const x0 = 0;
const y0 = 0;
const baseOffset = -34;
const x1 = 510;
const zAxisLength = 580;
const xAxisLength = 600;
const armLength = 80;
const axisThickness = 16;
const apiDirectionLineLength = 500;
const apiDirectionFadeLength = 100;
const apiDirectionFadeSegments = 10;
const scanOrigin = new THREE.Vector3(x0, 30, 0);
const floorOffset = baseOffset - axisThickness / 2;
woodFloor.position.y = floorOffset - floorThickness / 2;
floorSheen.position.y = floorOffset + 0.4;
floorGrid.position.y = floorOffset + 0.8;
const posXOrigin = 2215;
const posXScale = 5;
const posZOrigin = 625;
const posZScale = 25;
const rAxisPosPerRev = 3000;
const rAxisDegreesPerPos = 360 / rAxisPosPerRev;
const rAxisPosPerDegree = rAxisPosPerRev / 360;

function sceneToPos(xLeft, zDisplay) {
  return {
    x: posXOrigin - posXScale * xLeft,
    z: posZOrigin - posZScale * zDisplay,
  };
}

function posToScene(posX, posZ) {
  return {
    x: (posXOrigin - posX) / posXScale,
    y: (posZOrigin - posZ) / posZScale,
  };
}

function rPosToDegrees(pos) {
  return pos * rAxisDegreesPerPos;
}

function rDegreesToPos(deg) {
  return deg * rAxisPosPerDegree;
}

function makeLine(color) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(6);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(geometry, material);
  return { line, positions };
}

function setLine(lineData, x1, y1, z1, x2, y2, z2) {
  const { positions } = lineData;
  positions[0] = x1;
  positions[1] = y1;
  positions[2] = z1;
  positions[3] = x2;
  positions[4] = y2;
  positions[5] = z2;
  lineData.line.geometry.attributes.position.needsUpdate = true;
  lineData.line.geometry.computeBoundingSphere();
}

function createFadingLine(color, totalLength, fadeLength, fadeSegments) {
  const group = new THREE.Group();
  const baseLine = makeLine(color);
  baseLine.line.material.transparent = true;
  baseLine.line.material.opacity = 1;
  group.add(baseLine.line);

  const segments = [];
  const segmentCount = Math.max(2, fadeSegments);
  for (let i = 0; i < segmentCount; i += 1) {
    const segment = makeLine(color);
    segment.line.material.transparent = true;
    segment.line.material.opacity = 1 - i / (segmentCount - 1);
    group.add(segment.line);
    segments.push(segment);
  }

  return {
    group,
    baseLine,
    segments,
    totalLength,
    fadeLength,
  };
}

function updateFadingLine(lineData, origin, angleRad) {
  const { segments, totalLength, fadeLength } = lineData;
  const segmentCount = segments.length;
  if (segmentCount === 0) {
    return;
  }

  const dirX = Math.cos(angleRad);
  const dirY = Math.sin(angleRad);
  const startX = origin.x;
  const startY = origin.y;
  const startZ = origin.z;

  const baseLength = Math.max(0, totalLength - fadeLength);
  const baseEndX = startX + dirX * baseLength;
  const baseEndY = startY + dirY * baseLength;
  setLine(lineData.baseLine, startX, startY, startZ, baseEndX, baseEndY, startZ);

  const segmentLength = fadeLength / segmentCount;
  for (let i = 0; i < segmentCount; i += 1) {
    const segmentStart = baseLength + segmentLength * i;
    const segmentEnd = baseLength + segmentLength * (i + 1);
    const segStartX = startX + dirX * segmentStart;
    const segStartY = startY + dirY * segmentStart;
    const segEndX = startX + dirX * segmentEnd;
    const segEndY = startY + dirY * segmentEnd;
    setLine(segments[i], segStartX, segStartY, startZ, segEndX, segEndY, startZ);
  }
}

function initAxisIndicator() {
  if (!axisCanvas) {
    return;
  }

  axisRenderer = new THREE.WebGLRenderer({ canvas: axisCanvas, antialias: true, alpha: true });
  axisRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  axisRenderer.setClearColor(0x000000, 0);
  axisRenderer.outputColorSpace = THREE.SRGBColorSpace;

  axisScene = new THREE.Scene();
  axisCamera = new THREE.PerspectiveCamera(65, 1, 0.1, 80);

  const axisLength = 2.8;
  const negOpacity = 0.35;
  const xLinePos = makeLine(xAxisColor);
  setLine(xLinePos, 0, 0, 0, axisLength, 0, 0);
  axisScene.add(xLinePos.line);
  const xLineNeg = makeLine(xAxisColor);
  xLineNeg.line.material.transparent = true;
  xLineNeg.line.material.opacity = negOpacity;
  setLine(xLineNeg, 0, 0, 0, -axisLength, 0, 0);
  axisScene.add(xLineNeg.line);

  const zLinePos = makeLine(zAxisColor);
  setLine(zLinePos, 0, 0, 0, 0, axisLength, 0);
  axisScene.add(zLinePos.line);
  const zLineNeg = makeLine(zAxisColor);
  zLineNeg.line.material.transparent = true;
  zLineNeg.line.material.opacity = negOpacity;
  setLine(zLineNeg, 0, 0, 0, 0, -axisLength, 0);
  axisScene.add(zLineNeg.line);

  const yLinePos = makeLine(yAxisColor);
  setLine(yLinePos, 0, 0, 0, 0, 0, axisLength);
  axisScene.add(yLinePos.line);
  const yLineNeg = makeLine(yAxisColor);
  yLineNeg.line.material.transparent = true;
  yLineNeg.line.material.opacity = negOpacity;
  setLine(yLineNeg, 0, 0, 0, 0, 0, -axisLength);
  axisScene.add(yLineNeg.line);

  function createAxisLetter(letter, color, scale = 0.6) {
    const fontSize = 256;
    const padding = 8;
    const font = `700 ${fontSize}px \"Space Grotesk\", Arial, sans-serif`;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = font;
    const textWidth = Math.ceil(ctx.measureText(letter).width);
    const textHeight = fontSize;
    canvas.width = textWidth + padding * 2;
    canvas.height = textHeight + padding * 2;

    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(letter, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    const aspect = canvas.width / canvas.height;
    sprite.scale.set(scale * aspect, scale, 1);
    sprite.material.depthTest = false;
    return sprite;
  }

  const labelOffset = axisLength + 0.5;
  const labelScale = 0.9;
  const xLabelPos = createAxisLetter("X+", "#e74c3c", labelScale);
  const xLabelNeg = createAxisLetter("X-", "rgba(231, 76, 60, 0.55)", labelScale);
  const zLabelPos = createAxisLetter("Z+", "#2c7be5", labelScale);
  const zLabelNeg = createAxisLetter("Z-", "rgba(44, 123, 229, 0.55)", labelScale);
  const yLabelPos = createAxisLetter("Y+", "#2ecc71", labelScale);
  const yLabelNeg = createAxisLetter("Y-", "rgba(46, 204, 113, 0.55)", labelScale);
  xLabelPos.position.set(labelOffset, 0, 0);
  xLabelNeg.position.set(-labelOffset, 0, 0);
  zLabelPos.position.set(0, labelOffset, 0);
  zLabelNeg.position.set(0, -labelOffset, 0);
  yLabelPos.position.set(0, 0, labelOffset);
  yLabelNeg.position.set(0, 0, -labelOffset);
  axisScene.add(xLabelPos, xLabelNeg, yLabelPos, yLabelNeg, zLabelPos, zLabelNeg);
}

initAxisIndicator();

function initViewCube() {
  if (!viewCubeCanvas) {
    return;
  }

  viewCubeRenderer = new THREE.WebGLRenderer({
    canvas: viewCubeCanvas,
    antialias: true,
    alpha: true,
  });
  viewCubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewCubeRenderer.setClearColor(0x000000, 0);
  viewCubeRenderer.outputColorSpace = THREE.SRGBColorSpace;

  viewCubeScene = new THREE.Scene();
  viewCubeCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
  viewCubeCamera.position.set(6.75, 6.75, 6.75);
  viewCubeCamera.lookAt(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
  viewCubeScene.add(ambientLight);
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
  keyLight.position.set(3, 5, 4);
  viewCubeScene.add(keyLight);

  viewCube = new THREE.Group();
  const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
  const cubeMaterial = new THREE.MeshStandardMaterial({
    color: 0xdfe5e5,
    roughness: 0.35,
    metalness: 0.05,
  });
  const cubeMesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
  viewCubeMesh = cubeMesh;
  viewCube.add(cubeMesh);

  function createCubeLabel(text, scale = 0.5) {
    const fontSize = 52;
    const padding = 6;
    const font = `700 ${fontSize}px \"Space Grotesk\", Arial, sans-serif`;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = font;
    const textWidth = Math.ceil(ctx.measureText(text).width);
    const textHeight = fontSize;
    canvas.width = textWidth + padding * 2;
    canvas.height = textHeight + padding * 2;

    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1f2a2a";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    const aspect = canvas.width / canvas.height;
    sprite.scale.set(scale * aspect, scale, 1);
    sprite.material.depthTest = false;
    return sprite;
  }

  const faceOffset = 1.25;
  viewCubeLabels = [];

  function addFaceLabel(text, normal) {
    const label = createCubeLabel(text);
    label.position
      .copy(normal)
      .multiplyScalar(faceOffset);
    label.userData.normal = normal.clone();
    viewCube.add(label);
    viewCubeLabels.push(label);
  }

  addFaceLabel("Top", new THREE.Vector3(0, 1, 0));
  addFaceLabel("Down", new THREE.Vector3(0, -1, 0));
  addFaceLabel("Front", new THREE.Vector3(0, 0, 1));
  addFaceLabel("Back", new THREE.Vector3(0, 0, -1));
  addFaceLabel("Right", new THREE.Vector3(1, 0, 0));
  addFaceLabel("Left", new THREE.Vector3(-1, 0, 0));

  const cubeEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(cubeGeometry),
    new THREE.LineBasicMaterial({ color: 0x1f2a2a, transparent: true, opacity: 0.7 })
  );
  viewCube.add(cubeEdges);

  viewCubeScene.add(viewCube);
}

initViewCube();

function makeAnodizedMaterial(color, options = {}) {
  const emissiveIntensity = options.emissiveIntensity ?? 0.18;
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: options.roughness ?? 0.32,
    metalness: options.metalness ?? 0.45,
    clearcoat: options.clearcoat ?? 0.55,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.28,
    envMapIntensity: options.envMapIntensity ?? 0.9,
    emissive: new THREE.Color(color).multiplyScalar(emissiveIntensity),
  });
}

function setShadow(mesh, options = {}) {
  mesh.castShadow = options.cast ?? true;
  mesh.receiveShadow = options.receive ?? false;
}

const baseFrameMaterial = new THREE.MeshPhysicalMaterial({
  color: baseFrameColor,
  roughness: 0.55,
  metalness: 0.25,
  clearcoat: 0.2,
  clearcoatRoughness: 0.65,
  envMapIntensity: 0.6,
});
const baseFrameTube = new THREE.Mesh(
  new THREE.BoxGeometry(x1 - x0, axisThickness, axisThickness),
  baseFrameMaterial
);
baseFrameTube.position.set((x0 + x1) / 2, baseOffset, 0);
setShadow(baseFrameTube, { receive: true });
scene.add(baseFrameTube);

const zAxisMaterial = makeAnodizedMaterial(zAxisColor, { emissiveIntensity: 0.14 });
const xAxisMaterial = makeAnodizedMaterial(xAxisColor, { emissiveIntensity: 0.14 });
const pAxisMaterial = makeAnodizedMaterial(pAxisColor, { emissiveIntensity: 0.16 });
const verticalAxis = new THREE.Mesh(
  new THREE.BoxGeometry(axisThickness, zAxisLength, axisThickness),
  zAxisMaterial
);
verticalAxis.position.set(x1, baseOffset + zAxisLength / 2, 0);
setShadow(verticalAxis, { receive: true });
scene.add(verticalAxis);

const sphereMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x0a0b0f,
  roughness: 0.35,
  metalness: 0.55,
  clearcoat: 0.25,
  clearcoatRoughness: 0.45,
  envMapIntensity: 0.85,
});
const anchorGeometry = new THREE.SphereGeometry(12, 18, 18);
const stageMarker = new THREE.Mesh(anchorGeometry, sphereMaterial);
stageMarker.position.set(x1, baseOffset, 0);
setShadow(stageMarker);
scene.add(stageMarker);

const discRadius = 200;
const discThickness = 8;
const discCenter = new THREE.Vector3(0, -22, 0);
const discTopY = discCenter.y + discThickness / 2;
const discSurfaceMaterial = makeAnodizedMaterial(rAxisColor, {
  emissiveIntensity: 0.12,
  roughness: 0.28,
  metalness: 0.6,
  clearcoat: 0.7,
});
const discSideMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x0a0b0f,
  roughness: 0.3,
  metalness: 0.5,
  clearcoat: 0.3,
  clearcoatRoughness: 0.5,
  envMapIntensity: 0.8,
});
const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(discRadius, discRadius, discThickness, 80),
  [discSurfaceMaterial, discSurfaceMaterial, discSideMaterial]
);
disc.position.copy(discCenter);
setShadow(disc, { receive: true });
scene.add(disc);
const discTopMarker = new THREE.Mesh(
  new THREE.SphereGeometry(7, 16, 16),
  sphereMaterial
);
discTopMarker.position.set(discCenter.x, discTopY, discCenter.z);
setShadow(discTopMarker);
scene.add(discTopMarker);

const discHalo = new THREE.Mesh(
  new THREE.RingGeometry(discRadius * 0.6, discRadius * 0.92, 80),
  new THREE.MeshBasicMaterial({
    color: 0xa6f5c6,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
  })
);
discHalo.rotation.x = -Math.PI / 2;
discHalo.position.set(discCenter.x, discTopY + 1.2, discCenter.z);
discHalo.renderOrder = 3;
scene.add(discHalo);

function createGlowSprite(color, size, opacity) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  return sprite;
}

const scanOriginMarker = new THREE.Mesh(
  new THREE.SphereGeometry(9, 16, 16),
  new THREE.MeshPhysicalMaterial({
    color: 0xffd200,
    roughness: 0.22,
    metalness: 0.2,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.7,
  })
);
scanOriginMarker.position.copy(scanOrigin);
setShadow(scanOriginMarker);
scene.add(scanOriginMarker);

const scanPathGroup = new THREE.Group();
scene.add(scanPathGroup);

let scanPathLine = null;
let scanPathGlow = null;
let scanPathGeometry = null;
let scanPathMaterial = null;
let scanPathGlowMaterial = null;

if (THREE.Line2 && THREE.LineGeometry && THREE.LineMaterial) {
  scanPathGeometry = new THREE.LineGeometry();
  scanPathMaterial = new THREE.LineMaterial({
    color: 0x39ff14,
    linewidth: 9,
    transparent: true,
    opacity: 0.98,
  });
  scanPathMaterial.resolution.set(1, 1);
  scanPathLine = new THREE.Line2(scanPathGeometry, scanPathMaterial);
  scanPathLine.computeLineDistances();
  scanPathLine.renderOrder = 6;
  scanPathGroup.add(scanPathLine);

  scanPathGlowMaterial = new THREE.LineMaterial({
    color: 0x7dff4f,
    linewidth: 20,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
  });
  scanPathGlowMaterial.resolution.set(1, 1);
  scanPathGlowMaterial.depthWrite = false;
  scanPathGlowMaterial.depthTest = false;
  scanPathGlow = new THREE.Line2(scanPathGeometry, scanPathGlowMaterial);
  scanPathGlow.renderOrder = 5;
  scanPathGroup.add(scanPathGlow);
} else {
  scanPathLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x39ff14,
      transparent: true,
      opacity: 0.95,
    })
  );
  scanPathLine.renderOrder = 4;
  scanPathGroup.add(scanPathLine);
}

const waypointMarkerGroup = new THREE.Group();
waypointMarkerGroup.renderOrder = 5;
scene.add(waypointMarkerGroup);
const waypointMarkerGeometry = new THREE.SphereGeometry(6, 14, 14);
const waypointMarkerMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x39ff14,
  emissive: 0x39ff14,
  emissiveIntensity: 0.9,
  roughness: 0.25,
  metalness: 0.15,
  clearcoat: 0.5,
  clearcoatRoughness: 0.2,
  envMapIntensity: 0.8,
});

const apiMarker = new THREE.Mesh(
  new THREE.SphereGeometry(6, 16, 16),
  new THREE.MeshPhysicalMaterial({
    color: apiMarkerColor,
    emissive: apiMarkerColor,
    emissiveIntensity: 1,
    roughness: 0.18,
    metalness: 0.1,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.8,
  })
);
const apiGlow = createGlowSprite(apiMarkerColor, 55, 0.45);
apiMarker.add(apiGlow);
setShadow(apiMarker);
apiMarker.visible = false;
scene.add(apiMarker);

const apiDirectionLine = createFadingLine(
  apiMarkerColor,
  apiDirectionLineLength,
  apiDirectionFadeLength,
  apiDirectionFadeSegments
);
apiDirectionLine.group.visible = false;
scene.add(apiDirectionLine.group);

const pointCloudMaxPoints = 20000;
const pointCloudGeometry = new THREE.SphereGeometry(1.6, 8, 8);
const pointCloudMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.2,
  metalness: 0.08,
});
const pointCloudMesh = new THREE.InstancedMesh(
  pointCloudGeometry,
  pointCloudMaterial,
  pointCloudMaxPoints
);
pointCloudMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
pointCloudMesh.count = 0;
pointCloudMesh.frustumCulled = false;
const pointCloudGroup = new THREE.Group();
pointCloudGroup.position.copy(discCenter);
pointCloudGroup.add(pointCloudMesh);
scene.add(pointCloudGroup);
const pointCloudDummy = new THREE.Object3D();

const laserGuideGroup = new THREE.Group();
const laserGuideDot = new THREE.Mesh(
  new THREE.SphereGeometry(2.2, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0xff2d2d })
);
const laserGuideLineMaterial = new THREE.LineBasicMaterial({ color: 0xff2d2d });
const laserGuideLineGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(),
  new THREE.Vector3(),
]);
const laserGuideLine = new THREE.Line(laserGuideLineGeometry, laserGuideLineMaterial);
laserGuideGroup.add(laserGuideLine, laserGuideDot);
laserGuideGroup.visible = false;
scene.add(laserGuideGroup);


const rotationIndicatorLength = discRadius * 0.9;
const rotationLine = makeLine(rAxisColor);
scene.add(rotationLine.line);
const rotationTip = new THREE.Mesh(
  new THREE.SphereGeometry(11, 16, 16),
  sphereMaterial
);
setShadow(rotationTip);
scene.add(rotationTip);

const movablePoint = new THREE.Mesh(
  new THREE.SphereGeometry(15, 20, 20),
  sphereMaterial
);
setShadow(movablePoint);
scene.add(movablePoint);

const xAxisTube = new THREE.Mesh(
  new THREE.BoxGeometry(xAxisLength, axisThickness, axisThickness),
  xAxisMaterial
);
setShadow(xAxisTube, { receive: true });
scene.add(xAxisTube);
const xAxisLeftPoint = new THREE.Mesh(
  new THREE.SphereGeometry(13, 18, 18),
  sphereMaterial
);
setShadow(xAxisLeftPoint);
scene.add(xAxisLeftPoint);

const armTube = new THREE.Mesh(
  new THREE.BoxGeometry(armLength, axisThickness, axisThickness),
  pAxisMaterial
);
setShadow(armTube, { receive: true });
scene.add(armTube);
const pAxisEndTarget = new THREE.Object3D();
scene.add(pAxisEndTarget);

const draggableObjects = [
  { object: movablePoint, type: "z" },
  { object: xAxisLeftPoint, type: "xz" },
  { object: xAxisTube, type: "x" },
  { object: armTube, type: "p" },
  { object: rotationTip, type: "r" },
  { object: disc, type: "r" },
];

const axisLabelGroup = new THREE.Group();
const axisLineGroup = new THREE.Group();
const coordLabelGroup = new THREE.Group();
const coordLineGroup = new THREE.Group();
scene.add(axisLabelGroup);
scene.add(axisLineGroup);
scene.add(coordLabelGroup);
scene.add(coordLineGroup);

function createLabel(text, options = {}) {
  const fontSize = options.fontSize || 42;
  const padding = options.padding || 4;
  const fontWeight = options.fontWeight || 600;
  const font = `${fontWeight} ${fontSize}px \"Space Grotesk\", Arial, sans-serif`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 10;
  sprite.material.depthTest = false;
  sprite.userData.label = {
    canvas,
    ctx,
    texture,
    font,
    fontSize,
    padding,
    color: options.color || "#1f2a2a",
    scale: options.scale || 15,
    backgroundAlpha: options.backgroundAlpha ?? 0.8,
    extraWidth: options.extraWidth || 0,
    text: "",
  };
  updateLabelText(sprite, text);
  return sprite;
}

function updateLabelText(sprite, text) {
  const data = sprite.userData.label;
  if (!data || data.text === text) {
    return;
  }
  data.text = text;
  const { canvas, font, fontSize, padding, color, backgroundAlpha, texture, scale, extraWidth } = data;
  let { ctx } = data;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const metricsWidth = metrics.width;
  const leftExtent = Number.isFinite(metrics.actualBoundingBoxLeft)
    ? metrics.actualBoundingBoxLeft
    : metricsWidth / 2;
  const rightExtent = Number.isFinite(metrics.actualBoundingBoxRight)
    ? metrics.actualBoundingBoxRight
    : metricsWidth / 2;
  const centeredWidth = Math.max(metricsWidth, leftExtent + rightExtent, 2 * Math.max(leftExtent, rightExtent));
  const textWidth = Math.ceil(centeredWidth);
  const textHeight = fontSize;
  const width = textWidth + padding * 2 + extraWidth + 2;
  const height = textHeight + padding * 2;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext("2d");
    data.ctx = ctx;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundAlpha > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${backgroundAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  texture.needsUpdate = true;
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(scale * aspect, scale, 1);
}

const labels = {
  base: createLabel("Base", { color: "#0d0f12" }),
  zAxis: createLabel("Z-axis", { color: "#2c7be5" }),
  xAxis: createLabel("X-axis", { color: "#e74c3c" }),
  pAxis: createLabel("P-axis", { color: "#8e44ad" }),
  rAxis: createLabel("R-axis", { color: "#4cb06f" }),
};

Object.values(labels).forEach((label) => axisLabelGroup.add(label));


const labelLines = {
  base: makeLine(labelLineColor),
  zAxis: makeLine(labelLineColor),
  xAxis: makeLine(labelLineColor),
  pAxis: makeLine(labelLineColor),
  rAxis: makeLine(labelLineColor),
};
Object.values(labelLines).forEach((line) => {
  line.line.material.transparent = true;
  line.line.material.opacity = 0.5;
  axisLineGroup.add(line.line);
});

const coordLabels = [];
const coordLabelExtraWidth = 12;
function formatCoord(position) {
  return `X:${position.x.toFixed(1)} Z:${position.y.toFixed(1)}`;
}

function addCoordLabel(name, target, offset, options = {}) {
  const label = createLabel(`${name} ${formatCoord(target.position)}`, {
    color: options.color || "#0d0f12",
    scale: options.scale || 12,
    extraWidth: options.extraWidth ?? coordLabelExtraWidth,
  });
  label.position.copy(target.position).add(offset);
  coordLabelGroup.add(label);

  const line = makeLine(labelLineColor);
  line.line.material.transparent = true;
  line.line.material.opacity = 0.5;
  coordLineGroup.add(line.line);

  const entry = { name, target, offset: offset.clone(), label, line };
  coordLabels.push(entry);
  updateCoordLabel(entry);
  return entry;
}

function updateCoordLabel(entry) {
  const pos = entry.target.position;
  const labelPos = pos.clone().add(entry.offset);
  entry.label.position.copy(labelPos);
  setLine(entry.line, labelPos.x, labelPos.y, labelPos.z, pos.x, pos.y, pos.z);
  updateLabelText(entry.label, `${entry.name} ${formatCoord(pos)}`);
}

function updateCoordLabels() {
  coordLabels.forEach(updateCoordLabel);
}

addCoordLabel("Stage", stageMarker, new THREE.Vector3(80, 40, -80));
addCoordLabel("Slider", movablePoint, new THREE.Vector3(80, 40, 60));
addCoordLabel("Joint", xAxisLeftPoint, new THREE.Vector3(80, 40, 60));
addCoordLabel("P-axis End", pAxisEndTarget, new THREE.Vector3(60, 45, 60));
addCoordLabel("Disc", discTopMarker, new THREE.Vector3(60, 40, 0));
addCoordLabel("Scan Origin", scanOriginMarker, new THREE.Vector3(60, 40, 60));
const scanDistanceStep = 0.1;
function formatScanDistance(distance) {
  const snapped = Math.round(distance / scanDistanceStep) * scanDistanceStep;
  const text = snapped.toFixed(1);
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

const scanDistanceLabel = createLabel(
  `Scan distance ${formatScanDistance(0)}`,
  {
    color: "#1f2a2a",
    scale: 12,
    extraWidth: coordLabelExtraWidth,
  }
);
coordLabelGroup.add(scanDistanceLabel);
const scanDistanceLine = makeLine(labelLineColor);
scanDistanceLine.line.material.transparent = true;
scanDistanceLine.line.material.opacity = 0.5;
coordLineGroup.add(scanDistanceLine.line);
const scanDistanceMidpoint = new THREE.Vector3();

function updateScanDistanceLabel() {
  const start = pAxisEndTarget.position;
  const end = scanOriginMarker.position;
  scanDistanceMidpoint.set(
    (start.x + end.x) / 2,
    (start.y + end.y) / 2,
    (start.z + end.z) / 2
  );
  scanDistanceLabel.position.copy(scanDistanceMidpoint);
  setLine(scanDistanceLine, start.x, start.y, start.z, end.x, end.y, end.z);
  const distance = start.distanceTo(end);
  updateLabelText(scanDistanceLabel, `Scan distance ${formatScanDistance(distance)}`);
}

labels.base.position.set(x1 - 60, baseOffset + 35, -40);
labels.zAxis.position.set(x1 + 40, baseOffset + zAxisLength - 20, 40);
labels.rAxis.position.set(discCenter.x + discRadius * 0.7, discTopY + 35, 40);
setLine(
  labelLines.base,
  labels.base.position.x,
  labels.base.position.y,
  labels.base.position.z,
  x1,
  baseOffset,
  0
);
setLine(
  labelLines.zAxis,
  labels.zAxis.position.x,
  labels.zAxis.position.y,
  labels.zAxis.position.z,
  x1,
  baseOffset + zAxisLength,
  0
);
setLine(
  labelLines.rAxis,
  labels.rAxis.position.x,
  labels.rAxis.position.y,
  labels.rAxis.position.z,
  discCenter.x + discRadius,
  discTopY,
  0
);

function updateLabelPositions(xLeft, xRight, zVal, armEndX, armEndZ) {
  const xLabelAnchor = xLeft + (xAxisLength * 2) / 3;
  labels.xAxis.position.set(xLabelAnchor + 20, zVal + 35, 40);
  labels.pAxis.position.set((xLeft + armEndX) / 2 + 20, (zVal + armEndZ) / 2 + 35, 40);
  setLine(
    labelLines.xAxis,
    labels.xAxis.position.x,
    labels.xAxis.position.y,
    labels.xAxis.position.z,
    xLabelAnchor,
    zVal,
    0
  );
  setLine(
    labelLines.pAxis,
    labels.pAxis.position.x,
    labels.pAxis.position.y,
    labels.pAxis.position.z,
    (xLeft + armEndX) / 2,
    (zVal + armEndZ) / 2,
    0
  );
}

const zAxisInput = document.getElementById("zAxis");
const xAxisInput = document.getElementById("xAxis");
const pAxisInput = document.getElementById("pAxis");
const rAxisInput = document.getElementById("rAxis");
const lockOriginInput = document.getElementById("lockOrigin");
const labelsToggleInput = document.getElementById("toggleLabels");
const coordLabelsToggleInput = document.getElementById("toggleCoordLabels");
const ledPanel = document.getElementById("ledPanel");
const ledGrid = document.getElementById("ledGrid");
const scanPanel = document.getElementById("scanPanel");
const scanRadiusInput = document.getElementById("scanRadius");
const scanWaypointsInput = document.getElementById("scanWaypoints");
const scanRepeatsInput = document.getElementById("scanRepeats");
const scanStartDirectionInput = document.getElementById("scanStartDirection");
const scanDryRunInput = document.getElementById("scanDryRun");
const scanStartCenterInput = document.getElementById("scanStartCenter");
const scanStartButton = document.getElementById("scanStart");
const scanRunControls = document.getElementById("scanRunControls");
const scanPauseButton = document.getElementById("scanPause");
const scanStopButton = document.getElementById("scanStop");
const scanProgressText = document.getElementById("scanProgressText");
const scanProgressFill = document.getElementById("scanProgressFill");
const scanEstimateText = document.getElementById("scanEstimate");
const pointCloudPanel = document.getElementById("pointCloudPanel");
const pointCloudToggle = document.getElementById("pointCloudToggle");
const pointCloudToggleIcon = document.querySelector("#pointCloudToggle .hud-title-icon");
const pointCloudSecondsInput = document.getElementById("pointCloudSeconds");
const pointCloudStartButton = document.getElementById("pointCloudStart");
const pointCloudStopButton = document.getElementById("pointCloudStop");
const pointCloudClearButton = document.getElementById("pointCloudClear");
const pointCloudLaserToggle = document.getElementById("pointCloudLaserToggle");
const pointCloudStatus = document.getElementById("pointCloudStatus");
const controlsPanel = document.getElementById("controlsPanel");
const controlsToggle = document.getElementById("controlsToggle");
const controlsToggleIcon = document.querySelector("#controlsToggle .hud-title-icon");

const zAxisVal = document.getElementById("zAxisVal");
const xAxisVal = document.getElementById("xAxisVal");
const pAxisVal = document.getElementById("pAxisVal");
const rAxisVal = document.getElementById("rAxisVal");
const zPosVal = document.getElementById("zPosVal");
const xPosVal = document.getElementById("xPosVal");
const rPosVal = document.getElementById("rPosVal");
const apiPosX = document.getElementById("apiPosX");
const apiPosZ = document.getElementById("apiPosZ");
const apiPosP = document.getElementById("apiPosP");
const apiPosR = document.getElementById("apiPosR");
const apiPosStatus = document.getElementById("apiPosStatus");
const directControlPanel = document.getElementById("directControlPanel");
const directControlToggle = document.getElementById("directControlToggle");
const directControlIntervalInput = document.getElementById("directControlInterval");
const scanRadiusVal = document.getElementById("scanRadiusVal");
const axisTuningControls = [
  {
    axis: "z",
    velInput: document.getElementById("axisVelZ"),
    velOutput: document.getElementById("axisVelZVal"),
    accInput: document.getElementById("axisAccZ"),
    accOutput: document.getElementById("axisAccZVal"),
  },
  {
    axis: "x",
    velInput: document.getElementById("axisVelX"),
    velOutput: document.getElementById("axisVelXVal"),
    accInput: document.getElementById("axisAccX"),
    accOutput: document.getElementById("axisAccXVal"),
  },
  {
    axis: "p",
    velInput: document.getElementById("axisVelP"),
    velOutput: document.getElementById("axisVelPVal"),
    accInput: document.getElementById("axisAccP"),
    accOutput: document.getElementById("axisAccPVal"),
  },
  {
    axis: "r",
    velInput: document.getElementById("axisVelR"),
    velOutput: document.getElementById("axisVelRVal"),
    accInput: document.getElementById("axisAccR"),
    accOutput: document.getElementById("axisAccRVal"),
  },
];
const axisApplyButton = document.getElementById("axisApply");

if (labelsToggleInput) {
  axisLabelGroup.visible = labelsToggleInput.checked;
  axisLineGroup.visible = labelsToggleInput.checked;
}

if (coordLabelsToggleInput) {
  coordLabelGroup.visible = coordLabelsToggleInput.checked;
  coordLineGroup.visible = coordLabelsToggleInput.checked;
}

function deflectionToAngle(deflection) {
  let angle = deflection + 180;
  if (angle > 180) {
    angle -= 360;
  }
  return angle;
}

function angleToDeflection(angle) {
  let deflection = angle - 180;
  if (deflection <= -180) {
    deflection += 360;
  }
  if (deflection > 180) {
    deflection -= 360;
  }
  return clamp(deflection, -90, 90);
}

function angleToOrigin(xLeft, zVal) {
  return THREE.MathUtils.radToDeg(
    Math.atan2(scanOrigin.y - zVal, scanOrigin.x - xLeft)
  );
}

function getPAxisAngleRad() {
  const pVal = Number.parseFloat(pAxisInput.value);
  const safeP = Number.isFinite(pVal) ? pVal : 0;
  return THREE.MathUtils.degToRad(deflectionToAngle(safeP));
}

function apiPToAngleRad(rawP) {
  if (!Number.isFinite(rawP)) {
    return null;
  }
  const deflection = (-rawP / 255) * 90;
  return THREE.MathUtils.degToRad(deflectionToAngle(deflection));
}

function updateApiDirectionLine(fallbackAngleRad) {
  if (!apiMarker.visible) {
    apiDirectionLine.group.visible = false;
    return;
  }
  const apiAngleRad = apiPToAngleRad(lastApiP);
  const angleRad = Number.isFinite(apiAngleRad) ? apiAngleRad : fallbackAngleRad;
  if (!Number.isFinite(angleRad)) {
    apiDirectionLine.group.visible = false;
    return;
  }
  apiDirectionLine.group.visible = true;
  updateFadingLine(apiDirectionLine, apiMarker.position, angleRad);
}

function updateOutputs(zDisplay, xLeft, pVal, rVal) {
  zAxisVal.textContent = zDisplay.toFixed(1);
  xAxisVal.textContent = xLeft.toFixed(1);
  const pDisplay = (-pVal / 90) * 255;
  pAxisVal.textContent = pDisplay.toFixed(0);
  const rDegrees = rPosToDegrees(rVal);
  rAxisVal.textContent = rDegrees.toFixed(1);
  if (rPosVal) {
    rPosVal.textContent = rVal.toFixed(0);
  }
  if (zPosVal || xPosVal) {
    const posValues = sceneToPos(xLeft, zDisplay);
    if (zPosVal) {
      zPosVal.textContent = posValues.z.toFixed(1);
    }
    if (xPosVal) {
      xPosVal.textContent = posValues.x.toFixed(1);
    }
  }
}

function updateScene() {
  const zVal = parseFloat(zAxisInput.value);
  const xLeft = parseFloat(xAxisInput.value);
  const zActual = zVal;
  let pVal = parseFloat(pAxisInput.value);

  if (lockOriginInput.checked) {
    const desiredAngle = angleToOrigin(xLeft, zActual);
    const desiredDeflection = angleToDeflection(desiredAngle);
    pVal = desiredDeflection;
    pAxisInput.value = desiredDeflection.toFixed(1);
  }

  const angleDeg = deflectionToAngle(pVal);
  const angleRad = THREE.MathUtils.degToRad(angleDeg);
  const rVal = parseFloat(rAxisInput.value);

  updateOutputs(zActual, xLeft, pVal, rVal);

  const xRight = xLeft + xAxisLength;
  const armEndX = xLeft + armLength * Math.cos(angleRad);
  const armEndZ = zActual + armLength * Math.sin(angleRad);

  movablePoint.position.set(x1, zActual, 0);
  xAxisLeftPoint.position.set(xLeft, zActual, 0);
  xAxisTube.position.set((xLeft + xRight) / 2, zActual, 0);
  armTube.position.set((xLeft + armEndX) / 2, (zActual + armEndZ) / 2, 0);
  armTube.rotation.set(0, 0, angleRad);
  pAxisEndTarget.position.set(armEndX, armEndZ, 0);
  updateLabelPositions(xLeft, xRight, zActual, armEndX, armEndZ);
  updateScanDistanceLabel();

  const rotationDeg = rPosToDegrees(rVal);
  const rotationRad = THREE.MathUtils.degToRad(rotationDeg);
  const arrowEndX = discCenter.x + rotationIndicatorLength * Math.cos(rotationRad);
  const arrowEndZ = discCenter.z + rotationIndicatorLength * Math.sin(rotationRad);
  setLine(rotationLine, discCenter.x, discTopY, discCenter.z, arrowEndX, discTopY, arrowEndZ);
  rotationTip.position.set(arrowEndX, discTopY, arrowEndZ);
  updateCoordLabels();
  updateApiDirectionLine(angleRad);
  updateLaserGuide();
}

const apiBaseUrl = "http://192.168.178.222:8001/api";
const posApiUrl = `${apiBaseUrl}/pos`;
const maxVelocityUrl = `${apiBaseUrl}/maxvelocity`;
const maxAccelUrl = `${apiBaseUrl}/maxaccel`;
const moveAbsUrl = `${apiBaseUrl}/moveabs`;
const driverStatusUrl = `${apiBaseUrl}/driverstatus`;
const driverSettingsUrl = `${apiBaseUrl}/driversettings`;
const coordStatusUrl = `${apiBaseUrl}/coordstatus`;
const stopUrl = `${apiBaseUrl}/stop`;
const homeUrl = `${apiBaseUrl}/home`;
const measureUrl = `${apiBaseUrl}/measure`;
const ledUrl = `${apiBaseUrl}/led`;
const apiRootUrl = apiBaseUrl.replace(/\/api\/?$/, "");
const wsBaseUrl = apiRootUrl.replace(/^http/, "ws");
const measureAxis = "r";
const measureSocketUrl = `${wsBaseUrl}/ws/axis/${measureAxis}`;
const posPollIntervalMs = 50;
const apiStatusPollIntervalMs = 1000;
let posPollTimer = null;
let posFetchInFlight = false;
let lastApiP = null;
let lastApiScene = null;
let lastApiRaw = null;
let apiStatusTimer = null;
let apiStatusInFlight = false;
let apiOnlineSince = null;
let apiOfflineSince = null;
const measurementOffset = new THREE.Vector3(2, 25.5, 0);
const measurementOffsetAxis = new THREE.Vector3(0, 0, 1);
const measurementOffsetRotated = new THREE.Vector3();
const measurementLaserLength = 200;
const laserGuideOutOfPlaneOffset = 4.2;
const pointCloudState = {
  active: false,
  starting: false,
  socket: null,
  stopTimer: null,
  closing: false,
};
const ledAxes = ["x2", "x1", "z", "r"];
const ledCount = 8;
const ledSweepColor = "0000FF";
const ledSweepWeights = [0.2, 0.4, 1, 0.4, 0.2];
const ledTargetColor = "CCCC00";
const ledActualColors = {
  x2: "FF00FF",
  x1: "FF0000",
  z: "0000FF",
  r: "00FFFF",
};
const ledAxisRanges = {
  x2: { min: -255, max: 255 },
  x1: { min: 0, max: 2100 },
  z: { min: -11500, max: -50 },
  r: { min: 0, max: 360 },
};
const ledOffColor = "000000";
const ledUnset = "------";
const ledSweepStepMs = 220;
const ledLastSent = ledAxes.reduce((acc, axis) => {
  acc[axis] = Array.from({ length: ledCount }, () => null);
  return acc;
}, {});
const ledButtons = ledAxes.reduce((acc, axis) => {
  acc[axis] = [];
  return acc;
}, {});
const ledUpdateInFlight = ledAxes.reduce((acc, axis) => {
  acc[axis] = false;
  return acc;
}, {});
let ledUpdateTimer = null;
let homingActive = false;
let apiIsOnline = null;
const measurementBase = new THREE.Vector3();
const measurementOrigin = new THREE.Vector3();
const measurementDirection = new THREE.Vector3();
const measurementEnd = new THREE.Vector3();
const measurementLocal = new THREE.Vector3();
const pointCloudRotationSign = -1;

function readNumeric(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toHexByte(value) {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, "0").toUpperCase();
}

function scaleHexColor(hex, factor) {
  const safeHex = (hex || ledOffColor).replace("#", "");
  if (safeHex.length !== 6) {
    return ledOffColor;
  }
  const r = parseInt(safeHex.slice(0, 2), 16);
  const g = parseInt(safeHex.slice(2, 4), 16);
  const b = parseInt(safeHex.slice(4, 6), 16);
  return `${toHexByte(r * factor)}${toHexByte(g * factor)}${toHexByte(b * factor)}`;
}

function isBrightColor(hex) {
  const safeHex = (hex || ledOffColor).replace("#", "");
  if (safeHex.length !== 6) {
    return false;
  }
  const r = parseInt(safeHex.slice(0, 2), 16);
  const g = parseInt(safeHex.slice(2, 4), 16);
  const b = parseInt(safeHex.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150;
}

function createLedState(fillColor = ledOffColor) {
  return Array.from({ length: ledCount }, () => fillColor);
}

function mapValueToLedIndex(value, min, max) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const span = max - min;
  if (span <= 0) {
    return null;
  }
  const clampedValue = clamp(value, min, max);
  const segment = Math.min(
    ledCount - 1,
    Math.max(0, Math.floor(((clampedValue - min) / span) * ledCount))
  );
  return ledCount - 1 - segment;
}

function normalizeAngle360(degrees) {
  const raw = Number.isFinite(degrees) ? degrees : 0;
  return ((raw % 360) + 360) % 360;
}

function setLedButtonVisual(button, axis, ledIndex, color) {
  if (!button) {
    return;
  }
  const normalized = (color || ledOffColor).replace("#", "").toUpperCase();
  const isOff = normalized === ledOffColor;
  if (isOff) {
    button.style.backgroundColor = "rgba(31, 42, 42, 0.08)";
    button.style.borderColor = "rgba(31, 42, 42, 0.12)";
    button.style.color = "var(--ink-strong)";
    button.style.boxShadow = "none";
  } else {
    const colorValue = `#${normalized}`;
    button.style.backgroundColor = colorValue;
    button.style.borderColor = colorValue;
    button.style.color = isBrightColor(normalized) ? "var(--ink-strong)" : "#ffffff";
    button.style.boxShadow = "0 6px 12px rgba(0, 0, 0, 0.12)";
  }
  const axisLabel = axis ? axis.toUpperCase() : "";
  const labelParts = [];
  if (axisLabel) {
    labelParts.push(axisLabel);
  }
  if (Number.isFinite(ledIndex)) {
    labelParts.push(`LED ${ledIndex}`);
  }
  button.setAttribute("aria-label", labelParts.join(" "));
  button.title = labelParts.join(" ");
}

function getAxisActualValue(axis) {
  if (!lastApiRaw) {
    return null;
  }
  if (axis === "x2") {
    return readNumeric(lastApiRaw.p);
  }
  if (axis === "x1") {
    return readNumeric(lastApiRaw.x ?? lastApiRaw.x1);
  }
  if (axis === "z") {
    return readNumeric(lastApiRaw.z);
  }
  if (axis === "r") {
    return readNumeric(lastApiRaw.r);
  }
  return null;
}

function getAxisTargetValue(axis) {
  if (axis === "x2") {
    if (!pAxisInput) {
      return null;
    }
    const pVal = Number.parseFloat(pAxisInput.value);
    if (!Number.isFinite(pVal)) {
      return null;
    }
    return clamp(deflectionToPDisplay(pVal), ledAxisRanges.x2.min, ledAxisRanges.x2.max);
  }
  if (axis === "x1") {
    if (!xAxisInput || !zAxisInput) {
      return null;
    }
    const xLeft = Number.parseFloat(xAxisInput.value);
    const zVal = Number.parseFloat(zAxisInput.value);
    if (!Number.isFinite(xLeft) || !Number.isFinite(zVal)) {
      return null;
    }
    return sceneToPos(xLeft, zVal).x;
  }
  if (axis === "z") {
    if (!xAxisInput || !zAxisInput) {
      return null;
    }
    const xLeft = Number.parseFloat(xAxisInput.value);
    const zVal = Number.parseFloat(zAxisInput.value);
    if (!Number.isFinite(xLeft) || !Number.isFinite(zVal)) {
      return null;
    }
    return sceneToPos(xLeft, zVal).z;
  }
  if (axis === "r") {
    if (!rAxisInput) {
      return null;
    }
    const rVal = Number.parseFloat(rAxisInput.value);
    return Number.isFinite(rVal) ? rVal : null;
  }
  return null;
}

function getAxisLedIndex(axis, value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const range = ledAxisRanges[axis];
  if (!range) {
    return null;
  }
  let index = null;
  if (axis === "r") {
    const degrees = normalizeAngle360(rPosToDegrees(value));
    index = mapValueToLedIndex(degrees, range.min, range.max);
  } else {
    index = mapValueToLedIndex(value, range.min, range.max);
  }
  if (!Number.isFinite(index)) {
    return null;
  }
  if (axis === "x1" || axis === "z") {
    return ledCount - 1 - index;
  }
  return index;
}

function computeSweepLedState(nowMs) {
  const state = {};
  ledAxes.forEach((axis) => {
    state[axis] = createLedState();
  });
  const totalSteps = ledAxes.length * ledCount;
  if (!totalSteps) {
    return state;
  }
  const loopLength = Math.max(1, totalSteps * 2 - 2);
  const step = Math.floor(nowMs / ledSweepStepMs) % loopLength;
  const forwardStep = step < totalSteps ? step : loopLength - step;
  const offsetStart = Math.floor(ledSweepWeights.length / 2);
  ledSweepWeights.forEach((weight, idx) => {
    const linearIndex = forwardStep + (idx - offsetStart);
    if (linearIndex < 0 || linearIndex >= totalSteps) {
      return;
    }
    const axisIndex = Math.floor(linearIndex / ledCount);
    const posIndex = linearIndex % ledCount;
    const axis = ledAxes[axisIndex];
    const ledIndex = ledCount - 1 - posIndex;
    state[axis][ledIndex] = scaleHexColor(ledSweepColor, weight);
  });
  return state;
}

function computePositionLedState() {
  const state = {};
  ledAxes.forEach((axis) => {
    state[axis] = createLedState();
  });
  ledAxes.forEach((axis) => {
    const actualValue = getAxisActualValue(axis);
    const targetValue = getAxisTargetValue(axis);
    const actualIndex = getAxisLedIndex(axis, actualValue);
    const targetIndex = getAxisLedIndex(axis, targetValue);
    if (Number.isFinite(targetIndex) && targetIndex !== actualIndex) {
      state[axis][targetIndex] = ledTargetColor;
    }
    if (Number.isFinite(actualIndex)) {
      state[axis][actualIndex] = ledActualColors[axis] || ledOffColor;
    }
  });
  return state;
}

function updateLedButtonGrid(desiredState) {
  if (!ledGrid) {
    return;
  }
  ledAxes.forEach((axis) => {
    const axisButtons = ledButtons[axis];
    const colors = desiredState[axis];
    if (!axisButtons || !colors) {
      return;
    }
    axisButtons.forEach((button, index) => {
      setLedButtonVisual(button, axis, index, colors[index]);
    });
  });
}

function buildLedDeltaPayload(axis, desiredState) {
  const lastState = ledLastSent[axis];
  if (!desiredState || !lastState) {
    return null;
  }
  const payload = { axis };
  let changed = false;
  for (let i = 0; i < ledCount; i += 1) {
    const desired = desiredState[i] || ledOffColor;
    const previous = lastState[i];
    if (previous === desired) {
      payload[`led${i}`] = ledUnset;
    } else {
      payload[`led${i}`] = desired;
      changed = true;
    }
  }
  return changed ? payload : null;
}

async function postAxisLedPayload(axis, payload) {
  const response = await fetch(ledUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch (err) {
      detail = "";
    }
    throw new Error(`led ${axis} ${response.status} ${detail}`.trim());
  }
  return response.json().catch(() => null);
}

async function pushLedState(axis, desiredState) {
  if (ledUpdateInFlight[axis]) {
    return;
  }
  const payload = buildLedDeltaPayload(axis, desiredState);
  if (!payload) {
    return;
  }
  ledUpdateInFlight[axis] = true;
  try {
    await postAxisLedPayload(axis, payload);
    for (let i = 0; i < ledCount; i += 1) {
      const nextValue = payload[`led${i}`];
      if (nextValue !== ledUnset) {
        ledLastSent[axis][i] = nextValue;
      }
    }
  } catch (err) {
    console.warn("led update failed", err);
  } finally {
    ledUpdateInFlight[axis] = false;
  }
}

function computeDesiredLedState(nowMs) {
  const isHomed = Number(lastApiHomed) === 1;
  if (!isHomed && !homingActive) {
    return computeSweepLedState(nowMs);
  }
  return computePositionLedState();
}

function updateLedOutputs() {
  const desiredState = computeDesiredLedState(Date.now());
  updateLedButtonGrid(desiredState);
  if (apiIsOnline === false) {
    return;
  }
  ledAxes.forEach((axis) => {
    pushLedState(axis, desiredState[axis]);
  });
}

function startLedStatusLoop() {
  if (ledUpdateTimer) {
    return;
  }
  updateLedOutputs();
  ledUpdateTimer = window.setInterval(updateLedOutputs, 120);
}

function setupLedControls() {
  if (!ledPanel || !ledGrid) {
    return;
  }
  ledGrid.textContent = "";
  const fragment = document.createDocumentFragment();
  ledAxes.forEach((axis) => {
    const row = document.createElement("div");
    row.className = "led-row";
    row.dataset.axis = axis;

    const axisLabel = document.createElement("div");
    axisLabel.className = "led-axis";
    axisLabel.textContent = axis.toUpperCase();

    const buttons = document.createElement("div");
    buttons.className = "led-buttons";

    for (let i = ledCount - 1; i >= 0; i -= 1) {
      const button = document.createElement("button");
      button.className = "led-button";
      button.type = "button";
      button.textContent = String(i);
      button.dataset.axis = axis;
      button.dataset.ledIndex = String(i);
      setLedButtonVisual(button, axis, i, ledOffColor);
      ledButtons[axis][i] = button;
      buttons.append(button);
    }

    row.append(axisLabel, buttons);
    fragment.append(row);
  });
  ledGrid.append(fragment);
}

function parseCoordStatusState(payload) {
  if (!payload) {
    return null;
  }
  if (typeof payload === "string") {
    return payload.toLowerCase();
  }
  if (typeof payload === "object") {
    const direct = payload.state ?? payload.status ?? null;
    if (typeof direct === "string") {
      return direct.toLowerCase();
    }
    const nestedCandidates = [payload.data, payload.result, payload.coordstatus, payload.payload];
    for (const candidate of nestedCandidates) {
      if (candidate && typeof candidate.state === "string") {
        return candidate.state.toLowerCase();
      }
    }
  }
  return null;
}

async function fetchCoordStatusState() {
  try {
    const response = await fetch(`${coordStatusUrl}?refresh=true`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`coordstatus ${response.status}`);
    }
    const rawText = await response.text();
    let payload = rawText;
    try {
      payload = JSON.parse(rawText);
    } catch (err) {
      payload = rawText;
    }
    return parseCoordStatusState(payload);
  } catch (err) {
    return null;
  }
}

function setApiStatus(isOnline) {
  const now = Date.now();
  apiIsOnline = isOnline;
  if (isOnline) {
    if (!apiOnlineSince) {
      apiOnlineSince = now;
    }
    apiOfflineSince = null;
    if (apiStatus) {
      apiStatus.classList.add("is-online");
      apiStatus.classList.remove("is-offline");
    }
    if (apiStatusState) {
      apiStatusState.textContent = "ONLINE";
    }
  } else {
    if (!apiOfflineSince) {
      apiOfflineSince = now;
    }
    apiOnlineSince = null;
    if (apiStatus) {
      apiStatus.classList.add("is-offline");
      apiStatus.classList.remove("is-online");
    }
    if (apiStatusState) {
      apiStatusState.textContent = "OFFLINE";
    }
  }
}

function updateApiStatusTime() {
  if (!apiStatusTime) {
    return;
  }
  const now = Date.now();
  if (apiOnlineSince) {
    const seconds = Math.max(0, Math.floor((now - apiOnlineSince) / 1000));
    apiStatusTime.textContent = `${seconds}s`;
    return;
  }
  if (apiOfflineSince) {
    const seconds = Math.max(0, Math.floor((now - apiOfflineSince) / 1000));
    apiStatusTime.textContent = `${seconds}s`;
    return;
  }
  apiStatusTime.textContent = "--";
}

async function pollApiStatus() {
  if (apiStatusInFlight) {
    return;
  }
  apiStatusInFlight = true;
  try {
    const response = await fetch(`${posApiUrl}?refresh=true`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`api status ${response.status}`);
    }
    setApiStatus(true);
  } catch (err) {
    setApiStatus(false);
  } finally {
    apiStatusInFlight = false;
    updateApiStatusTime();
  }
}

function startApiStatusPolling() {
  if (apiStatusTimer) {
    return;
  }
  pollApiStatus();
  apiStatusTimer = window.setInterval(pollApiStatus, apiStatusPollIntervalMs);
}

const velocitySteps = [5, 10, 25, 50, 100, 250, 500, 750, 1000];
const accelSteps = [25, 50, 100, 250, 500];
const axisTuningStorageKey = "scanbot.axisTuning.v1";
const axisTuningDefaults = {
  z: { velocity: 500, accel: 100 },
  x: { velocity: 500, accel: 100 },
  p: { velocity: 500, accel: 100 },
  r: { velocity: 500, accel: 100 },
};
let axisTuningState = null;
const directControlDefaultIntervalSec = 5;
let directControlTimer = null;
let lastMoveAbsPayload = null;
let lastApiStatus = null;
let lastApiHomed = null;
const scanDefaults = {
  radius: 320,
  waypoints: 9,
  repeats: 3,
  startDirection: "forward",
};
const scanState = {
  active: false,
  paused: false,
  previousLockOrigin: null,
  previousDirectControl: null,
  previousRMax: null,
  dryRun: false,
};
let scanWaypoints = [];
const scanEstimateWindow = 6;
const scanProgressState = {
  totalSteps: 0,
  completedSteps: 0,
  stepDurations: [],
};

function getClosestStepIndex(steps, value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  let closestIndex = 0;
  let closestDelta = Infinity;
  steps.forEach((step, index) => {
    const delta = Math.abs(step - value);
    if (delta < closestDelta) {
      closestDelta = delta;
      closestIndex = index;
    }
  });
  return closestIndex;
}

function getStepValueFromInput(steps, inputEl) {
  if (!inputEl) {
    return steps[0];
  }
  const rawIndex = Number.parseInt(inputEl.value, 10);
  const safeIndex = Number.isFinite(rawIndex)
    ? clamp(rawIndex, 0, steps.length - 1)
    : 0;
  return steps[safeIndex];
}

function loadAxisTuning() {
  let parsed = null;
  let shouldPersist = false;
  try {
    const stored = localStorage.getItem(axisTuningStorageKey);
    if (stored) {
      parsed = JSON.parse(stored);
    }
  } catch (err) {
    parsed = null;
  }
  if (parsed && typeof parsed === "object") {
    if (parsed.y && !parsed.z) {
      parsed.z = parsed.y;
      shouldPersist = true;
    }
  }
  const next = {};
  Object.keys(axisTuningDefaults).forEach((axis) => {
    const axisDefaults = axisTuningDefaults[axis];
    const axisData = parsed && typeof parsed === "object" ? parsed[axis] : null;
    const velocity = Number.parseFloat(axisData?.velocity);
    const accel = Number.parseFloat(axisData?.accel);
    next[axis] = {
      velocity: Number.isFinite(velocity) ? velocity : axisDefaults.velocity,
      accel: Number.isFinite(accel) ? accel : axisDefaults.accel,
    };
  });
  if (shouldPersist) {
    saveAxisTuning(next);
  }
  return next;
}

function saveAxisTuning(tuning) {
  try {
    localStorage.setItem(axisTuningStorageKey, JSON.stringify(tuning));
  } catch (err) {
    console.warn("axis tuning save failed", err);
  }
}

function syncAxisTuningStateFromInputs(tuning, controls) {
  controls.forEach((entry) => {
    const velocity = getStepValueFromInput(velocitySteps, entry.velInput);
    const accel = getStepValueFromInput(accelSteps, entry.accInput);
    tuning[entry.axis] = { velocity, accel };
  });
}

function setAxisControlValues(entry, tuning) {
  const axisData = tuning[entry.axis] || axisTuningDefaults[entry.axis];
  const velIndex = getClosestStepIndex(velocitySteps, axisData.velocity);
  const accIndex = getClosestStepIndex(accelSteps, axisData.accel);
  entry.velInput.value = velIndex;
  entry.velOutput.textContent = velocitySteps[velIndex].toString();
  entry.accInput.value = accIndex;
  entry.accOutput.textContent = accelSteps[accIndex].toString();
}

async function postAxisSetting(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch (err) {
      detail = "";
    }
    throw new Error(`axis settings ${response.status} ${detail}`.trim());
  }
  return response.json().catch(() => null);
}

async function applyAxisTuning(controls, tuning) {
  syncAxisTuningStateFromInputs(tuning, controls);
  saveAxisTuning(tuning);
  const requests = [];
  controls.forEach((entry) => {
    const axisData = tuning[entry.axis];
    if (!axisData) {
      return;
    }
    const velocity = Math.round(axisData.velocity);
    const accel = Math.round(axisData.accel);
    requests.push(postAxisSetting(maxVelocityUrl, { axis: entry.axis, sps: velocity }));
    requests.push(postAxisSetting(maxAccelUrl, { axis: entry.axis, sps2: accel }));
  });
  const results = await Promise.allSettled(requests);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    console.warn("axis tuning apply failed", failures);
  }
}

function setupAxisTuningControls() {
  if (!axisApplyButton) {
    return;
  }
  const hasAllControls = axisTuningControls.every(
    (entry) =>
      entry.velInput &&
      entry.velOutput &&
      entry.accInput &&
      entry.accOutput
  );
  if (!hasAllControls) {
    return;
  }
  axisTuningState = loadAxisTuning();
  axisTuningControls.forEach((entry) => {
    setAxisControlValues(entry, axisTuningState);
    entry.velInput.addEventListener("input", () => {
      const value = getStepValueFromInput(velocitySteps, entry.velInput);
      entry.velOutput.textContent = value.toString();
      axisTuningState[entry.axis].velocity = value;
      saveAxisTuning(axisTuningState);
    });
    entry.accInput.addEventListener("input", () => {
      const value = getStepValueFromInput(accelSteps, entry.accInput);
      entry.accOutput.textContent = value.toString();
      axisTuningState[entry.axis].accel = value;
      saveAxisTuning(axisTuningState);
    });
  });
  const applyLabel = axisApplyButton.textContent || "Apply";
  axisApplyButton.addEventListener("click", async () => {
    axisApplyButton.disabled = true;
    axisApplyButton.textContent = "Applying...";
    await applyAxisTuning(axisTuningControls, axisTuningState);
    axisApplyButton.disabled = false;
    axisApplyButton.textContent = applyLabel;
  });
}

function isDirectControlAvailable(status, homed) {
  if (!status) {
    return false;
  }
  const normalizedStatus = String(status).toLowerCase();
  return normalizedStatus === "ok" && Number(homed) === 1;
}

function updateHomeButtonState(homed) {
  if (!homeZButton) {
    return;
  }
  homeZButton.classList.toggle("is-homed", Number(homed) === 1);
}

function updateDirectControlAvailability(status, homed) {
  lastApiStatus = status;
  lastApiHomed = homed;
  if (Number(homed) === 1) {
    homingActive = false;
  }
  updateHomeButtonState(homed);
  if (!directControlToggle) {
    return;
  }
  const available = !scanState.active && isDirectControlAvailable(status, homed);
  directControlToggle.disabled = !available;
  if (directControlPanel) {
    directControlPanel.classList.toggle("is-disabled", !available);
  }
  if (!available && directControlToggle.checked) {
    directControlToggle.checked = false;
    stopDirectControlTimer();
  }
}

function normalizeDirectControlInterval() {
  if (!directControlIntervalInput) {
    return directControlDefaultIntervalSec;
  }
  const min = Number.parseFloat(directControlIntervalInput.min) || 1;
  const max = Number.parseFloat(directControlIntervalInput.max) || 60;
  let value = Number.parseFloat(directControlIntervalInput.value);
  if (!Number.isFinite(value)) {
    value = directControlDefaultIntervalSec;
  }
  value = clamp(value, min, max);
  directControlIntervalInput.value = value.toString();
  return value;
}

function getDirectControlIntervalMs() {
  return normalizeDirectControlInterval() * 1000;
}

function getMoveAbsPayload() {
  if (!zAxisInput || !xAxisInput || !pAxisInput || !rAxisInput) {
    return null;
  }
  const zVal = Number.parseFloat(zAxisInput.value);
  const xLeft = Number.parseFloat(xAxisInput.value);
  const pVal = Number.parseFloat(pAxisInput.value);
  const rVal = Number.parseFloat(rAxisInput.value);
  if (
    !Number.isFinite(zVal) ||
    !Number.isFinite(xLeft) ||
    !Number.isFinite(pVal) ||
    !Number.isFinite(rVal)
  ) {
    return null;
  }
  const posValues = sceneToPos(xLeft, zVal);
  if (!Number.isFinite(posValues.x) || !Number.isFinite(posValues.z)) {
    return null;
  }
  const pDisplay = (-pVal / 90) * 255;
  return {
    x: Math.round(posValues.x),
    z: Math.round(posValues.z),
    p: Math.round(pDisplay),
    r: Math.round(rVal),
  };
}

function moveAbsPayloadChanged(nextPayload, lastPayload) {
  if (!lastPayload) {
    return true;
  }
  return ["x", "z", "p", "r"].some(
    (key) => nextPayload[key] !== lastPayload[key]
  );
}

async function sendMoveAbs(payload) {
  const response = await fetch(moveAbsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch (err) {
      detail = "";
    }
    throw new Error(`moveabs ${response.status} ${detail}`.trim());
  }
  return response.json().catch(() => null);
}

async function directControlTick() {
  if (!directControlToggle || !directControlToggle.checked) {
    return;
  }
  if (!isDirectControlAvailable(lastApiStatus, lastApiHomed)) {
    return;
  }
  const payload = getMoveAbsPayload();
  if (!payload) {
    return;
  }
  if (!moveAbsPayloadChanged(payload, lastMoveAbsPayload)) {
    return;
  }
  try {
    await sendMoveAbs(payload);
    lastMoveAbsPayload = payload;
  } catch (err) {
    console.warn("direct control moveabs failed", err);
  }
}

function stopDirectControlTimer() {
  if (directControlTimer) {
    window.clearInterval(directControlTimer);
    directControlTimer = null;
  }
}

function startDirectControlTimer() {
  stopDirectControlTimer();
  if (!directControlToggle || !directControlToggle.checked) {
    return;
  }
  const intervalMs = getDirectControlIntervalMs();
  directControlTimer = window.setInterval(directControlTick, intervalMs);
  directControlTick();
}

function setupDirectControlPanel() {
  if (!directControlToggle) {
    return;
  }
  updateDirectControlAvailability(lastApiStatus, lastApiHomed);
  normalizeDirectControlInterval();
  directControlToggle.addEventListener("change", () => {
    if (directControlToggle.checked) {
      lastMoveAbsPayload = null;
      startDirectControlTimer();
      return;
    }
    stopDirectControlTimer();
  });
  if (directControlIntervalInput) {
    directControlIntervalInput.addEventListener("change", () => {
      normalizeDirectControlInterval();
      if (directControlToggle.checked) {
        startDirectControlTimer();
      }
    });
  }
}

function normalizePointCloudSeconds() {
  if (!pointCloudSecondsInput) {
    return 30;
  }
  const min = Number.parseFloat(pointCloudSecondsInput.min) || 1;
  const max = Number.parseFloat(pointCloudSecondsInput.max) || 300;
  let value = Number.parseFloat(pointCloudSecondsInput.value);
  if (!Number.isFinite(value)) {
    value = 30;
  }
  value = clamp(value, min, max);
  const rounded = Math.round(value);
  pointCloudSecondsInput.value = rounded.toString();
  return rounded;
}

function setPointCloudStatus(message, isError = false) {
  if (!pointCloudStatus) {
    return;
  }
  pointCloudStatus.textContent = message || "";
  pointCloudStatus.classList.toggle("is-error", Boolean(message) && isError);
}

function syncPointCloudControls() {
  const isBusy = pointCloudState.active || pointCloudState.starting;
  if (pointCloudStartButton) {
    if (!pointCloudStartButton.dataset.label) {
      pointCloudStartButton.dataset.label = pointCloudStartButton.textContent || "Start";
    }
    if (pointCloudState.starting) {
      pointCloudStartButton.textContent = "Starting...";
    } else if (pointCloudState.active) {
      pointCloudStartButton.textContent = "Measuring...";
    } else {
      pointCloudStartButton.textContent = pointCloudStartButton.dataset.label;
    }
    pointCloudStartButton.disabled = isBusy;
    pointCloudStartButton.classList.toggle("is-running", pointCloudState.active);
  }
  if (pointCloudStopButton) {
    pointCloudStopButton.disabled = !pointCloudState.active;
  }
  if (pointCloudSecondsInput) {
    pointCloudSecondsInput.disabled = isBusy;
  }
}

function getMeasurementAngleRad() {
  const apiAngleRad = apiPToAngleRad(lastApiP);
  if (Number.isFinite(apiAngleRad)) {
    return apiAngleRad;
  }
  return getPAxisAngleRad();
}

function getMeasurementRotationRad() {
  if (lastApiRaw && Number.isFinite(lastApiRaw.r)) {
    return THREE.MathUtils.degToRad(rPosToDegrees(lastApiRaw.r));
  }
  if (rAxisInput) {
    const rVal = Number.parseFloat(rAxisInput.value);
    if (Number.isFinite(rVal)) {
      return THREE.MathUtils.degToRad(rPosToDegrees(rVal));
    }
  }
  return 0;
}

function rotatePointAroundYAxis(target, pivot, angleRad) {
  if (!target || !pivot || !Number.isFinite(angleRad)) {
    return;
  }
  if (angleRad === 0) {
    return;
  }
  const dx = target.x - pivot.x;
  const dz = target.z - pivot.z;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  target.x = pivot.x + dx * cos - dz * sin;
  target.z = pivot.z + dx * sin + dz * cos;
}

function getMeasurementBasePosition(target) {
  if (!target) {
    return null;
  }
  let baseX = 0;
  let baseY = 0;
  if (lastApiScene && Number.isFinite(lastApiScene.x) && Number.isFinite(lastApiScene.y)) {
    baseX = lastApiScene.x;
    baseY = lastApiScene.y;
  } else {
    const xLeft = xAxisInput ? Number.parseFloat(xAxisInput.value) : 0;
    const zVal = zAxisInput ? Number.parseFloat(zAxisInput.value) : 0;
    baseX = Number.isFinite(xLeft) ? xLeft : 0;
    baseY = Number.isFinite(zVal) ? zVal : 0;
  }
  const angleRad = getMeasurementAngleRad();
  const safeAngle = Number.isFinite(angleRad) ? angleRad : 0;
  target.set(
    baseX + armLength * Math.cos(safeAngle),
    baseY + armLength * Math.sin(safeAngle),
    0
  );
  return target;
}

function getMeasurementOrigin(target) {
  if (!target) {
    return null;
  }
  getMeasurementBasePosition(target);
  const angleRad = getMeasurementAngleRad();
  const safeAngle = Number.isFinite(angleRad) ? angleRad : 0;
  measurementOffsetRotated.copy(measurementOffset);
  if (safeAngle !== 0) {
    measurementOffsetRotated.applyAxisAngle(measurementOffsetAxis, safeAngle);
  }
  target.add(measurementOffsetRotated);
  return target;
}

function updateLaserGuide() {
  if (!laserGuideGroup.visible) {
    return;
  }
  const angleRad = getMeasurementAngleRad();
  if (!Number.isFinite(angleRad)) {
    return;
  }
  getMeasurementOrigin(measurementOrigin);
  measurementOrigin.z += laserGuideOutOfPlaneOffset;
  measurementDirection.set(Math.cos(angleRad), Math.sin(angleRad), 0);
  measurementEnd.copy(measurementOrigin).addScaledVector(
    measurementDirection,
    measurementLaserLength
  );
  laserGuideDot.position.copy(measurementOrigin);
  laserGuideLine.geometry.setFromPoints([measurementOrigin, measurementEnd]);
  laserGuideLine.geometry.computeBoundingSphere();
}

function updatePointCloudRotation() {
  if (!pointCloudGroup) {
    return;
  }
  const rotationRad = getMeasurementRotationRad() * pointCloudRotationSign;
  pointCloudGroup.rotation.y = Number.isFinite(rotationRad) ? rotationRad : 0;
}

function addPointCloudSample(rangeMm) {
  if (!Number.isFinite(rangeMm) || rangeMm <= 0) {
    return;
  }
  const angleRad = getMeasurementAngleRad();
  if (!Number.isFinite(angleRad)) {
    return;
  }
  if (pointCloudMesh.count >= pointCloudMaxPoints) {
    setPointCloudStatus("Point cloud limit reached.", true);
    return;
  }
  getMeasurementOrigin(measurementOrigin);
  measurementDirection.set(Math.cos(angleRad), Math.sin(angleRad), 0);
  measurementEnd.copy(measurementOrigin).addScaledVector(measurementDirection, rangeMm);
  updatePointCloudRotation();
  measurementLocal.copy(measurementEnd);
  if (pointCloudGroup) {
    pointCloudGroup.updateMatrixWorld();
    pointCloudGroup.worldToLocal(measurementLocal);
  }
  pointCloudDummy.position.copy(measurementLocal);
  pointCloudDummy.updateMatrix();
  pointCloudMesh.setMatrixAt(pointCloudMesh.count, pointCloudDummy.matrix);
  pointCloudMesh.count += 1;
  pointCloudMesh.instanceMatrix.needsUpdate = true;
}

function clearPointCloud() {
  pointCloudMesh.count = 0;
  pointCloudMesh.instanceMatrix.needsUpdate = true;
}

function normalizeRangeError(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return value === 0 ? null : value;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number.parseFloat(trimmed);
  if (Number.isFinite(numeric) && numeric === 0) {
    return null;
  }
  return trimmed;
}

function parseRangeFromText(text) {
  if (typeof text !== "string") {
    return { rangeMm: null, rangeErr: null };
  }
  let rangeMm = null;
  let rangeErr = null;
  const rangeMatch = /range_mm\s*[:=]\s*(-?\d+(?:\.\d+)?)/i.exec(text);
  if (rangeMatch) {
    const parsed = Number.parseFloat(rangeMatch[1]);
    rangeMm = Number.isFinite(parsed) ? parsed : null;
  }
  const errMatch = /range\.err\s*[:=]\s*([^\s]+)/i.exec(text);
  if (errMatch) {
    rangeErr = errMatch[1];
  }
  return { rangeMm, rangeErr };
}

function parseRangePayload(payload, rawText) {
  let rangeMm = null;
  let rangeErr = null;
  if (payload && typeof payload === "object") {
    const metrics = payload.metrics && typeof payload.metrics === "object" ? payload.metrics : null;
    if (metrics) {
      rangeMm = readNumeric(metrics.range_mm);
      if (Object.prototype.hasOwnProperty.call(metrics, "range.err")) {
        rangeErr = metrics["range.err"];
      }
    }
    const lineText = typeof payload.line === "string" ? payload.line : "";
    if (lineText) {
      const parsed = parseRangeFromText(lineText);
      if (rangeMm === null && parsed.rangeMm !== null) {
        rangeMm = parsed.rangeMm;
      }
      if (rangeErr === null && parsed.rangeErr !== null) {
        rangeErr = parsed.rangeErr;
      }
    }
  }
  if (rangeMm === null || rangeErr === null) {
    const parsed = parseRangeFromText(rawText);
    if (rangeMm === null && parsed.rangeMm !== null) {
      rangeMm = parsed.rangeMm;
    }
    if (rangeErr === null && parsed.rangeErr !== null) {
      rangeErr = parsed.rangeErr;
    }
  }
  return { rangeMm, rangeErr: normalizeRangeError(rangeErr) };
}

function closePointCloudSocket() {
  if (!pointCloudState.socket) {
    return;
  }
  const socket = pointCloudState.socket;
  pointCloudState.closing = true;
  pointCloudState.socket = null;
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close();
  }
}

function handlePointCloudMessage(event) {
  if (!pointCloudState.active) {
    return;
  }
  let payload = null;
  if (typeof event.data === "string") {
    try {
      payload = JSON.parse(event.data);
    } catch (err) {
      payload = null;
    }
  }
  const { rangeMm, rangeErr } = parseRangePayload(payload, event.data);
  if (Number.isFinite(rangeMm)) {
    addPointCloudSample(rangeMm);
  }
  if (rangeErr !== null) {
    setPointCloudStatus(`Range error ${rangeErr}.`, true);
  }
}

function openPointCloudSocket() {
  closePointCloudSocket();
  let socket;
  try {
    socket = new WebSocket(measureSocketUrl);
  } catch (err) {
    setPointCloudStatus("WebSocket unavailable.", true);
    return false;
  }
  pointCloudState.socket = socket;
  socket.addEventListener("message", handlePointCloudMessage);
  socket.addEventListener("error", () => {
    if (pointCloudState.active) {
      setPointCloudStatus("WebSocket error.", true);
    }
  });
  socket.addEventListener("close", () => {
    const closing = pointCloudState.closing;
    pointCloudState.socket = null;
    pointCloudState.closing = false;
    if (pointCloudState.active && !closing) {
      pointCloudState.active = false;
      syncPointCloudControls();
      setPointCloudStatus("Stream closed.", true);
    }
  });
  return true;
}

async function postMeasure(axis, seconds) {
  const response = await fetch(measureUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ axis, seconds }),
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch (err) {
      detail = "";
    }
    throw new Error(`measure ${response.status} ${detail}`.trim());
  }
  return response.json().catch(() => null);
}

function schedulePointCloudStop(seconds) {
  if (pointCloudState.stopTimer) {
    window.clearTimeout(pointCloudState.stopTimer);
  }
  const durationMs = Math.max(0, seconds) * 1000 + 250;
  pointCloudState.stopTimer = window.setTimeout(() => {
    pointCloudState.stopTimer = null;
    stopPointCloudMeasurement({ manual: false });
  }, durationMs);
}

async function startPointCloudMeasurement() {
  if (pointCloudState.active || pointCloudState.starting) {
    return;
  }
  pointCloudState.starting = true;
  syncPointCloudControls();
  setPointCloudStatus("Starting measurement...");
  const seconds = normalizePointCloudSeconds();
  try {
    await postMeasure(measureAxis, seconds);
  } catch (err) {
    pointCloudState.starting = false;
    syncPointCloudControls();
    setPointCloudStatus("Measurement start failed.", true);
    return;
  }
  pointCloudState.starting = false;
  pointCloudState.active = true;
  syncPointCloudControls();
  setPointCloudStatus("Collecting samples...");
  const opened = openPointCloudSocket();
  if (!opened) {
    pointCloudState.active = false;
    syncPointCloudControls();
    return;
  }
  schedulePointCloudStop(seconds);
}

async function stopPointCloudMeasurement({ manual = true } = {}) {
  if (pointCloudState.stopTimer) {
    window.clearTimeout(pointCloudState.stopTimer);
    pointCloudState.stopTimer = null;
  }
  if (!pointCloudState.active && !pointCloudState.starting) {
    syncPointCloudControls();
    return;
  }
  pointCloudState.active = false;
  pointCloudState.starting = false;
  syncPointCloudControls();
  closePointCloudSocket();
  if (manual) {
    try {
      await postStopAxis(measureAxis);
    } catch (err) {
      setPointCloudStatus("Stop failed.", true);
      return;
    }
    setPointCloudStatus("Measurement stopped.");
    return;
  }
  setPointCloudStatus("Measurement complete.");
}

function setupPointCloudControls() {
  if (!pointCloudPanel) {
    return;
  }
  normalizePointCloudSeconds();
  syncPointCloudControls();
  setPointCloudStatus("Ready.");
  if (pointCloudSecondsInput) {
    pointCloudSecondsInput.addEventListener("change", () => {
      normalizePointCloudSeconds();
    });
  }
  if (pointCloudStartButton) {
    pointCloudStartButton.addEventListener("click", startPointCloudMeasurement);
  }
  if (pointCloudStopButton) {
    pointCloudStopButton.addEventListener("click", () => {
      stopPointCloudMeasurement({ manual: true });
    });
  }
  if (pointCloudClearButton) {
    pointCloudClearButton.addEventListener("click", () => {
      clearPointCloud();
      setPointCloudStatus("Point cloud cleared.");
    });
  }
  if (pointCloudLaserToggle) {
    laserGuideGroup.visible = pointCloudLaserToggle.checked;
    pointCloudLaserToggle.addEventListener("change", () => {
      laserGuideGroup.visible = pointCloudLaserToggle.checked;
      updateLaserGuide();
    });
  }
  updateLaserGuide();
}

const scanMoveTolerance = 1.5;
const scanRotateTolerance = 10;
const scanMoveTimeoutMs = 20000;
const scanRotateTimeoutMs = 25000;
const scanPollIntervalMs = 60;
const scanPausePollIntervalMs = 120;

function readScanRangeValue(inputEl, fallback) {
  if (!inputEl) {
    return fallback;
  }
  const raw = Number.parseFloat(inputEl.value);
  if (!Number.isFinite(raw)) {
    inputEl.value = fallback.toString();
    return fallback;
  }
  const next = clampInputValue(raw, inputEl);
  inputEl.value = next.toString();
  return next;
}

function readScanNumberValue(inputEl, fallback) {
  if (!inputEl) {
    return fallback;
  }
  const raw = Number.parseInt(inputEl.value, 10);
  let next = Number.isFinite(raw) ? raw : fallback;
  const min = Number.parseInt(inputEl.min, 10);
  const max = Number.parseInt(inputEl.max, 10);
  if (Number.isFinite(min)) {
    next = Math.max(min, next);
  }
  if (Number.isFinite(max)) {
    next = Math.min(max, next);
  }
  inputEl.value = next.toString();
  return next;
}

function updateScanOutputs(settings) {
  if (scanRadiusVal) {
    scanRadiusVal.textContent = settings.radius.toFixed(0);
  }
}

function getScanSettings() {
  const radius = readScanRangeValue(scanRadiusInput, scanDefaults.radius);
  const waypoints = readScanNumberValue(scanWaypointsInput, scanDefaults.waypoints);
  const repeats = readScanNumberValue(scanRepeatsInput, scanDefaults.repeats);
  const startDirection = scanStartDirectionInput
    ? scanStartDirectionInput.value
    : scanDefaults.startDirection;
  return {
    radius,
    waypoints,
    repeats,
    startDirection,
  };
}

function getAxisBounds() {
  const xMin = xAxisInput ? Number.parseFloat(xAxisInput.min) : 0;
  const xMax = xAxisInput ? Number.parseFloat(xAxisInput.max) : 0;
  const zMin = zAxisInput ? Number.parseFloat(zAxisInput.min) : 0;
  const zMax = zAxisInput ? Number.parseFloat(zAxisInput.max) : 0;
  return {
    xMin: Number.isFinite(xMin) ? xMin : 0,
    xMax: Number.isFinite(xMax) ? xMax : 0,
    zMin: Number.isFinite(zMin) ? zMin : 0,
    zMax: Number.isFinite(zMax) ? zMax : 0,
  };
}

function buildNominalArcPoints(radius) {
  if (!Number.isFinite(radius) || radius <= 0) {
    return { points: [], sweep: 0 };
  }
  const startAngle = 0;
  const endAngle = Math.PI / 2;
  const sweep = endAngle - startAngle;
  const span = Math.abs(endAngle - startAngle);
  const sampleCount = Math.max(64, Math.ceil((span * 180) / Math.PI));
  const points = [];
  for (let i = 0; i <= sampleCount; i += 1) {
    const t = sampleCount === 0 ? 0 : i / sampleCount;
    const angle = startAngle + (endAngle - startAngle) * t;
    points.push({
      x: scanOrigin.x + radius * Math.cos(angle),
      y: scanOrigin.y + radius * Math.sin(angle),
    });
  }
  return { points, sweep };
}

function clampPathPoints(points, bounds) {
  const clamped = [];
  points.forEach((point) => {
    const x = clamp(point.x, bounds.xMin, bounds.xMax);
    const zVal = clamp(point.y, bounds.zMin, bounds.zMax);
    const prev = clamped[clamped.length - 1];
    if (!prev || Math.hypot(x - prev.x, zVal - prev.y) > 0.001) {
      clamped.push({ x, y: zVal });
    }
  });
  return clamped;
}

function resamplePathPoints(points, count) {
  if (!points.length) {
    return [];
  }
  if (count <= 1) {
    return [{ x: points[0].x, y: points[0].y }];
  }
  if (points.length === 1) {
    return Array.from({ length: count }, () => ({ x: points[0].x, y: points[0].y }));
  }
  const distances = [0];
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    distances.push(distances[i - 1] + Math.hypot(dx, dy));
  }
  const total = distances[distances.length - 1];
  if (total <= 0) {
    return Array.from({ length: count }, () => ({ x: points[0].x, y: points[0].y }));
  }
  const step = total / (count - 1);
  const sampled = [];
  let segmentIndex = 1;
  for (let i = 0; i < count; i += 1) {
    const target = step * i;
    while (
      segmentIndex < distances.length - 1 &&
      distances[segmentIndex] < target
    ) {
      segmentIndex += 1;
    }
    const prevDist = distances[segmentIndex - 1];
    const nextDist = distances[segmentIndex];
    const span = nextDist - prevDist;
    const ratio = span > 0 ? (target - prevDist) / span : 0;
    const prevPoint = points[segmentIndex - 1];
    const nextPoint = points[segmentIndex];
    sampled.push({
      x: prevPoint.x + (nextPoint.x - prevPoint.x) * ratio,
      y: prevPoint.y + (nextPoint.y - prevPoint.y) * ratio,
    });
  }
  return sampled;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "--";
  }
  const totalSeconds = Math.round(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutesTotal = Math.floor(totalSeconds / 60);
  const minutes = minutesTotal % 60;
  const hours = Math.floor(minutesTotal / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function getAverageStepDuration() {
  if (!scanProgressState.stepDurations.length) {
    return null;
  }
  const sum = scanProgressState.stepDurations.reduce((total, value) => total + value, 0);
  return sum / scanProgressState.stepDurations.length;
}

function updateScanProgressUI() {
  if (!scanProgressText || !scanProgressFill || !scanEstimateText) {
    return;
  }
  const total = scanProgressState.totalSteps;
  const completed = scanProgressState.completedSteps;
  const percent = total > 0 ? (completed / total) * 100 : 0;
  const clampedPercent = clamp(percent, 0, 100);
  scanProgressFill.style.width = `${clampedPercent.toFixed(1)}%`;
  if (total > 0) {
    scanProgressText.textContent = `${Math.round(clampedPercent)}% (${completed}/${total})`;
  } else {
    scanProgressText.textContent = "0%";
  }
  const avg = getAverageStepDuration();
  if (avg && total > 0) {
    scanEstimateText.textContent = formatDuration(avg * total);
  } else {
    scanEstimateText.textContent = "--";
  }
}

function resetScanProgress(totalSteps) {
  scanProgressState.totalSteps = Math.max(0, totalSteps);
  scanProgressState.completedSteps = 0;
  scanProgressState.stepDurations = [];
  updateScanProgressUI();
}

function recordScanStep(durationMs) {
  if (Number.isFinite(durationMs) && durationMs > 0) {
    scanProgressState.stepDurations.push(durationMs);
    if (scanProgressState.stepDurations.length > scanEstimateWindow) {
      scanProgressState.stepDurations.shift();
    }
  }
  scanProgressState.completedSteps = Math.min(
    scanProgressState.totalSteps,
    scanProgressState.completedSteps + 1
  );
  updateScanProgressUI();
}

function updateWaypointMarkers(points) {
  if (!waypointMarkerGroup) {
    return;
  }
  const count = points.length;
  while (waypointMarkerGroup.children.length < count) {
    const marker = new THREE.Mesh(waypointMarkerGeometry, waypointMarkerMaterial);
    setShadow(marker);
    waypointMarkerGroup.add(marker);
  }
  while (waypointMarkerGroup.children.length > count) {
    const marker = waypointMarkerGroup.children[waypointMarkerGroup.children.length - 1];
    if (marker) {
      waypointMarkerGroup.remove(marker);
    }
  }
  for (let i = 0; i < count; i += 1) {
    const marker = waypointMarkerGroup.children[i];
    const point = points[i];
    marker.position.set(point.x, point.y, 0);
  }
}

function updateScanPreview() {
  if (!scanRadiusInput) {
    return;
  }
  const settings = getScanSettings();
  updateScanOutputs(settings);
  const bounds = getAxisBounds();
  const nominal = buildNominalArcPoints(settings.radius);
  const clamped = clampPathPoints(nominal.points, bounds);
  scanWaypoints = resamplePathPoints(clamped, settings.waypoints);
  updateWaypointMarkers(scanWaypoints);

  const points = clamped.length ? clamped : [scanOrigin, scanOrigin];
  if (scanPathGeometry) {
    const positions = new Float32Array(points.length * 3);
    points.forEach((point, index) => {
      const offset = index * 3;
      positions[offset] = point.x;
      positions[offset + 1] = point.y;
      positions[offset + 2] = 0;
    });
    scanPathGeometry.setPositions(positions);
    if (scanPathLine && scanPathLine.computeLineDistances) {
      scanPathLine.computeLineDistances();
    }
    if (scanPathGlow && scanPathGlow.computeLineDistances) {
      scanPathGlow.computeLineDistances();
    }
  } else if (scanPathLine) {
    const vectors = points.map((point) => new THREE.Vector3(point.x, point.y, 0));
    scanPathLine.geometry.setFromPoints(vectors);
  }
}

function deflectionToPDisplay(deflection) {
  return (-deflection / 90) * 255;
}

function getLockOriginDeflection(xVal, zVal) {
  const desiredAngle = angleToOrigin(xVal, zVal);
  return angleToDeflection(desiredAngle);
}

function setAxisInputsFromScan(point, deflection, rPos, shouldUpdateScene = true) {
  if (xAxisInput) {
    xAxisInput.value = point.x.toFixed(1);
  }
  if (zAxisInput) {
    zAxisInput.value = point.y.toFixed(1);
  }
  if (pAxisInput) {
    pAxisInput.value = deflection.toFixed(1);
  }
  if (rAxisInput) {
    rAxisInput.value = Math.round(rPos).toString();
  }
  if (shouldUpdateScene) {
    updateScene();
  }
}

function applyDryRunState(point, deflection, rPos) {
  const pos = sceneToPos(point.x, point.y);
  const pDisplay = clamp(deflectionToPDisplay(deflection), -255, 255);
  const raw = {
    x: Math.round(pos.x),
    z: Math.round(pos.z),
    y: null,
    p: Math.round(pDisplay),
    r: Math.round(rPos),
  };
  lastApiScene = { x: point.x, y: point.y, z: 0 };
  lastApiRaw = raw;
  lastApiP = raw.p;
  if (apiMarker) {
    apiMarker.position.set(point.x, point.y, 0);
    apiMarker.visible = true;
  }
  updateApiReadout(raw, "dry-run");
}

function getCurrentRPos() {
  if (lastApiRaw && Number.isFinite(lastApiRaw.r)) {
    return lastApiRaw.r;
  }
  if (!rAxisInput) {
    return 0;
  }
  const raw = Number.parseFloat(rAxisInput.value);
  return Number.isFinite(raw) ? raw : 0;
}

function ensureRInputMax(value) {
  if (!rAxisInput) {
    return;
  }
  const currentMax = Number.parseFloat(rAxisInput.max);
  if (Number.isFinite(currentMax) && value > currentMax) {
    rAxisInput.max = Math.ceil(value).toString();
  }
}

function updateScanActionButtons() {
  if (scanStartButton) {
    scanStartButton.classList.toggle("is-hidden", scanState.active);
  }
  if (scanRunControls) {
    scanRunControls.classList.toggle("is-visible", scanState.active);
  }
  if (scanPauseButton) {
    scanPauseButton.disabled = !scanState.active;
    scanPauseButton.textContent = scanState.paused ? "Resume" : "Pause";
  }
  if (scanStopButton) {
    scanStopButton.disabled = !scanState.active;
  }
}

function setScanPauseState(paused) {
  scanState.paused = paused;
  updateScanActionButtons();
}

function stopScanSequence() {
  if (!scanState.active) {
    return;
  }
  scanState.active = false;
  scanState.paused = false;
  if (scanStartButton) {
    scanStartButton.classList.remove("is-running");
  }
  setScanModeActive(false);
}

function setScanInputsDisabled(disabled) {
  [
    scanRadiusInput,
    scanWaypointsInput,
    scanRepeatsInput,
    scanStartDirectionInput,
    scanDryRunInput,
    scanStartCenterInput,
  ].forEach((input) => {
    if (input) {
      input.disabled = disabled;
    }
  });
}

function setScanModeActive(active) {
  scanState.active = active;
  if (!active) {
    scanState.paused = false;
  }
  if (!active) {
    scanState.dryRun = false;
  }
  setScanInputsDisabled(active);
  if (scanStartButton) {
    scanStartButton.disabled = active;
    scanStartButton.textContent = active ? "Scanning..." : "Start Scan";
    if (!active) {
      scanStartButton.classList.remove("is-error");
    }
  }
  updateScanActionButtons();
  if (lockOriginInput) {
    if (active) {
      scanState.previousLockOrigin = lockOriginInput.checked;
      lockOriginInput.checked = true;
      lockOriginInput.disabled = true;
    } else {
      lockOriginInput.disabled = false;
      if (scanState.previousLockOrigin !== null) {
        lockOriginInput.checked = scanState.previousLockOrigin;
      }
      scanState.previousLockOrigin = null;
    }
  }
  if (directControlIntervalInput) {
    directControlIntervalInput.disabled = active;
  }
  if (directControlToggle) {
    if (active) {
      scanState.previousDirectControl = directControlToggle.checked;
      directControlToggle.checked = false;
      stopDirectControlTimer();
    }
  }
  if (rAxisInput) {
    if (active) {
      if (scanState.previousRMax === null) {
        const maxVal = Number.parseFloat(rAxisInput.max);
        scanState.previousRMax = Number.isFinite(maxVal) ? maxVal : null;
      }
    } else if (scanState.previousRMax !== null) {
      rAxisInput.max = scanState.previousRMax.toString();
      scanState.previousRMax = null;
    }
  }
  updateDirectControlAvailability(lastApiStatus, lastApiHomed);
  if (!active && directControlToggle) {
    if (scanState.previousDirectControl && !directControlToggle.disabled) {
      directControlToggle.checked = true;
      startDirectControlTimer();
    }
    scanState.previousDirectControl = null;
  }
  updateScene();
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForScanResume() {
  while (scanState.active && scanState.paused) {
    await sleep(scanPausePollIntervalMs);
  }
  return scanState.active;
}

async function waitForMove(target, timeoutMs) {
  const start = performance.now();
  let sawActive = false;
  while (performance.now() - start < timeoutMs) {
    if (!scanState.active) {
      return false;
    }
    if (scanState.paused) {
      const resumed = await waitForScanResume();
      if (!resumed) {
        return false;
      }
      continue;
    }
    let withinTolerance = false;
    if (lastApiScene) {
      const dx = lastApiScene.x - target.x;
      const dy = lastApiScene.y - target.y;
      withinTolerance = Math.hypot(dx, dy) <= scanMoveTolerance;
    }
    if (withinTolerance) {
      return true;
    }
    const coordState = await fetchCoordStatusState();
    if (coordState === "queued" || coordState === "running") {
      sawActive = true;
    }
    if (coordState === "idle" && sawActive) {
      return true;
    }
    await sleep(scanPollIntervalMs);
  }
  return false;
}

async function waitForRotation(targetR, timeoutMs) {
  const start = performance.now();
  let sawActive = false;
  while (performance.now() - start < timeoutMs) {
    if (!scanState.active) {
      return false;
    }
    if (scanState.paused) {
      const resumed = await waitForScanResume();
      if (!resumed) {
        return false;
      }
      continue;
    }
    let withinTolerance = false;
    if (lastApiRaw && Number.isFinite(lastApiRaw.r)) {
      const delta = Math.abs(lastApiRaw.r - targetR);
      withinTolerance = delta <= scanRotateTolerance;
    }
    if (withinTolerance) {
      return true;
    }
    const coordState = await fetchCoordStatusState();
    if (coordState === "queued" || coordState === "running") {
      sawActive = true;
    }
    if (coordState === "idle" && sawActive) {
      return true;
    }
    await sleep(scanPollIntervalMs);
  }
  return false;
}

async function executeWaypoint(point, currentR, rotationDirection = 1) {
  const stepStart = performance.now();
  const deflection = getLockOriginDeflection(point.x, point.y);
  const pos = sceneToPos(point.x, point.y);
  const pDisplay = clamp(deflectionToPDisplay(deflection), -255, 255);
  if (scanState.dryRun) {
    if (!(await waitForScanResume())) {
      return currentR;
    }
    setAxisInputsFromScan(point, deflection, currentR, false);
    applyDryRunState(point, deflection, currentR);
    updateScene();
    await sleep(scanPollIntervalMs);
    const nextR = currentR + rotationDirection * rAxisPosPerRev;
    ensureRInputMax(nextR);
    if (!(await waitForScanResume())) {
      return currentR;
    }
    setAxisInputsFromScan(point, deflection, nextR, false);
    applyDryRunState(point, deflection, nextR);
    updateScene();
    await sleep(scanPollIntervalMs);
    recordScanStep(performance.now() - stepStart);
    return nextR;
  }
  if (!(await waitForScanResume())) {
    return currentR;
  }
  const payload = {
    x: Math.round(pos.x),
    z: Math.round(pos.z),
    p: Math.round(pDisplay),
    r: Math.round(currentR),
  };
  const nextR = currentR + rotationDirection * rAxisPosPerRev;
  ensureRInputMax(nextR);
  const rotatePayload = { ...payload, r: Math.round(nextR) };
  await sendMoveAbs(payload);
  setAxisInputsFromScan(point, deflection, currentR);
  const reached = await waitForMove(point, scanMoveTimeoutMs);
  if (!reached) {
    if (!scanState.active) {
      return currentR;
    }
    console.warn("scan waypoint move timed out", payload);
  }
  if (!(await waitForScanResume())) {
    return currentR;
  }
  await sendMoveAbs(rotatePayload);
  setAxisInputsFromScan(point, deflection, nextR);
  const rotated = await waitForRotation(nextR, scanRotateTimeoutMs);
  if (!rotated) {
    if (!scanState.active) {
      return currentR;
    }
    console.warn("scan rotation timed out", rotatePayload);
  }
  recordScanStep(performance.now() - stepStart);
  return nextR;
}

async function runWaypointPass(waypoints, startR, rotationDirection) {
  let currentR = startR;
  for (const point of waypoints) {
    if (!scanState.active) {
      break;
    }
    currentR = await executeWaypoint(point, currentR, rotationDirection);
  }
  return currentR;
}

async function startScanSequence() {
  if (scanState.active || !scanStartButton) {
    return;
  }
  const isDryRun = scanDryRunInput ? scanDryRunInput.checked : false;
  const startAtCenter = scanStartCenterInput ? scanStartCenterInput.checked : true;
  if (!isDryRun && !isDirectControlAvailable(lastApiStatus, lastApiHomed)) {
    scanStartButton.classList.add("is-error");
    scanStartButton.textContent = "API Offline";
    window.setTimeout(() => {
      if (!scanState.active) {
        scanStartButton.textContent = "Start Scan";
        scanStartButton.classList.remove("is-error");
      }
    }, 1200);
    return;
  }
  updateScanPreview();
  const settings = getScanSettings();
  if (!scanWaypoints.length) {
    return;
  }
  const forward = settings.startDirection === "reverse"
    ? [...scanWaypoints].reverse()
    : [...scanWaypoints];
  const reverse = [...forward].reverse();
  const reversePass = reverse.length > 1 ? reverse.slice(1) : reverse;
  const forwardPassLoop = forward.length > 1 ? forward.slice(1) : forward;
  const centerIndex = startAtCenter ? Math.floor(forward.length / 2) : 0;
  const forwardPassFirst = startAtCenter ? forward.slice(centerIndex) : forward;
  const firstCycleSteps = forwardPassFirst.length + reversePass.length;
  const loopCycleSteps = forwardPassLoop.length + reversePass.length;
  const totalSteps = firstCycleSteps + Math.max(0, settings.repeats - 1) * loopCycleSteps;
  resetScanProgress(totalSteps);
  scanState.dryRun = isDryRun;
  setScanModeActive(true);
  scanStartButton.classList.add("is-running");
  let currentR = getCurrentRPos();
  try {
    for (let cycle = 0; cycle < settings.repeats; cycle += 1) {
      const forwardPass = cycle === 0 ? forwardPassFirst : forwardPassLoop;
      currentR = await runWaypointPass(forwardPass, currentR, 1);
      currentR = await runWaypointPass(reversePass, currentR, -1);
    }
  } catch (err) {
    console.warn("scan sequence failed", err);
  } finally {
    scanStartButton.classList.remove("is-running");
    scanState.dryRun = false;
    setScanModeActive(false);
  }
}

function setupScanControls() {
  if (!scanPanel) {
    return;
  }
  updateScanPreview();
  updateScanProgressUI();
  updateScanActionButtons();
  if (scanRadiusInput) {
    scanRadiusInput.addEventListener("input", updateScanPreview);
  }
  if (scanWaypointsInput) {
    scanWaypointsInput.addEventListener("input", updateScanPreview);
  }
  if (scanRepeatsInput) {
    scanRepeatsInput.addEventListener("input", () => {
      readScanNumberValue(scanRepeatsInput, scanDefaults.repeats);
    });
  }
  if (scanStartDirectionInput) {
    scanStartDirectionInput.addEventListener("change", updateScanPreview);
  }
  if (scanStartButton) {
    scanStartButton.addEventListener("click", startScanSequence);
  }
  if (scanPauseButton) {
    scanPauseButton.addEventListener("click", () => {
      if (!scanState.active) {
        return;
      }
      setScanPauseState(!scanState.paused);
    });
  }
  if (scanStopButton) {
    scanStopButton.addEventListener("click", () => {
      stopScanSequence();
    });
  }
}

const driverAxes = ["x1", "x2", "z", "r"];
const stopAxes = ["x", "z", "p", "r", "x1", "x2"];
let popupZIndex = 6;
let emergencyStopInFlight = false;
let homeZInFlight = false;

function clearElement(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function formatPopupValue(value) {
  if (value === null || value === undefined) {
    return "--";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function findAxisContainer(payload, axes) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (axes.some((axis) => Object.prototype.hasOwnProperty.call(payload, axis))) {
    return payload;
  }
  const candidates = ["axes", "axis", "data", "result", "payload", "drivers"];
  for (const key of candidates) {
    const candidate = payload[key];
    if (candidate && typeof candidate === "object") {
      if (axes.some((axis) => Object.prototype.hasOwnProperty.call(candidate, axis))) {
        return candidate;
      }
    }
  }
  return null;
}

function renderDriverPayload(body, payload, title) {
  clearElement(body);
  const axisContainer = findAxisContainer(payload, driverAxes);
  if (!axisContainer) {
    const fallback = document.createElement("div");
    fallback.className = "popup-value";
    const fallbackText =
      payload === null || payload === undefined
        ? `${title} returned no data.`
        : typeof payload === "string"
          ? payload
          : JSON.stringify(payload, null, 2);
    fallback.textContent = fallbackText;
    body.append(fallback);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "popup-grid";
  driverAxes.forEach((axis) => {
    const row = document.createElement("div");
    row.className = "popup-row";
    const label = document.createElement("div");
    label.className = "popup-axis";
    label.textContent = axis.toUpperCase();
    const value = document.createElement("pre");
    value.className = "popup-value";
    value.textContent = formatPopupValue(axisContainer[axis]);
    row.append(label, value);
    grid.append(row);
  });
  body.append(grid);
}

function positionPopup(popup) {
  if (!viewport) {
    return;
  }
  const bounds = viewport.getBoundingClientRect();
  const rect = popup.getBoundingClientRect();
  const left = clamp((bounds.width - rect.width) / 2, 12, bounds.width - rect.width - 12);
  const top = clamp(bounds.height * 0.18, 12, bounds.height - rect.height - 12);
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function makePopupDraggable(popup, handle) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    popup.style.zIndex = popupZIndex++;
    const rect = popup.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }
    const bounds = viewport.getBoundingClientRect();
    const rect = popup.getBoundingClientRect();
    let nextLeft = event.clientX - bounds.left - offsetX;
    let nextTop = event.clientY - bounds.top - offsetY;
    const maxLeft = Math.max(12, bounds.width - rect.width - 12);
    const maxTop = Math.max(12, bounds.height - rect.height - 12);
    nextLeft = clamp(nextLeft, 12, maxLeft);
    nextTop = clamp(nextTop, 12, maxTop);
    popup.style.left = `${nextLeft}px`;
    popup.style.top = `${nextTop}px`;
  });

  handle.addEventListener("pointerup", (event) => {
    dragging = false;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  });
}

function createPopupShell(title) {
  if (!popupLayer) {
    return null;
  }
  const popup = document.createElement("div");
  popup.className = "popup-window";
  popup.style.zIndex = popupZIndex++;

  const header = document.createElement("div");
  header.className = "popup-header";

  const titleEl = document.createElement("div");
  titleEl.className = "popup-title";
  titleEl.textContent = title;

  const closeButton = document.createElement("button");
  closeButton.className = "popup-close";
  closeButton.type = "button";
  closeButton.textContent = "Close";

  header.append(titleEl, closeButton);

  const body = document.createElement("div");
  body.className = "popup-body";
  const loading = document.createElement("div");
  loading.className = "popup-loading";
  loading.textContent = "Loading...";
  body.append(loading);

  popup.append(header, body);
  popupLayer.append(popup);

  closeButton.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  closeButton.addEventListener("click", () => popup.remove());
  makePopupDraggable(popup, header);
  requestAnimationFrame(() => positionPopup(popup));

  return { popup, body };
}

async function openDriverPopup(title, url) {
  const popup = createPopupShell(title);
  if (!popup) {
    return;
  }
  popup.popup.classList.add("popup-window--driver");
  const { body } = popup;
  try {
    const results = await Promise.allSettled(
      driverAxes.map(async (axis) => {
        const response = await fetch(
          `${url}?axis=${encodeURIComponent(axis)}&refresh=true`,
          {
          cache: "no-store",
          }
        );
        if (!response.ok) {
          throw new Error(`${axis} ${response.status}`);
        }
        const rawText = await response.text();
        try {
          return JSON.parse(rawText);
        } catch (err) {
          return rawText;
        }
      })
    );
    const payload = {};
    results.forEach((result, index) => {
      const axis = driverAxes[index];
      if (result.status === "fulfilled") {
        payload[axis] = result.value;
      } else {
        payload[axis] = { error: `Failed to load ${axis}.` };
      }
    });
    renderDriverPayload(body, payload, title);
  } catch (err) {
    clearElement(body);
    const message = document.createElement("div");
    message.className = "popup-value";
    message.textContent = `Failed to load ${title}.`;
    body.append(message);
  }
}

async function postStopAxis(axis) {
  const response = await fetch(stopUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ axis }),
  });
  if (!response.ok) {
    throw new Error(`stop ${axis} ${response.status}`);
  }
  return response.json().catch(() => null);
}

async function postHomeAxis(axis) {
  const response = await fetch(homeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ axis }),
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch (err) {
      detail = "";
    }
    throw new Error(`home ${axis} ${response.status} ${detail}`.trim());
  }
  return response.json().catch(() => null);
}

async function triggerHomeZ() {
  if (!homeZButton || homeZInFlight) {
    return;
  }
  homeZInFlight = true;
  homingActive = true;
  const label = homeZButton.textContent || "Home";
  homeZButton.textContent = "Homing...";
  homeZButton.disabled = true;
  try {
    await postHomeAxis("z");
    homeZButton.textContent = label;
  } catch (err) {
    console.warn("home z failed", err);
    homingActive = false;
    homeZButton.classList.add("is-error");
    homeZButton.textContent = "Home Failed";
    window.setTimeout(() => {
      if (homeZButton) {
        homeZButton.classList.remove("is-error");
        homeZButton.textContent = label;
      }
    }, 1200);
  } finally {
    homeZButton.disabled = false;
    homeZInFlight = false;
  }
}

async function triggerEmergencyStop() {
  if (!emergencyStopButton || emergencyStopInFlight) {
    return;
  }
  emergencyStopInFlight = true;
  const label = emergencyStopButton.textContent || "EMERGENCY STOP";
  emergencyStopButton.textContent = "STOPPING...";
  emergencyStopButton.disabled = true;
  const results = await Promise.allSettled(stopAxes.map((axis) => postStopAxis(axis)));
  emergencyStopButton.disabled = false;
  emergencyStopButton.textContent = label;
  emergencyStopInFlight = false;
  const hasFailure = results.some((result) => result.status === "rejected");
  if (hasFailure) {
    emergencyStopButton.classList.add("is-error");
    window.setTimeout(() => {
      emergencyStopButton.classList.remove("is-error");
    }, 1200);
  }
}

function parsePosLine(line) {
  const axes = {};
  const regex = /([a-zA-Z][a-zA-Z0-9]*)\s*[:=]\s*(-?\d+(?:\.\d+)?)/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    const key = match[1].toLowerCase();
    const value = Number.parseFloat(match[2]);
    if (Number.isFinite(value)) {
      axes[key] = value;
    }
  }
  return axes;
}

function formatApiNumber(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function updateApiReadout(raw, status) {
  const values = raw || {};
  if (apiPosX) {
    apiPosX.textContent = formatApiNumber(values.x);
  }
  if (apiPosZ) {
    apiPosZ.textContent = formatApiNumber(values.z);
  }
  if (apiPosP) {
    apiPosP.textContent = formatApiNumber(values.p);
  }
  if (apiPosR) {
    apiPosR.textContent = formatApiNumber(values.r);
  }
  if (apiPosStatus) {
    apiPosStatus.textContent = status ? String(status) : "--";
  }
}

function extractPosFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const axes = {};
  ["x", "z", "y", "x1", "x2", "p", "r", "homed"].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      const numeric = readNumeric(payload[key]);
      if (numeric !== null) {
        axes[key] = numeric;
      }
    }
  });

  const lineText = typeof payload.line === "string" ? payload.line : "";
  if (lineText) {
    const parsed = parsePosLine(lineText);
    Object.keys(parsed).forEach((key) => {
      if (!(key in axes)) {
        axes[key] = parsed[key];
      }
    });
  }

  const rawX = axes.x ?? axes.x1 ?? null;
  const rawZ = axes.z ?? null;
  const rawY = axes.y ?? null;

  if (rawX === null || rawZ === null) {
    return null;
  }

  const mapped = posToScene(rawX, rawZ);
  const homed = axes.homed ?? null;
  return {
    raw: {
      x: rawX,
      z: rawZ,
      y: rawY,
      p: axes.p ?? null,
      r: axes.r ?? null,
    },
    scene: {
      x: mapped.x,
      y: mapped.y,
      z: Number.isFinite(rawY) ? rawY : 0,
    },
    homed: Number.isFinite(homed) ? homed : null,
  };
}

async function pollPosApi() {
  if (scanState.dryRun) {
    return;
  }
  if (posFetchInFlight) {
    return;
  }
  posFetchInFlight = true;
  try {
    const response = await fetch(`${posApiUrl}?refresh=true`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`pos api ${response.status}`);
    }
    const data = await response.json();
    const posData = extractPosFromPayload(data);
    updateDirectControlAvailability(data.status, posData ? posData.homed : null);
    updateApiReadout(posData ? posData.raw : null, data.status);
    if (!posData) {
      return;
    }
    lastApiP = Number.isFinite(posData.raw.p) ? posData.raw.p : null;
    lastApiScene = posData.scene;
    lastApiRaw = posData.raw;
    apiMarker.position.set(posData.scene.x, posData.scene.y, posData.scene.z);
    apiMarker.visible = true;
    updateApiDirectionLine(getPAxisAngleRad());
    updateLaserGuide();
  } catch (err) {
    console.warn("pos api poll failed", err);
    updateApiReadout(null, "error");
    updateDirectControlAvailability("error", null);
  } finally {
    posFetchInFlight = false;
  }
}

function startPosPolling() {
  if (posPollTimer) {
    return;
  }
  pollPosApi();
  posPollTimer = window.setInterval(pollPosApi, posPollIntervalMs);
}

function handleResize() {
  if (!renderer) {
    return;
  }
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  if (width === 0 || height === 0) {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  updateCameraProjection(width, height);
  if (scanPathMaterial && scanPathMaterial.resolution) {
    scanPathMaterial.resolution.set(width, height);
  }
  if (scanPathGlowMaterial && scanPathGlowMaterial.resolution) {
    scanPathGlowMaterial.resolution.set(width, height);
  }
  if (axisRenderer && axisCanvas) {
    const axisWidth = axisCanvas.clientWidth;
    const axisHeight = axisCanvas.clientHeight;
    if (axisWidth > 0 && axisHeight > 0) {
      axisRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      axisRenderer.setSize(axisWidth, axisHeight, false);
      axisCamera.aspect = axisWidth / axisHeight;
      axisCamera.updateProjectionMatrix();
    }
  }

  if (viewCubeRenderer && viewCubeCanvas) {
    const cubeWidth = viewCubeCanvas.clientWidth;
    const cubeHeight = viewCubeCanvas.clientHeight;
    if (cubeWidth > 0 && cubeHeight > 0) {
      viewCubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      viewCubeRenderer.setSize(cubeWidth, cubeHeight, false);
      viewCubeCamera.aspect = cubeWidth / cubeHeight;
      viewCubeCamera.updateProjectionMatrix();
    }
  }
  syncEmergencyStopSizing();
}

function onPointerDown(event) {
  if (event.button === 0) {
    const rect = canvas.getBoundingClientRect();
    dragPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    dragPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    dragRaycaster.setFromCamera(dragPointer, camera);
    const hits = dragRaycaster.intersectObjects(
      draggableObjects.map((entry) => entry.object),
      false
    );
    if (hits.length) {
      const hitObject = hits[0].object;
      const match = draggableObjects.find((entry) => entry.object === hitObject);
      if (match) {
        dragState.active = true;
        dragState.type = match.type;
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }
  }
  if (event.button === 1) {
    event.preventDefault();
    orbit.isPanning = true;
    orbit.panStartX = event.clientX;
    orbit.panStartY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (event.button !== 0) {
    return;
  }
  orbit.isDragging = true;
  orbit.startX = event.clientX;
  orbit.startY = event.clientY;
  orbit.startTheta = orbit.theta;
  orbit.startPhi = orbit.phi;
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (dragState.active) {
    const rect = canvas.getBoundingClientRect();
    dragPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    dragPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    dragRaycaster.setFromCamera(dragPointer, camera);
    const intersection = new THREE.Vector3();
    let plane = dragPlane;
    if (dragState.type === "r") {
      plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -discTopY);
    }
    const hit = dragRaycaster.ray.intersectPlane(plane, intersection);
    if (hit) {
      if (dragState.type === "x") {
        const nextX = clampInputValue(intersection.x, xAxisInput, false);
        xAxisInput.value = nextX.toFixed(dragPrecision);
        updateScene();
      } else if (dragState.type === "z") {
        const nextZ = clampInputValue(intersection.y, zAxisInput, false);
        zAxisInput.value = nextZ.toFixed(dragPrecision);
        updateScene();
      } else if (dragState.type === "xz") {
        const nextX = clampInputValue(intersection.x, xAxisInput, false);
        const nextZ = clampInputValue(intersection.y, zAxisInput, false);
        xAxisInput.value = nextX.toFixed(dragPrecision);
        zAxisInput.value = nextZ.toFixed(dragPrecision);
        updateScene();
      } else if (dragState.type === "p") {
        const baseX = parseFloat(xAxisInput.value);
        const baseZ = parseFloat(zAxisInput.value);
        const angle = THREE.MathUtils.radToDeg(Math.atan2(intersection.y - baseZ, intersection.x - baseX));
        const deflection = angleToDeflection(angle);
        pAxisInput.value = deflection.toFixed(dragPrecision);
        updateScene();
      } else if (dragState.type === "r") {
        const angle = THREE.MathUtils.radToDeg(
          Math.atan2(intersection.z - discCenter.z, intersection.x - discCenter.x)
        );
        const nextDeg = (angle + 360) % 360;
        const nextPos = clampInputValue(rDegreesToPos(nextDeg), rAxisInput);
        rAxisInput.value = nextPos.toFixed(0);
        updateScene();
      }
    }
    return;
  }
  if (orbit.isPanning) {
    const dx = event.clientX - orbit.panStartX;
    const dy = event.clientY - orbit.panStartY;
    orbit.panStartX = event.clientX;
    orbit.panStartY = event.clientY;
    panCamera(dx, dy);
    return;
  }
  if (!orbit.isDragging) {
    return;
  }
  const dx = event.clientX - orbit.startX;
  const dy = event.clientY - orbit.startY;
  orbit.theta = orbit.startTheta - dx * 0.005;
  orbit.phi = clamp(orbit.startPhi - dy * 0.005, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  updateCamera();
}

function onPointerUp(event) {
  orbit.isDragging = false;
  orbit.isPanning = false;
  dragState.active = false;
  dragState.type = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

function onWheel(event) {
  event.preventDefault();
  if (camera === orthographicCamera) {
    const zoomDelta = -event.deltaY * 0.002;
    orthographicCamera.zoom = clamp(orthographicCamera.zoom + zoomDelta, 0.6, 4);
    orthographicCamera.updateProjectionMatrix();
    return;
  }
  orbit.radius = clamp(orbit.radius + event.deltaY * 0.2, 800, 4000);
  updateCamera();
}

function onViewCubePointer(event) {
  if (!viewCubeCanvas || !viewCubeCamera || !viewCubeMesh) {
    return;
  }
  event.preventDefault();
  const rect = viewCubeCanvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  viewCubePointer.set(x, y);
  viewCubeRaycaster.setFromCamera(viewCubePointer, viewCubeCamera);
  const hits = viewCubeRaycaster.intersectObject(viewCubeMesh, false);
  if (!hits.length) {
    return;
  }
  const normalLocal = hits[0].face.normal.clone();
  const normalWorld = normalLocal.applyQuaternion(viewCube.quaternion);
  const snapped = snapDirection(normalWorld);
  setOrbitToDirection(snapped);
}

[zAxisInput, xAxisInput, pAxisInput, rAxisInput].forEach((input) => {
  input.addEventListener("input", updateScene);
});
lockOriginInput.addEventListener("change", updateScene);
if (labelsToggleInput) {
  labelsToggleInput.addEventListener("change", () => {
    axisLabelGroup.visible = labelsToggleInput.checked;
    axisLineGroup.visible = labelsToggleInput.checked;
  });
}

if (coordLabelsToggleInput) {
  coordLabelsToggleInput.addEventListener("change", () => {
    coordLabelGroup.visible = coordLabelsToggleInput.checked;
    coordLineGroup.visible = coordLabelsToggleInput.checked;
  });
}

if (cameraModeSelect) {
  cameraModeSelect.addEventListener("change", () => {
    setCameraMode(cameraModeSelect.value);
    handleResize();
  });
  setCameraMode(cameraModeSelect.value);
}

function setupHudToggle(panel, toggle, icon) {
  if (!panel || !toggle) {
    return;
  }
  const syncToggle = () => {
    const collapsed = panel.classList.contains("is-collapsed");
    if (icon) {
      icon.textContent = collapsed ? "^" : "v";
    }
  };
  syncToggle();
  toggle.addEventListener("click", () => {
    panel.classList.toggle("is-collapsed");
    syncToggle();
  });
}

setupHudToggle(pointCloudPanel, pointCloudToggle, pointCloudToggleIcon);
setupHudToggle(controlsPanel, controlsToggle, controlsToggleIcon);

if (viewReadout) {
  viewReadout.addEventListener("click", async () => {
    const text = viewReadout.textContent || "";
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      viewReadout.classList.add("copied");
      setTimeout(() => viewReadout.classList.remove("copied"), 800);
    } catch (err) {
      const temp = document.createElement("textarea");
      temp.value = text;
      temp.style.position = "fixed";
      temp.style.opacity = "0";
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
    }
  });
}

if (driverStatusButton) {
  driverStatusButton.addEventListener("click", () => {
    openDriverPopup("Driver Status", driverStatusUrl);
  });
}

if (driverSettingsButton) {
  driverSettingsButton.addEventListener("click", () => {
    openDriverPopup("Driver Settings", driverSettingsUrl);
  });
}

if (homeZButton) {
  homeZButton.addEventListener("click", () => {
    triggerHomeZ();
  });
}

if (emergencyStopButton) {
  emergencyStopButton.addEventListener("click", () => {
    triggerEmergencyStop();
  });
}

setupAxisTuningControls();
setupDirectControlPanel();
setupLedControls();
setupScanControls();
setupPointCloudControls();

window.addEventListener("keydown", (event) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) {
    return;
  }
  const key = event.key.toLowerCase();
  if (!["w", "a", "s", "d"].includes(key)) {
    return;
  }
  pressedKeys.add(key);
  event.preventDefault();
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (!["w", "a", "s", "d"].includes(key)) {
    return;
  }
  pressedKeys.delete(key);
});

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointerleave", () => {
  orbit.isDragging = false;
  orbit.isPanning = false;
  dragState.active = false;
  dragState.type = null;
});
canvas.addEventListener("wheel", onWheel, { passive: false });
if (viewCubeCanvas) {
  viewCubeCanvas.addEventListener("pointerdown", onViewCubePointer);
}

window.addEventListener("resize", handleResize);

handleResize();
updateScene();
startPosPolling();
startApiStatusPolling();
startLedStatusLoop();

function animate(time) {
  if (!renderer) {
    return;
  }
  const delta = (time - lastFrameTime) / 1000;
  lastFrameTime = time;
  updateKeyMovement(delta);
  updateViewReadout();
  const pulse = (Math.sin(time * 0.0012) + 1) * 0.5;
  apiGlow.material.opacity = 0.25 + pulse * 0.2;
  discHalo.material.opacity = 0.12 + pulse * 0.08;
  skyDome.position.copy(camera.position);
  updatePointCloudRotation();
  if (coordLabelGroup.visible) {
    updateCoordLabels();
    updateScanDistanceLabel();
  }

  renderer.render(scene, camera);
  if (axisRenderer && axisScene && axisCamera) {
    axisViewDirection.copy(camera.position).sub(orbit.target).normalize();
    axisCamera.position.copy(axisViewDirection).multiplyScalar(20);
    axisCamera.up.copy(camera.up);
    axisCamera.lookAt(axisScene.position);
    axisRenderer.render(axisScene, axisCamera);
  }
  if (viewCubeRenderer && viewCubeScene && viewCubeCamera && viewCube) {
    viewCube.quaternion.identity();
    axisViewDirection.copy(camera.position).sub(orbit.target).normalize();
    const viewUp = camera.up.clone();
    if (Math.abs(axisViewDirection.dot(viewUp)) > 0.95) {
      viewUp.set(0, 0, 1);
    }
    viewCubeCamera.position.copy(axisViewDirection).multiplyScalar(7.5);
    viewCubeCamera.up.copy(viewUp);
    viewCubeCamera.lookAt(viewCubeScene.position);
    if (viewCubeLabels.length) {
      const camDirection = viewCubeCamera.position.clone().normalize();
      viewCubeLabels.forEach((label) => {
        const normal = label.userData.normal ? label.userData.normal : new THREE.Vector3();
        label.visible = normal.dot(camDirection) > 0.15;
      });
    }
    viewCubeRenderer.render(viewCubeScene, viewCubeCamera);
  }
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
