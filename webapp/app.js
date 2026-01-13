const canvas = document.getElementById("scene");
const axisCanvas = document.getElementById("axisIndicator");
const viewCubeCanvas = document.getElementById("viewCube");
const cameraModeSelect = document.getElementById("cameraMode");
const viewReadout = document.getElementById("viewReadout");
const emergencyStopButton = document.getElementById("emergencyStop");
const driverStatusButton = document.getElementById("driverStatusButton");
const driverSettingsButton = document.getElementById("driverSettingsButton");
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

const planetSettings = {
  terrain: {
    type: 3,
    amplitude: 1.5,
    sharpness: 1.975,
    offset: -0.172,
    period: 0.7581,
    persistence: 0.42,
    lacunarity: 1.888,
    octaves: 8,
    centerFalloffRadius: 0,
    centerFalloffStrength: 1,
    verticalOffset: 0,
  },
  lighting: {
    ambient: 0.01,
    diffuse: 1,
    specular: 2,
    shininess: 10,
    direction: new THREE.Vector3(1, 1, 1),
    color: new THREE.Color(1, 1, 1),
  },
  layers: {
    color1: new THREE.Color(0.014, 0.117, 0.279),
    color2: new THREE.Color(0.08, 0.527, 0.351),
    color3: new THREE.Color(0.62, 0.516, 0.372),
    color4: new THREE.Color(0.149, 0.254, 0.084),
    color5: new THREE.Color(0.15, 0.15, 0.15),
    transition2: 0.071,
    transition3: 0.215,
    transition4: 0.372,
    transition5: 1.2,
    blend12: 0.152,
    blend23: 0.152,
    blend34: 0.104,
    blend45: 0.168,
    scale: 1.2,
  },
  bump: {
    strength: 1,
    offset: 0.0001,
  },
  bloom: {
    threshold: 0.71,
    strength: 0.396,
    radius: 1.29,
  },
};

const planetNoiseFunctions = `
const float PI = 3.14159265;
const int MAX_OCTAVES = 8;

vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float simplex3(vec3 v) { 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1. + 3.0 * C.xxx;

  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
            i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
          + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  float n_ = 1.0/7.0;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

float fractal3(      
  vec3 v,
  float sharpness,
  float period,
  float persistence,
  float lacunarity,
  int octaves
) {
  float n = 0.0;
  float a = 1.0;
  float max_amp = 0.0;
  float P = period;

  for (int i = 0; i < MAX_OCTAVES; i++) {
    if (i >= octaves) {
      break;
    }
    n += a * simplex3(v / P);
    a *= persistence;
    max_amp += a;
    P /= lacunarity;
  }

  return max_amp > 0.0 ? (n / max_amp) : 0.0;
}

float terrainHeight(
  int type,
  vec3 v,
  float amplitude,
  float sharpness,
  float offset,
  float period,
  float persistence,
  float lacunarity,
  int octaves
) {
  float h = 0.0;

  if (type == 1) {
    h = amplitude * simplex3(v / period);
  } else if (type == 2) {
    h = amplitude * fractal3(
      v,
      sharpness,
      period, 
      persistence, 
      lacunarity, 
      octaves);
    h = amplitude * pow(max(0.0, (h + 1.0) / 2.0), sharpness);
  } else if (type == 3) {
    h = fractal3(
      v,
      sharpness,
      period, 
      persistence, 
      lacunarity, 
      octaves);
    h = amplitude * pow(max(0.0, 1.0 - abs(h)), sharpness);
  }

  return max(0.0, h + offset);
}
`;

const terrainVertexShader = `
${planetNoiseFunctions}
attribute vec3 tangent;

uniform int type;
uniform float amplitude;
uniform float sharpness;
uniform float offset;
uniform float period;
uniform float persistence;
uniform float lacunarity;
uniform int octaves;
uniform sampler2D heightMap;
uniform float heightMapStrength;
uniform float heightScale;
uniform float centerFalloffRadius;
uniform float centerFalloffStrength;
uniform float terrainScale;

varying vec3 fragPosition;
varying vec3 fragNormal;
varying vec3 fragTangent;
varying vec3 fragBitangent;
varying vec2 fragUv;

void main() {
  vec3 basePosition = vec3(position.x, 0.0, position.z);
  vec3 samplePos = basePosition / terrainScale;
  float h = terrainHeight(
    type,
    samplePos,
    amplitude,
    sharpness,
    offset,
    period,
    persistence,
    lacunarity,
    octaves
  );
  float mapHeight = texture2D(heightMap, uv).r;
  float hMap = pow(mapHeight, 1.55) * heightMapStrength;
  float heightValue = h + hMap;
  float centerDistance = length(basePosition.xz);
  float falloffRadius = max(centerFalloffRadius, 0.0001);
  float centerFalloff = smoothstep(0.0, falloffRadius, centerDistance);
  float centerScale = mix(centerFalloffStrength, 1.0, centerFalloff);
  vec3 displaced = position + normal * (heightValue * centerScale * heightScale);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  fragPosition = basePosition;
  fragNormal = normal;
  fragTangent = tangent;
  fragBitangent = cross(normal, tangent);
  fragUv = uv;
}
`;

