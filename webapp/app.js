const canvas = document.getElementById("scene");
const axisCanvas = document.getElementById("axisIndicator");
const viewCubeCanvas = document.getElementById("viewCube");
const cameraModeSelect = document.getElementById("cameraMode");
const viewReadout = document.getElementById("viewReadout");
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

const perspectiveCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
const orthoSize = 800;
const orthographicCamera = new THREE.OrthographicCamera(
  -orthoSize,
  orthoSize,
  orthoSize,
  -orthoSize,
  0.1,
  10000
);
let camera = perspectiveCamera;

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

function clampInputValue(value, inputEl) {
  const min = parseFloat(inputEl.min);
  const max = parseFloat(inputEl.max);
  const step = parseFloat(inputEl.step) || 0;
  let next = clamp(value, min, max);
  if (step > 0) {
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

function updateViewReadout() {
  if (!viewReadout) {
    return;
  }
  const pos = camera.position;
  const thetaDeg = THREE.MathUtils.radToDeg(orbit.theta);
  const phiDeg = THREE.MathUtils.radToDeg(orbit.phi);
  viewReadout.textContent = `View x:${pos.x.toFixed(1)} y:${pos.y.toFixed(1)} z:${pos.z.toFixed(1)} | θ:${thetaDeg.toFixed(1)}° φ:${phiDeg.toFixed(1)}°`;
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

const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);

const directional = new THREE.DirectionalLight(0xffffff, 0.8);
directional.position.set(80, 120, 60);
scene.add(directional);

function createFloorGradientTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.06,
    size / 2,
    size / 2,
    size * 0.52
  );
  gradient.addColorStop(0, "rgba(234, 226, 208, 0.98)");
  gradient.addColorStop(0.45, "rgba(196, 217, 208, 0.75)");
  gradient.addColorStop(1, "rgba(196, 217, 208, 0.38)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const floorSize = 2400;
const floorGradient = new THREE.Mesh(
  new THREE.PlaneGeometry(floorSize, floorSize),
  new THREE.MeshBasicMaterial({
    map: createFloorGradientTexture(),
    transparent: true,
    opacity: 1,
    depthWrite: false,
  })
);
floorGradient.rotation.x = -Math.PI / 2;
scene.add(floorGradient);

const floorGrid = new THREE.GridHelper(floorSize, 8, 0x7f8b8a, 0xaab7b4);
floorGrid.material.opacity = 0.32;
floorGrid.material.transparent = true;
scene.add(floorGrid);

const baseFrameColor = 0x0d0f12;
const xAxisColor = 0x2ecc71;
const yAxisColor = 0xe74c3c;
const pAxisColor = 0x8e44ad;
const rAxisColor = 0x2c7be5;
const labelLineColor = 0x111111;
const x0 = 0;
const y0 = 0;
const baseOffset = -34;
const x1 = 400;
const yAxisLength = 400;
const xAxisLength = 600;
const armLength = 80;
const axisThickness = 16;
const scanOrigin = new THREE.Vector3(x0, 27, 0);
const floorOffset = baseOffset - axisThickness / 2;
floorGradient.position.y = floorOffset;
floorGrid.position.y = floorOffset;
const posXOrigin = 1665;
const posXScale = 5;
const posYOrigin = 625;
const posYScale = 25;

function sceneToPos(xLeft, yDisplay) {
  return {
    x: posXOrigin - posXScale * xLeft,
    y: posYOrigin - posYScale * yDisplay,
  };
}

function posToScene(posX, posY) {
  return {
    x: (posXOrigin - posX) / posXScale,
    y: (posYOrigin - posY) / posYScale,
  };
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

  const yLinePos = makeLine(yAxisColor);
  setLine(yLinePos, 0, 0, 0, 0, axisLength, 0);
  axisScene.add(yLinePos.line);
  const yLineNeg = makeLine(yAxisColor);
  yLineNeg.line.material.transparent = true;
  yLineNeg.line.material.opacity = negOpacity;
  setLine(yLineNeg, 0, 0, 0, 0, -axisLength, 0);
  axisScene.add(yLineNeg.line);

  const zLinePos = makeLine(rAxisColor);
  setLine(zLinePos, 0, 0, 0, 0, 0, axisLength);
  axisScene.add(zLinePos.line);
  const zLineNeg = makeLine(rAxisColor);
  zLineNeg.line.material.transparent = true;
  zLineNeg.line.material.opacity = negOpacity;
  setLine(zLineNeg, 0, 0, 0, 0, 0, -axisLength);
  axisScene.add(zLineNeg.line);

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
  const xLabelPos = createAxisLetter("X+", "#2ecc71", labelScale);
  const xLabelNeg = createAxisLetter("X-", "rgba(46, 204, 113, 0.55)", labelScale);
  const yLabelPos = createAxisLetter("Y+", "#e74c3c", labelScale);
  const yLabelNeg = createAxisLetter("Y-", "rgba(231, 76, 60, 0.55)", labelScale);
  const zLabelPos = createAxisLetter("Z+", "#2c7be5", labelScale);
  const zLabelNeg = createAxisLetter("Z-", "rgba(44, 123, 229, 0.55)", labelScale);
  xLabelPos.position.set(labelOffset, 0, 0);
  xLabelNeg.position.set(-labelOffset, 0, 0);
  yLabelPos.position.set(0, labelOffset, 0);
  yLabelNeg.position.set(0, -labelOffset, 0);
  zLabelPos.position.set(0, 0, labelOffset);
  zLabelNeg.position.set(0, 0, -labelOffset);
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
  viewCubeCamera.position.set(4.5, 4.5, 4.5);
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

const baseFrameMaterial = new THREE.MeshStandardMaterial({
  color: baseFrameColor,
  roughness: 0.4,
  metalness: 0.05,
});
const baseFrameTube = new THREE.Mesh(
  new THREE.BoxGeometry(x1 - x0, axisThickness, axisThickness),
  baseFrameMaterial
);
baseFrameTube.position.set((x0 + x1) / 2, baseOffset, 0);
scene.add(baseFrameTube);

const yAxisMaterial = new THREE.MeshStandardMaterial({
  color: yAxisColor,
  roughness: 0.35,
  metalness: 0.1,
});
const xAxisMaterial = new THREE.MeshStandardMaterial({
  color: xAxisColor,
  roughness: 0.35,
  metalness: 0.1,
});
const pAxisMaterial = new THREE.MeshStandardMaterial({
  color: pAxisColor,
  roughness: 0.35,
  metalness: 0.1,
});
const verticalAxis = new THREE.Mesh(
  new THREE.BoxGeometry(axisThickness, yAxisLength, axisThickness),
  yAxisMaterial
);
verticalAxis.position.set(x1, baseOffset + yAxisLength / 2, 0);
scene.add(verticalAxis);

const sphereMaterial = new THREE.MeshStandardMaterial({
  color: 0x000000,
  roughness: 0.4,
  metalness: 0.1,
});
const anchorGeometry = new THREE.SphereGeometry(12, 18, 18);
const originMarker = new THREE.Mesh(anchorGeometry, sphereMaterial);
originMarker.position.set(0, 0, 0);
scene.add(originMarker);
const stageMarker = new THREE.Mesh(anchorGeometry, sphereMaterial);
stageMarker.position.set(x1, baseOffset, 0);
scene.add(stageMarker);

const discRadius = 200;
const discThickness = 8;
const discCenter = new THREE.Vector3(0, -4, 0);
const discTopY = discCenter.y + discThickness / 2;
const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(discRadius, discRadius, discThickness, 80),
  [
    new THREE.MeshStandardMaterial({
      color: rAxisColor,
      transparent: false,
      opacity: 1,
      roughness: 0.5,
    }),
    new THREE.MeshStandardMaterial({
      color: rAxisColor,
      transparent: false,
      opacity: 1,
      roughness: 0.5,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.4,
      metalness: 0.1,
    }),
  ]
);
disc.position.copy(discCenter);
scene.add(disc);
const discTopMarker = new THREE.Mesh(
  new THREE.SphereGeometry(7, 16, 16),
  sphereMaterial
);
discTopMarker.position.set(discCenter.x, discTopY, discCenter.z);
scene.add(discTopMarker);

const scanOriginMarker = new THREE.Mesh(
  new THREE.SphereGeometry(9, 16, 16),
  new THREE.MeshStandardMaterial({
    color: 0xffd200,
    roughness: 0.35,
    metalness: 0.1,
  })
);
scanOriginMarker.position.copy(scanOrigin);
scene.add(scanOriginMarker);

const apiMarker = new THREE.Mesh(
  new THREE.SphereGeometry(6, 16, 16),
  new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x39ff14,
    emissiveIntensity: 0.85,
    roughness: 0.2,
    metalness: 0.05,
  })
);
apiMarker.visible = false;
scene.add(apiMarker);


