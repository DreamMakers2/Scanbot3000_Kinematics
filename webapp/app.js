const canvas = document.getElementById("scene");
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

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

const orbit = {
  radius: 180,
  theta: -Math.PI / 3,
  phi: Math.PI / 7,
  target: new THREE.Vector3(10, 18, 0),
  isDragging: false,
  startX: 0,
  startY: 0,
  startTheta: 0,
  startPhi: 0,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

updateCamera();

const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);

const directional = new THREE.DirectionalLight(0xffffff, 0.8);
directional.position.set(80, 120, 60);
scene.add(directional);

const floorGrid = new THREE.GridHelper(300, 12, 0x9aa7a5, 0xc6d2cf);
floorGrid.position.y = 0;
floorGrid.material.opacity = 0.2;
floorGrid.material.transparent = true;
scene.add(floorGrid);

const wall = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 220, 12, 12),
  new THREE.MeshBasicMaterial({
    color: 0xcad6d4,
    wireframe: true,
    transparent: true,
    opacity: 0.12,
  })
);
wall.position.set(-120, 30, 0);
wall.rotation.y = Math.PI / 2;
scene.add(wall);

const baseFrameColor = 0x0d0f12;
const xAxisColor = 0x2ecc71;
const yAxisColor = 0xe74c3c;
const pAxisColor = 0x8e44ad;
const rAxisColor = 0x2c7be5;
const x0 = 0;
const y0 = 0;
const x1 = 40;
const yAxisLength = 40;
const xAxisLength = 60;
const armLength = 8;
const axisThickness = 1.6;

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

const baseFrameMaterial = new THREE.MeshStandardMaterial({
  color: baseFrameColor,
  roughness: 0.4,
  metalness: 0.05,
});
const baseFrameTube = new THREE.Mesh(
  new THREE.BoxGeometry(x1 - x0, axisThickness, axisThickness),
  baseFrameMaterial
);
baseFrameTube.position.set((x0 + x1) / 2, y0, 0);
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
verticalAxis.position.set(x1, yAxisLength / 2, 0);
scene.add(verticalAxis);

const anchorMaterial = new THREE.MeshStandardMaterial({ color: baseFrameColor });
const anchorGeometry = new THREE.SphereGeometry(1.2, 18, 18);
const originMarker = new THREE.Mesh(anchorGeometry, anchorMaterial);
originMarker.position.set(0, 0, 0);
scene.add(originMarker);
const stageMarker = new THREE.Mesh(anchorGeometry, anchorMaterial);
stageMarker.position.set(x1, 0, 0);
scene.add(stageMarker);

const discRadius = 20;
const discThickness = 0.2;
const discCenter = new THREE.Vector3(0, 3, 0);
const discTopY = discCenter.y + discThickness / 2;
const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(discRadius, discRadius, discThickness, 80),
  new THREE.MeshStandardMaterial({
    color: rAxisColor,
    transparent: true,
    opacity: 0.7,
    roughness: 0.5,
  })
);
disc.position.copy(discCenter);
scene.add(disc);

const rotationIndicatorLength = discRadius * 0.9;
const rotationLine = makeLine(rAxisColor);
scene.add(rotationLine.line);
const rotationTip = new THREE.Mesh(
  new THREE.SphereGeometry(1.1, 16, 16),
  new THREE.MeshStandardMaterial({ color: rAxisColor })
);
scene.add(rotationTip);

const movablePoint = new THREE.Mesh(
  new THREE.SphereGeometry(1.5, 20, 20),
  new THREE.MeshStandardMaterial({ color: 0x1a6a77 })
);
scene.add(movablePoint);

const xAxisTube = new THREE.Mesh(
  new THREE.BoxGeometry(xAxisLength, axisThickness, axisThickness),
  xAxisMaterial
);
scene.add(xAxisTube);
const xAxisLeftPoint = new THREE.Mesh(
  new THREE.SphereGeometry(1.3, 18, 18),
  new THREE.MeshStandardMaterial({ color: 0x4cb06f })
);
scene.add(xAxisLeftPoint);

const armTube = new THREE.Mesh(
  new THREE.BoxGeometry(armLength, axisThickness, axisThickness),
  pAxisMaterial
);
scene.add(armTube);

const labelGroup = new THREE.Group();
scene.add(labelGroup);

function createLabel(text, options = {}) {
  const fontSize = options.fontSize || 42;
  const padding = options.padding || 18;
  const font = `600 ${fontSize}px \"Space Grotesk\", Arial, sans-serif`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  const textWidth = Math.ceil(ctx.measureText(text).width);
  const textHeight = fontSize;
  canvas.width = textWidth + padding * 2;
  canvas.height = textHeight + padding * 2;

  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = options.color || "#1f2a2a";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  const scale = options.scale || 12;
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(scale * aspect, scale, 1);
  sprite.renderOrder = 10;
  sprite.material.depthTest = false;
  return sprite;
}