const terrainFragmentShader = `
${planetNoiseFunctions}
uniform int type;
uniform float amplitude;
uniform float sharpness;
uniform float offset;
uniform float period;
uniform float persistence;
uniform float lacunarity;
uniform int octaves;

uniform vec3 color1;
uniform vec3 color2;
uniform vec3 color3;
uniform vec3 color4;
uniform vec3 color5;
uniform float transition2;
uniform float transition3;
uniform float transition4;
uniform float transition5;
uniform float blend12;
uniform float blend23;
uniform float blend34;
uniform float blend45;

uniform float bumpStrength;
uniform float bumpOffset;

uniform float ambientIntensity;
uniform float diffuseIntensity;
uniform float specularIntensity;
uniform float shininess;
uniform vec3 lightDirection;
uniform vec3 lightColor;

uniform sampler2D heightMap;
uniform float heightMapStrength;
uniform float heightScale;
uniform float centerFalloffRadius;
uniform float centerFalloffStrength;
uniform float terrainScale;

varying vec3 fragPosition;
varying vec3 fragNormal;
varying vec3 fragTangent;
varying vec3 fragBitangent;
varying vec2 fragUv;

void main() {
  vec3 samplePos = fragPosition / terrainScale;
  float h = terrainHeight(
    type,
    samplePos,
    amplitude, 
    sharpness,
    offset,
    period, 
    persistence, 
    lacunarity, 
    octaves);
  float mapHeight = texture2D(heightMap, fragUv).r;
  float hMap = pow(mapHeight, 1.55) * heightMapStrength;
  float heightValue = h + hMap;
  float centerDistance = length(fragPosition.xz);
  float falloffRadius = max(centerFalloffRadius, 0.0001);
  float centerFalloff = smoothstep(0.0, falloffRadius, centerDistance);
  float centerScale = mix(centerFalloffStrength, 1.0, centerFalloff);
  float heightScaled = heightValue * centerScale * heightScale;

  vec3 dx = bumpOffset * fragTangent;
  vec3 dy = bumpOffset * fragBitangent;
  vec3 samplePosDx = vec3(fragPosition.x + dx.x, 0.0, fragPosition.z + dx.z) / terrainScale;
  vec3 samplePosDy = vec3(fragPosition.x + dy.x, 0.0, fragPosition.z + dy.z) / terrainScale;
  vec2 uvDx = fragUv + vec2(dx.x, dx.z) / (terrainScale * 2.0);
  vec2 uvDy = fragUv + vec2(dy.x, dy.z) / (terrainScale * 2.0);
  float h_dx = terrainHeight(
    type,
    samplePosDx,
    amplitude,
    sharpness,
    offset,
    period,
    persistence,
    lacunarity,
    octaves
  ) + pow(texture2D(heightMap, uvDx).r, 1.55) * heightMapStrength;
  float h_dy = terrainHeight(
    type,
    samplePosDy,
    amplitude,
    sharpness,
    offset,
    period,
    persistence,
    lacunarity,
    octaves
  ) + pow(texture2D(heightMap, uvDy).r, 1.55) * heightMapStrength;

  float centerScaleDx = mix(
    centerFalloffStrength,
    1.0,
    smoothstep(0.0, falloffRadius, length(vec2(fragPosition.x + dx.x, fragPosition.z + dx.z)))
  );
  float centerScaleDy = mix(
    centerFalloffStrength,
    1.0,
    smoothstep(0.0, falloffRadius, length(vec2(fragPosition.x + dy.x, fragPosition.z + dy.z)))
  );

  vec3 pos = vec3(fragPosition.x, heightScaled, fragPosition.z);
  vec3 pos_dx = vec3(fragPosition.x + dx.x, h_dx * centerScaleDx * heightScale, fragPosition.z + dx.z);
  vec3 pos_dy = vec3(fragPosition.x + dy.x, h_dy * centerScaleDy * heightScale, fragPosition.z + dy.z);
  vec3 bumpNormal = normalize(cross(pos_dx - pos, pos_dy - pos));
  vec3 N = normalize(mix(fragNormal, bumpNormal, bumpStrength));
  vec3 L = normalize(-lightDirection);
  vec3 V = normalize(cameraPosition - pos);
  vec3 R = normalize(reflect(L, N));

  float diffuse = diffuseIntensity * max(0.0, dot(N, -L));
  float heightValueScaled = heightValue * centerScale;
  float specularFalloff = clamp((transition3 - heightValueScaled) / transition3, 0.0, 1.0);
  float specular = max(0.0, specularFalloff * specularIntensity * pow(dot(V, R), shininess));
  float light = ambientIntensity + diffuse + specular;

  vec3 color12 = mix(
    color1, 
    color2, 
    smoothstep(transition2 - blend12, transition2 + blend12, heightValueScaled));

  vec3 color123 = mix(
    color12, 
    color3, 
    smoothstep(transition3 - blend23, transition3 + blend23, heightValueScaled));

  vec3 color1234 = mix(
    color123, 
    color4, 
    smoothstep(transition4 - blend34, transition4 + blend34, heightValueScaled));

  vec3 finalColor = mix(
    color1234, 
    color5, 
    smoothstep(transition5 - blend45, transition5 + blend45, heightValueScaled));
  
  gl_FragColor = vec4(light * finalColor * lightColor, 1.0);
}
`;

let axisRenderer = null;
let axisScene = null;
let axisCamera = null;
let viewCubeRenderer = null;
let viewCubeScene = null;
let viewCubeCamera = null;
let viewCube = null;
let viewCubeMesh = null;
let viewCubeLabels = [];
let composer = null;
let renderPass = null;
let bloomPass = null;
let terrainMesh = null;
let heightmapTexture = null;
let heightmapData = null;
let heightmapWidth = 0;
let heightmapHeight = 0;
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
  if (renderPass) {
    renderPass.camera = camera;
  }
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
  viewReadout.textContent = `View x:${pos.x.toFixed(1)} y:${pos.y.toFixed(1)} z:${pos.z.toFixed(1)} | θ:${thetaDeg.toFixed(1)}° φ:${phiDeg.toFixed(1)}°`;
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

function initPostProcessing() {
  if (!renderer || !THREE.EffectComposer || !THREE.RenderPass || !THREE.UnrealBloomPass) {
    return;
  }
  composer = new THREE.EffectComposer(renderer);
  renderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(renderPass);
  bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(1, 1),
    planetSettings.bloom.strength,
    planetSettings.bloom.radius,
    planetSettings.bloom.threshold
  );
  composer.addPass(bloomPass);
}

initPostProcessing();