const rotationIndicatorLength = discRadius * 0.9;
const rotationLine = makeLine(rAxisColor);
scene.add(rotationLine.line);
const rotationTip = new THREE.Mesh(
  new THREE.SphereGeometry(11, 16, 16),
  sphereMaterial
);
scene.add(rotationTip);

const movablePoint = new THREE.Mesh(
  new THREE.SphereGeometry(15, 20, 20),
  sphereMaterial
);
scene.add(movablePoint);

const xAxisTube = new THREE.Mesh(
  new THREE.BoxGeometry(xAxisLength, axisThickness, axisThickness),
  xAxisMaterial
);
scene.add(xAxisTube);
const xAxisLeftPoint = new THREE.Mesh(
  new THREE.SphereGeometry(13, 18, 18),
  sphereMaterial
);
scene.add(xAxisLeftPoint);

const armTube = new THREE.Mesh(
  new THREE.BoxGeometry(armLength, axisThickness, axisThickness),
  pAxisMaterial
);
scene.add(armTube);

const draggableObjects = [
  { object: movablePoint, type: "y" },
  { object: xAxisLeftPoint, type: "xy" },
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
  const { canvas, font, fontSize, padding, color, backgroundAlpha, texture, scale } = data;
  let { ctx } = data;
  ctx.font = font;
  const textWidth = Math.ceil(ctx.measureText(text).width);
  const textHeight = fontSize;
  const width = textWidth + padding * 2;
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
  yAxis: createLabel("Y-axis", { color: "#e74c3c" }),
  xAxis: createLabel("X-axis", { color: "#2ecc71" }),
  pAxis: createLabel("P-axis", { color: "#8e44ad" }),
  rAxis: createLabel("R-axis", { color: "#2c7be5" }),
};