const labels = {
  base: createLabel("Base", { color: "#0d0f12" }),
  yAxis: createLabel("Y-axis", { color: "#e74c3c" }),
  xAxis: createLabel("X-axis", { color: "#2ecc71" }),
  pAxis: createLabel("P-axis", { color: "#8e44ad" }),
  rAxis: createLabel("R-axis", { color: "#2c7be5" }),
};

Object.values(labels).forEach((label) => labelGroup.add(label));

labels.base.position.set((x0 + x1) / 2, y0 - 6, -10);
labels.yAxis.position.set(x1 + 6, yAxisLength + 2, 0);
labels.rAxis.position.set(discCenter.x + discRadius + 8, discTopY + 4, discCenter.z);

function updateLabelPositions(xLeft, xRight, yVal, armEndX, armEndY) {
  labels.xAxis.position.set((xLeft + xRight) / 2, yVal + 5, 8);
  labels.pAxis.position.set((xLeft + armEndX) / 2, (yVal + armEndY) / 2 + 5, 8);
}

const yAxisInput = document.getElementById("yAxis");
const xAxisInput = document.getElementById("xAxis");
const pAxisInput = document.getElementById("pAxis");
const rAxisInput = document.getElementById("rAxis");
const lockOriginInput = document.getElementById("lockOrigin");
const labelsToggleInput = document.getElementById("toggleLabels");

const yAxisVal = document.getElementById("yAxisVal");
const xAxisVal = document.getElementById("xAxisVal");
const pAxisVal = document.getElementById("pAxisVal");
const rAxisVal = document.getElementById("rAxisVal");

if (labelsToggleInput) {
  labelGroup.visible = labelsToggleInput.checked;
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
  return THREE.MathUtils.radToDeg(Math.atan2(y0 - yVal, x0 - xLeft));
}

function updateOutputs(yVal, xLeft, pVal, rVal) {
  yAxisVal.textContent = yVal.toFixed(1);
  xAxisVal.textContent = xLeft.toFixed(1);
  pAxisVal.textContent = pVal.toFixed(1);
  rAxisVal.textContent = rVal.toFixed(0);
}

function updateScene() {
  const yVal = parseFloat(yAxisInput.value);
  const xLeft = parseFloat(xAxisInput.value);
  let pVal = parseFloat(pAxisInput.value);

  if (lockOriginInput.checked) {
    const desiredAngle = angleToOrigin(xLeft, yVal);
    const desiredDeflection = angleToDeflection(desiredAngle);
    pVal = desiredDeflection;
    pAxisInput.value = desiredDeflection.toFixed(1);
  }

  const angleDeg = deflectionToAngle(pVal);
  const angleRad = THREE.MathUtils.degToRad(angleDeg);
  const rVal = parseFloat(rAxisInput.value);

  updateOutputs(yVal, xLeft, pVal, rVal);

  const xRight = xLeft + xAxisLength;
  const armEndX = xLeft + armLength * Math.cos(angleRad);
  const armEndY = yVal + armLength * Math.sin(angleRad);

  movablePoint.position.set(x1, yVal, 0);
  xAxisLeftPoint.position.set(xLeft, yVal, 0);
  xAxisTube.position.set((xLeft + xRight) / 2, yVal, 0);
  armTube.position.set((xLeft + armEndX) / 2, (yVal + armEndY) / 2, 0);
  armTube.rotation.set(0, 0, angleRad);
  updateLabelPositions(xLeft, xRight, yVal, armEndX, armEndY);

  const rotationRad = THREE.MathUtils.degToRad(rVal);
  const arrowEndX = discCenter.x + rotationIndicatorLength * Math.cos(rotationRad);
  const arrowEndZ = discCenter.z + rotationIndicatorLength * Math.sin(rotationRad);
  setLine(rotationLine, discCenter.x, discTopY, discCenter.z, arrowEndX, discTopY, arrowEndZ);
  rotationTip.position.set(arrowEndX, discTopY, arrowEndZ);
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
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function onPointerDown(event) {
  orbit.isDragging = true;
  orbit.startX = event.clientX;
  orbit.startY = event.clientY;
  orbit.startTheta = orbit.theta;
  orbit.startPhi = orbit.phi;
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
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
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

function onWheel(event) {
  event.preventDefault();
  orbit.radius = clamp(orbit.radius + event.deltaY * 0.2, 80, 400);
  updateCamera();
}

[yAxisInput, xAxisInput, pAxisInput, rAxisInput].forEach((input) => {
  input.addEventListener("input", updateScene);
});
lockOriginInput.addEventListener("change", updateScene);
if (labelsToggleInput) {
  labelsToggleInput.addEventListener("change", () => {
    labelGroup.visible = labelsToggleInput.checked;
  });
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointerleave", () => {
  orbit.isDragging = false;
});
canvas.addEventListener("wheel", onWheel, { passive: false });

window.addEventListener("resize", handleResize);

handleResize();
updateScene();

function animate() {
  if (!renderer) {
    return;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