function updateLighting() {
  ambient.intensity = planetSettings.lighting.ambient;
  sunLight.intensity = planetSettings.lighting.diffuse;
  fillLight.intensity = planetSettings.lighting.diffuse * 0.18;
  rimLight.intensity = planetSettings.lighting.diffuse * 0.22;
  const lightDir = planetSettings.lighting.direction.clone().normalize();
  sunLight.position.set(lightDir.x, lightDir.y, lightDir.z).multiplyScalar(1000);
  sunLight.color.copy(planetSettings.lighting.color);
  sunTarget.position.set(0, 0, 0);
  sunTarget.updateMatrixWorld();
  updateTerrainUniforms();
}

function updateBloom() {
  if (!bloomPass) {
    return;
  }
  bloomPass.threshold = planetSettings.bloom.threshold;
  bloomPass.strength = planetSettings.bloom.strength;
  bloomPass.radius = planetSettings.bloom.radius;
}

const ambient = new THREE.AmbientLight(0xfff1e1, planetSettings.lighting.ambient);
scene.add(ambient);

const hemisphere = new THREE.HemisphereLight(0xf7f1e8, 0x2a1b12, 0.2);
scene.add(hemisphere);

const sunLight = new THREE.DirectionalLight(0xfff1d6, planetSettings.lighting.diffuse);
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
sunTarget.position.set(120, 40, 0);
scene.add(sunTarget);
sunLight.target = sunTarget;

const fillLight = new THREE.PointLight(0xffb86c, 0.18, 900);
fillLight.position.set(-220, 260, 300);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x86c9ff, 0.22);
rimLight.position.set(-420, 320, -340);
scene.add(rimLight);

updateLighting();