Object.values(labels).forEach((label) => axisLabelGroup.add(label));


const labelLines = {
  base: makeLine(labelLineColor),
  yAxis: makeLine(labelLineColor),
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

function formatCoord(position) {
  return `X:${position.x.toFixed(1)} Y:${position.y.toFixed(1)}`;
}

function addCoordLabel(name, target, offset, options = {}) {
  const label = createLabel(`${name} ${formatCoord(target.position)}`, {
    color: options.color || "#0d0f12",
    scale: options.scale || 12,
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
addCoordLabel("Joint", xAxisLeftPoint, new THREE.Vector3(-80, 40, 60));
addCoordLabel("Disc", discTopMarker, new THREE.Vector3(60, 40, 0));
addCoordLabel("Scan Origin", scanOriginMarker, new THREE.Vector3(60, 40, 60));

labels.base.position.set(x1 - 60, baseOffset + 35, -40);
labels.yAxis.position.set(x1 + 40, baseOffset + yAxisLength - 20, 40);
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
  labelLines.yAxis,
  labels.yAxis.position.x,
  labels.yAxis.position.y,
  labels.yAxis.position.z,
  x1,
  baseOffset + yAxisLength,
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

function updateLabelPositions(xLeft, xRight, yVal, armEndX, armEndY) {
  const xLabelAnchor = xLeft + (xAxisLength * 2) / 3;
  labels.xAxis.position.set(xLabelAnchor + 20, yVal + 35, 40);
  labels.pAxis.position.set((xLeft + armEndX) / 2 + 20, (yVal + armEndY) / 2 + 35, 40);
  setLine(
    labelLines.xAxis,
    labels.xAxis.position.x,
    labels.xAxis.position.y,
    labels.xAxis.position.z,
    xLabelAnchor,
    yVal,
    0
  );
  setLine(
    labelLines.pAxis,
    labels.pAxis.position.x,
    labels.pAxis.position.y,
    labels.pAxis.position.z,
    (xLeft + armEndX) / 2,
    (yVal + armEndY) / 2,
    0
  );
}

const yAxisInput = document.getElementById("yAxis");
const xAxisInput = document.getElementById("xAxis");
const pAxisInput = document.getElementById("pAxis");
const rAxisInput = document.getElementById("rAxis");
const lockOriginInput = document.getElementById("lockOrigin");
const labelsToggleInput = document.getElementById("toggleLabels");
const coordLabelsToggleInput = document.getElementById("toggleCoordLabels");

const yAxisVal = document.getElementById("yAxisVal");
const xAxisVal = document.getElementById("xAxisVal");
const pAxisVal = document.getElementById("pAxisVal");
const rAxisVal = document.getElementById("rAxisVal");
const yPosVal = document.getElementById("yPosVal");
const xPosVal = document.getElementById("xPosVal");
const apiPosX = document.getElementById("apiPosX");
const apiPosY = document.getElementById("apiPosY");
const apiPosP = document.getElementById("apiPosP");
const apiPosR = document.getElementById("apiPosR");
const apiPosStatus = document.getElementById("apiPosStatus");
const directControlPanel = document.getElementById("directControlPanel");
const directControlToggle = document.getElementById("directControlToggle");
const directControlIntervalInput = document.getElementById("directControlInterval");
const axisTuningControls = [
  {
    axis: "y",
    velInput: document.getElementById("axisVelY"),
    velOutput: document.getElementById("axisVelYVal"),
    accInput: document.getElementById("axisAccY"),
    accOutput: document.getElementById("axisAccYVal"),
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

function angleToOrigin(xLeft, yVal) {
  return THREE.MathUtils.radToDeg(
    Math.atan2(scanOrigin.y - yVal, scanOrigin.x - xLeft)
  );
}

function updateOutputs(yDisplay, xLeft, pVal, rVal) {
  yAxisVal.textContent = yDisplay.toFixed(1);
  xAxisVal.textContent = xLeft.toFixed(1);
  const pDisplay = (-pVal / 90) * 255;
  pAxisVal.textContent = pDisplay.toFixed(0);
  rAxisVal.textContent = rVal.toFixed(0);
  if (yPosVal || xPosVal) {
    const posValues = sceneToPos(xLeft, yDisplay);
    if (yPosVal) {
      yPosVal.textContent = posValues.y.toFixed(1);
    }
    if (xPosVal) {
      xPosVal.textContent = posValues.x.toFixed(1);
    }
  }
}

function updateScene() {
  const yVal = parseFloat(yAxisInput.value);
  const xLeft = parseFloat(xAxisInput.value);
  const yActual = yVal;
  let pVal = parseFloat(pAxisInput.value);

  if (lockOriginInput.checked) {
    const desiredAngle = angleToOrigin(xLeft, yActual);
    const desiredDeflection = angleToDeflection(desiredAngle);
    pVal = desiredDeflection;
    pAxisInput.value = desiredDeflection.toFixed(1);
  }

  const angleDeg = deflectionToAngle(pVal);
  const angleRad = THREE.MathUtils.degToRad(angleDeg);
  const rVal = parseFloat(rAxisInput.value);

  updateOutputs(yActual, xLeft, pVal, rVal);

  const xRight = xLeft + xAxisLength;
  const armEndX = xLeft + armLength * Math.cos(angleRad);
  const armEndY = yActual + armLength * Math.sin(angleRad);

  movablePoint.position.set(x1, yActual, 0);
  xAxisLeftPoint.position.set(xLeft, yActual, 0);
  xAxisTube.position.set((xLeft + xRight) / 2, yActual, 0);
  armTube.position.set((xLeft + armEndX) / 2, (yActual + armEndY) / 2, 0);
  armTube.rotation.set(0, 0, angleRad);
  updateLabelPositions(xLeft, xRight, yActual, armEndX, armEndY);

  const rotationRad = THREE.MathUtils.degToRad(rVal);
  const arrowEndX = discCenter.x + rotationIndicatorLength * Math.cos(rotationRad);
  const arrowEndZ = discCenter.z + rotationIndicatorLength * Math.sin(rotationRad);
  setLine(rotationLine, discCenter.x, discTopY, discCenter.z, arrowEndX, discTopY, arrowEndZ);
  rotationTip.position.set(arrowEndX, discTopY, arrowEndZ);
  updateCoordLabels();
}

const apiBaseUrl = "http://192.168.178.222:8001/api";
const posApiUrl = `${apiBaseUrl}/pos`;
const maxVelocityUrl = `${apiBaseUrl}/maxvelocity`;
const maxAccelUrl = `${apiBaseUrl}/maxaccel`;
const moveAbsUrl = `${apiBaseUrl}/moveabs`;
const posPollIntervalMs = 50;
let posPollTimer = null;
let posFetchInFlight = false;

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

const velocitySteps = [100, 250, 500, 750, 1000];
const accelSteps = [25, 50, 100, 250, 500];
const axisTuningStorageKey = "scanbot.axisTuning.v1";
const axisTuningDefaults = {
  y: { velocity: 500, accel: 100 },
  x: { velocity: 500, accel: 100 },
  p: { velocity: 500, accel: 100 },
  r: { velocity: 500, accel: 100 },
};
const directControlDefaultIntervalSec = 5;
let directControlTimer = null;
let lastMoveAbsPayload = null;
let lastApiStatus = null;
let lastApiHomed = null;

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
  try {
    const stored = localStorage.getItem(axisTuningStorageKey);
    if (stored) {
      parsed = JSON.parse(stored);
    }
  } catch (err) {
    parsed = null;
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
  const tuningState = loadAxisTuning();
  axisTuningControls.forEach((entry) => {
    setAxisControlValues(entry, tuningState);
    entry.velInput.addEventListener("input", () => {
      const value = getStepValueFromInput(velocitySteps, entry.velInput);
      entry.velOutput.textContent = value.toString();
      tuningState[entry.axis].velocity = value;
      saveAxisTuning(tuningState);
    });
    entry.accInput.addEventListener("input", () => {
      const value = getStepValueFromInput(accelSteps, entry.accInput);
      entry.accOutput.textContent = value.toString();
      tuningState[entry.axis].accel = value;
      saveAxisTuning(tuningState);
    });
  });
  const applyLabel = axisApplyButton.textContent || "Apply";
  axisApplyButton.addEventListener("click", async () => {
    axisApplyButton.disabled = true;
    axisApplyButton.textContent = "Applying...";
    await applyAxisTuning(axisTuningControls, tuningState);
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

function updateDirectControlAvailability(status, homed) {
  lastApiStatus = status;
  lastApiHomed = homed;
  if (!directControlToggle) {
    return;
  }
  const available = isDirectControlAvailable(status, homed);
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
  if (!yAxisInput || !xAxisInput || !pAxisInput || !rAxisInput) {
    return null;
  }
  const yVal = Number.parseFloat(yAxisInput.value);
  const xLeft = Number.parseFloat(xAxisInput.value);
  const pVal = Number.parseFloat(pAxisInput.value);
  const rVal = Number.parseFloat(rAxisInput.value);
  if (
    !Number.isFinite(yVal) ||
    !Number.isFinite(xLeft) ||
    !Number.isFinite(pVal) ||
    !Number.isFinite(rVal)
  ) {
    return null;
  }
  const posValues = sceneToPos(xLeft, yVal);
  if (!Number.isFinite(posValues.x) || !Number.isFinite(posValues.y)) {
    return null;
  }
  const pDisplay = (-pVal / 90) * 255;
  return {
    x: Math.round(posValues.x),
    y: Math.round(posValues.y),
    p: Math.round(pDisplay),
    r: Math.round(rVal),
  };
}

function moveAbsPayloadChanged(nextPayload, lastPayload) {
  if (!lastPayload) {
    return true;
  }
  return ["x", "y", "p", "r"].some(
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
  if (apiPosY) {
    apiPosY.textContent = formatApiNumber(values.y);
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
  ["x", "y", "z", "x1", "x2", "p", "r", "homed"].forEach((key) => {
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
  const rawY = axes.y ?? null;
  const rawZ = axes.z ?? null;

  if (rawX === null || rawY === null) {
    return null;
  }

  const mapped = posToScene(rawX, rawY);
  const homed = axes.homed ?? null;
  return {
    raw: {
      x: rawX,
      y: rawY,
      z: rawZ,
      p: axes.p ?? null,
      r: axes.r ?? null,
    },
    scene: {
      x: mapped.x,
      y: mapped.y,
      z: Number.isFinite(rawZ) ? rawZ : 0,
    },
    homed: Number.isFinite(homed) ? homed : null,
  };
}

async function pollPosApi() {
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
    apiMarker.position.set(posData.scene.x, posData.scene.y, posData.scene.z);
    apiMarker.visible = true;
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
        const nextX = clampInputValue(intersection.x, xAxisInput);
        xAxisInput.value = nextX.toFixed(1);
        updateScene();
      } else if (dragState.type === "y") {
        const nextY = clampInputValue(intersection.y, yAxisInput);
        yAxisInput.value = nextY.toFixed(1);
        updateScene();
      } else if (dragState.type === "xy") {
        const nextX = clampInputValue(intersection.x, xAxisInput);
        const nextY = clampInputValue(intersection.y, yAxisInput);
        xAxisInput.value = nextX.toFixed(1);
        yAxisInput.value = nextY.toFixed(1);
        updateScene();
      } else if (dragState.type === "p") {
        const baseX = parseFloat(xAxisInput.value);
        const baseY = parseFloat(yAxisInput.value);
        const angle = THREE.MathUtils.radToDeg(Math.atan2(intersection.y - baseY, intersection.x - baseX));
        const deflection = angleToDeflection(angle);
        pAxisInput.value = deflection.toFixed(1);
        updateScene();
      } else if (dragState.type === "r") {
        const angle = THREE.MathUtils.radToDeg(
          Math.atan2(intersection.z - discCenter.z, intersection.x - discCenter.x)
        );
        const nextR = (angle + 360) % 360;
        rAxisInput.value = nextR.toFixed(0);
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

[yAxisInput, xAxisInput, pAxisInput, rAxisInput].forEach((input) => {
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

setupAxisTuningControls();
setupDirectControlPanel();

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

function animate(time) {
  if (!renderer) {
    return;
  }
  const delta = (time - lastFrameTime) / 1000;
  lastFrameTime = time;
  updateKeyMovement(delta);
  updateViewReadout();

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
    viewCubeCamera.position.copy(axisViewDirection).multiplyScalar(5);
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