function createEnvironmentTexture() {
  const width = 512;
  const height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, "#fff1dd");
  skyGradient.addColorStop(0.45, "#f5d7b4");
  skyGradient.addColorStop(1, "#7ea3b4");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  const sun = ctx.createRadialGradient(
    width * 0.72,
    height * 0.28,
    12,
    width * 0.72,
    height * 0.28,
    180
  );
  sun.addColorStop(0, "rgba(255, 245, 226, 0.85)");
  sun.addColorStop(1, "rgba(255, 245, 226, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSkyTexture() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, "#f8f4e8");
  skyGradient.addColorStop(0.38, "#f3d8b2");
  skyGradient.addColorStop(0.7, "#9fc0d4");
  skyGradient.addColorStop(1, "#6f8ea8");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  const horizonGlow = ctx.createLinearGradient(0, height * 0.45, 0, height * 0.8);
  horizonGlow.addColorStop(0, "rgba(255, 239, 214, 0.7)");
  horizonGlow.addColorStop(1, "rgba(255, 239, 214, 0)");
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, 0, width, height);

  const sun = ctx.createRadialGradient(
    width * 0.18,
    height * 0.3,
    16,
    width * 0.18,
    height * 0.3,
    240
  );
  sun.addColorStop(0, "rgba(255, 248, 232, 0.9)");
  sun.addColorStop(1, "rgba(255, 248, 232, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 36; i += 1) {
    const cx = Math.random() * width;
    const cy = height * 0.18 + Math.random() * height * 0.45;
    const rx = 90 + Math.random() * 220;
    const ry = 26 + Math.random() * 70;
    const alpha = 0.03 + Math.random() * 0.06;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, Math.random() * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  const haze = ctx.createLinearGradient(0, height * 0.64, 0, height);
  haze.addColorStop(0, "rgba(255, 243, 224, 0)");
  haze.addColorStop(1, "rgba(255, 243, 224, 0.12)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function hash2(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function smoothstepRange(edge0, edge1, x) {
  if (edge0 === edge1) {
    return x < edge0 ? 0 : 1;
  }
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return smoothstep(t);
}

function valueNoise(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);

  const n00 = hash2(x0, y0);
  const n10 = hash2(x1, y0);
  const n01 = hash2(x0, y1);
  const n11 = hash2(x1, y1);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function fractalNoise2(x, y, settings) {
  let n = 0;
  let amplitude = 1;
  let maxAmp = 0;
  let period = settings.period;
  for (let i = 0; i < settings.octaves; i += 1) {
    const noiseValue = valueNoise(x / period, y / period) * 2 - 1;
    n += amplitude * noiseValue;
    maxAmp += amplitude;
    amplitude *= settings.persistence;
    period /= settings.lacunarity;
  }
  if (maxAmp === 0) {
    return 0;
  }
  return n / maxAmp;
}

function terrainHeightValue(type, x, z, settings) {
  const baseNoise = valueNoise(x / settings.period, z / settings.period) * 2 - 1;
  let h = 0;
  if (type === 1) {
    h = settings.amplitude * baseNoise;
  } else if (type === 2) {
    const fractal = fractalNoise2(x, z, settings);
    h = settings.amplitude * Math.pow(Math.max(0, (fractal + 1) / 2), settings.sharpness);
  } else {
    const fractal = fractalNoise2(x, z, settings);
    h = settings.amplitude * Math.pow(Math.max(0, 1 - Math.abs(fractal)), settings.sharpness);
  }
  return Math.max(0, h + settings.offset);
}

function createHeightmapTerrain(options) {
  const { size, segments, baseY } = options;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const tangents = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i += 1) {
    const offset = i * 3;
    tangents[offset] = 1;
    tangents[offset + 1] = 0;
    tangents[offset + 2] = 0;
  }
  geometry.setAttribute("tangent", new THREE.BufferAttribute(tangents, 3));

  const uniforms = {
    type: { value: planetSettings.terrain.type },
    amplitude: { value: planetSettings.terrain.amplitude },
    sharpness: { value: planetSettings.terrain.sharpness },
    offset: { value: planetSettings.terrain.offset },
    period: { value: planetSettings.terrain.period },
    persistence: { value: planetSettings.terrain.persistence },
    lacunarity: { value: planetSettings.terrain.lacunarity },
    octaves: { value: planetSettings.terrain.octaves },
    color1: { value: planetSettings.layers.color1.clone() },
    color2: { value: planetSettings.layers.color2.clone() },
    color3: { value: planetSettings.layers.color3.clone() },
    color4: { value: planetSettings.layers.color4.clone() },
    color5: { value: planetSettings.layers.color5.clone() },
    transition2: { value: planetSettings.layers.transition2 },
    transition3: { value: planetSettings.layers.transition3 },
    transition4: { value: planetSettings.layers.transition4 },
    transition5: { value: planetSettings.layers.transition5 },
    blend12: { value: planetSettings.layers.blend12 },
    blend23: { value: planetSettings.layers.blend23 },
    blend34: { value: planetSettings.layers.blend34 },
    blend45: { value: planetSettings.layers.blend45 },
    bumpStrength: { value: planetSettings.bump.strength },
    bumpOffset: { value: planetSettings.bump.offset },
    ambientIntensity: { value: planetSettings.lighting.ambient },
    diffuseIntensity: { value: planetSettings.lighting.diffuse },
    specularIntensity: { value: planetSettings.lighting.specular },
    shininess: { value: planetSettings.lighting.shininess },
    lightDirection: { value: planetSettings.lighting.direction.clone().normalize() },
    lightColor: { value: planetSettings.lighting.color.clone() },
    heightMap: { value: heightmapTexture },
    heightMapStrength: { value: 0 },
    heightScale: { value: terrainMaxHeight },
    centerFalloffRadius: { value: planetSettings.terrain.centerFalloffRadius },
    centerFalloffStrength: { value: planetSettings.terrain.centerFalloffStrength },
    terrainScale: { value: size * 0.5 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: terrainVertexShader,
    fragmentShader: terrainFragmentShader,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = baseY;
  mesh.receiveShadow = true;
  return mesh;
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
scene.background = environmentTexture;
scene.environment = environmentTexture;

const floorSize = 1440;
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
const woodFloor = new THREE.Mesh(new THREE.PlaneGeometry(floorSize, floorSize), woodMaterial);
woodFloor.rotation.x = -Math.PI / 2;
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
const xAxisColor = 0x2ecc71;
const yAxisColor = 0xe74c3c;
const pAxisColor = 0x8e44ad;
const rAxisColor = 0x2c7be5;
const apiMarkerColor = 0x39ff14;
const labelLineColor = 0x111111;
const x0 = 0;
const y0 = 0;
const baseOffset = -34;
const x1 = 400;
const yAxisLength = 400;
const xAxisLength = 600;
const armLength = 80;
const axisThickness = 16;
const apiDirectionLineLength = 500;
const apiDirectionFadeLength = 100;
const apiDirectionFadeSegments = 10;
const scanOrigin = new THREE.Vector3(x0, 27, 0);
const floorOffset = baseOffset - axisThickness / 2;
woodFloor.position.y = floorOffset;
floorSheen.position.y = floorOffset + 0.4;
floorGrid.position.y = floorOffset + 0.8;
const terrainGroup = new THREE.Group();
scene.add(terrainGroup);

const terrainSize = 19600;
const terrainSegments = 420;
const terrainMaxHeight = 1100;
const terrainBaseY = floorOffset - 220;
const terrainCeilingY = floorOffset - 8;
const terrainHeightmapStrength = 0;

function initHeightmapData(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  heightmapData = img.data;
  heightmapWidth = canvas.width;
  heightmapHeight = canvas.height;
}

function sampleHeightmap(u, v) {
  if (!heightmapData || !heightmapWidth || !heightmapHeight) {
    return 0;
  }
  const x = Math.floor(clamp(u, 0, 1) * (heightmapWidth - 1));
  const y = Math.floor(clamp(1 - v, 0, 1) * (heightmapHeight - 1));
  const idx = (y * heightmapWidth + x) * 4;
  return (heightmapData[idx] + heightmapData[idx + 1] + heightmapData[idx + 2]) / (3 * 255);
}

function computeCenterMaxHeight() {
  const radius = floorSize * 0.55;
  const samples = 22;
  let maxHeightValue = 0;
  for (let i = 0; i <= samples; i += 1) {
    const x = ((i / samples) * 2 - 1) * radius;
    for (let j = 0; j <= samples; j += 1) {
      const z = ((j / samples) * 2 - 1) * radius;
      if (Math.hypot(x, z) > radius) {
        continue;
      }
      const u = x / terrainSize + 0.5;
      const v = z / terrainSize + 0.5;
      const mapHeight = Math.pow(sampleHeightmap(u, v), 1.55) * terrainHeightmapStrength;
      const noiseHeight = terrainHeightValue(
        planetSettings.terrain.type,
        x / (terrainSize * 0.5),
        z / (terrainSize * 0.5),
        planetSettings.terrain
      );
      const heightValue = Math.max(0, mapHeight + noiseHeight);
      const centerScale = smoothstepRange(0, planetSettings.terrain.centerFalloffRadius, Math.hypot(x, z));
      const centerStrength = planetSettings.terrain.centerFalloffStrength;
      const falloffScale = centerStrength + (1 - centerStrength) * centerScale;
      const heightScaled = heightValue * falloffScale * terrainMaxHeight;
      if (heightScaled > maxHeightValue) {
        maxHeightValue = heightScaled;
      }
    }
  }
  return maxHeightValue;
}

function updateTerrainClearance() {
  if (!terrainMesh) {
    return;
  }
  const baseY = terrainBaseY + planetSettings.terrain.verticalOffset;
  const centerMaxHeight = computeCenterMaxHeight();
  const clearanceOffset = Math.min(0, terrainCeilingY - (baseY + centerMaxHeight));
  terrainMesh.position.y = baseY + clearanceOffset;
}

function updateTerrainUniforms() {
  if (!terrainMesh || !terrainMesh.material || !terrainMesh.material.uniforms) {
    return;
  }
  const u = terrainMesh.material.uniforms;
  if (u.heightMap && heightmapTexture) {
    u.heightMap.value = heightmapTexture;
  }
  u.type.value = planetSettings.terrain.type;
  u.amplitude.value = planetSettings.terrain.amplitude;
  u.sharpness.value = planetSettings.terrain.sharpness;
  u.offset.value = planetSettings.terrain.offset;
  u.period.value = planetSettings.terrain.period;
  u.persistence.value = planetSettings.terrain.persistence;
  u.lacunarity.value = planetSettings.terrain.lacunarity;
  u.octaves.value = planetSettings.terrain.octaves;
  u.color1.value.copy(planetSettings.layers.color1);
  u.color2.value.copy(planetSettings.layers.color2);
  u.color3.value.copy(planetSettings.layers.color3);
  u.color4.value.copy(planetSettings.layers.color4);
  u.color5.value.copy(planetSettings.layers.color5);
  u.transition2.value = planetSettings.layers.transition2;
  u.transition3.value = planetSettings.layers.transition3;
  u.transition4.value = planetSettings.layers.transition4;
  u.transition5.value = planetSettings.layers.transition5;
  u.blend12.value = planetSettings.layers.blend12;
  u.blend23.value = planetSettings.layers.blend23;
  u.blend34.value = planetSettings.layers.blend34;
  u.blend45.value = planetSettings.layers.blend45;
  u.bumpStrength.value = planetSettings.bump.strength;
  u.bumpOffset.value = planetSettings.bump.offset;
  u.ambientIntensity.value = planetSettings.lighting.ambient;
  u.diffuseIntensity.value = planetSettings.lighting.diffuse;
  u.specularIntensity.value = planetSettings.lighting.specular;
  u.shininess.value = planetSettings.lighting.shininess;
  u.lightDirection.value.copy(planetSettings.lighting.direction).normalize();
  u.lightColor.value.copy(planetSettings.lighting.color);
  u.heightMapStrength.value = terrainHeightmapStrength;
  u.heightScale.value = terrainMaxHeight;
  u.centerFalloffRadius.value = planetSettings.terrain.centerFalloffRadius;
  u.centerFalloffStrength.value = planetSettings.terrain.centerFalloffStrength;
}

function rebuildTerrain() {
  if (!heightmapTexture || !heightmapTexture.image) {
    return;
  }
  if (terrainMesh) {
    terrainGroup.remove(terrainMesh);
    terrainMesh.geometry.dispose();
    terrainMesh.material.dispose();
  }
  terrainMesh = createHeightmapTerrain({
    size: terrainSize,
    segments: terrainSegments,
    baseY: terrainBaseY + planetSettings.terrain.verticalOffset,
  });
  terrainGroup.add(terrainMesh);
  updateTerrainClearance();
  updateLighting();
}

const posXOrigin = 1665;
const posXScale = 5;
const posYOrigin = 625;
const posYScale = 25;
const rAxisPosPerRev = 3000;
const rAxisDegreesPerPos = 360 / rAxisPosPerRev;
const rAxisPosPerDegree = rAxisPosPerRev / 360;

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

const yAxisMaterial = makeAnodizedMaterial(yAxisColor, { emissiveIntensity: 0.14 });
const xAxisMaterial = makeAnodizedMaterial(xAxisColor, { emissiveIntensity: 0.14 });
const pAxisMaterial = makeAnodizedMaterial(pAxisColor, { emissiveIntensity: 0.16 });
const verticalAxis = new THREE.Mesh(
  new THREE.BoxGeometry(axisThickness, yAxisLength, axisThickness),
  yAxisMaterial
);
verticalAxis.position.set(x1, baseOffset + yAxisLength / 2, 0);
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
const originMarker = new THREE.Mesh(anchorGeometry, sphereMaterial);
originMarker.position.set(0, 0, 0);
setShadow(originMarker);
scene.add(originMarker);
const stageMarker = new THREE.Mesh(anchorGeometry, sphereMaterial);
stageMarker.position.set(x1, baseOffset, 0);
setShadow(stageMarker);
scene.add(stageMarker);

const discRadius = 200;
const discThickness = 8;
const discCenter = new THREE.Vector3(0, -4, 0);
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
    color: 0x9ee7ff,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
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
    color: 0xffd200,
    linewidth: 6,
    transparent: true,
    opacity: 0.95,
  });
  scanPathMaterial.resolution.set(1, 1);
  scanPathLine = new THREE.Line2(scanPathGeometry, scanPathMaterial);
  scanPathLine.computeLineDistances();
  scanPathLine.renderOrder = 6;
  scanPathGroup.add(scanPathLine);

  scanPathGlowMaterial = new THREE.LineMaterial({
    color: 0xfff3b0,
    linewidth: 14,
    transparent: true,
    opacity: 0.25,
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
      color: 0xffd200,
      transparent: true,
      opacity: 0.9,
    })
  );
  scanPathLine.renderOrder = 4;
  scanPathGroup.add(scanPathLine);
}

const waypointMarkerGroup = new THREE.Group();
waypointMarkerGroup.renderOrder = 5;
scene.add(waypointMarkerGroup);
const waypointMarkerGeometry = new THREE.SphereGeometry(4, 14, 14);
const waypointMarkerMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x8fd3ff,
  emissive: 0x8fd3ff,
  emissiveIntensity: 0.75,
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
const scanPanel = document.getElementById("scanPanel");
const scanRadiusInput = document.getElementById("scanRadius");
const scanWaypointsInput = document.getElementById("scanWaypoints");
const scanRepeatsInput = document.getElementById("scanRepeats");
const scanStartDirectionInput = document.getElementById("scanStartDirection");
const scanDryRunInput = document.getElementById("scanDryRun");
const scanStartButton = document.getElementById("scanStart");
const scanProgressText = document.getElementById("scanProgressText");
const scanProgressFill = document.getElementById("scanProgressFill");
const scanEstimateText = document.getElementById("scanEstimate");
const controlsPanel = document.querySelector(".hud");
const controlsToggle = document.getElementById("controlsToggle");
const controlsToggleIcon = document.querySelector("#controlsToggle .hud-title-icon");

const yAxisVal = document.getElementById("yAxisVal");
const xAxisVal = document.getElementById("xAxisVal");
const pAxisVal = document.getElementById("pAxisVal");
const rAxisVal = document.getElementById("rAxisVal");
const yPosVal = document.getElementById("yPosVal");
const xPosVal = document.getElementById("xPosVal");
const rPosVal = document.getElementById("rPosVal");
const apiPosX = document.getElementById("apiPosX");
const apiPosY = document.getElementById("apiPosY");
const apiPosP = document.getElementById("apiPosP");
const apiPosR = document.getElementById("apiPosR");
const apiPosStatus = document.getElementById("apiPosStatus");
const directControlPanel = document.getElementById("directControlPanel");
const directControlToggle = document.getElementById("directControlToggle");
const directControlIntervalInput = document.getElementById("directControlInterval");
const scanRadiusVal = document.getElementById("scanRadiusVal");
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
const settingsPanel = document.getElementById("settingsPanel");

function setSettingValue(id, value) {
  const input = document.getElementById(id);
  if (!input) {
    return;
  }
  const textValue = Number.isFinite(Number(value)) ? String(value) : `${value}`;
  input.value = textValue;
  const output = input.closest(".settings-row")?.querySelector("output");
  if (output) {
    output.textContent = textValue;
  }
}

if (settingsPanel) {
  const settingsDefaults = [
    ["terrainAmplitude", planetSettings.terrain.amplitude],
    ["terrainSharpness", planetSettings.terrain.sharpness],
    ["terrainOffset", planetSettings.terrain.offset],
    ["terrainPeriod", planetSettings.terrain.period],
    ["terrainPersistence", planetSettings.terrain.persistence],
    ["terrainLacunarity", planetSettings.terrain.lacunarity],
    ["terrainOctaves", planetSettings.terrain.octaves],
    ["terrainVerticalOffset", planetSettings.terrain.verticalOffset],
    ["centerFalloffRadius", planetSettings.terrain.centerFalloffRadius],
    ["centerFalloffStrength", planetSettings.terrain.centerFalloffStrength],
    ["transition2", planetSettings.layers.transition2],
    ["transition3", planetSettings.layers.transition3],
    ["transition4", planetSettings.layers.transition4],
    ["transition5", planetSettings.layers.transition5],
    ["blend12", planetSettings.layers.blend12],
    ["blend23", planetSettings.layers.blend23],
    ["blend34", planetSettings.layers.blend34],
    ["blend45", planetSettings.layers.blend45],
    ["lightingAmbient", planetSettings.lighting.ambient],
    ["lightingDiffuse", planetSettings.lighting.diffuse],
    ["lightingSpecular", planetSettings.lighting.specular],
    ["lightingShininess", planetSettings.lighting.shininess],
    ["lightDirX", planetSettings.lighting.direction.x],
    ["lightDirY", planetSettings.lighting.direction.y],
    ["lightDirZ", planetSettings.lighting.direction.z],
    ["bumpStrength", planetSettings.bump.strength],
    ["bumpOffset", planetSettings.bump.offset],
    ["bloomThreshold", planetSettings.bloom.threshold],
    ["bloomStrength", planetSettings.bloom.strength],
    ["bloomRadius", planetSettings.bloom.radius],
  ];

  const layer1 = planetSettings.layers.color1;
  const layer2 = planetSettings.layers.color2;
  const layer3 = planetSettings.layers.color3;
  const layer4 = planetSettings.layers.color4;
  const layer5 = planetSettings.layers.color5;
  settingsDefaults.push(
    ["layer1Red", layer1.r],
    ["layer1Green", layer1.g],
    ["layer1Blue", layer1.b],
    ["layer2Red", layer2.r],
    ["layer2Green", layer2.g],
    ["layer2Blue", layer2.b],
    ["layer3Red", layer3.r],
    ["layer3Green", layer3.g],
    ["layer3Blue", layer3.b],
    ["layer4Red", layer4.r],
    ["layer4Green", layer4.g],
    ["layer4Blue", layer4.b],
    ["layer5Red", layer5.r],
    ["layer5Green", layer5.g],
    ["layer5Blue", layer5.b]
  );

  const lightColor = planetSettings.lighting.color;
  settingsDefaults.push(
    ["lightColorR", lightColor.r],
    ["lightColorG", lightColor.g],
    ["lightColorB", lightColor.b]
  );

  settingsDefaults.forEach(([id, value]) => setSettingValue(id, value));

  const terrainTypeSelect = document.getElementById("terrainType");
  if (terrainTypeSelect) {
    terrainTypeSelect.value = String(planetSettings.terrain.type);
    terrainTypeSelect.addEventListener("change", () => {
      planetSettings.terrain.type = Number(terrainTypeSelect.value) || 1;
      updateTerrainUniforms();
      updateTerrainClearance();
    });
  }

  const settingsHandlers = {
    terrainAmplitude: (value) => {
      planetSettings.terrain.amplitude = value;
      updateTerrainUniforms();
      updateTerrainClearance();
    },
    terrainSharpness: (value) => {
      planetSettings.terrain.sharpness = value;
      updateTerrainUniforms();
      updateTerrainClearance();
    },
    terrainOffset: (value) => {
      planetSettings.terrain.offset = value;
      updateTerrainUniforms();
      updateTerrainClearance();
    },
    terrainPeriod: (value) => {
      planetSettings.terrain.period = value;
      updateTerrainUniforms();
      updateTerrainClearance();
    },
    terrainPersistence: (value) => {
      planetSettings.terrain.persistence = value;
      updateTerrainUniforms();
      updateTerrainClearance();
    },
    terrainLacunarity: (value) => {
      planetSettings.terrain.lacunarity = value;
      updateTerrainUniforms();
      updateTerrainClearance();
    },
    terrainOctaves: (value) => {
      planetSettings.terrain.octaves = clamp(Math.round(value), 1, 8);
      updateTerrainUniforms();
      updateTerrainClearance();
    },
    terrainVerticalOffset: (value) => {
      planetSettings.terrain.verticalOffset = value;
      updateTerrainClearance();
    },
    centerFalloffRadius: (value) => {
      planetSettings.terrain.centerFalloffRadius = value;
      updateTerrainUniforms();
      updateTerrainClearance();
    },
    centerFalloffStrength: (value) => {
      planetSettings.terrain.centerFalloffStrength = value;
      updateTerrainUniforms();
      updateTerrainClearance();
    },
    transition2: (value) => {
      planetSettings.layers.transition2 = value;
      updateTerrainUniforms();
    },
    transition3: (value) => {
      planetSettings.layers.transition3 = value;
      updateTerrainUniforms();
    },
    transition4: (value) => {
      planetSettings.layers.transition4 = value;
      updateTerrainUniforms();
    },
    transition5: (value) => {
      planetSettings.layers.transition5 = value;
      updateTerrainUniforms();
    },
    blend12: (value) => {
      planetSettings.layers.blend12 = value;
      updateTerrainUniforms();
    },
    blend23: (value) => {
      planetSettings.layers.blend23 = value;
      updateTerrainUniforms();
    },
    blend34: (value) => {
      planetSettings.layers.blend34 = value;
      updateTerrainUniforms();
    },
    blend45: (value) => {
      planetSettings.layers.blend45 = value;
      updateTerrainUniforms();
    },
    layer1Red: (value) => {
      planetSettings.layers.color1.r = value;
      updateTerrainUniforms();
    },
    layer1Green: (value) => {
      planetSettings.layers.color1.g = value;
      updateTerrainUniforms();
    },
    layer1Blue: (value) => {
      planetSettings.layers.color1.b = value;
      updateTerrainUniforms();
    },
    layer2Red: (value) => {
      planetSettings.layers.color2.r = value;
      updateTerrainUniforms();
    },
    layer2Green: (value) => {
      planetSettings.layers.color2.g = value;
      updateTerrainUniforms();
    },
    layer2Blue: (value) => {
      planetSettings.layers.color2.b = value;
      updateTerrainUniforms();
    },
    layer3Red: (value) => {
      planetSettings.layers.color3.r = value;
      updateTerrainUniforms();
    },
    layer3Green: (value) => {
      planetSettings.layers.color3.g = value;
      updateTerrainUniforms();
    },
    layer3Blue: (value) => {
      planetSettings.layers.color3.b = value;
      updateTerrainUniforms();
    },
    layer4Red: (value) => {
      planetSettings.layers.color4.r = value;
      updateTerrainUniforms();
    },
    layer4Green: (value) => {
      planetSettings.layers.color4.g = value;
      updateTerrainUniforms();
    },
    layer4Blue: (value) => {
      planetSettings.layers.color4.b = value;
      updateTerrainUniforms();
    },
    layer5Red: (value) => {
      planetSettings.layers.color5.r = value;
      updateTerrainUniforms();
    },
    layer5Green: (value) => {
      planetSettings.layers.color5.g = value;
      updateTerrainUniforms();
    },
    layer5Blue: (value) => {
      planetSettings.layers.color5.b = value;
      updateTerrainUniforms();
    },
    lightingAmbient: (value) => {
      planetSettings.lighting.ambient = value;
      updateLighting();
    },
    lightingDiffuse: (value) => {
      planetSettings.lighting.diffuse = value;
      updateLighting();
    },
    lightingSpecular: (value) => {
      planetSettings.lighting.specular = value;
      updateLighting();
    },
    lightingShininess: (value) => {
      planetSettings.lighting.shininess = Math.max(0, Math.round(value));
      updateLighting();
    },
    lightDirX: (value) => {
      planetSettings.lighting.direction.x = value;
      updateLighting();
    },
    lightDirY: (value) => {
      planetSettings.lighting.direction.y = value;
      updateLighting();
    },
    lightDirZ: (value) => {
      planetSettings.lighting.direction.z = value;
      updateLighting();
    },
    lightColorR: (value) => {
      planetSettings.lighting.color.r = value;
      updateLighting();
    },
    lightColorG: (value) => {
      planetSettings.lighting.color.g = value;
      updateLighting();
    },
    lightColorB: (value) => {
      planetSettings.lighting.color.b = value;
      updateLighting();
    },
    bumpStrength: (value) => {
      planetSettings.bump.strength = value;
      updateTerrainUniforms();
    },
    bumpOffset: (value) => {
      planetSettings.bump.offset = value;
      updateTerrainUniforms();
    },
    bloomThreshold: (value) => {
      planetSettings.bloom.threshold = value;
      updateBloom();
    },
    bloomStrength: (value) => {
      planetSettings.bloom.strength = value;
      updateBloom();
    },
    bloomRadius: (value) => {
      planetSettings.bloom.radius = value;
      updateBloom();
    },
  };

  settingsPanel.querySelectorAll('input[type="range"]').forEach((input) => {
    const output = input.closest(".settings-row")?.querySelector("output");
    if (output) {
      output.textContent = input.value;
    }
    input.addEventListener("input", () => {
      if (output) {
        output.textContent = input.value;
      }
      const handler = settingsHandlers[input.id];
      if (handler) {
        handler(Number(input.value));
      }
    });
  });
}

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

function updateOutputs(yDisplay, xLeft, pVal, rVal) {
  yAxisVal.textContent = yDisplay.toFixed(1);
  xAxisVal.textContent = xLeft.toFixed(1);
  const pDisplay = (-pVal / 90) * 255;
  pAxisVal.textContent = pDisplay.toFixed(0);
  const rDegrees = rPosToDegrees(rVal);
  rAxisVal.textContent = rDegrees.toFixed(1);
  if (rPosVal) {
    rPosVal.textContent = rVal.toFixed(0);
  }
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

  const rotationDeg = rPosToDegrees(rVal);
  const rotationRad = THREE.MathUtils.degToRad(rotationDeg);
  const arrowEndX = discCenter.x + rotationIndicatorLength * Math.cos(rotationRad);
  const arrowEndZ = discCenter.z + rotationIndicatorLength * Math.sin(rotationRad);
  setLine(rotationLine, discCenter.x, discTopY, discCenter.z, arrowEndX, discTopY, arrowEndZ);
  rotationTip.position.set(arrowEndX, discTopY, arrowEndZ);
  updateCoordLabels();
  updateApiDirectionLine(angleRad);
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
  y: { velocity: 500, accel: 100 },
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

function updateDirectControlAvailability(status, homed) {
  lastApiStatus = status;
  lastApiHomed = homed;
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

const scanMoveTolerance = 1.5;
const scanRotateTolerance = 10;
const scanMoveTimeoutMs = 20000;
const scanRotateTimeoutMs = 25000;
const scanPollIntervalMs = 60;

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
  const yMin = yAxisInput ? Number.parseFloat(yAxisInput.min) : 0;
  const yMax = yAxisInput ? Number.parseFloat(yAxisInput.max) : 0;
  return {
    xMin: Number.isFinite(xMin) ? xMin : 0,
    xMax: Number.isFinite(xMax) ? xMax : 0,
    yMin: Number.isFinite(yMin) ? yMin : 0,
    yMax: Number.isFinite(yMax) ? yMax : 0,
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
    const y = clamp(point.y, bounds.yMin, bounds.yMax);
    const prev = clamped[clamped.length - 1];
    if (!prev || Math.hypot(x - prev.x, y - prev.y) > 0.001) {
      clamped.push({ x, y });
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

function getLockOriginDeflection(xVal, yVal) {
  const desiredAngle = angleToOrigin(xVal, yVal);
  return angleToDeflection(desiredAngle);
}

function setAxisInputsFromScan(point, deflection, rPos, shouldUpdateScene = true) {
  if (xAxisInput) {
    xAxisInput.value = point.x.toFixed(1);
  }
  if (yAxisInput) {
    yAxisInput.value = point.y.toFixed(1);
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
    y: Math.round(pos.y),
    z: null,
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

function setScanInputsDisabled(disabled) {
  [
    scanRadiusInput,
    scanWaypointsInput,
    scanRepeatsInput,
    scanStartDirectionInput,
    scanDryRunInput,
  ].forEach((input) => {
    if (input) {
      input.disabled = disabled;
    }
  });
}

function setScanModeActive(active) {
  scanState.active = active;
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

async function waitForMove(target, timeoutMs) {
  const start = performance.now();
  let sawActive = false;
  while (performance.now() - start < timeoutMs) {
    if (!scanState.active) {
      return false;
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
    setAxisInputsFromScan(point, deflection, currentR, false);
    applyDryRunState(point, deflection, currentR);
    updateScene();
    await sleep(scanPollIntervalMs);
    const nextR = currentR + rotationDirection * rAxisPosPerRev;
    ensureRInputMax(nextR);
    setAxisInputsFromScan(point, deflection, nextR, false);
    applyDryRunState(point, deflection, nextR);
    updateScene();
    await sleep(scanPollIntervalMs);
    recordScanStep(performance.now() - stepStart);
    return nextR;
  }
  const payload = {
    x: Math.round(pos.x),
    y: Math.round(pos.y),
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
    console.warn("scan waypoint move timed out", payload);
  }
  await sendMoveAbs(rotatePayload);
  setAxisInputsFromScan(point, deflection, nextR);
  const rotated = await waitForRotation(nextR, scanRotateTimeoutMs);
  if (!rotated) {
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
  const totalSteps =
    forward.length +
    reversePass.length +
    Math.max(0, settings.repeats - 1) * (forwardPassLoop.length + reversePass.length);
  resetScanProgress(totalSteps);
  scanState.dryRun = isDryRun;
  setScanModeActive(true);
  scanStartButton.classList.add("is-running");
  let currentR = getCurrentRPos();
  try {
    for (let cycle = 0; cycle < settings.repeats; cycle += 1) {
      const forwardPass = cycle === 0 ? forward : forwardPassLoop;
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
}

const driverAxes = ["x1", "x2", "y", "r"];
const stopAxes = ["x", "y", "p", "r", "x1", "x2"];
let popupZIndex = 6;
let emergencyStopInFlight = false;

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
  if (composer) {
    composer.setSize(width, height);
  }
  if (bloomPass && bloomPass.setSize) {
    bloomPass.setSize(width, height);
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

if (controlsToggle && controlsPanel) {
  const setControlsCollapsed = (collapsed) => {
    controlsPanel.classList.toggle("is-collapsed", collapsed);
    if (controlsToggleIcon) {
      controlsToggleIcon.textContent = collapsed ? "^" : "v";
    }
  };
  setControlsCollapsed(controlsPanel.classList.contains("is-collapsed"));
  controlsToggle.addEventListener("click", () => {
    const nextCollapsed = !controlsPanel.classList.contains("is-collapsed");
    setControlsCollapsed(nextCollapsed);
  });
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

if (emergencyStopButton) {
  emergencyStopButton.addEventListener("click", () => {
    triggerEmergencyStop();
  });
}

setupAxisTuningControls();
setupDirectControlPanel();
setupScanControls();

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

  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
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
