import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { initLanguage, isDefaultMaint, LANGS, onLang, setLanguage, t } from "./i18n.js";
import { createCity } from "./city.js";
import { createWorld } from "./world.js";
import { mountSuit, suitIds } from "./suits.js";
import { softGeo } from "./soft.js";

const CDN = "https://threejs.org/examples/models/gltf";
const MODELS = {
  xbot: `${CDN}/Xbot.glb`,
  soldier: `${CDN}/Soldier.glb`,
  parrot: `${CDN}/Parrot.glb`,
  flamingo: `${CDN}/Flamingo.glb`,
  stork: `${CDN}/Stork.glb`,
  horse: `${CDN}/Horse.glb`,
};

const streetLights = [];
let lampGlow = null;

const loadEl = document.getElementById("load");
const PAYMENT_WALLET = "UQAJLZ-0T6R_C1_ONJNXiIRh78kJ67bOm4eYER6dztR1KNwn";
const ZCOIN_PER_GRAM = 100;
const BREAD_PRICE = 8;
const WATER_PRICE = 5;

initLanguage();

const tgBoot = window.Telegram?.WebApp;
const phone =
  (tgBoot && ["ios", "android", "android_x"].includes(tgBoot.platform)) ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 1000);
function fitRatio() {
  if (!phone) return Math.min(window.devicePixelRatio, 1.5);
  // After cutting world load, aim ~720px long side (was 512: ugly, still heavy).
  const long = Math.max(window.innerWidth, window.innerHeight, 1);
  return Math.min(1.15, 720 / long);
}
const renderer = new THREE.WebGLRenderer({
  antialias: !phone,
  powerPreference: "high-performance",
  stencil: false,
  depth: true,
});
renderer.setPixelRatio(fitRatio());
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = !phone;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = phone ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = phone ? 1 : 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec9ef);
// Denser fog on phone hides far mesh and saves fill.
scene.fog = new THREE.FogExp2(0xc5d7ea, phone ? 0.011 : 0.0024);
if (!phone) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, phone ? 72 : 400);
if (phone) document.body.classList.add("phone");
const clock = new THREE.Clock();
const loader = new GLTFLoader();

const keys = Object.create(null);
let runHeld = false;
let pointerLocked = false;
let wardrobeOpen = false;
let yaw = Math.PI;
let pitch = 0.4;
let camDist = 4.8;
let decorOrbit = null;

const WALK_SPEED = 1.65;
const RUN_SPEED = 4.3;

const SLOTS = 6;
const BAG_SIZE = 18;
const inventory = [null, null, null, null, null, null];
const bag = Array.from({ length: BAG_SIZE }, () => null);
try {
  const pack = JSON.parse(localStorage.getItem("zv-pack") || "null");
  if (Array.isArray(pack?.inventory)) {
    for (let i = 0; i < SLOTS; i++) inventory[i] = pack.inventory[i] || null;
  }
  if (Array.isArray(pack?.bag)) {
    for (let i = 0; i < BAG_SIZE; i++) bag[i] = pack.bag[i] || null;
  }
} catch {
  /* empty bag */
}
let selectedSlot = 0;
let bagOpen = false;
let picked = null;

const MAX_LEVEL = 150;
const PROG_KEY = "zv-progress";
const progress = { xp: 0, level: 0, into: 0, next: 25, walked: 0, day: "", tasks: {} };
let boardCanvas;
let boardTexture;
let badgeCanvas;
let badgeTexture;
let levelBadge;
const BOARD_AT = new THREE.Vector3(8.4, 0, 2.2);
try {
  const savedProg = JSON.parse(localStorage.getItem(PROG_KEY) || "null");
  if (savedProg) Object.assign(progress, savedProg, { tasks: savedProg.tasks || {} });
} catch {
  /* fresh life */
}

const player = {
  group: new THREE.Group(),
  mixer: null,
  actions: {},
  velY: 0,
  grounded: true,
  radius: 0.35,
};

player.group.position.set(0, 0, 8);
{
  try {
    const where = JSON.parse(localStorage.getItem("zv-where") || "null");
    if (where && Number.isFinite(where.x) && Number.isFinite(where.z) && Math.hypot(where.x, where.z) <= 206) {
      player.group.position.set(where.x, 0, where.z);
      if (Number.isFinite(where.face)) player.group.rotation.y = where.face;
    }
  } catch {
    /* fresh life */
  }
}
scene.add(player.group);
createLevelBadge();

const placeholder = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.32, 1.05, 6, 12),
  new THREE.MeshStandardMaterial({ color: 0x4a6d8c, roughness: 0.55 }),
);
placeholder.position.y = 0.85;
placeholder.castShadow = true;
player.group.add(placeholder);
player.placeholder = placeholder;

const mixers = [];
const npcs = [];
const animals = [];
const birds = [];
const plazaGates = [];
const fountainParticles = [];

function setLoad(msg) {
  loadEl.textContent = msg;
}

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function makeNoiseTexture(size, fn) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const c = fn(x / size, y / size);
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function hash(x, y) {
  return THREE.MathUtils.euclideanModulo(Math.sin(x * 127.1 + y * 311.7) * 43758.5453, 1);
}

function refreshPose(root) {
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (obj.isSkinnedMesh && obj.skeleton) obj.skeleton.update();
  });
}

function skinnedBox(root) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let found = false;
  root.traverse((obj) => {
    if (!obj.isSkinnedMesh) return;
    const position = obj.geometry.getAttribute("position");
    if (!position) return;
    const step = Math.max(1, Math.floor(position.count / 250));
    for (let i = 0; i < position.count; i += step) {
      obj.getVertexPosition(i, v);
      v.applyMatrix4(obj.matrixWorld);
      box.expandByPoint(v);
      found = true;
    }
  });
  return found ? box : null;
}

function fitOnGround(root) {
  root.scale.set(1, 1, 1);
  root.position.y = 0;
  refreshPose(root);
  const box = skinnedBox(root);
  if (!box || !Number.isFinite(box.min.y)) return;
  root.position.y -= box.min.y;
}

function pinHipsXZ(clips) {
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const n = track.name.toLowerCase();
      if (!n.includes("hips") || !n.endsWith("position")) continue;
      const values = track.values;
      if (values.length < 3) continue;
      const x0 = values[0];
      const z0 = values[2];
      for (let i = 0; i < values.length; i += 3) {
        values[i] = x0;
        values[i + 2] = z0;
      }
    }
  }
}

function findClip(clips, names) {
  const lower = clips.map((c) => c.name.toLowerCase());
  for (const name of names) {
    const i = lower.findIndex((n) => n.includes(name));
    if (i >= 0) return clips[i];
  }
  return clips[0] || null;
}

function setupActions(mixer, clips) {
  const idle = findClip(clips, ["idle", "stand"]);
  const walk = findClip(clips, ["walk"]);
  const run = findClip(clips, ["run", "jog"]);
  const actions = {};
  if (idle) actions.idle = mixer.clipAction(idle);
  if (walk) actions.walk = mixer.clipAction(walk);
  if (run) actions.run = mixer.clipAction(run);
  Object.values(actions).forEach((a) => {
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
  });
  if (actions.idle) actions.idle.setEffectiveWeight(1);
  return actions;
}

function recastMaterials(root, tint) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (/joint/i.test(obj.name)) {
      obj.visible = false;
      return;
    }
    obj.castShadow = true;
    obj.receiveShadow = true;
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => m.clone());
    } else if (obj.material) {
      obj.material = obj.material.clone();
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (mat.color && tint) mat.color.multiply(tint);
      mat.envMapIntensity = 0.85;
    }
  });
}

function addSky() {
  const sky = new Sky();
  sky.scale.setScalar(450);
  scene.add(sky);
  const sun = new THREE.Vector3();
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 4;
  uniforms.rayleigh.value = 1.15;
  uniforms.mieCoefficient.value = 0.004;
  uniforms.mieDirectionalG.value = 0.8;
  const phi = THREE.MathUtils.degToRad(78);
  const theta = THREE.MathUtils.degToRad(175);
  sun.setFromSphericalCoords(1, phi, theta);
  uniforms.sunPosition.value.copy(sun);
  return { sky, sun };
}

function addLights(sunDir) {
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b7a4a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.15);
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.castShadow = !phone;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xa8c8ff, 0.25);
  fill.position.set(-20, 12, -10);
  scene.add(fill);

  const fountainGlow = new THREE.PointLight(0x9ad7ff, 18, 16, 2);
  fountainGlow.position.set(0, 2.2, 0);
  scene.add(fountainGlow);
  return { hemi, sun, fill };
}

function paintCanvas(w, h, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function flatDisc(geo, mat, y) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function avenueHere(x, z) {
  if (Math.abs(x) < 5.2 && z > 23.1 && z < 51.2) return true;
  if (Math.abs(x) < 5.2 && z < -23.1 && z > -34.4) return true;
  if (Math.abs(z) < 4.9 && x > 23.1 && x < 74.2) return true;
  if (Math.abs(z) < 4.9 && x < -23.1 && x > -74.2) return true;
  if (Math.abs(z - 25.1) < 4.3 && Math.abs(x) > 9.2 && Math.abs(x) < 32) return true;
  if (Math.abs(z + 23.1) < 4.3 && Math.abs(x) > 12.8 && Math.abs(x) < 32) return true;
  if (Math.abs(x - 27.2) < 4.3 && z > -19.6 && z < 21.6 && Math.abs(z) > 4.6) return true;
  if (Math.abs(x + 27.2) < 4.3 && z > -19.6 && z < 21.6 && Math.abs(z) > 4.6) return true;
  if (Math.abs(z - 70) < 4.3 && x > -150 && x < 50) return true;
  if (Math.abs(z + 46) < 4.3 && x > -150 && x < 2) return true;
  if (Math.abs(x + 40) < 4.3 && z > 3.5 && z < 75) return true;
  if (Math.abs(x + 40) < 4.3 && z < -4 && z > -52) return true;
  if (Math.abs(z) < 4.9 && x > 74 && x < 156) return true;
  if (Math.abs(z) < 4.9 && x < -74 && x > -156) return true;
  if (Math.abs(x - 128) < 4.3 && z > -102 && z < 80) return true;
  if (Math.abs(x + 128) < 4.3 && z > -102 && z < 110) return true;
  if (Math.abs(z + 100) < 4.3 && Math.abs(x) < 150) return true;
  if (Math.abs(z - 108) < 4.3 && x > -150 && x < -28) return true;
  if (Math.hypot(x - 108, z - 38) < 12.4) return true;
  if (Math.hypot(x + 108, z + 36) < 12.4) return true;
  const ring = Math.hypot(x, z);
  if (ring > 19.65 && ring < 23.3) return true;
  return false;
}

function addGround() {
  const grassTex = paintCanvas(256, 256, (g) => {
    g.fillStyle = "#5f8a3e";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = "rgba(92, 68, 40, 0.18)";
      g.beginPath();
      g.ellipse((i * 47) % 256, (i * 29) % 256, 8, 4, i, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 1400; i++) {
      const x = (i * 53) % 256;
      const y = (i * 97) % 256;
      const n = hash(i, 3);
      g.strokeStyle = n > 0.62 ? "#3d6a2c" : n > 0.3 ? "#8fbe62" : "#c5d98a";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (n - 0.5) * 3, y - 5 - n * 7);
      g.stroke();
    }
  });
  grassTex.repeat.set(28, 28);
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.92, metalness: 0 });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uQuarry = { value: new THREE.Vector3(QUARRY.x, QUARRY.z, QUARRY.rim - 0.35) };
    shader.uniforms.uLakeA = { value: new THREE.Vector3(LAKES[0].x, LAKES[0].z, LAKES[0].r + 0.85) };
    shader.uniforms.uLakeB = { value: new THREE.Vector3(LAKES[1].x, LAKES[1].z, LAKES[1].r + 0.85) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vZvW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvZvW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uQuarry;\nuniform vec3 uLakeA;\nuniform vec3 uLakeB;\nvarying vec3 vZvW;",
      )
      .replace(
        "#include <dithering_fragment>",
        `if (distance(vZvW.xz, uQuarry.xy) < uQuarry.z) discard;
        if (distance(vZvW.xz, uLakeA.xy) < uLakeA.z) discard;
        if (distance(vZvW.xz, uLakeB.xy) < uLakeB.z) discard;
        #include <dithering_fragment>`,
      );
  };
  grassTex.repeat.set(66, 66);
  grassMat.polygonOffset = true;
  grassMat.polygonOffsetFactor = 2;
  grassMat.polygonOffsetUnits = 2;
  flatDisc(new THREE.CircleGeometry(270, 96), grassMat, 0);

  const stoneTex = paintCanvas(512, 512, (g) => {
    g.fillStyle = "#cfc6b6";
    g.fillRect(0, 0, 512, 512);
    const cols = 8;
    const rows = 8;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const n = hash(gx, gy);
        const shift = gy % 2 ? 32 : 0;
        const x = gx * 64 + shift;
        const y = gy * 64;
        const tone = 214 + n * 28;
        g.fillStyle = `rgb(${tone}, ${tone - 8}, ${tone - 20})`;
        g.fillRect(x + 3, y + 3, 58, 58);
      }
    }
  });
  stoneTex.repeat.set(5, 5);
  flatDisc(
    new THREE.CircleGeometry(15.48, 80),
    new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.72, metalness: 0.04 }),
    0.025,
  );

  flatDisc(
    new THREE.RingGeometry(15.55, 16.32, 80),
    new THREE.MeshStandardMaterial({ color: 0x9c9486, roughness: 0.62 }),
    0.04,
  );
  flatDisc(
    new THREE.RingGeometry(16.36, 17.12, 80),
    new THREE.MeshStandardMaterial({ color: 0xe7e0d2, roughness: 0.7 }),
    0.04,
  );

  const roadTex = paintCanvas(256, 256, (g) => {
    g.fillStyle = "#3c4248";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const n = hash(i, 9);
      const tone = 48 + n * 36;
      g.fillStyle = `rgba(${tone}, ${tone + 2}, ${tone - 2}, 0.45)`;
      g.fillRect((i * 37) % 256, (i * 61) % 256, 3, 2);
    }
    g.fillStyle = "#d8c56a";
    g.fillRect(122, 0, 8, 256);
  });
  roadTex.anisotropy = 8;
  roadTex.repeat.set(6, 6);

  addAvenue(roadTex);
}

function addAvenue(roadTex) {
  const walkMat = new THREE.MeshStandardMaterial({ color: 0xd5cec2, roughness: 0.78 });
  const streetMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.86, metalness: 0.02 });
  const bikeMat = new THREE.MeshStandardMaterial({ color: 0xa34b38, roughness: 0.74 });
  const h = 0.06;
  function liftOf(mat) {
    if (mat === streetMat) return 0.11;
    if (mat === bikeMat) return 0.135;
    return 0.155;
  }
  for (const mat of [walkMat, streetMat, bikeMat]) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
  }
  function slab(w, d, x, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, liftOf(mat), z);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    scene.add(mesh);
  }
  function ring(inner, outer, mat) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = liftOf(mat) + h / 2;
    mesh.receiveShadow = false;
    scene.add(mesh);
  }
  ring(19.75, 20.45, bikeMat);
  ring(20.49, 22.35, streetMat);
  ring(22.39, 23.15, walkMat);
  function spokeZ(z0, z1) {
    const len = z1 - z0;
    const z = (z0 + z1) / 2;
    slab(2.15, len, -4.025, z, walkMat);
    slab(4.46, len, -0.68, z, streetMat);
    slab(0.7, len, 1.94, z, bikeMat);
    slab(2.73, len, 3.735, z, walkMat);
  }
  function spokeX(x0, x1) {
    const len = x1 - x0;
    const x = (x0 + x1) / 2;
    slab(len, 2.1, x, -3.75, walkMat);
    slab(len, 4.12, x, -0.57, streetMat);
    slab(len, 0.7, x, 1.88, bikeMat);
    slab(len, 2.52, x, 3.54, walkMat);
  }
  spokeZ(23.25, 50.4);
  spokeZ(-34.2, -23.25);
  spokeX(23.25, 34.35);
  spokeX(-34.35, -23.25);
}

function quarryGround(x, z) {
  const d = Math.hypot(x - QUARRY.x, z - QUARRY.z);
  const rim = QUARRY.rim;
  const floor = QUARRY.floor;
  const crest = QUARRY.crest;
  if (d >= rim) return null;
  if (d < floor) return -1.85;
  if (d < crest) {
    const t = (d - floor) / (crest - floor);
    const s = t * t * (3 - 2 * t);
    return -1.85 + s * 4.25;
  }
  const t = (d - crest) / (rim - crest);
  const s = t * t * (3 - 2 * t);
  return 2.4 * (1 - s) + 0.04 * s;
}

const PEAK = { x: 18, z: 116, rx: 22, rz: 42, top: 18, flatX: 10, flatZ: 6, plazaZ: 116 };
const CLIMB = [
  [18, 74.3, 0],
  [18, 110, 1],
];
const hearthFlames = [];

function climbEase(f) {
  const s = f * f * (3 - 2 * f);
  return f * 0.8 + s * 0.2;
}

function onPlaza(x, z) {
  const dx = (x - PEAK.x) / PEAK.flatX;
  const dz = (z - PEAK.plazaZ) / PEAK.flatZ;
  return dx * dx + dz * dz <= 1;
}

function climbAt(x, z) {
  let best = 6;
  let height = null;
  for (let i = 0; i < CLIMB.length - 1; i++) {
    const a = CLIMB[i];
    const b = CLIMB[i + 1];
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const len2 = abx * abx + abz * abz || 1;
    const t = THREE.MathUtils.clamp(((x - a[0]) * abx + (z - a[1]) * abz) / len2, 0, 1);
    const d = Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t));
    if (d < best) {
      best = d;
      const f = a[2] + (b[2] - a[2]) * t;
      height = 0.12 + climbEase(f) * (PEAK.top - 0.12);
    }
  }
  return best < 4.2 ? height : null;
}

function mountainAt(x, z) {
  const ex = (x - PEAK.x) / PEAK.rx;
  const ez = (z - PEAK.z) / PEAK.rz;
  const e = ex * ex + ez * ez;
  if (e > 1) return null;
  if (onPlaza(x, z)) return PEAK.top;
  const road = climbAt(x, z);
  if (road != null) return road;
  const u = 1 - Math.sqrt(e);
  return PEAK.top * Math.pow(Math.max(u, 0.001), 0.32);
}

function blockClimb(x0, z0, x1, z1) {
  const y0 = groundAt(x0, z0);
  const y1 = groundAt(x1, z1);
  const rise = y1 - y0;
  if (rise < 0.28) return false;
  const run = Math.hypot(x1 - x0, z1 - z0) || 0.001;
  if (rise / run < 0.58) return false;
  if (onPlaza(x1, z1) || climbAt(x1, z1) != null) return false;
  return mountainAt(x1, z1) != null;
}

function groundAt(x, z) {
  const quarry = quarryGround(x, z);
  if (quarry != null) return quarry;
  const hill = mountainAt(x, z);
  if (hill != null) return hill;
  if (Math.abs(x) < 3.6 && z > 49.55 && z < 50.72) return 0.24;
  if (Math.abs(x) < 3.8 && z > 48.85 && z <= 49.55) return 0.16;
  if (Math.abs(x) < 4.1 && z > 48.05 && z <= 48.85) return 0.09;
  if (avenueHere(x, z)) return 0.1;
  if (Math.hypot(x, z) < 17.2) return 0.03;
  return 0.01;
}

const waterUniforms = { uTime: { value: 0 } };

function sprayTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const g = canvas.getContext("2d");
  const glow = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, "rgba(255,255,255,0.95)");
  glow.addColorStop(0.35, "rgba(210,240,255,0.55)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function rippleMaterial(color, radius = 4, amp = 1, deep = false) {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.06,
    metalness: 0.04,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.94,
    transmission: 0.12,
    thickness: 1.1,
    ior: 1.33,
    envMapIntensity: 1.15,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.uniforms.uRadius = { value: radius };
    shader.uniforms.uAmp = { value: amp };
    shader.uniforms.uDeep = { value: deep ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform float uRadius;
        uniform float uAmp;
        varying vec3 vWPos;
        varying float vRad;`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `float t = uTime;
        float hx = cos(position.x * 1.35 + t * 1.15) * 1.35 * 0.05 * uAmp
          + cos((position.x + position.y) * 2.6 + t * 1.45) * 2.6 * 0.016 * uAmp;
        float hy = cos(position.y * 1.7 - t * 0.85) * 1.7 * 0.034 * uAmp
          + cos((position.x + position.y) * 2.6 + t * 1.45) * 2.6 * 0.016 * uAmp;
        vec3 objectNormal = normalize(vec3(-hx, -hy, 1.0));`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float w1 = sin(position.x * 1.35 + uTime * 1.15);
        float w2 = sin(position.y * 1.7 - uTime * 0.85);
        float w3 = sin((position.x + position.y) * 2.6 + uTime * 1.45);
        transformed.z += (w1 * 0.05 + w2 * 0.034 + w3 * 0.016) * uAmp;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vRad = length(position.xy) / max(uRadius, 0.001);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform float uDeep;
        varying vec3 vWPos;
        varying float vRad;`,
      )
      .replace(
        "#include <dithering_fragment>",
        `float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        float fres = pow(1.0 - ndv, 3.0);
        float ripple = sin(vWPos.x * 2.4 + uTime * 1.2) * sin(vWPos.z * 1.9 - uTime * 0.8);
        float crest = smoothstep(0.55, 1.0, ripple);
        if (uDeep > 0.5) {
          vec3 abyss = vec3(0.015, 0.08, 0.16);
          vec3 mid = vec3(0.04, 0.2, 0.34);
          gl_FragColor.rgb = mix(abyss, mid, 0.35 + fres * 0.2);
          gl_FragColor.rgb += vec3(0.65, 0.82, 0.92) * crest * 0.06;
        } else {
          float depth = smoothstep(0.08, 0.78, vRad);
          vec3 deepCol = vec3(0.02, 0.18, 0.34);
          vec3 shallowCol = vec3(0.20, 0.62, 0.74);
          vec3 body = mix(deepCol, shallowCol, depth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, body, 0.72);
          float lap = 0.5 + 0.5 * sin(vRad * 36.0 - uTime * 2.1);
          float shore = smoothstep(0.93, 1.0, vRad) * lap;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.62, 0.82, 0.9), fres * 0.55);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.85, 0.95, 1.0), crest * 0.22 + shore * 0.8);
        }
        #include <dithering_fragment>`,
      );
  };
  return mat;
}

function addFountain() {
  const stone = new THREE.MeshStandardMaterial({ color: 0xf3eee6, roughness: 0.42, metalness: 0.05 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0xc4baab, roughness: 0.5, metalness: 0.08 });
  const group = new THREE.Group();

  function lathe(points, mat, y, segs = 56) {
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), segs), mat);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  const medal = new THREE.Mesh(
    new THREE.RingGeometry(5.15, 6.55, 72),
    new THREE.MeshStandardMaterial({ color: 0xddd4c6, roughness: 0.62 }),
  );
  medal.rotation.x = -Math.PI / 2;
  medal.position.y = 0.04;
  medal.receiveShadow = true;
  group.add(medal);

  lathe(
    [
      [3.15, 0],
      [4.15, 0.05],
      [4.62, 0.22],
      [4.7, 0.46],
      [4.42, 0.64],
      [4.18, 0.58],
      [3.95, 0.4],
      [3.7, 0.34],
    ],
    stone,
    0.02,
  );
  const basinWater = new THREE.Mesh(new THREE.CircleGeometry(3.85, 96), rippleMaterial(0x2c86ae, 3.85, 1));
  basinWater.rotation.x = -Math.PI / 2;
  basinWater.position.y = 0.4;
  group.add(basinWater);

  lathe(
    [
      [0.42, 0],
      [0.72, 0.08],
      [0.55, 0.7],
      [0.48, 1.15],
      [0.7, 1.28],
      [0.95, 1.4],
      [1.22, 1.62],
      [1.28, 1.78],
      [1.05, 1.9],
    ],
    darkStone,
    0.36,
    40,
  );
  const bowlWater = new THREE.Mesh(new THREE.CircleGeometry(1.02, 48), rippleMaterial(0x49b0cc, 1.02, 0.55));
  bowlWater.rotation.x = -Math.PI / 2;
  bowlWater.position.y = 2.12;
  group.add(bowlWater);

  lathe(
    [
      [0.16, 0],
      [0.22, 0.08],
      [0.14, 0.7],
      [0.2, 0.82],
      [0.34, 0.96],
      [0.38, 1.08],
      [0.22, 1.16],
    ],
    stone,
    2.2,
    28,
  );

  scene.add(group);

  function spray(count, place) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const speeds = [];
    for (let i = 0; i < count; i++) {
      const born = place();
      positions[i * 3] = born.x;
      positions[i * 3 + 1] = born.y;
      positions[i * 3 + 2] = born.z;
      speeds.push(born);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xe7f7ff,
        map: sprayTexture(),
        size: 0.07,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        alphaTest: 0.05,
      }),
    );
    scene.add(points);
    fountainParticles.push({ points, speeds, positions, place });
  }

  spray(420, () => {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.12;
    return {
      x: Math.cos(a) * r,
      y: 3.28,
      z: Math.sin(a) * r,
      vx: Math.cos(a) * 0.25,
      vy: 1.4 + Math.random() * 0.8,
      vz: Math.sin(a) * 0.25,
      life: Math.random(),
      floor: 2.16,
    };
  });
  spray(640, () => {
    const a = Math.random() * Math.PI * 2;
    const r = 1.08 + Math.random() * 0.12;
    return {
      x: Math.cos(a) * r,
      y: 2.18,
      z: Math.sin(a) * r,
      vx: Math.cos(a) * (0.35 + Math.random() * 0.45),
      vy: 0.15 + Math.random() * 0.35,
      vz: Math.sin(a) * (0.35 + Math.random() * 0.45),
      life: Math.random(),
      floor: 0.42,
    };
  });
}

const LAKES = [
  { x: -58, z: 46, r: 7.2 },
  { x: 62, z: -50, r: 6.4 },
];
const QUARRY = { x: 28, z: -62, rim: 22, floor: 10, crest: 15.2 };
const IMPORT_AT = { x: 40, z: 36 };
const MARKET_AT = { x: 70, z: 7.4 };
const PESCA_AT = { x: -70, z: 7.4 };
const ATELIER_AT = { x: 71, z: -8.6 };
const SUIT_GRAM = 8;
const SUIT_KEY = "zv-suits";
const WORN_KEY = "zv-worn";
const ROD_PRICE = 30;
const SKATE_PRICE = 520;
const PISTOL_PRICE = 4200;
const AMMO_PRICE = 60;
const AMMO_PACK = 15;
const AMMO_CAP = 30;
let aiming = false;
let mag = Number(localStorage.getItem("zv-mag") || "0") || 0;
const swayTrees = [];
const benchSpots = [];

function lakeHere(x, z) {
  return LAKES.some((lake) => Math.hypot(x - lake.x, z - lake.z) < lake.r + 3);
}

function addGarden() {
  const bark = paintCanvas(64, 128, (g) => {
    g.fillStyle = "#6a4630";
    g.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = i % 2 ? "#4a2e1c" : "#8a6244";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(4 + (i % 5) * 12, 0);
      g.bezierCurveTo(8, 40, 2, 80, 10 + (i % 4) * 8, 128);
      g.stroke();
    }
  });
  bark.wrapS = THREE.RepeatWrapping;
  bark.wrapT = THREE.RepeatWrapping;
  const trunkMat = new THREE.MeshStandardMaterial({ map: bark, color: 0xffffff, roughness: 0.9 });
  const leafMats = [0x2f6e38, 0x3e8b46, 0x67a84a].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.78 }),
  );
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x2c7a3c, roughness: 0.8 });
  const trunkGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.34, 0),
      new THREE.Vector2(0.22, 0.18),
      new THREE.Vector2(0.16, 0.7),
      new THREE.Vector2(0.13, 1.55),
      new THREE.Vector2(0.1, 2.05),
    ],
    8,
  );
  const puffGeo = new THREE.IcosahedronGeometry(0.72, 1);
  function addTree(x, z, seed) {
    if (avenueHere(x, z) || lakeHere(x, z)) return;
    if (Math.hypot(x - QUARRY.x, z - QUARRY.z) < QUARRY.rim + 1.4) return;
    if (Math.abs(x - IMPORT_AT.x) < 7 && Math.abs(z - IMPORT_AT.z) < 6) return;
    if (Math.hypot(x + 34, z - 12) < 4.2) return;
    if (Math.hypot(x, z) > 200) return;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.castShadow = true;
    tree.add(trunk);
    const core = new THREE.Mesh(puffGeo, leafMats[Math.abs(Math.floor(seed * 3)) % leafMats.length]);
    core.position.y = 2.35 + (Math.abs(seed) % 1) * 0.35;
    core.scale.setScalar(1.15 + (Math.abs(seed) % 1) * 0.28);
    core.castShadow = true;
    tree.add(core);
    for (let k = 0; k < 6; k++) {
      const puff = new THREE.Mesh(puffGeo, leafMats[k % leafMats.length]);
      const ang = seed + k * 1.05;
      puff.position.set(Math.cos(ang) * 0.72, 2.15 + (k % 3) * 0.48, Math.sin(ang) * 0.66);
      puff.scale.setScalar(0.72 + ((seed * 5 + k) % 3) * 0.12);
      puff.castShadow = true;
      tree.add(puff);
    }
    tree.position.set(x, 0, z);
    scene.add(tree);
    swayTrees.push(tree);
    addCircle(x, z, 0.42);
  }

  const ringTrees = phone ? 8 : 26;
  for (let i = 0; i < ringTrees; i++) {
    const a = (i / ringTrees) * Math.PI * 2 + 0.15;
    const r = 28.2 + (i % 4) * 2.4;
    addTree(Math.cos(a) * r, Math.sin(a) * r, a);
  }
  const avenueTrees = phone ? 3 : 7;
  for (let i = 0; i < avenueTrees; i++) {
    const z = 26 + i * 3.15;
    addTree(-6.35, z, i * 0.7);
    addTree(6.35, z, i * 0.7 + 1.2);
  }
  if (!phone) {
    for (let i = 0; i < 42; i++) {
      const a = (i / 42) * Math.PI * 2 + 0.2;
      const r = 64 + (i % 5) * 6.2;
      addTree(Math.cos(a) * r, Math.sin(a) * r, a * 1.7);
    }
  }
  function rowTrees(x0, z0, x1, z1, step, side) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / step));
    const dx = (x1 - x0) / n;
    const dz = (z1 - z0) / n;
    const nx = -dz;
    const nz = dx;
    const plen = Math.hypot(nx, nz) || 1;
    for (let i = 0; i <= n; i++) {
      addTree(x0 + dx * i + (nx / plen) * side, z0 + dz * i + (nz / plen) * side, i * 1.3 + side);
    }
  }
  rowTrees(80, 0, 150, 0, 20, 7.4);
  rowTrees(80, 0, 150, 0, 20, -7.4);
  rowTrees(-150, 0, -80, 0, 20, 7.4);
  rowTrees(-150, 0, -80, 0, 20, -7.4);
  rowTrees(-142, 70, -70, 70, 22, 7.4);
  rowTrees(128, -94, 128, 72, 22, 7.4);
  rowTrees(-128, -94, -128, 102, 22, -7.4);
  rowTrees(-142, -100, 142, -100, 24, 7.4);
  rowTrees(-142, 108, -36, 108, 22, 7.4);
  rowTrees(-142, -46, -78, -46, 22, -7.4);

  const hedgeGeo = new THREE.CapsuleGeometry(0.4, 2.15, 4, 8);
  for (let i = 0; i < 12; i++) {
    if (i % 3 === 0) continue;
    const a = (i / 12) * Math.PI * 2;
    const hedge = new THREE.Group();
    const mesh = new THREE.Mesh(hedgeGeo, hedgeMat);
    mesh.rotation.z = Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    hedge.add(mesh);
    hedge.position.set(Math.cos(a) * 18.35, 0.48, Math.sin(a) * 18.35);
    hedge.lookAt(0, 0.48, 0);
    const tx = -Math.sin(a);
    const tz = Math.cos(a);
    addCircle(hedge.position.x, hedge.position.z, 0.46);
    addCircle(hedge.position.x + tx * 0.9, hedge.position.z + tz * 0.9, 0.42);
    addCircle(hedge.position.x - tx * 0.9, hedge.position.z - tz * 0.9, 0.42);
    scene.add(hedge);
  }

  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2e30, roughness: 0.42, metalness: 0.55 });
  const glow = new THREE.MeshStandardMaterial({
    color: 0xfff1cc,
    emissive: 0xffc56a,
    emissiveIntensity: 1.1,
    roughness: 0.28,
  });
  lampGlow = glow;
  function addLamp(x, z, style = "classic", lit = true) {
    const lamp = new THREE.Group();
    const bulb = new THREE.PointLight(0xfff0c4, 0, style === "lantern" ? 28 : style === "avenue" ? 38 : 34, 1.12);
    bulb.castShadow = false;
    if (style === "lantern") {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 2.35, 8), iron);
      pole.position.y = 1.18;
      pole.castShadow = true;
      lamp.add(pole);
      const cage = new THREE.Mesh(softGeo(0.28, 0.36, 0.28, 0.07), iron);
      cage.position.y = 2.45;
      lamp.add(cage);
      const glass = new THREE.Mesh(softGeo(0.18, 0.24, 0.18, 0.045), glow);
      glass.position.y = 2.45;
      lamp.add(glass);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 4), iron);
      cap.position.y = 2.7;
      cap.rotation.y = Math.PI / 4;
      lamp.add(cap);
      bulb.position.set(0, 2.45, 0);
    } else if (style === "avenue") {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.6, 10), iron);
      pole.position.y = 1.8;
      pole.castShadow = true;
      lamp.add(pole);
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8), iron);
        arm.rotation.z = Math.PI / 2;
        arm.position.set(side * 0.28, 3.45, 0);
        lamp.add(arm);
        const head = new THREE.Mesh(softGeo(0.22, 0.08, 0.16, 0.035), glow);
        head.position.set(side * 0.52, 3.38, 0);
        lamp.add(head);
      }
      bulb.position.set(0, 3.3, 0);
    } else {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 3.05, 10), iron);
      pole.position.y = 1.52;
      pole.castShadow = true;
      lamp.add(pole);
      const neck = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), iron);
      neck.position.y = 3.05;
      lamp.add(neck);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.28, 8), glow);
      glass.position.y = 2.82;
      lamp.add(glass);
      for (let i = 0; i < 4; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), iron);
        const a = (i / 4) * Math.PI * 2;
        bar.position.set(Math.cos(a) * 0.11, 2.82, Math.sin(a) * 0.11);
        lamp.add(bar);
      }
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 8), iron);
      cap.position.y = 3.02;
      lamp.add(cap);
      bulb.position.set(0, 2.72, 0);
    }
    if (lit) {
      bulb.userData.lx = x;
      bulb.userData.lz = z;
      lamp.add(bulb);
      streetLights.push(bulb);
    }
    lamp.position.set(x, 0, z);
    scene.add(lamp);
    addCircle(x, z, 0.2);
  }
  for (let i = 0; i < (phone ? 4 : 8); i++) {
    const a = (i / (phone ? 4 : 8)) * Math.PI * 2 + 0.18;
    const x = Math.cos(a) * 13.6;
    const z = Math.sin(a) * 13.6;
    if (Math.abs(x) < 1.4 && z > 8) continue;
    addLamp(x, z, "lantern");
  }
  if (!phone) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      let x = Math.cos(a) * 26.2;
      let z = Math.sin(a) * 26.2;
      if (avenueHere(x, z)) {
        const len = Math.hypot(x, z) || 1;
        x += (x / len) * 4;
        z += (z / len) * 4;
      }
      addLamp(x, z);
    }
    for (const z of [22, 31, 40, 49]) {
      addLamp(-5.2, z, "avenue");
      addLamp(5.2, z, "avenue");
    }
    for (const z of [-22, -29]) {
      addLamp(-5.1, z, "avenue");
      addLamp(5.1, z, "avenue");
    }
    for (const x of [22, 31]) {
      addLamp(x, 5.2, "avenue");
      addLamp(x, -5.2, "avenue");
      addLamp(-x, 5.2, "avenue");
      addLamp(-x, -5.2, "avenue");
    }
    addLamp(-36.4, 12.4);
    addLamp(-31.6, 12.4);
    addLamp(31.6, -12.4);
    addLamp(36.4, -12.4);
  }
  const crossings = [[-40, 0], [-40, 70], [-40, -46], [27.2, 0], [-27.2, 0], [27.2, 25.1], [-27.2, 25.1], [27.2, -23.1], [-27.2, -23.1], [0, 0]];
  function curbClear(x, z) {
    if (Math.hypot(x, z) < 26) return false;
    if (crossings.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 6.5)) return false;
    if (Math.hypot(x - 18, z - 74) < 6) return false;
    if (Math.hypot(x - 28, z + 62) < 24) return false;
    if (Math.hypot(x + 58, z - 46) < 10) return false;
    if (Math.hypot(x - 62, z + 50) < 9) return false;
    return true;
  }
  function curbLamps(x0, z0, x1, z1, step, lightEvery = 2) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / step));
    const dx = (x1 - x0) / n;
    const dz = (z1 - z0) / n;
    const nx = -dz;
    const nz = dx;
    const plen = Math.hypot(nx, nz) || 1;
    for (let i = 0; i <= n; i++) {
      for (const side of [-3.85, 3.85]) {
        const x = x0 + dx * i + (nx / plen) * side;
        const z = z0 + dz * i + (nz / plen) * side;
        if (curbClear(x, z)) addLamp(x, z, "avenue", side > 0 && i % lightEvery === 0);
      }
    }
  }
  curbLamps(-58, 70, 42, 70, 14);
  curbLamps(-66, -46, -6, -46, 14);
  curbLamps(-40, 12, -40, 60, 14);
  curbLamps(-40, -38, -40, -10, 14);
  curbLamps(42, 0, 70, 0, 14);
  curbLamps(-70, 0, -48, 0, 14);
  curbLamps(27.2, 8, 27.2, 18, 12);
  curbLamps(-27.2, 8, -27.2, 18, 12);
  curbLamps(27.2, -16, 27.2, -6, 12);
  curbLamps(-27.2, -16, -27.2, -6, 12);
  curbLamps(-28, 25.1, -14, 25.1, 12);
  curbLamps(14, 25.1, 28, 25.1, 12);
  curbLamps(-28, -23.1, -14, -23.1, 12);
  curbLamps(14, -23.1, 28, -23.1, 12);
  curbLamps(80, 0, 150, 0, 28, 4);
  curbLamps(-150, 0, -80, 0, 28, 4);
  curbLamps(-142, 70, -70, 70, 28, 4);
  curbLamps(-142, -46, -78, -46, 28, 4);
  curbLamps(128, -94, 128, 72, 28, 4);
  curbLamps(-128, -94, -128, 102, 28, 4);
  curbLamps(-142, -100, 142, -100, 32, 4);
  curbLamps(-142, 108, -36, 108, 28, 4);

  function quarter(x, z, r, label, yaw) {
    const stone = new THREE.MeshStandardMaterial({ color: 0xe4ddd0, roughness: 0.78 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.55 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), stone);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, 0.17, z);
    disc.receiveShadow = true;
    scene.add(disc);
    const curb = new THREE.Mesh(new THREE.RingGeometry(r - 0.45, r + 0.15, 40), trim);
    curb.rotation.x = -Math.PI / 2;
    curb.position.set(x, 0.185, z);
    scene.add(curb);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 160;
    const g = canvas.getContext("2d");
    g.fillStyle = "#f6f1e8";
    g.fillRect(0, 0, 512, 160);
    g.strokeStyle = "#2a2118";
    g.lineWidth = 12;
    g.strokeRect(10, 10, 492, 140);
    g.fillStyle = "#2a2118";
    g.font = "700 78px Segoe UI, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, 256, 84);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.82, 0.08),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 }),
    );
    board.position.set(x, 1.85, z - r + 1.4);
    board.rotation.y = yaw;
    scene.add(board);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.85, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.72 }),
    );
    post.position.set(x, 0.92, z - r + 1.4);
    scene.add(post);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      addTree(x + Math.cos(a) * (r + 2.8), z + Math.sin(a) * (r + 2.8), a + x);
    }
    addLamp(x + r * 0.72, z + r * 0.72, "lantern", true);
    addLamp(x - r * 0.72, z - r * 0.72, "lantern", true);
  }
  quarter(108, 38, 11, "LEVANTE", 0);
  quarter(-108, -36, 11, "PONENTE", Math.PI);

  const plazaStone = paintCanvas(128, 128, (g) => {
    g.fillStyle = "#d9d3c8";
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 4; row++) {
      const shift = row % 2 ? 20 : 0;
      for (let col = -1; col < 4; col++) {
        g.fillStyle = (row + col) % 2 ? "#cfc6b8" : "#e7e1d6";
        g.fillRect(col * 40 + shift, row * 32, 36, 28);
        g.strokeStyle = "rgba(90,80,70,0.35)";
        g.strokeRect(col * 40 + shift, row * 32, 36, 28);
      }
    }
  });
  plazaStone.wrapS = plazaStone.wrapT = THREE.RepeatWrapping;
  const plazaMat = new THREE.MeshStandardMaterial({ map: plazaStone, roughness: 0.72 });
  const plazaTrim = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.55 });
  const rim = 14.9;
  const wallH = 5.05;
  const gateHalf = 0.25;
  const gates = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  function inGate(a) {
    return gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gateHalf);
  }
  const segs = 72;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * rim;
    const z = Math.sin(a) * rim;
    if (inGate(a)) {
      const headerH = wallH - 3.46;
      const header = new THREE.Mesh(new THREE.BoxGeometry(1.62, headerH, 0.7), plazaMat);
      header.position.set(x, 3.46 + headerH / 2, z);
      header.lookAt(0, header.position.y, 0);
      header.castShadow = true;
      header.receiveShadow = true;
      scene.add(header);
      continue;
    }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.58, wallH, 0.64), plazaMat);
    wall.position.set(x, wallH / 2, z);
    wall.lookAt(0, wallH / 2, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    addCircle(x, z, 0.4);
    if (i % 6 === 0) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.38, wallH + 0.35, 0.78), plazaTrim);
      pier.position.set(x, (wallH + 0.35) / 2, z);
      pier.lookAt(0, pier.position.y, 0);
      pier.castShadow = true;
      scene.add(pier);
    }
  }
  const cornice = new THREE.Mesh(new THREE.TorusGeometry(rim, 0.2, 8, 72), plazaTrim);
  cornice.rotation.x = Math.PI / 2;
  cornice.position.y = wallH + 0.06;
  cornice.castShadow = true;
  scene.add(cornice);
  const domePts = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const r = 1.45 + t * (rim - 1.7);
    const y = wallH + 3.15 - Math.pow(t, 1.55) * 3.05;
    domePts.push(new THREE.Vector2(r, y));
  }
  const dome = new THREE.Mesh(
    new THREE.LatheGeometry(domePts, 56),
    new THREE.MeshPhysicalMaterial({
      color: 0xf7f3ec,
      roughness: 0.16,
      metalness: 0,
      transmission: 0.62,
      thickness: 0.7,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    }),
  );
  dome.castShadow = false;
  dome.receiveShadow = true;
  scene.add(dome);
  const oculus = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.09, 8, 32), plazaTrim);
  oculus.rotation.x = Math.PI / 2;
  oculus.position.y = wallH + 3.15;
  scene.add(oculus);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rib = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(Math.cos(a) * (rim - 0.2), wallH + 0.12, Math.sin(a) * (rim - 0.2)),
      new THREE.Vector3(Math.cos(a) * 7.2, wallH + 2.7, Math.sin(a) * 7.2),
      new THREE.Vector3(Math.cos(a) * 1.45, wallH + 3.15, Math.sin(a) * 1.45),
    );
    const ribMesh = new THREE.Mesh(new THREE.TubeGeometry(rib, 14, 0.045, 5, false), plazaTrim);
    ribMesh.castShadow = true;
    scene.add(ribMesh);
  }
  const doorWood = paintCanvas(128, 256, (g) => {
    g.fillStyle = "#6d4428";
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = "#855433";
    g.fillRect(14, 16, 100, 100);
    g.fillRect(14, 136, 100, 100);
    g.strokeStyle = "#3f2614";
    g.lineWidth = 7;
    g.strokeRect(10, 12, 108, 108);
    g.strokeRect(10, 132, 108, 108);
  });
  const doorMat = new THREE.MeshStandardMaterial({ map: doorWood, roughness: 0.62 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc6a15a, roughness: 0.32, metalness: 0.72 });
  const gateSpan = Math.sin(gateHalf) * rim;
  const leafW = gateSpan - 0.08;
  const leafH = 3.28;
  function addLeaf(parent, hingeX, openOut) {
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, 0, 0);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, 0.08), doorMat);
    slab.position.set(Math.sign(hingeX) * -leafW * 0.5, leafH / 2, 0);
    slab.castShadow = true;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.045), brass);
    handle.position.set(Math.sign(hingeX) * -(leafW - 0.38), 1.12, 0.055);
    pivot.add(slab, handle);
    parent.add(pivot);
    return { pivot, out: openOut };
  }
  for (const a of gates) {
    const gx = Math.cos(a) * rim;
    const gz = Math.sin(a) * rim;
    const frame = new THREE.Group();
    frame.position.set(gx, 0, gz);
    frame.rotation.y = Math.PI / 2 - a;
    scene.add(frame);
    for (const hingeX of [-gateSpan, gateSpan]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.42, leafH + 0.45, 0.5), plazaTrim);
      jamb.position.set(hingeX, (leafH + 0.45) / 2, 0);
      jamb.castShadow = true;
      frame.add(jamb);
      addCircle(gx + hingeX * Math.sin(a), gz - hingeX * Math.cos(a), 0.28);
    }
    const leaves = [addLeaf(frame, -gateSpan, -1.55), addLeaf(frame, gateSpan, 1.55)];
    const ped = new THREE.Group();
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(gateSpan * 2 + 0.9, 0.38, 0.72), plazaTrim);
    const riseL = new THREE.Mesh(new THREE.BoxGeometry(gateSpan + 0.55, 0.26, 0.58), plazaTrim);
    riseL.position.set(-gateSpan * 0.46, 0.62, 0);
    riseL.rotation.z = 0.3;
    const riseR = riseL.clone();
    riseR.position.x = gateSpan * 0.46;
    riseR.rotation.z = -0.3;
    ped.add(lintel, riseL, riseR);
    ped.position.set(gx + Math.cos(a) * 0.46, leafH + 0.08, gz + Math.sin(a) * 0.46);
    ped.rotation.y = Math.PI / 2 - a;
    scene.add(ped);
    const alongX = Math.abs(Math.cos(a)) < 0.5;
    const block = addBlock(
      gx - (alongX ? gateSpan - 0.2 : 0.34),
      gx + (alongX ? gateSpan - 0.2 : 0.34),
      gz - (alongX ? 0.34 : gateSpan - 0.2),
      gz + (alongX ? 0.34 : gateSpan - 0.2),
    );
    block.shut = true;
    plazaGates.push({ x: gx, z: gz, a, span: gateSpan, leaves, block, dir: 1, phase: "shut" });
  }
  const memory = new THREE.Mesh(softGeo(1.8, 0.9, 0.45, 0.08), plazaMat);
  memory.position.set(0, 0.5, -8.2);
  memory.castShadow = true;
  scene.add(memory);
  addCircle(0, -8.2, 0.7);
  const seal = paintCanvas(256, 128, (g) => {
    g.fillStyle = "#f7f2ea";
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = "#8d7348";
    g.lineWidth = 6;
    g.strokeRect(8, 8, 240, 112);
    g.fillStyle = "#2a2118";
    g.font = "700 28px Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("ZOOM VERSE", 128, 64);
  });
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 0.62),
    new THREE.MeshStandardMaterial({ map: seal, roughness: 0.45 }),
  );
  plaque.position.set(0, 0.7, -7.94);
  scene.add(plaque);

  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a38, roughness: 0.72 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3e40, roughness: 0.4, metalness: 0.45 });
  function addBench(x, z) {
    const bench = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const slat = new THREE.Mesh(softGeo(1.55, 0.045, 0.1, 0.016), wood);
      slat.position.set(0, 0.46, -0.16 + i * 0.11);
      slat.castShadow = true;
      bench.add(slat);
    }
    for (let i = 0; i < 3; i++) {
      const back = new THREE.Mesh(softGeo(1.55, 0.045, 0.08, 0.014), wood);
      back.position.set(0, 0.72 + i * 0.1, 0.2);
      back.rotation.x = -0.18;
      back.castShadow = true;
      bench.add(back);
    }
    for (const sx of [-0.62, 0.62]) {
      const leg = new THREE.Mesh(softGeo(0.07, 0.46, 0.42, 0.03), metal);
      leg.position.set(sx, 0.23, 0);
      bench.add(leg);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.4, 8), metal);
      post.position.set(sx, 0.58, 0.1);
      bench.add(post);
    }
    const link = new THREE.Mesh(softGeo(1.4, 0.16, 0.05, 0.02), wood);
    link.position.set(0, 0.58, 0.08);
    bench.add(link);
    bench.position.set(x, 0, z);
    const len = Math.hypot(x, z) || 1;
    bench.rotation.y = Math.atan2(x / len, z / len);
    scene.add(bench);
    addCircle(x, z, 0.55);
    benchSpots.push({
      x,
      z,
      yaw: Math.atan2(-x, -z),
    });
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.55;
    const x = Math.cos(a) * 11.4;
    const z = Math.sin(a) * 11.4;
    if (Math.hypot(x - BOARD_AT.x, z - BOARD_AT.z) < 2.4) continue;
    if (z > 7 && Math.abs(x) < 2.2) continue;
    addBench(x, z);
  }
  addSunfield();
  addCritters();
}

const blooms = [];
const critters = [];
const bloomPos = new THREE.Vector3();
const bloomAt = new THREE.Vector3();
const sunUp = new THREE.Vector3(0, 1, 0);

function addSunfield() {
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3d6a28, roughness: 0.8 });
  const discMat = new THREE.MeshStandardMaterial({ color: 0x6b3f14, roughness: 0.62 });
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xe6b423, roughness: 0.5, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 7; j++) {
      const x = -50 + i * 1.4;
      const z = 30 + j * 1.35;
      if (avenueHere(x, z)) continue;
      const plant = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 1.2, 6), stemMat);
      stem.position.y = 0.6;
      const head = new THREE.Group();
      head.position.y = 1.2;
      const petals = new THREE.Mesh(new THREE.CircleGeometry(0.26, 12), petalMat);
      petals.position.z = -0.012;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.14, 10), discMat);
      head.add(petals, disc);
      plant.add(stem, head);
      plant.position.set(x, 0, z);
      scene.add(plant);
      blooms.push(head);
    }
  }
  const bark = new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.86 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2f6a34, roughness: 0.72 });
  for (let i = 0; i < 6; i++) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.3, 7), bark);
    trunk.position.y = 0.65;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), leaf);
    crown.position.y = 1.7;
    tree.add(trunk, crown);
    tree.position.set(-56 + (i % 3) * 6, 0, 27 + Math.floor(i / 3) * 12);
    scene.add(tree);
  }
}

function updateBlooms() {
  if (!blooms.length || !world?.sun) return;
  const dir = world.sun.y > 0.05 ? world.sun : sunUp;
  for (const head of blooms) {
    bloomAt.copy(head.getWorldPosition(bloomPos)).add(dir);
    head.lookAt(bloomAt);
  }
}

function animalCoat(kind) {
  const fur = paintCanvas(128, 128, (g) => {
    const base = kind === "dog" ? [138, 92, 52] : kind === "cat" ? [92, 96, 102] : [122, 108, 92];
    const dark = kind === "dog" ? [74, 46, 28] : kind === "cat" ? [42, 44, 48] : [78, 66, 54];
    const light = kind === "dog" ? [214, 176, 128] : kind === "cat" ? [226, 228, 230] : [196, 180, 160];
    g.fillStyle = `rgb(${base.join(",")})`;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const x = (i * 37) % 128;
      const y = (i * 19) % 128;
      const stripe = kind === "cat" && Math.floor(y / 10) % 2 === 0;
      const tone = stripe ? dark : i % 5 === 0 ? light : i % 3 === 0 ? dark : base;
      g.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.55)`;
      g.fillRect(x, y, kind === "cat" ? 14 : 3, kind === "dog" ? 7 : 2);
    }
    g.fillStyle = `rgba(${light.join(",")}, 0.85)`;
    g.fillRect(0, 78, 128, 50);
  });
  return new THREE.MeshStandardMaterial({ map: fur, roughness: 0.72 });
}

function makeCritter(kind) {
  const root = new THREE.Group();
  const coat = animalCoat(kind);
  const belly = coat.clone();
  belly.color = new THREE.Color(kind === "dog" ? 0xd7c2a4 : kind === "cat" ? 0xe6e4e0 : 0xe2d6c8);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.45 });
  const scale = kind === "dog" ? 1 : kind === "cat" ? 0.72 : 0.28;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.34, 4, 8), coat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.28, 0);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), belly);
  chest.scale.set(0.9, 0.75, 0.7);
  chest.position.set(0, 0.26, 0.16);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), coat);
  head.scale.set(0.95, 0.9, 1.05);
  head.position.set(0, 0.36, 0.28);
  const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.06, 3, 6), belly);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.33, 0.38);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), dark);
  nose.position.set(0, 0.345, 0.43);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1c140e, roughness: 0.3 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), eyeMat);
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.04, 0.39, 0.36);
  eyeR.position.set(0.04, 0.39, 0.36);
  root.add(body, chest, head, snout, nose, eyeL, eyeR);
  if (kind !== "mouse") {
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, kind === "dog" ? 0.08 : 0.05, 3, 6), coat);
      ear.position.set(side * 0.07, kind === "dog" ? 0.4 : 0.48, 0.26);
      ear.rotation.z = side * (kind === "dog" ? 0.9 : 0.15);
      root.add(ear);
    }
  } else {
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CircleGeometry(0.045, 8), coat);
      ear.position.set(side * 0.06, 0.46, 0.26);
      root.add(ear);
    }
  }
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, kind === "cat" ? 0.28 : 0.16, 3, 5), coat);
  tail.position.set(0, 0.32, -0.28);
  tail.rotation.x = kind === "cat" ? 1.1 : 0.7;
  root.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.08, 0.12], [0.08, 0.12], [-0.08, -0.12], [0.08, -0.12]]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.1, 3, 5), coat);
    leg.position.set(x, 0.1, z);
    root.add(leg);
    legs.push(leg);
  }
  root.scale.setScalar(scale);
  scene.add(root);
  return { root, legs, tail };
}

function addCritters() {
  const packs = [
    { kind: "dog", speed: 1.05, route: [[24, 6.5], [48, 6.5], [48, 16], [28, 16]] },
    { kind: "dog", speed: 0.9, route: [[-24, -7], [-50, -7], [-42, -18], [-26, -14]] },
    { kind: "cat", speed: 0.7, route: [[22, -8], [38, -8], [38, -18], [24, -16]] },
    { kind: "cat", speed: 0.62, route: [[-22, 12], [-36, 14], [-30, 24], [-20, 18]] },
    { kind: "mouse", speed: 1.35, route: [[18, 5], [24, 5], [24, 8], [18, 8]] },
    { kind: "mouse", speed: 1.2, route: [[-18, 5], [-26, 5], [-26, 9], [-18, 9]] },
    { kind: "mouse", speed: 1.4, route: [[30, -6], [36, -6], [36, -10], [30, -10]] },
    { kind: "mouse", speed: 1.1, route: [[-34, 28], [-28, 28], [-28, 34], [-34, 34]] },
  ];
  for (const pack of packs) {
    const critter = makeCritter(pack.kind);
    critter.speed = pack.speed;
    critter.route = pack.route;
    critter.wp = 0;
    critter.root.position.set(pack.route[0][0], groundAt(pack.route[0][0], pack.route[0][1]), pack.route[0][1]);
    critters.push(critter);
  }
}

function updateCritters(dt) {
  const wag = Math.sin(performance.now() * 0.014);
  for (const c of critters) {
    const wp = c.route[c.wp];
    const dx = wp[0] - c.root.position.x;
    const dz = wp[1] - c.root.position.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    if (dist < 0.35) {
      c.wp = (c.wp + 1) % c.route.length;
      continue;
    }
    const step = Math.min(dist, c.speed * dt);
    const nx = c.root.position.x + (dx / dist) * step;
    const nz = c.root.position.z + (dz / dist) * step;
    if (city.keepOut && city.keepOut(nx, nz)) {
      c.wp = (c.wp + 1) % c.route.length;
      const out = city.keepOut(c.root.position.x, c.root.position.z);
      if (out) {
        c.root.position.x = out.x;
        c.root.position.z = out.z;
        c.root.position.y = groundAt(out.x, out.z);
      }
      continue;
    }
    c.root.position.x = nx;
    c.root.position.z = nz;
    c.root.position.y = groundAt(c.root.position.x, c.root.position.z);
    c.root.rotation.y = Math.atan2(dx, dz);
    c.legs[0].rotation.x = wag * 0.5;
    c.legs[1].rotation.x = -wag * 0.5;
    c.legs[2].rotation.x = -wag * 0.5;
    c.legs[3].rotation.x = wag * 0.5;
    if (c.tail) c.tail.rotation.z = wag * 0.45;
  }
}

function updateFountain(dt) {
  waterUniforms.uTime.value += dt * 1.6;
  for (const sys of fountainParticles) {
    const { speeds, positions, points, place } = sys;
    for (let i = 0; i < speeds.length; i++) {
      const p = speeds[i];
      p.life += dt * 0.7;
      positions[i * 3] += p.vx * dt;
      positions[i * 3 + 1] += p.vy * dt;
      positions[i * 3 + 2] += p.vz * dt;
      p.vy -= 6.5 * dt;
      if (positions[i * 3 + 1] < p.floor || p.life > 1.15) {
        const born = place();
        positions[i * 3] = born.x;
        positions[i * 3 + 1] = born.y;
        positions[i * 3 + 2] = born.z;
        p.x = born.x;
        p.y = born.y;
        p.z = born.z;
        p.vx = born.vx;
        p.vy = born.vy;
        p.vz = born.vz;
        p.life = 0;
        p.floor = born.floor;
      }
    }
    points.geometry.attributes.position.needsUpdate = true;
  }
}

function collideFountain(pos) {
  const dx = pos.x;
  const dz = pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 4.9) {
    const push = (4.9 - d) / (d || 1);
    pos.x += dx * push;
    pos.z += dz * push;
  }
}

const blockers = [];
const circles = [];

function addBlock(minX, maxX, minZ, maxZ) {
  const block = { minX, maxX, minZ, maxZ };
  blockers.push(block);
  return block;
}

function addCircle(x, z, radius) {
  circles.push({ x, z, radius });
}

function collideCircles(pos, radius) {
  for (const c of circles) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const min = radius + c.radius;
    const dist = Math.hypot(dx, dz);
    if (dist >= min) continue;
    const push = (min - dist) / (dist || 1);
    pos.x += dx * push;
    pos.z += dz * push;
  }
}

function collidePeople(pos, radius) {
  for (const n of npcs) {
    const dx = pos.x - n.pivot.position.x;
    const dz = pos.z - n.pivot.position.z;
    const min = radius + 0.38;
    const dist = Math.hypot(dx, dz);
    if (dist >= min) continue;
    if (dist < 0.0001) {
      pos.x += min;
      continue;
    }
    const push = (min - dist) / dist;
    pos.x += dx * push;
    pos.z += dz * push;
  }
}

function collideBlocks(pos, radius) {
  for (const b of blockers) {
    if (b.shut === false) continue;
    const closestX = THREE.MathUtils.clamp(pos.x, b.minX, b.maxX);
    const closestZ = THREE.MathUtils.clamp(pos.z, b.minZ, b.maxZ);
    let dx = pos.x - closestX;
    let dz = pos.z - closestZ;
    const dist = Math.hypot(dx, dz);
    if (dist < radius) {
      if (dist < 0.0001) {
        const left = pos.x - b.minX;
        const right = b.maxX - pos.x;
        const south = pos.z - b.minZ;
        const north = b.maxZ - pos.z;
        const min = Math.min(left, right, south, north);
        if (min === left) pos.x = b.minX - radius;
        else if (min === right) pos.x = b.maxX + radius;
        else if (min === south) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      } else {
        const push = (radius - dist) / dist;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }
  }
}

function plankTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d");
  g.fillStyle = "#b18458";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 8; i++) {
    const y = i * 64;
    g.fillStyle = i % 2 ? "#a87548" : "#c39264";
    g.fillRect(0, y, 512, 62);
    g.strokeStyle = "rgba(70, 38, 16, 0.35)";
    g.strokeRect(0, y, 512, 62);
    g.strokeStyle = "rgba(90, 48, 20, 0.18)";
    g.beginPath();
    g.moveTo(0, y + 18);
    g.bezierCurveTo(140, y + 8, 280, y + 34, 512, y + 16);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(4, 5);
  return tex;
}

function addHome() {
  const group = new THREE.Group();
  const cx = 0;
  const cz = 58;
  const hw = 5.6;
  const hd = 7.1;
  const h = 3.35;
  const t = 0.16;

  const wall = new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 0.82 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xe4d5c3, roughness: 0.55 });
  const wood = new THREE.MeshPhysicalMaterial({
    color: 0xa67c52,
    roughness: 0.38,
    metalness: 0.02,
    clearcoat: 0.25,
    clearcoatRoughness: 0.45,
  });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x24352f, roughness: 0.72 });
  const linen = new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc5ccd1, metalness: 0.72, roughness: 0.28 });
  const plant = new THREE.MeshStandardMaterial({ color: 0x2f6a3c, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.45 });

  function piece(w, ht, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, ht, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  const floor = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 - 0.2, 0.08, hd * 2 - 0.35), wood);
  floor.position.set(cx, 0.1, cz + 0.12);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.08, hd * 2), wall);
  ceiling.position.set(cx, h, cz);
  group.add(ceiling);

  const southZ = cz - hd;
  const northZ = cz + hd;
  const westX = cx - hw;
  const eastX = cx + hw;

  function wallBox(w, d, x, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  function wallSeg(w, ht, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, ht, d), wall);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const winL = -2.35;
  const winR = 2.35;
  const winB = 0.84;
  const winT = 2.64;
  wallSeg(winL - westX, h, t, (westX + winL) / 2, h / 2, northZ);
  wallSeg(eastX - winR, h, t, (eastX + winR) / 2, h / 2, northZ);
  wallSeg(winR - winL, winB, t, 0, winB / 2, northZ);
  wallSeg(winR - winL, h - winT, t, 0, winT + (h - winT) / 2, northZ);
  function sideWall(x) {
    const gaps = [55.6, 60.2];
    const cuts = [southZ, 55.05, 56.15, 59.65, 60.75, northZ];
    for (let i = 0; i < cuts.length; i += 2) {
      const a = cuts[i];
      const b = cuts[i + 1];
      wallSeg(t, h, b - a, x, h / 2, (a + b) / 2);
    }
    for (const gz of gaps) {
      wallSeg(t, 1.12, 1.1, x, 0.56, gz);
      wallSeg(t, h - 2.55, 1.1, x, 2.55 + (h - 2.55) / 2, gz);
    }
  }
  sideWall(westX);
  sideWall(eastX);
  const door = 1.15;
  wallBox(hw - door, t, cx - (hw + door) / 2, southZ);
  wallBox(hw - door, t, cx + (hw + door) / 2, southZ);
  const corner = new THREE.CylinderGeometry(0.16, 0.17, h, 12);
  for (const x of [westX, eastX]) {
    for (const z of [southZ, northZ]) {
      const post = new THREE.Mesh(corner, trim);
      post.position.set(x, h / 2, z);
      post.castShadow = true;
      group.add(post);
    }
  }
  addBlock(westX - t, eastX + t, northZ - t / 2, northZ + t / 2);
  addBlock(westX - t / 2, westX + t / 2, southZ, northZ);
  addBlock(eastX - t / 2, eastX + t / 2, southZ, northZ);
  addBlock(westX, cx - door, southZ - t / 2, southZ + t / 2);
  addBlock(cx + door, eastX, southZ - t / 2, southZ + t / 2);

  const seeThrough = new THREE.MeshPhysicalMaterial({
    color: 0xe7f4ff,
    roughness: 0.02,
    metalness: 0,
    transmission: 1,
    thickness: 0.04,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(4.55, 1.72), seeThrough);
  glass.position.set(cx, (winB + winT) / 2, northZ);
  group.add(glass);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.08, 0.08), dark);
  frame.position.set(cx, 2.64, northZ - 0.04);
  group.add(frame);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.08, 0.08), dark);
  sill.position.set(cx, 0.76, northZ - 0.04);
  group.add(sill);
  const curtain = new THREE.MeshStandardMaterial({ color: 0xefe4d4, roughness: 0.86, side: THREE.DoubleSide });
  piece(0.55, 2.05, 0.04, curtain, cx - 2.15, 1.7, northZ - 0.18);
  piece(0.55, 2.05, 0.04, curtain, cx + 2.15, 1.7, northZ - 0.18);

  const floorMat = wood.clone();
  floorMat.map = plankTexture();
  floorMat.polygonOffset = true;
  floorMat.polygonOffsetFactor = 2;
  floorMat.polygonOffsetUnits = 2;
  floor.material = floorMat;

  const counter = new THREE.Mesh(softGeo(0.65, 0.9, 3.2, 0.06), new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.4 }));
  counter.position.set(cx + 4.85, 0.5, cz + 1.4);
  counter.castShadow = true;
  group.add(counter);
  const cabinet = new THREE.Mesh(softGeo(0.62, 0.72, 3.1, 0.05), dark);
  cabinet.position.set(cx + 4.9, 0.4, cz + 1.4);
  group.add(cabinet);
  addBlock(cx + 4.5, eastX, cz - 0.2, cz + 3.05);

  const day = new THREE.SpotLight(0xfff4e5, 6, 14, 0.9, 0.6, 1);
  day.position.set(cx, 3.05, northZ - 0.4);
  day.target.position.set(cx, 0.6, cz);
  day.castShadow = !phone;
  day.shadow.mapSize.set(1024, 1024);
  day.shadow.bias = -0.0004;
  group.add(day);
  group.add(day.target);

  const plaster = new THREE.MeshStandardMaterial({ color: 0xf7f3ec, roughness: 0.72 });
  const civic = new THREE.MeshStandardMaterial({ color: 0xe8e0d2, roughness: 0.55 });
  const civicDark = new THREE.MeshStandardMaterial({ color: 0xc2b6a4, roughness: 0.62 });
  const tileTex = paintCanvas(128, 256, (g) => {
    g.fillStyle = "#c85a40";
    g.fillRect(0, 0, 128, 256);
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      const shift = row % 2 ? 20 : 0;
      for (let col = -1; col < 5; col++) {
        g.fillStyle = row % 2 ? "#b84c34" : "#d36a4c";
        g.beginPath();
        g.arc(col * 36 + shift + 18, y + 22, 18, Math.PI, 0);
        g.fill();
      }
    }
  });
  tileTex.repeat.set(7, 3);
  const roofMat = new THREE.MeshStandardMaterial({ map: tileTex, color: 0xffffff, roughness: 0.72 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe7f4ff,
    roughness: 0.02,
    metalness: 0,
    transmission: 1,
    thickness: 0.04,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  piece(hw * 2 + 0.85, 0.12, hd * 2 + 0.85, civicDark, cx, h + 0.04, cz);
  const gable = new THREE.Shape();
  gable.moveTo(-(hd + 0.55), 0);
  gable.lineTo(0, 2.35);
  gable.lineTo(hd + 0.55, 0);
  const roofGeo = new THREE.ExtrudeGeometry(gable, { depth: hw * 2 + 1.3, bevelEnabled: false });
  roofGeo.translate(0, 0, -(hw + 0.65));
  roofGeo.rotateY(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(cx, h - 0.02, cz);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  piece(hw * 2 + 1.5, 0.14, 0.28, civicDark, cx, h + 2.22, cz);

  const jamb = hw - door;
  piece(jamb, 0.85, 0.22, civic, cx - (hw + door) / 2, 0.46, southZ - 0.2);
  piece(jamb, 0.85, 0.22, civic, cx + (hw + door) / 2, 0.46, southZ - 0.2);
  piece(0.22, 0.85, hd * 2 + 0.15, civic, westX - 0.12, 0.46, cz);
  piece(0.22, 0.85, hd * 2 + 0.15, civic, eastX + 0.12, 0.46, cz);
  piece(hw * 2 + 0.3, 0.85, 0.22, civic, cx, 0.46, northZ + 0.14);
  piece(hw * 2 + 0.45, 0.1, 0.16, civicDark, cx, 1.55, southZ - 0.16);
  function stringCourse(x) {
    const cuts = [southZ, 55.05, 56.15, 59.65, 60.75, northZ];
    for (let i = 0; i < cuts.length; i += 2) {
      const a = cuts[i];
      const b = cuts[i + 1];
      piece(0.12, 0.1, b - a, civicDark, x, 1.55, (a + b) / 2);
    }
  }
  stringCourse(westX - 0.14);
  stringCourse(eastX + 0.14);

  const steps = [
    [8.8, 1.25, 48.4, 0.05],
    [8.1, 1.15, 49.2, 0.12],
    [7.4, 1.05, 50.0, 0.2],
  ];
  for (const [w, d, z, y] of steps) {
    const tread = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), civic);
    tread.position.set(cx, y, z);
    tread.castShadow = true;
    tread.receiveShadow = true;
    group.add(tread);
  }
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 0.9), civic);
  threshold.position.set(cx, 0.2, 50.7);
  threshold.receiveShadow = true;
  group.add(threshold);

  const columnGeo = new THREE.LatheGeometry(
    [
      [0.34, 0],
      [0.36, 0.08],
      [0.24, 0.16],
      [0.2, 0.28],
      [0.18, 2.35],
      [0.22, 2.46],
      [0.34, 2.58],
      [0.36, 2.7],
      [0.28, 2.78],
    ].map((p) => new THREE.Vector2(p[0], p[1])),
    16,
  );
  for (const sx of [-3.05, -1.45, 1.45, 3.05]) {
    const column = new THREE.Mesh(columnGeo, plaster);
    column.position.set(cx + sx, 0.24, southZ - 1.05);
    column.castShadow = true;
    group.add(column);
    if (Math.abs(sx) > 1.2) addCircle(cx + sx, southZ - 1.05, 0.34);
  }
  piece(7.4, 0.16, 0.62, civic, cx, 3.08, southZ - 1.05);
  piece(7.1, 0.1, 0.48, civicDark, cx, 3.2, southZ - 1.05);

  const tri = new THREE.Shape();
  tri.moveTo(-3.35, 0);
  tri.lineTo(3.35, 0);
  tri.lineTo(0, 1.2);
  const pedGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 1 });
  const pediment = new THREE.Mesh(pedGeo, plaster);
  pediment.position.set(cx, 3.26, southZ - 1.28);
  pediment.castShadow = true;
  group.add(pediment);

  const sealCanvas = document.createElement("canvas");
  sealCanvas.width = 256;
  sealCanvas.height = 256;
  const sg = sealCanvas.getContext("2d");
  sg.fillStyle = "#f7f2ea";
  sg.beginPath();
  sg.arc(128, 128, 118, 0, Math.PI * 2);
  sg.fill();
  sg.strokeStyle = "#8d6844";
  sg.lineWidth = 10;
  sg.stroke();
  for (let n = 0; n < 12; n++) {
    const a = (n / 12) * Math.PI * 2 - Math.PI / 2;
    sg.beginPath();
    sg.arc(128 + Math.cos(a) * 78, 128 + Math.sin(a) * 78, 3.5, 0, Math.PI * 2);
    sg.fillStyle = "#2c2622";
    sg.fill();
  }
  sg.strokeStyle = "#2c2622";
  sg.lineWidth = 6;
  sg.lineCap = "round";
  sg.beginPath();
  sg.moveTo(128, 132);
  sg.lineTo(128, 62);
  sg.stroke();
  sg.lineWidth = 4;
  sg.beginPath();
  sg.moveTo(128, 132);
  sg.lineTo(176, 150);
  sg.stroke();
  const sealTex = new THREE.CanvasTexture(sealCanvas);
  sealTex.colorSpace = THREE.SRGBColorSpace;
  const seal = new THREE.Mesh(
    new THREE.CircleGeometry(0.46, 32),
    new THREE.MeshStandardMaterial({ map: sealTex, roughness: 0.4 }),
  );
  seal.position.set(cx, 3.72, southZ - 1.72);
  seal.rotation.y = Math.PI;
  group.add(seal);

  function archedWindow(x, z, rotY) {
    const frame = new THREE.Group();
    frame.position.set(x, 1.95, z);
    frame.rotation.y = rotY;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.35), glassMat);
    glass.position.y = -0.08;
    frame.add(glass);
    const arch = new THREE.Mesh(new THREE.CircleGeometry(0.46, 24, 0, Math.PI), glassMat);
    arch.position.y = 0.58;
    frame.add(arch);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.12), civicDark);
    sill.position.y = -0.78;
    frame.add(sill);
    const lintel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 18, Math.PI), dark);
    lintel.position.y = 0.58;
    frame.add(lintel);
    for (const side of [-0.5, 0.5]) {
      const jambBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.08), dark);
      jambBar.position.set(side, -0.08, 0);
      frame.add(jambBar);
    }
    group.add(frame);
  }
  for (const side of [-1, 1]) {
    for (const oz of [-2.4, 2.2]) archedWindow(cx + side * hw, cz + oz, side > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  for (const sx of [-2.3, 2.3]) {
    const doorJamb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.35, 0.18), civicDark);
    doorJamb.position.set(cx + sx, 1.35, southZ - 0.2);
    doorJamb.castShadow = true;
    group.add(doorJamb);
  }
  piece(4.8, 0.16, 0.2, civicDark, cx, 2.55, southZ - 0.22);

  const porch = new THREE.PointLight(0xffe0b0, 8, 12, 2);
  porch.position.set(cx, 2.6, southZ - 2.1);
  group.add(porch);

  for (const sx of [-4.2, 4.2]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.42, 14), civicDark);
    pot.position.set(cx + sx, 0.28, 47.7);
    pot.castShadow = true;
    group.add(pot);
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), plant);
    shrub.position.set(cx + sx, 0.78, 47.7);
    shrub.castShadow = true;
    group.add(shrub);
    const shrub2 = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), plant);
    shrub2.position.set(cx + sx + Math.sign(sx) * 0.12, 1.05, 47.65);
    group.add(shrub2);
  }

  scene.add(group);
}

const skyPack = addSky();
function addQuarry() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d");
  g.fillStyle = "#8a705c";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 28; i++) {
    const n = (i * 37) % 40;
    g.fillStyle = `rgba(${90 + n}, ${70 + (n % 18)}, ${48 + (n % 12)}, 0.35)`;
    g.beginPath();
    g.ellipse((i * 73) % 512, (i * 41) % 512, 40 + (i % 5) * 18, 28 + (i % 4) * 12, i, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 2400; i++) {
    const n = (i * 17) % 50;
    g.fillStyle = n > 30 ? "#5c4638" : n > 15 ? "#c2a588" : "#74604e";
    g.fillRect((i * 13) % 512, (i * 29) % 512, 1 + (i % 3), 1 + (i % 2));
  }
  g.strokeStyle = "rgba(60, 42, 32, 0.35)";
  g.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    g.moveTo((i * 47) % 512, (i * 19) % 512);
    g.lineTo((i * 47 + 80) % 512, (i * 19 + 36) % 512);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  const span = (QUARRY.rim + 2) * 2;
  const segs = phone ? 14 : 56;
  const geo = new THREE.PlaneGeometry(span, span, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const h = quarryGround(QUARRY.x + pos.getX(i), QUARRY.z + pos.getZ(i));
    pos.setY(i, h == null ? 0.04 : h);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.02 }),
  );
  mesh.position.set(QUARRY.x, 0, QUARRY.z);
  mesh.receiveShadow = true;
  scene.add(mesh);

  const rock = new THREE.MeshStandardMaterial({ color: 0x6d6258, roughness: 0.86 });
  const moss = new THREE.MeshStandardMaterial({ color: 0x3d6a3a, roughness: 0.8 });
  for (let i = 0; i < (phone ? 4 : 12); i++) {
    const a = (i / 12) * Math.PI * 2 + 0.4;
    const x = QUARRY.x + Math.cos(a) * 17.2;
    const z = QUARRY.z + Math.sin(a) * 17.2;
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 + (i % 3) * 0.18, 0), rock);
    boulder.position.set(x, quarryGround(x, z) + 0.35, z);
    boulder.rotation.set(i, a, 0.4);
    boulder.castShadow = true;
    scene.add(boulder);
    addCircle(x, z, 0.55);
    const tree = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.1, 7), moss);
    const tx = QUARRY.x + Math.cos(a + 0.28) * 20.2;
    const tz = QUARRY.z + Math.sin(a + 0.28) * 20.2;
    tree.position.set(tx, (quarryGround(tx, tz) || 0.2) + 1.05, tz);
    tree.castShadow = true;
    scene.add(tree);
    addCircle(tx, tz, 0.4);
  }
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2e30, roughness: 0.42, metalness: 0.55 });
  for (let i = 0; i < (phone ? 0 : 8); i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const x = QUARRY.x + Math.cos(a) * 12.4;
    const z = QUARRY.z + Math.sin(a) * 12.4;
    const y = quarryGround(x, z) || 0.8;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 2.4, 8), iron);
    pole.position.set(x, y + 1.2, z);
    pole.castShadow = true;
    scene.add(pole);
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 8),
      lampGlow || new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffc56a, emissiveIntensity: 1.4 }),
    );
    glass.position.set(x, y + 2.45, z);
    scene.add(glass);
    const bulb = new THREE.PointLight(0xffe2a6, 0, 22, 2);
    bulb.position.set(x, y + 2.4, z);
    bulb.userData.lx = x;
    bulb.userData.lz = z;
    scene.add(bulb);
    streetLights.push(bulb);
  }
}

addHome();
const lights = addLights(skyPack.sun);
addGround();
addMountain();
addFountain();
addGarden();
addQuarry();
addBoard();

function addMountain() {
  const size = Math.max(PEAK.rx, PEAK.rz) * 2 + 8;
  const geo = new THREE.PlaneGeometry(size, size, 88, 88);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grassC = new THREE.Color(0x6a9144);
  const rockC = new THREE.Color(0x7d7268);
  const snowC = new THREE.Color(0xf4f7fb);
  const dirtC = new THREE.Color(0x8d6844);
  const tint = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = PEAK.x + pos.getX(i);
    const z = PEAK.z + pos.getZ(i);
    const y = mountainAt(x, z);
    if (y == null) {
      const dx = x - PEAK.x;
      const dz = z - PEAK.z;
      const e = Math.hypot(dx / PEAK.rx, dz / PEAK.rz) || 1;
      pos.setX(i, dx / e);
      pos.setZ(i, dz / e);
      pos.setY(i, 0);
      grassC.toArray(colors, i * 3);
    } else {
      pos.setY(i, y);
      const t = y / PEAK.top;
      const band = Math.sin(x * 0.55 + z * 0.37);
      if (onPlaza(x, z)) tint.set(0x7ea85a);
      else if (climbAt(x, z) != null) tint.set(0x8d6844);
      else if (t > 0.82) tint.set(0xd7d2c8).lerp(new THREE.Color(0xb7a090), 0.35);
      else if (band > 0.45) tint.set(0xc47a4a);
      else if (band < -0.45) tint.set(0x6e7a72);
      else if (t > 0.45) tint.set(0x8a7568).lerp(new THREE.Color(0x6a8f4a), 0.28);
      else tint.set(0x6a9144).lerp(new THREE.Color(0x8d7358), 0.4);
      tint.toArray(colors, i * 3);
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const rockTex = paintCanvas(256, 256, (g) => {
    g.fillStyle = "#8d8478";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {
      const gx = (i % 5) * 52;
      const gy = Math.floor(i / 5) * 48;
      const n = 150 + (i * 17) % 50;
      g.fillStyle = `rgb(${n}, ${n - 8}, ${n - 16})`;
      g.fillRect(gx + 2, gy + 2, 46, 40);
      g.strokeStyle = "rgba(50,42,36,0.45)";
      g.strokeRect(gx + 2, gy + 2, 46, 40);
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = i % 2 ? "rgba(255,255,255,0.16)" : "rgba(40,32,26,0.28)";
      g.fillRect((i * 29) % 256, (i * 47) % 256, 4, 2);
    }
  });
  rockTex.wrapS = THREE.RepeatWrapping;
  rockTex.wrapT = THREE.RepeatWrapping;
  rockTex.repeat.set(6, 6);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: rockTex, vertexColors: true, roughness: 0.9 }),
  );
  mesh.position.set(PEAK.x, 0, PEAK.z);
  mesh.receiveShadow = true;
  scene.add(mesh);

  const y = PEAK.top;
  const cx = PEAK.x;
  const cz = PEAK.plazaZ;
  const dirtTex = paintCanvas(128, 256, (g) => {
    g.fillStyle = "#6d5340";
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = "#8a6a48";
    g.fillRect(18, 0, 92, 256);
    g.fillStyle = "#c4b49a";
    g.fillRect(58, 0, 8, 256);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = i % 2 ? "rgba(255,236,200,0.18)" : "rgba(40,24,12,0.28)";
      g.fillRect((i * 17) % 128, (i * 29) % 256, 16, 3);
    }
    g.strokeStyle = "rgba(70,52,36,0.55)";
    g.strokeRect(16, 0, 96, 256);
  });
  dirtTex.wrapS = THREE.RepeatWrapping;
  dirtTex.wrapT = THREE.RepeatWrapping;
  dirtTex.repeat.set(1, 3);
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 0.92 });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x9a9186, roughness: 0.88 });
  function climbY(f) {
    return 0.12 + climbEase(f) * (PEAK.top - 0.12);
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3e8b46, roughness: 0.78 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4630, roughness: 0.9 });
  const benchWood = new THREE.MeshStandardMaterial({ color: 0x8d5a34, roughness: 0.7 });
  for (let i = 0; i < CLIMB.length - 1; i++) {
    const a = CLIMB[i];
    const b = CLIMB[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.round(len / 1.35));
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      const ax = a[0] + (b[0] - a[0]) * t0;
      const az = a[1] + (b[1] - a[1]) * t0;
      const bx = a[0] + (b[0] - a[0]) * t1;
      const bz = a[1] + (b[1] - a[1]) * t1;
      const y0 = climbY(a[2] + (b[2] - a[2]) * t0);
      const y1 = climbY(a[2] + (b[2] - a[2]) * t1);
      const piece = Math.hypot(bx - ax, bz - az, y1 - y0);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, piece + 0.2), dirtMat);
      const midY = (y0 + y1) / 2 + 0.1;
      slab.position.set((ax + bx) / 2, midY, (az + bz) / 2);
      slab.lookAt(bx, y1 + 0.1, bz);
      slab.receiveShadow = true;
      scene.add(slab);
      const side = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (bz - az) / side;
      const nz = -(bx - ax) / side;
      for (const sign of [-1, 1]) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, piece + 0.12), curbMat);
        curb.position.set((ax + bx) / 2 + nx * sign * 2.15, midY + 0.06, (az + bz) / 2 + nz * sign * 2.15);
        curb.lookAt(bx, y1 + 0.16, bz);
        curb.receiveShadow = true;
        scene.add(curb);
      }
      if (s % 3 === 1 && s < steps - 1) {
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        const sign = s % 6 === 1 ? 1 : -1;
        const tx = mx + nx * sign * 3.35;
        const tz = mz + nz * sign * 3.35;
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.5, 6), trunkMat);
        trunk.position.y = 0.75;
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), leafMat);
        crown.position.y = 1.7;
        tree.add(trunk, crown);
        tree.position.set(tx, midY, tz);
        scene.add(tree);
      }
      if (s % 5 === 2) {
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        const sign = s % 10 === 2 ? -1 : 1;
        const seat = new THREE.Group();
        const plank = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.36), benchWood);
        plank.position.y = 0.46;
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.36, 0.05), benchWood);
        back.position.set(0, 0.68, -0.15);
        seat.add(plank, back);
        seat.position.set(mx + nx * sign * 2.7, midY, mz + nz * sign * 2.7);
        seat.lookAt(mx, midY, mz);
        scene.add(seat);
        benchSpots.push({ x: seat.position.x, z: seat.position.z, yaw: seat.rotation.y });
      }
    }
  }
  const gate = CLIMB[0];
  const gateNext = CLIMB[1];
  const gdx = gateNext[0] - gate[0];
  const gdz = gateNext[1] - gate[1];
  const glen = Math.hypot(gdx, gdz) || 1;
  const gfx = gdx / glen;
  const gfz = gdz / glen;
  const grx = gdz / glen;
  const grz = -gdx / glen;
  const gateY = climbY(0);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6a4630, roughness: 0.82 });
  const lampIron = new THREE.MeshStandardMaterial({ color: 0x2a2e30, roughness: 0.4, metalness: 0.55 });
  const lampGlowMat = new THREE.MeshStandardMaterial({ color: 0xfff1cc, emissive: 0xffc56a, emissiveIntensity: 1.8, roughness: 0.28 });
  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = 512;
  boardCanvas.height = 220;
  const bg = boardCanvas.getContext("2d");
  bg.fillStyle = "#5c3a22";
  bg.fillRect(0, 0, 512, 220);
  bg.fillStyle = "#f6ecd4";
  bg.fillRect(18, 16, 476, 188);
  bg.strokeStyle = "#8d6844";
  bg.lineWidth = 6;
  bg.strokeRect(28, 26, 456, 168);
  bg.fillStyle = "#3a2414";
  bg.font = "700 68px Georgia, serif";
  bg.textAlign = "center";
  bg.fillText("BELVEDERE", 256, 118);
  bg.font = "500 28px Georgia, serif";
  bg.fillText("salita al belvedere", 256, 164);
  const boardMap = new THREE.CanvasTexture(boardCanvas);
  boardMap.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.05, 0.08),
    new THREE.MeshStandardMaterial({ map: boardMap, roughness: 0.72 }),
  );
  board.position.set(gate[0] - gfx * 1.6, gateY + 1.55, gate[1] - gfz * 1.6);
  board.lookAt(gate[0] - gfx * 4, gateY + 1.55, gate[1] - gfz * 4);
  scene.add(board);
  for (const side of [-1.35, 1.35]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.15, 0.16), postMat);
    post.position.set(board.position.x + grx * side, gateY + 1.05, board.position.z + grz * side);
    scene.add(post);
  }
  function pathLamp(px, pz, py) {
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 2.5, 8), lampIron);
    pole.position.y = 1.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lampGlowMat);
    head.position.y = 2.55;
    const bulb = new THREE.PointLight(0xfff0c4, 36, 18, 1.45);
    bulb.position.y = 2.45;
    lamp.add(pole, head, bulb);
    lamp.position.set(px, py, pz);
    scene.add(lamp);
  }
  for (const side of [-1, 1]) {
    pathLamp(gate[0] + grx * side * 3.5 - gfx * 0.4, gate[1] + grz * side * 3.5 - gfz * 0.4, gateY);
    const along = 3.2 / glen;
    pathLamp(
      gate[0] + grx * side * 3.15 + gfx * 3.2,
      gate[1] + grz * side * 3.15 + gfz * 3.2,
      climbY(along),
    );
  }
  for (let i = 1; i <= 3; i++) {
    const f = i / 4;
    const px = gate[0] + (gateNext[0] - gate[0]) * f;
    const pz = gate[1] + (gateNext[1] - gate[1]) * f;
    pathLamp(px + grx * 3.4, pz + grz * 3.4, climbY(f));
    pathLamp(px - grx * 3.4, pz - grz * 3.4, climbY(f));
  }
  const stoneTex = paintCanvas(128, 128, (g) => {
    g.fillStyle = "#c8bfb0";
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const n = 180 + ((row * 3 + col) * 17) % 40;
        g.fillStyle = `rgb(${n}, ${n - 6}, ${n - 16})`;
        g.fillRect(col * 32 + 2, row * 32 + 2, 28, 28);
      }
    }
  });
  const stone = new THREE.Mesh(
    new THREE.CircleGeometry(1, 28),
    new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.84 }),
  );
  stone.rotation.x = -Math.PI / 2;
  stone.scale.set(PEAK.flatX * 0.92, PEAK.flatZ * 0.92, 1);
  stone.position.set(cx, y + 0.04, cz);
  scene.add(stone);

  const pondX = cx - 5.6;
  const pondZ = cz + 1.1;
  const pondR = 2.45;
  const sandTex = paintCanvas(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 140, 10, 128, 128, 128);
    grd.addColorStop(0, "#c4a36a");
    grd.addColorStop(0.55, "#8d7348");
    grd.addColorStop(1, "#5c6a58");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = i % 2 ? "rgba(255,244,220,0.28)" : "rgba(60,40,20,0.25)";
      g.beginPath();
      g.ellipse((i * 37) % 256, (i * 19) % 256, 10, 4, i, 0, Math.PI * 2);
      g.fill();
    }
  });
  const sand = new THREE.Mesh(
    new THREE.CircleGeometry(pondR * 0.96, 48),
    new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.92 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(pondX, y + 0.05, pondZ);
  scene.add(sand);
  const pondMat = rippleMaterial(0x146888, pondR, 0.9);
  pondMat.opacity = 0.78;
  pondMat.transparent = true;
  pondMat.depthWrite = false;
  pondMat.roughness = 0.04;
  const pond = new THREE.Mesh(new THREE.CircleGeometry(pondR, 72), pondMat);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(pondX, y + 0.1, pondZ);
  pond.renderOrder = 3;
  scene.add(pond);
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(pondR, pondR + 0.28, 40),
    new THREE.MeshStandardMaterial({ color: 0x8d8478, roughness: 0.9, side: THREE.DoubleSide }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(pondX, y + 0.11, pondZ);
  scene.add(rim);
  const pebbleMat = new THREE.MeshStandardMaterial({ color: 0xb7aea0, roughness: 0.82 });
  const wetMat = new THREE.MeshStandardMaterial({ color: 0x6e675e, roughness: 0.55 });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + (i % 3) * 0.05, 0), i % 2 ? pebbleMat : wetMat);
    rock.position.set(pondX + Math.cos(a) * (pondR + 0.22), y + 0.14, pondZ + Math.sin(a) * (pondR + 0.22));
    rock.scale.y = 0.55;
    rock.rotation.set(i, a, i * 0.2);
    scene.add(rock);
  }

  const brick = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.86 });
  const logTex = paintCanvas(64, 64, (g) => {
    g.fillStyle = "#6a3e24";
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(40,20,10,0.45)";
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(0, 8 + i * 10);
      g.bezierCurveTo(20, 4 + i * 10, 40, 14 + i * 10, 64, 8 + i * 10);
      g.stroke();
    }
  });
  const logMat = new THREE.MeshStandardMaterial({ map: logTex, roughness: 0.8 });
  for (const [ox, oz] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.42), brick);
    block.position.set(cx + ox, y + 0.2, cz + oz);
    scene.add(block);
  }
  for (const spin of [0.2, 1.3]) {
    const logs = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.7, 8), logMat);
    logs.rotation.z = Math.PI / 2;
    logs.rotation.y = spin;
    logs.position.set(cx, y + 0.34, cz);
    scene.add(logs);
  }
  const flameMap = paintCanvas(64, 128, (g) => {
    g.clearRect(0, 0, 64, 128);
    const grd = g.createLinearGradient(32, 128, 32, 0);
    grd.addColorStop(0, "rgba(160,20,0,0)");
    grd.addColorStop(0.28, "rgba(230,70,8,0.9)");
    grd.addColorStop(0.62, "rgba(255,170,40,0.95)");
    grd.addColorStop(1, "rgba(255,244,190,0.15)");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(32, 6);
    g.quadraticCurveTo(62, 64, 42, 124);
    g.quadraticCurveTo(32, 88, 22, 124);
    g.quadraticCurveTo(2, 64, 32, 6);
    g.fill();
  });
  for (let i = 0; i < 4; i++) {
    const flame = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.7),
      new THREE.MeshBasicMaterial({
        map: flameMap,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    flame.position.set(cx + (i - 1.5) * 0.05, y + 0.72, cz);
    flame.rotation.y = i * 0.7;
    flame.userData.i = i;
    hearthFlames.push(flame);
    scene.add(flame);
  }
  const glow = new THREE.PointLight(0xff8a3a, 1.2, 9, 2);
  glow.position.set(cx, y + 0.9, cz);
  scene.add(glow);

  const wood = new THREE.MeshStandardMaterial({ color: 0x8d5a34, roughness: 0.7 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3c4146, roughness: 0.4, metalness: 0.4 });
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 12), wood);
  top.position.y = 0.74;
  table.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.72, 8), iron);
  leg.position.y = 0.36;
  table.add(leg);
  table.position.set(cx + 2.05, y, cz + 0.15);
  scene.add(table);

  function chair(x, z, yaw) {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), wood);
    seat.position.y = 0.46;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.05), wood);
    back.position.set(0, 0.7, -0.18);
    group.add(seat, back);
    [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]].forEach(([lx, lz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.44, 0.04), iron);
      post.position.set(lx, 0.22, lz);
      group.add(post);
    });
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    scene.add(group);
    benchSpots.push({ x, z, yaw: yaw + Math.PI });
  }
  chair(cx + 2.05, cz + 0.95, 0);
  chair(cx + 2.05, cz - 0.7, Math.PI);
  chair(cx + 1.25, cz + 0.15, Math.PI / 2);
  chair(cx + 2.85, cz + 0.15, -Math.PI / 2);
  chair(cx - 1.7, cz + 1.15, 0.5);
  chair(cx - 1.55, cz - 1.2, -0.4);

  for (const [lx, lz] of [[cx + 6.2, cz + 2.2], [cx + 6.2, cz - 2.4], [cx - 1.2, cz + 3.6], [cx + 1.4, cz - 3.4]]) {
    const lamp = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 8), iron);
    post.position.y = 1.1;
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe1a8, emissive: 0xffc56a, emissiveIntensity: 0.8 }),
    );
    bulb.position.y = 2.2;
    lamp.add(post, bulb);
    lamp.position.set(lx, y, lz);
    scene.add(lamp);
  }
}

function ownMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const cloned = list.map((mat) => mat.clone());
    obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}

const PEOPLE = [
  { skin: "#f6d3b8", hair: "#c4a574", top: "#f4f1ea", pants: "#1e3a5f", shoes: "#111111", glasses: true, hat: false, earrings: "stud" },
  { skin: "#e0ac7a", hair: "#1b1b1b", top: "#8d3b3b", pants: "#1c1c1c", shoes: "#f4f4f4", glasses: false, hat: true, earrings: "hoop" },
  { skin: "#c68642", hair: "#4a3428", top: "#1d3a5f", pants: "#5c4033", shoes: "#111111", glasses: true, hat: false, earrings: "off" },
  { skin: "#8d5524", hair: "#1b1b1b", top: "#24352f", pants: "#1c1c1c", shoes: "#c4a574", glasses: false, hat: false, earrings: "stud" },
  { skin: "#f6d3b8", hair: "#a33b24", top: "#1c1c1c", pants: "#6b2d5b", shoes: "#8d3b3b", glasses: true, hat: true, earrings: "off" },
  { skin: "#e0ac7a", hair: "#d9d9d9", top: "#f4f1ea", pants: "#1e3a5f", shoes: "#1d4e89", glasses: false, hat: false, earrings: "hoop" },
  { skin: "#4a312c", hair: "#1b1b1b", top: "#8d3b3b", pants: "#1c1c1c", shoes: "#111111", glasses: false, hat: true, earrings: "stud" },
  { skin: "#c68642", hair: "#c4a574", top: "#1d3a5f", pants: "#f4f1ea", shoes: "#c4a574", glasses: true, hat: false, earrings: "off" },
];

function paintNamed(root, look) {
  const meshes = {};
  root.traverse((obj) => {
    if (obj.isMesh) meshes[obj.name] = obj;
  });
  paintMesh(meshes.Wolf3D_Head, look.skin, 0.78);
  paintMesh(meshes.Wolf3D_Body, look.skin, 0.86);
  paintMesh(meshes.Wolf3D_Hair, look.hair, 0.88);
  paintMesh(meshes.Wolf3D_Outfit_Top, look.top, 0.94);
  paintMesh(meshes.Wolf3D_Outfit_Bottom, look.pants, 0.94);
  paintMesh(meshes.Wolf3D_Outfit_Footwear, look.shoes, 0.94);
  if (meshes.Wolf3D_Glasses) meshes.Wolf3D_Glasses.visible = !!look.glasses;
  const gear = attachGear(root, {});
  if (gear.hat) gear.hat.visible = !!look.hat;
  const ears = look.earrings || "off";
  gear.studL.visible = ears === "stud";
  gear.studR.visible = ears === "stud";
  gear.hoopL.visible = ears === "hoop";
  gear.hoopR.visible = ears === "hoop";
  gear.piercing.visible = false;
  gear.ring.visible = false;
  gear.tattoo.visible = false;
  gear.bun.visible = false;
  if (gear.hair) gear.hair.visible = true;
}

const ROLES = [
  { speed: 1.05, sy: 1.06, sx: 1.02 },
  { speed: 0.72, sy: 0.92, sx: 0.96 },
  { speed: 0.82, sy: 1, sx: 1.08 },
  { speed: 0.7, sy: 1.04, sx: 1.16 },
  { speed: 0.92, sy: 1.02, sx: 1 },
  { speed: 1.08, sy: 1.1, sx: 1.04 },
  { speed: 0.88, sy: 0.96, sx: 1 },
  { speed: 0.64, sy: 0.9, sx: 0.94 },
  { speed: 0.78, sy: 1.02, sx: 1.1 },
  { speed: 1.15, sy: 1, sx: 1 },
];

const ROBOTS = [
  { shell: 0xc5ccd4, trim: 0x243044, eye: 0x7fd0ff, head: "box", antenna: "one", chest: "screen" },
  { shell: 0xd4a24a, trim: 0x3a2a14, eye: 0xffe08a, head: "dome", antenna: "two", chest: "vents" },
  { shell: 0xb7c9c4, trim: 0x1c3a34, eye: 0x5dffa8, head: "round", antenna: "dish", chest: "plate" },
  { shell: 0x8d97a3, trim: 0x6b2430, eye: 0xff6a6a, head: "box", antenna: "none", chest: "screen" },
  { shell: 0xe6e1d6, trim: 0x24507a, eye: 0x9fd0ff, head: "cylinder", antenna: "one", chest: "plate" },
  { shell: 0x6e7c86, trim: 0xc9842a, eye: 0xffc14a, head: "dome", antenna: "none", chest: "vents" },
  { shell: 0x9aa3ad, trim: 0x3d2a6a, eye: 0xc9a0ff, head: "round", antenna: "two", chest: "screen" },
  { shell: 0xd0d5dc, trim: 0x1a1c20, eye: 0xf4f7ff, head: "box", antenna: "dish", chest: "plate" },
  { shell: 0xb08a62, trim: 0x243028, eye: 0xb6ff6a, head: "cylinder", antenna: "one", chest: "vents" },
  { shell: 0xaeb6bf, trim: 0x8a3030, eye: 0xff9a6a, head: "dome", antenna: "none", chest: "screen" },
];

function dressRobot(bones, index) {
  const kit = ROBOTS[index % ROBOTS.length];
  const shell = new THREE.MeshStandardMaterial({ color: kit.shell, metalness: 0.74, roughness: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: kit.trim, metalness: 0.62, roughness: 0.38 });
  const joint = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.5, roughness: 0.42 });
  const glow = new THREE.MeshStandardMaterial({
    color: kit.eye,
    emissive: kit.eye,
    emissiveIntensity: 0.9,
    roughness: 0.22,
    metalness: 0.15,
  });
  const bulk = 0.86 + (index % 5) * 0.05;
  function put(bone, geo, mat, x, y, z) {
    const host = bones[bone];
    if (!host) return null;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    host.add(mesh);
    return mesh;
  }
  if (kit.head === "box") put("Head", new THREE.BoxGeometry(0.16, 0.14, 0.15), shell, 0, 0.12, 0.02);
  else if (kit.head === "dome") put("Head", new THREE.SphereGeometry(0.09, 16, 12), shell, 0, 0.13, 0.02);
  else if (kit.head === "cylinder") put("Head", new THREE.CylinderGeometry(0.078, 0.09, 0.15, 12), shell, 0, 0.12, 0.02);
  else put("Head", new THREE.SphereGeometry(0.086, 16, 12), shell, 0, 0.12, 0.02);
  if (index % 2 === 0) put("Head", new THREE.BoxGeometry(0.11, 0.032, 0.02), glow, 0, 0.12, 0.1);
  else {
    put("Head", new THREE.SphereGeometry(0.018, 10, 8), glow, -0.034, 0.13, 0.09);
    put("Head", new THREE.SphereGeometry(0.018, 10, 8), glow, 0.034, 0.13, 0.09);
  }
  if (kit.antenna === "one") put("Head", new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), trim, 0, 0.24, 0);
  if (kit.antenna === "two") {
    put("Head", new THREE.CylinderGeometry(0.006, 0.006, 0.1, 6), trim, -0.04, 0.22, 0);
    put("Head", new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), trim, 0.04, 0.24, 0);
  }
  if (kit.antenna === "dish") {
    put("Head", new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6), trim, 0.05, 0.2, 0);
    const dish = put("Head", new THREE.CylinderGeometry(0.04, 0.04, 0.012, 12), trim, 0.05, 0.25, 0.02);
    if (dish) dish.rotation.x = 0.7;
  }
  put("Neck", new THREE.CylinderGeometry(0.04, 0.046, 0.06, 8), joint, 0, 0.02, 0);
  put("Spine2", new THREE.BoxGeometry(0.28 * bulk, 0.2, 0.12), shell, 0, 0.02, 0.03);
  if (kit.chest === "screen") put("Spine2", new THREE.BoxGeometry(0.12, 0.07, 0.012), glow, 0, 0.04, 0.095);
  if (kit.chest === "vents") {
    put("Spine2", new THREE.BoxGeometry(0.16, 0.012, 0.012), trim, 0, 0.07, 0.095);
    put("Spine2", new THREE.BoxGeometry(0.16, 0.012, 0.012), trim, 0, 0.04, 0.095);
    put("Spine2", new THREE.BoxGeometry(0.16, 0.012, 0.012), trim, 0, 0.01, 0.095);
  }
  if (kit.chest === "plate") put("Spine2", new THREE.BoxGeometry(0.16, 0.09, 0.016), trim, 0, 0.03, 0.09);
  put("LeftShoulder", new THREE.BoxGeometry(0.07, 0.05, 0.07), trim, 0, 0.02, 0);
  put("RightShoulder", new THREE.BoxGeometry(0.07, 0.05, 0.07), trim, 0, 0.02, 0);
  put("Hips", new THREE.BoxGeometry(0.22, 0.08, 0.12), shell, 0, 0.03, 0);
  function limb(bone, radius, len) {
    put(bone, new THREE.CylinderGeometry(radius, radius * 0.9, len, 8), shell, 0, len * 0.42, 0);
    put(bone, new THREE.SphereGeometry(radius * 1.05, 8, 6), joint, 0, 0.02, 0);
  }
  limb("LeftArm", 0.042 * bulk, 0.2);
  limb("RightArm", 0.042 * bulk, 0.2);
  limb("LeftForeArm", 0.036 * bulk, 0.18);
  limb("RightForeArm", 0.036 * bulk, 0.18);
  put("LeftHand", new THREE.BoxGeometry(0.05, 0.055, 0.035), trim, 0, 0.05, 0.01);
  put("RightHand", new THREE.BoxGeometry(0.05, 0.055, 0.035), trim, 0, 0.05, 0.01);
  limb("LeftUpLeg", 0.05 * bulk, 0.28);
  limb("RightUpLeg", 0.05 * bulk, 0.28);
  limb("LeftLeg", 0.042 * bulk, 0.26);
  limb("RightLeg", 0.042 * bulk, 0.26);
  put("LeftFoot", new THREE.BoxGeometry(0.08, 0.035, 0.13), trim, 0, 0.02, 0.04);
  put("RightFoot", new THREE.BoxGeometry(0.08, 0.035, 0.13), trim, 0, 0.02, 0.04);
}

const ROUTES = [
  [[20, 0], [8, 1], [2, 8], [8, -2], [20, 0], [32, 4], [46, 6], [34, 12]],
  [[-20, 0], [-8, 2], [-4, 8], [-10, -2], [-20, 0], [-34, 4], [-50, 8], [-36, -4]],
  [[0, 20], [1, 8], [6, 4], [-4, 6], [0, 10], [0, 20], [2, 34], [0, 46], [-2, 32]],
  [[0, -20], [2, -8], [8, -4], [-6, -6], [0, -10], [0, -20], [14, -24], [24, -18], [-10, -24]],
  [[-40, 30], [-52, 40], [-46, 32], [-36, 26], [-40, 55], [-40, 70], [-20, 70], [-52, 70]],
  [[20, 0], [8, -4], [12, 6], [0, 12], [0, 22], [18, 24], [26, 12], [20, 0]],
  [[-20, 0], [-8, 6], [-6, -4], [-12, 2], [-20, 0], [-28, 16], [-26, -6]],
  [[0, 20], [2, 8], [-6, 6], [4, 2], [0, 12], [0, 22], [-12, 20], [0, 20]],
  [[36, 18], [48, 8], [58, 4], [44, -8], [32, 6]],
  [[-42, -6], [-30, -18], [-18, -8], [-28, 8], [-44, 10], [-40, -20], [-40, -46], [-16, -46], [-52, -46]],
];

function spawnCitizen(root, i, clips) {
  fitOnGround(root);
  const role = ROLES[i % ROLES.length];
  root.traverse((obj) => {
    if (obj.isSkinnedMesh) obj.visible = false;
  });
  const bones = {};
  root.traverse((obj) => {
    if (obj.isBone) bones[obj.name] = obj;
  });
  dressRobot(bones, i);
  let phone = null;
  if (bones.RightHand) {
    phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.1, 0.008),
      new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.35, metalness: 0.4 }),
    );
    phone.position.set(0.02, 0.12, 0.03);
    phone.visible = false;
    bones.RightHand.add(phone);
  }
  const mixer = new THREE.AnimationMixer(root);
  const actions = setupActions(mixer, clips);
  mixers.push(mixer);
  const pivot = new THREE.Group();
  pivot.scale.set(role.sx, role.sy, role.sx);
  pivot.add(root);
  scene.add(pivot);
  const route = ROUTES[i % ROUTES.length];
  pivot.position.set(route[0][0], groundAt(route[0][0], route[0][1]), route[0][1]);
  const npc = {
    pivot,
    actions,
    bones,
    phone,
    mixer,
    hunch: 0,
    speed: role.speed,
    route,
    wp: 1,
    mode: "walk",
    modeT: 0,
  };
  npcs.push(npc);
  setNpcAnim(npc, true);
}

function setNpcAnim(n, walking) {
  if (!n.actions) return;
  if (n.actions.walk) {
    n.actions.walk.setEffectiveWeight(walking ? 1 : 0);
    n.actions.walk.setEffectiveTimeScale(Math.max(0.45, n.speed / 1.15));
  }
  if (n.actions.idle) n.actions.idle.setEffectiveWeight(walking ? 0 : 1);
}

function spawnNpc(gltf, i, total, face) {
  const root = cloneSkeleton(gltf.scene);
  const outfit = [0x8fb7e8, 0xe7b08a, 0x9dcea0, 0xe0a0a8, 0xd8c48a, 0xb7a4e0, 0x8ecfc4, 0xe8c2b0];
  recastMaterials(root, new THREE.Color(outfit[i % outfit.length]));
  fitOnGround(root);
  const mixer = new THREE.AnimationMixer(root);
  const actions = setupActions(mixer, gltf.animations);
  const linear = 1.32 + (i % 4) * 0.1;
  if (actions.walk) {
    Object.values(actions).forEach((a) => a.setEffectiveWeight(0));
    actions.walk.setEffectiveWeight(1);
    actions.walk.setEffectiveTimeScale(linear / 1.45);
  }
  mixers.push(mixer);

  const pivot = new THREE.Group();
  pivot.add(root);
  scene.add(pivot);
  npcs.push({
    pivot,
    radius: i % 2 === 0 ? 20.85 : 22.55,
    linear,
    phase: (i / total) * Math.PI * 2,
    dir: i % 2 === 0 ? 1 : -1,
    face: face || 0,
  });
}

function spawnHorse(gltf, i) {
  const root = cloneSkeleton(gltf.scene);
  recastMaterials(root, new THREE.Color().setHSL(0.08 + i * 0.03, 0.35, 0.55 + i * 0.05));
  fitOnGround(root);
  const mixer = new THREE.AnimationMixer(root);
  if (gltf.animations[0]) {
    const act = mixer.clipAction(gltf.animations[0]);
    act.play();
    act.timeScale = 0.85;
  }
  mixers.push(mixer);
  const pivot = new THREE.Group();
  pivot.add(root);
  scene.add(pivot);
  animals.push({
    pivot,
    radius: 32 + i * 3.5,
    linear: 2.6,
    phase: i * 1.7,
  });
}

function spawnBird(gltf, i) {
  const root = cloneSkeleton(gltf.scene);
  const feather = new THREE.Color().setHSL((0.08 + i * 0.18) % 1, 0.45, 0.55);
  recastMaterials(root, feather);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  root.scale.multiplyScalar(0.32 / Math.max(size.y, 0.001));
  const mixer = new THREE.AnimationMixer(root);
  let action = null;
  if (gltf.animations[0]) {
    action = mixer.clipAction(gltf.animations[0]);
    action.play();
  }
  mixers.push(mixer);
  const bird = { root, action, state: "cruise", from: new THREE.Vector3(), to: new THREE.Vector3(), timer: 0, dur: 1, peck: i };
  scene.add(root);
  root.position.set(Math.cos(i) * 12, 5 + i * 0.3, Math.sin(i) * 12);
  birds.push(bird);
  beginBird(bird, i % 2 === 0 ? "cruise" : "descend");
}

function featherTex(main, tip, bars) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 72;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, 256, 72);
  const fade = g.createLinearGradient(0, 0, 256, 0);
  fade.addColorStop(0, main);
  fade.addColorStop(0.62, main);
  fade.addColorStop(1, tip);
  g.fillStyle = fade;
  g.beginPath();
  g.moveTo(2, 36);
  g.quadraticCurveTo(36, 8, 214, 16);
  g.quadraticCurveTo(252, 36, 214, 56);
  g.quadraticCurveTo(36, 64, 2, 36);
  g.fill();
  g.strokeStyle = "rgba(18,14,10,0.55)";
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(8, 36);
  g.quadraticCurveTo(120, 34, 244, 36);
  g.stroke();
  g.strokeStyle = "rgba(18,14,10,0.22)";
  g.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    const x = 18 + i * 13;
    g.beginPath();
    g.moveTo(x, 36);
    g.lineTo(x + 16, 14);
    g.moveTo(x, 36);
    g.lineTo(x + 16, 58);
    g.stroke();
  }
  if (bars) {
    g.fillStyle = "rgba(22,18,16,0.82)";
    g.fillRect(78, 18, 9, 36);
    g.fillRect(118, 16, 8, 40);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function featherMat(main, tip, bars, rough) {
  return new THREE.MeshStandardMaterial({
    map: featherTex(main, tip, bars),
    roughness: rough,
    metalness: rough < 0.4 ? 0.18 : 0.02,
    transparent: true,
    alphaTest: 0.28,
    side: THREE.DoubleSide,
  });
}

function spawnKindBirds() {
  const kinds = [
    { name: "pigeon", body: 0x8e969c, belly: 0xe4e7ea, wing: "#6e757c", tip: "#3c4146", beak: 0xc4a06a, neck: 0x2f7a62, plump: 1.05, length: 0.34, scale: 0.62, primary: 0.22, tail: "fan", beakLen: 0.04, bars: true, gloss: 0.08 },
    { name: "sparrow", body: 0x8a5a30, belly: 0xf0d7ae, wing: "#6b4324", tip: "#3a2414", beak: 0xd9a04a, neck: 0, plump: 0.78, length: 0.24, scale: 0.4, primary: 0.16, tail: "notch", beakLen: 0.028, bars: false, gloss: 0.04 },
    { name: "gull", body: 0xf7f8f6, belly: 0xffffff, wing: "#d5dde3", tip: "#1c1e22", beak: 0xe2a03a, neck: 0, plump: 0.86, length: 0.4, scale: 0.72, primary: 0.28, tail: "square", beakLen: 0.055, bars: false, gloss: 0.06, spot: true },
    { name: "crow", body: 0x16181b, belly: 0x222428, wing: "#121416", tip: "#0c0d10", beak: 0x2a2c30, neck: 0, plump: 0.95, length: 0.34, scale: 0.58, primary: 0.22, tail: "square", beakLen: 0.045, bars: false, gloss: 0.28 },
    { name: "swallow", body: 0x1a3c78, belly: 0xf6f1e6, wing: "#142848", tip: "#0e1c32", beak: 0x2a2a2a, neck: 0, plump: 0.68, length: 0.28, scale: 0.46, primary: 0.24, tail: "fork", beakLen: 0.026, bars: false, gloss: 0.12 },
    { name: "dove", body: 0xc9a888, belly: 0xf3e4d4, wing: "#8d7058", tip: "#5c4636", beak: 0xd8b070, neck: 0x6a8f78, plump: 0.9, length: 0.3, scale: 0.5, primary: 0.18, tail: "point", beakLen: 0.034, bars: false, gloss: 0.06 },
  ];
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.35 });
  const eyeDark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.25 });
  kinds.forEach((kind, i) => {
    const root = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: kind.body, roughness: 0.72 - kind.gloss, metalness: kind.gloss });
    const bellyMat = new THREE.MeshStandardMaterial({ color: kind.belly, roughness: 0.78 });
    const flight = featherMat(kind.wing, kind.tip, kind.bars, 0.62 - kind.gloss * 0.4);
    const pts = [
      [0.012, 0],
      [0.05 * kind.plump, 0.06 * kind.length],
      [0.1 * kind.plump, 0.18 * kind.length],
      [0.118 * kind.plump, 0.32 * kind.length],
      [0.07 * kind.plump, 0.48 * kind.length],
      [0.028, 0.6 * kind.length],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), bodyMat);
    body.rotation.x = Math.PI / 2;
    body.position.z = -kind.length * 0.2;
    body.castShadow = true;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.07 * kind.plump, 12, 8), bellyMat);
    belly.scale.set(0.85, 0.62, 1.35);
    belly.position.set(0, -0.035 * kind.plump, kind.length * 0.02);
    const headZ = kind.length * 0.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.058 * (0.85 + kind.plump * 0.2), 14, 12), bodyMat);
    head.scale.set(0.92, 0.9, 1.12);
    head.position.set(0, 0.028, headZ);
    head.castShadow = true;
    const beakMat = new THREE.MeshStandardMaterial({ color: kind.beak, roughness: 0.38 });
    const beak = new THREE.Mesh(new THREE.ConeGeometry(kind.name === "crow" ? 0.02 : 0.012, kind.beakLen, 7), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.02, headZ + 0.05 + kind.beakLen * 0.35);
    const beakLow = new THREE.Mesh(new THREE.ConeGeometry(0.008, kind.beakLen * 0.72, 6), beakMat);
    beakLow.rotation.x = Math.PI / 2;
    beakLow.position.set(0, 0.008, headZ + 0.045 + kind.beakLen * 0.2);
    root.add(body, belly, head, beak, beakLow);
    if (kind.neck) {
      const collar = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 10, 8),
        new THREE.MeshStandardMaterial({ color: kind.neck, roughness: 0.28, metalness: 0.42, emissive: kind.neck, emissiveIntensity: 0.12 }),
      );
      collar.scale.set(0.85, 0.7, 0.55);
      collar.position.set(0, 0.02, headZ - 0.045);
      root.add(collar);
    }
    if (kind.spot) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), new THREE.MeshStandardMaterial({ color: 0xc4382c, roughness: 0.4 }));
      spot.position.set(0, 0.018, headZ + 0.05 + kind.beakLen * 0.45);
      root.add(spot);
    }
    for (const side of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), eyeWhite);
      white.position.set(side * 0.032, 0.04, headZ + 0.03);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), eyeDark);
      pupil.position.set(side * 0.038, 0.042, headZ + 0.04);
      root.add(white, pupil);
    }
    function makeWing(sign) {
      const hinge = new THREE.Group();
      hinge.position.set(sign * 0.02, 0.04, kind.length * 0.05);
      const elbow = new THREE.Group();
      elbow.position.x = sign * 0.15;
      hinge.add(elbow);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.12, 2, 6), bodyMat);
      arm.rotation.z = Math.PI / 2;
      arm.position.x = sign * 0.08;
      hinge.add(arm);
      for (let n = 0; n < 3; n++) {
        const covert = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.05), flight);
        covert.rotation.x = -Math.PI / 2;
        covert.position.set(sign * (0.06 + n * 0.04), 0.012, 0.015);
        hinge.add(covert);
      }
      const count = kind.tail === "fork" ? 6 : 5;
      for (let n = 0; n < count; n++) {
        const len = kind.primary * (0.62 + n * 0.1);
        const vane = new THREE.Mesh(new THREE.PlaneGeometry(len, kind.name === "gull" ? 0.055 : 0.042), flight);
        vane.rotation.x = -Math.PI / 2;
        vane.position.set(sign * len * 0.46, 0, -0.01 * n);
        elbow.add(vane);
      }
      root.add(hinge);
      return { root: hinge, elbow, sign };
    }
    const joints = [makeWing(-1), makeWing(1)];
    const tail = new THREE.Group();
    const feathers = kind.tail === "fork" ? 2 : kind.tail === "fan" ? 7 : 5;
    for (let n = 0; n < feathers; n++) {
      const k = feathers === 1 ? 0 : (n / (feathers - 1)) * 2 - 1;
      const len = kind.tail === "fork" ? 0.32 : kind.tail === "point" && Math.abs(k) < 0.25 ? 0.2 : 0.15;
      const vane = new THREE.Mesh(new THREE.PlaneGeometry(kind.tail === "fork" ? 0.035 : 0.045, len), flight);
      vane.position.set(k * (kind.tail === "fork" ? 0.04 : 0.028), 0.01, -len * 0.55);
      vane.rotation.x = -1.15;
      vane.rotation.y = k * (kind.tail === "fork" ? 0.7 : 0.22);
      tail.add(vane);
    }
    tail.position.set(0, 0.02, -kind.length * 0.16);
    root.add(tail);
    const legs = new THREE.Group();
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 5), beakMat);
      leg.position.set(side * 0.03, -0.07, -0.02);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.04), beakMat);
      foot.position.set(side * 0.03, -0.11, 0.0);
      legs.add(leg, foot);
    }
    legs.visible = false;
    root.add(legs);
    root.scale.setScalar(kind.scale);
    scene.add(root);
    const perch = [[5.5, 2.6, 11], [-6, 3.2, 9.5], [8, 2.4, 5], [-4, 3.5, 3.5], [1.5, 2.8, 12.5], [-8.5, 3.1, 7]];
    root.position.set(perch[i][0], perch[i][1], perch[i][2]);
    const bird = {
      root,
      joints,
      tail,
      legs,
      action: null,
      state: "cruise",
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      timer: 0,
      dur: 1,
      peck: i,
    };
    birds.push(bird);
    beginBird(bird, "cruise");
  });
}

const LOOK_KEY = "home-hub-look";
const LOOKS = [
  { id: "skin", label: "skin", mesh: "skin", colors: ["#ffffff", "#f6d3b8", "#e0ac7a", "#c68642", "#8d5524", "#4a312c"] },
  { id: "hair", label: "hair", mesh: "Wolf3D_Hair", colors: ["#ffffff", "#1b1b1b", "#4a3428", "#c4a574", "#a33b24", "#d9d9d9"] },
  { id: "eyes", label: "eyes", mesh: "eyes", colors: ["#ffffff", "#6ea0d8", "#3d7a4a", "#7a4e2d", "#c4b08a", "#1c1c1c"] },
  { id: "top", label: "top", mesh: "Wolf3D_Outfit_Top", colors: ["#ffffff", "#1c1c1c", "#f4f1ea", "#8d3b3b", "#1d3a5f", "#24352f"] },
  { id: "pants", label: "pants", mesh: "Wolf3D_Outfit_Bottom", colors: ["#ffffff", "#1c1c1c", "#f4f1ea", "#1e3a5f", "#5c4033", "#6b2d5b"] },
  { id: "shoes", label: "shoes", mesh: "Wolf3D_Outfit_Footwear", colors: ["#ffffff", "#111111", "#f4f4f4", "#8d3b3b", "#c4a574", "#1d4e89"] },
];

const FACE_SLIDERS = [
  { tab: "viso", group: "grp.chin", id: "chin", label: "chin.len" },
  { tab: "viso", group: "grp.chin", id: "chinWidth", label: "chin.wid" },
  { tab: "viso", group: "grp.jaw", id: "jaw", label: "jaw.wid" },
  { tab: "viso", group: "grp.cheeks", id: "cheek", label: "cheek.full" },
  { tab: "viso", group: "grp.cheeks", id: "cheekBone", label: "cheek.bone" },
  { tab: "viso", group: "grp.ears", id: "ear", label: "ear" },
  { tab: "occhi", group: "grp.eyes", id: "eyeSize", label: "eye.size" },
  { tab: "occhi", group: "grp.eyes", id: "eyeSpace", label: "eye.space" },
  { tab: "occhi", group: "grp.eyes", id: "eyeHeight", label: "eye.height" },
  { tab: "occhi", group: "grp.brows", id: "browHeight", label: "brow.height" },
  { tab: "occhi", group: "grp.brows", id: "brow", label: "brow.arch", min: 0, max: 1 },
  { tab: "naso", group: "grp.nose", id: "noseWidth", label: "nose.wid" },
  { tab: "naso", group: "grp.nose", id: "noseLength", label: "nose.len" },
  { tab: "naso", group: "grp.nose", id: "noseBridge", label: "nose.bridge" },
  { tab: "naso", group: "grp.lips", id: "lipFull", label: "lip.full" },
  { tab: "naso", group: "grp.lips", id: "lipWidth", label: "lip.wid" },
  { tab: "naso", group: "grp.lips", id: "lipHeight", label: "lip.height" },
  { tab: "viso", group: "grp.expression", id: "smile", label: "smile", min: 0, max: 1 },
];

const avatar = { meshes: {}, morphs: [], look: null };
let mirrorYaw = 0;
let mirrorPitch = 0;
let mirrorZoom = 0.68;
let mirrorDragging = false;
let lookArmed = false;

function dyeTexture(image, hex, strength) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width || image.videoWidth || 512;
  canvas.height = image.height || image.videoHeight || 512;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const target = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  target.getHSL(hsl);
  const dyed = new THREE.Color();
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const light = Math.min(0.94, Math.max(0.05, hsl.l + (lum - 0.45) * 0.32));
    dyed.setHSL(hsl.h, Math.min(1, hsl.s), light);
    data[i] = (r * (1 - strength) + dyed.r * strength) * 255;
    data[i + 1] = (g * (1 - strength) + dyed.g * strength) * 255;
    data[i + 2] = (b * (1 - strength) + dyed.b * strength) * 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function dyeIris(image, hex) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width || image.videoWidth || 256;
  canvas.height = image.height || image.videoHeight || 256;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const target = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  target.getHSL(hsl);
  const dyed = new THREE.Color();
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum < 0.08 || (lum > 0.72 && max - min < 0.16)) continue;
    const light = Math.min(0.62, Math.max(0.12, lum * 0.85));
    dyed.setHSL(hsl.h, Math.min(0.85, Math.max(0.35, hsl.s)), light);
    data[i] = dyed.r * 255;
    data[i + 1] = dyed.g * 255;
    data[i + 2] = dyed.b * 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function paintIris(mesh, hex) {
  if (!mesh) return;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of mats) {
    if (!mat) continue;
    if (mat.map && !mat.userData.baseMap) {
      mat.userData.baseMap = mat.map;
      mat.userData.baseFlipY = mat.map.flipY;
    }
    if (!hex || hex === "#ffffff" || !mat.userData.baseMap?.image) {
      if (mat.userData.baseMap) {
        mat.map = mat.userData.baseMap;
        mat.map.flipY = mat.userData.baseFlipY;
      }
    } else {
      const dyed = dyeIris(mat.userData.baseMap.image, hex);
      dyed.flipY = mat.userData.baseFlipY;
      mat.map = dyed;
    }
    if (mat.color) mat.color.set(0xffffff);
    mat.needsUpdate = true;
  }
}

function paintCloth(mesh, hex, pattern, flat) {
  if (!mesh) return;
  if (!flat) {
    paintMesh(mesh, hex, 0.94);
    if (!pattern || pattern === "plain") return;
  }
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of mats) {
    if (!mat) continue;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (flat) {
      ctx.fillStyle = !hex || hex === "#ffffff" ? "#f2efe8" : hex;
      ctx.fillRect(0, 0, 512, 512);
    } else {
      const src = mat.map?.image;
      if (src && src.width) ctx.drawImage(src, 0, 0, 512, 512);
      else {
        ctx.fillStyle = hex || "#888888";
        ctx.fillRect(0, 0, 512, 512);
      }
    }
    ctx.save();
    if (pattern === "stripe") {
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      for (let y = 0; y < 512; y += 48) ctx.fillRect(0, y, 512, 16);
    } else if (pattern === "rugby") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      for (let y = 18; y < 512; y += 64) ctx.fillRect(0, y, 512, 22);
      ctx.fillStyle = "rgba(20,20,20,0.85)";
      ctx.fillRect(0, 0, 512, 36);
    } else if (pattern === "polo") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(333, 66, 123, 22);
      ctx.fillStyle = "rgba(20,20,20,0.9)";
      for (let i = 0; i < 3; i++) ctx.fillRect(386, 96 + i * 18, 14, 8);
    } else if (pattern === "logo") {
      ctx.fillStyle = "#f4f1ea";
      ctx.beginPath();
      ctx.arc(394, 130, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1a2744";
      ctx.lineWidth = 6;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(376, 114);
      ctx.lineTo(412, 114);
      ctx.lineTo(376, 146);
      ctx.lineTo(412, 146);
      ctx.stroke();
    } else if (pattern === "vest") {
      ctx.fillStyle = "rgba(12,12,12,0.72)";
      ctx.fillRect(0, 0, 120, 512);
      ctx.fillRect(392, 0, 120, 512);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 8;
      ctx.strokeRect(150, 40, 212, 420);
    } else if (pattern === "block") {
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fillRect(0, 150, 512, 90);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 250, 512, 28);
    } else if (pattern === "dot") {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      for (let y = 16; y < 512; y += 48) {
        for (let x = 16; x < 512; x += 48) {
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (pattern === "rib") {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      for (let x = 0; x < 512; x += 14) ctx.fillRect(x, 0, 4, 512);
    } else if (pattern === "jean") {
      ctx.strokeStyle = "rgba(180,210,255,0.85)";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(256, 0);
      ctx.lineTo(256, 512);
      ctx.moveTo(40, 80);
      ctx.lineTo(40, 512);
      ctx.moveTo(472, 80);
      ctx.lineTo(472, 512);
      ctx.stroke();
      ctx.fillStyle = "rgba(20,40,80,0.35)";
      ctx.fillRect(0, 0, 512, 512);
    } else if (pattern === "cargo") {
      ctx.fillStyle = "rgba(40,32,24,0.82)";
      ctx.fillRect(70, 250, 130, 110);
      ctx.fillRect(312, 250, 130, 110);
      ctx.strokeStyle = "rgba(230,210,170,0.9)";
      ctx.lineWidth = 6;
      ctx.strokeRect(70, 250, 130, 110);
      ctx.strokeRect(312, 250, 130, 110);
    } else if (pattern === "check") {
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 6;
      for (let y = 0; y < 512; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }
      for (let x = 0; x < 512; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 512);
        ctx.stroke();
      }
    } else if (pattern === "chino") {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(170, 0);
      ctx.lineTo(150, 512);
      ctx.moveTo(342, 0);
      ctx.lineTo(362, 512);
      ctx.stroke();
    } else if (pattern === "sneaker") {
      ctx.fillStyle = "#f2efe8";
      ctx.fillRect(0, 430, 512, 82);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(40, 80, 180, 28);
      ctx.fillRect(292, 80, 180, 28);
    } else if (pattern === "track") {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillRect(70, 0, 28, 512);
      ctx.fillRect(414, 0, 28, 512);
      ctx.fillStyle = "rgba(20,20,20,0.8)";
      ctx.fillRect(78, 0, 12, 512);
      ctx.fillRect(422, 0, 12, 512);
    }
    ctx.restore();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = mat.map ? mat.map.flipY : false;
    tex.needsUpdate = true;
    mat.map = tex;
    mat.needsUpdate = true;
  }
}

function paintMesh(mesh, hex, strength) {
  if (!mesh) return;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of mats) {
    if (!mat?.color) continue;
    if (mat.map && !mat.userData.baseMap) {
      mat.userData.baseMap = mat.map;
      mat.userData.baseFlipY = mat.map.flipY;
    }
    if (!hex || hex === "#ffffff" || !mat.userData.baseMap?.image) {
      if (mat.userData.baseMap) {
        mat.map = mat.userData.baseMap;
        mat.map.flipY = mat.userData.baseFlipY;
      }
      mat.color.set(0xffffff);
    } else {
      const dyed = dyeTexture(mat.userData.baseMap.image, hex, strength);
      dyed.flipY = mat.userData.baseFlipY;
      mat.map = dyed;
      mat.color.set(0xffffff);
    }
    mat.needsUpdate = true;
  }
}

function falloff(v, cx, cy, cz, rx, ry, rz) {
  const dx = (v.x - cx) / rx;
  const dy = (v.y - cy) / ry;
  const dz = (v.z - cz) / rz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= 1) return 0;
  const t = 1 - Math.sqrt(d2);
  return t * t;
}

function shapeOffset(id, v, out) {
  out.set(0, 0, 0);
  if (id === "chin") {
    const w = falloff(v, 0, 1.508, 0.118, 0.03, 0.024, 0.026);
    const front = Math.min(1, Math.max(0, (v.z - 0.09) / 0.028));
    out.set(0, -0.022 * w * front, 0.014 * w * front);
  } else if (id === "chinWidth") {
    const w = falloff(v, 0, 1.5, 0.108, 0.042, 0.026, 0.028);
    const front = Math.min(1, Math.max(0, (v.z - 0.088) / 0.028));
    out.set(Math.sign(v.x || 1) * 0.016 * w * front, 0, 0);
  } else if (id === "jaw") {
    const w = falloff(v, 0, 1.51, 0.075, 0.085, 0.05, 0.05) * Math.min(1, Math.abs(v.x) / 0.04);
    out.set(Math.sign(v.x || 1) * 0.018 * w, 0, 0);
  } else if (id === "cheek") {
    const left = falloff(v, 0.05, 1.585, 0.1, 0.038, 0.04, 0.04);
    const right = falloff(v, -0.05, 1.585, 0.1, 0.038, 0.04, 0.04);
    out.set((left - right) * 0.016, 0, (left + right) * 0.008);
  } else if (id === "cheekBone") {
    const left = falloff(v, 0.055, 1.63, 0.09, 0.032, 0.028, 0.03);
    const right = falloff(v, -0.055, 1.63, 0.09, 0.032, 0.028, 0.03);
    out.set((left - right) * 0.014, (left + right) * 0.004, 0);
  } else if (id === "ear") {
    if (Math.abs(v.x) > 0.06 && v.z < 0.07 && v.y > 1.52 && v.y < 1.7) {
      const w = Math.min(1, (Math.abs(v.x) - 0.06) / 0.03);
      out.set(Math.sign(v.x) * 0.02 * w * w, 0, 0);
    }
  } else if (id === "noseWidth") {
    const w = falloff(v, 0, 1.575, 0.145, 0.032, 0.03, 0.025);
    out.set(Math.sign(v.x || 1) * 0.012 * w, 0, 0);
  } else if (id === "noseLength") {
    const w = falloff(v, 0, 1.585, 0.15, 0.026, 0.032, 0.022);
    out.set(0, -0.005 * w, 0.018 * w);
  } else if (id === "noseBridge") {
    const w = falloff(v, 0, 1.62, 0.125, 0.022, 0.03, 0.028);
    out.set(0, 0.005 * w, 0.012 * w);
  } else if (id === "lipFull") {
    const w = falloff(v, 0, 1.548, 0.125, 0.034, 0.022, 0.022);
    const side = v.y >= 1.548 ? 1 : -1;
    out.set(0, side * 0.009 * w, 0.012 * w);
  } else if (id === "lipWidth") {
    const w = falloff(v, 0, 1.548, 0.12, 0.04, 0.02, 0.02);
    out.set(Math.sign(v.x || 1) * 0.014 * w, 0, 0);
  } else if (id === "lipHeight") {
    const w = falloff(v, 0, 1.548, 0.12, 0.036, 0.024, 0.02);
    out.set(0, 0.014 * w, 0);
  } else if (id === "browHeight") {
    const w = falloff(v, 0, 1.655, 0.12, 0.085, 0.028, 0.035);
    out.set(0, 0.014 * w, 0.003 * w);
  }
  out.multiplyScalar(0.55);
}

const shapeScratch = new THREE.Vector3();

function addShape(mesh, id) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  if (!geo.morphAttributes.position) geo.morphAttributes.position = [];
  const arr = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    shapeOffset(id, v, shapeScratch);
    arr[i * 3] = shapeScratch.x;
    arr[i * 3 + 1] = shapeScratch.y;
    arr[i * 3 + 2] = shapeScratch.z;
  }
  geo.morphAttributes.position.push(new THREE.BufferAttribute(arr, 3));
  const index = geo.morphAttributes.position.length - 1;
  if (!mesh.morphTargetInfluences) mesh.morphTargetInfluences = [];
  while (mesh.morphTargetInfluences.length < geo.morphAttributes.position.length) {
    mesh.morphTargetInfluences.push(0);
  }
  if (!mesh.morphTargetDictionary) mesh.morphTargetDictionary = {};
  mesh.morphTargetDictionary[id] = index;
}

function installFaceShapes(hero) {
  const targets = [];
  hero.traverse((obj) => {
    if (obj.name === "Wolf3D_Head" || obj.name === "Wolf3D_Teeth") targets.push(obj);
    if (obj.isBone && (obj.name === "LeftEye" || obj.name === "RightEye")) {
      obj.userData.basePos = obj.position.clone();
      if (obj.name === "LeftEye") avatar.leftEye = obj;
      else avatar.rightEye = obj;
    }
  });
  const ids = [
    "chin",
    "chinWidth",
    "jaw",
    "cheek",
    "cheekBone",
    "ear",
    "noseWidth",
    "noseLength",
    "noseBridge",
    "lipFull",
    "lipWidth",
    "lipHeight",
    "browHeight",
  ];
  for (const mesh of targets) {
    for (const id of ids) addShape(mesh, id);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) if (mat) mat.needsUpdate = true;
  }
}

function setFace(name, value) {
  for (const mesh of avatar.morphs) {
    const index = mesh.morphTargetDictionary?.[name];
    if (index === undefined) continue;
    mesh.morphTargetInfluences[index] = value;
  }
}

function applyEyes(look) {
  const space = Number(look.eyeSpace) || 0;
  const height = Number(look.eyeHeight) || 0;
  const size = 1 + (Number(look.eyeSize) || 0) * 0.4;
  for (const bone of [avatar.leftEye, avatar.rightEye]) {
    if (!bone?.userData.basePos) continue;
    const base = bone.userData.basePos;
    const sign = base.x >= 0 ? 1 : -1;
    bone.position.x = base.x + sign * space * 0.012;
    bone.position.y = base.y + height * 0.01;
    bone.scale.setScalar(size);
  }
}

function tintMesh(mesh, hex) {
  if (!mesh) return;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of mats) {
    if (mat?.color) mat.color.set(hex || "#ffffff");
  }
}

function applyColors(look) {
  for (const row of LOOKS) {
    const hex = look[row.id] || "#ffffff";
    if (row.mesh === "skin") {
      if (bodySex() === "m") paintMaleHead(avatar.meshes.Wolf3D_Head, hex, look.beard, look.hair);
      else paintMesh(avatar.meshes.Wolf3D_Head, hex, 0.78);
      paintMesh(avatar.meshes.Wolf3D_Body, hex, 0.86);
    } else if (row.mesh === "eyes") {
      paintIris(avatar.meshes.EyeLeft, hex);
      paintIris(avatar.meshes.EyeRight, hex);
    } else if (row.id === "hair") {
      paintMesh(avatar.meshes[row.mesh], hex, 0.97);
    } else if (row.id === "top") {
      const male = bodySex() === "m";
      const style = look.topStyle || "plain";
      const mesh = avatar.meshes[row.mesh];
      if (mesh) {
        mesh.visible = true;
        if (male && style === "none") paintBareChest(mesh, look.skin);
        else paintCloth(mesh, hex, style, male);
      }
    } else if (row.id === "pants") {
      paintCloth(avatar.meshes[row.mesh], hex, look.pantsStyle || "plain", bodySex() === "m");
    } else if (row.id === "shoes" && bodySex() === "m") {
      paintCloth(avatar.meshes[row.mesh], hex, "sneaker", true);
    } else {
      paintMesh(avatar.meshes[row.mesh], hex, 0.94);
    }
  }
}

function bodySex() {
  return localStorage.getItem("zv-sex") === "m" ? "m" : "f";
}

const MALE_START = {
  hairStyle: "crop",
  beard: "stubble",
  topStyle: "polo",
  pantsStyle: "jean",
  hat: "off",
  earrings: "off",
  glasses: false,
  jaw: 0.72,
  chin: 0.36,
  chinWidth: 0.42,
  lipFull: -0.62,
  lipWidth: 0.06,
  browHeight: -0.36,
  brow: 0.02,
  noseWidth: 0.2,
  noseLength: 0.26,
  cheek: -0.22,
  cheekBone: 0.28,
  smile: 0.04,
  eyeSize: -0.08,
};

const MALE_CUTS = ["crop", "neat", "side", "quiff", "buzz", "fade", "slick"];
const BEARDS = ["off", "stubble", "mustache", "goatee", "short", "full"];

function hairTint(hex) {
  if (!hex || hex === "#ffffff") return "#3b2a22";
  return hex;
}

function masculinizeImage(image, beard, hairHex) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width || image.videoWidth || 512;
  canvas.height = image.height || image.videoHeight || 512;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const w = canvas.width;
  const h = canvas.height;
  const pixels = ctx.getImageData(0, 0, w, h);
  const data = pixels.data;
  const sample = (u, v) => {
    const x = Math.min(w - 1, Math.max(0, Math.round(u * (w - 1))));
    const y = Math.min(h - 1, Math.max(0, Math.round(v * (h - 1))));
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const cheek = sample(0.7, 0.44);
  const browSkin = sample(0.5, 0.36);
  const skin = [
    (cheek[0] + browSkin[0]) * 0.46,
    (cheek[1] + browSkin[1]) * 0.46,
    (cheek[2] + browSkin[2]) * 0.46,
  ];
  const brow = new THREE.Color(hairTint(hairHex));
  brow.multiplyScalar(0.35);
  const br = brow.r * 255;
  const bg = brow.g * 255;
  const bb = brow.b * 255;
  const ellipse = (u, v, cu, cv, rx, ry) => {
    const dx = (u - cu) / rx;
    const dy = (v - cv) / ry;
    const d = dx * dx + dy * dy;
    return d >= 1 ? 0 : 1 - d;
  };
  const grain = (kind, u, v) => {
    if (!kind || kind === "off") return 0;
    const upper = ellipse(u, v, 0.5, 0.528, 0.05, 0.016);
    const chin = ellipse(u, v, 0.5, 0.655, 0.055, 0.04);
    const jaw = Math.max(ellipse(u, v, 0.64, 0.62, 0.09, 0.055), ellipse(u, v, 0.36, 0.62, 0.09, 0.055));
    const cheek = Math.max(ellipse(u, v, 0.68, 0.52, 0.055, 0.06), ellipse(u, v, 0.32, 0.52, 0.055, 0.06));
    if (kind === "stubble") return Math.min(1, upper * 0.7 + chin * 0.85 + jaw * 0.75);
    if (kind === "mustache") return upper * 0.2;
    if (kind === "goatee") return Math.max(upper * 0.22, chin * 0.28);
    if (kind === "short") return Math.max(upper * 0.18, chin * 0.3, jaw * 0.26);
    if (kind === "full") return Math.max(upper * 0.2, chin * 0.32, jaw * 0.3, cheek * 0.22);
    return 0;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const v = y / (h - 1);
      const i = (y * w + x) * 4;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const pink = r - Math.max(g, b);
      const paintedHair = (v < 0.27 && lum < 170) || (v < 0.5 && lum < 95 && (u < 0.3 || u > 0.7));
      if (paintedHair) {
        r = skin[0];
        g = skin[1];
        b = skin[2];
      }
      if (((u > 0.34 && u < 0.47) || (u > 0.53 && u < 0.66)) && v > 0.27 && v < 0.35 && lum < 95) {
        r = skin[0];
        g = skin[1];
        b = skin[2];
      }
      const lip = ellipse(u, v, 0.497, 0.555, 0.058, 0.02);
      if (lip > 0) {
        const k = Math.min(1, lip * 1.15);
        r = r * (1 - k) + (skin[0] * 0.62 + 36) * k;
        g = g * (1 - k) + (skin[1] * 0.5 + 14) * k;
        b = b * (1 - k) + (skin[2] * 0.48 + 12) * k;
      }
      const blush = Math.max(ellipse(u, v, 0.7, 0.44, 0.07, 0.05), ellipse(u, v, 0.3, 0.44, 0.07, 0.05));
      if (blush > 0 && pink > 6) {
        const k = Math.min(0.9, blush);
        r = r * (1 - k) + skin[0] * k;
        g = g * (1 - k) + skin[1] * k;
        b = b * (1 - k) + skin[2] * k;
      }
      const liner = Math.max(ellipse(u, v, 0.592, 0.338, 0.042, 0.012), ellipse(u, v, 0.408, 0.338, 0.042, 0.012));
      if (liner > 0 && lum < 80) {
        const k = liner * 0.75;
        r = r * (1 - k) + skin[0] * 0.82 * k;
        g = g * (1 - k) + skin[1] * 0.82 * k;
        b = b * (1 - k) + skin[2] * 0.82 * k;
      }
      const browW = Math.max(ellipse(u, v, 0.59, 0.305, 0.06, 0.022), ellipse(u, v, 0.405, 0.305, 0.06, 0.022));
      if (browW > 0.15) {
        const k = Math.min(1, (browW - 0.15) / 0.45);
        r = r * (1 - k) + br * k;
        g = g * (1 - k) + bg * k;
        b = b * (1 - k) + bb * k;
      }
      const fuzz = grain(beard, u, v);
      if (fuzz > 0.04) {
        const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        const roll = n - Math.floor(n);
        if (roll < fuzz * 0.85) {
          const shade = 0.12 + roll * 0.28;
          r *= shade;
          g *= shade;
          b *= shade;
        }
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function paintMaleHead(mesh, hex, beard, hairHex) {
  if (!mesh) return;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of mats) {
    if (!mat) continue;
    if (mat.map && !mat.userData.baseMap) {
      mat.userData.baseMap = mat.map;
      mat.userData.baseFlipY = mat.map.flipY;
    }
    const image = mat.userData.baseMap?.image;
    if (!image) continue;
    const key = `${hex || "#ffffff"}|${beard || "off"}|${hairHex || ""}`;
    if (mat.userData.maleKey !== key) {
      const source = !hex || hex === "#ffffff" ? image : dyeTexture(image, hex, 0.78).image;
      const male = masculinizeImage(source || image, beard, hairHex);
      male.flipY = mat.userData.baseFlipY;
      mat.userData.maleMap = male;
      mat.userData.maleKey = key;
    }
    mat.map = mat.userData.maleMap;
    mat.color.set(0xffffff);
    mat.roughness = 0.72;
    mat.needsUpdate = true;
  }
}

function paintBareChest(mesh, skinHex) {
  if (!mesh) return;
  const head = avatar.meshes.Wolf3D_Head;
  const headMat = Array.isArray(head?.material) ? head.material[0] : head?.material;
  const sample = headMat?.userData?.maleMap?.image || headMat?.userData?.baseMap?.image || headMat?.map?.image;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of mats) {
    if (!mat) continue;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    let tone = skinHex && skinHex !== "#ffffff" ? skinHex : "#d7a37a";
    if (sample && (!skinHex || skinHex === "#ffffff")) {
      const probe = document.createElement("canvas");
      probe.width = 8;
      probe.height = 8;
      const pg = probe.getContext("2d");
      pg.drawImage(sample, 0, 0, 8, 8);
      const px = pg.getImageData(0, 0, 8, 8).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) {
        const lum = px[i] * 0.2 + px[i + 1] * 0.7 + px[i + 2] * 0.1;
        if (lum < 40 || lum > 230) continue;
        r += px[i];
        g += px[i + 1];
        b += px[i + 2];
        n += 1;
      }
      if (n) tone = `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
    }
    ctx.fillStyle = tone;
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.03 + (i % 5) * 0.01})`;
      ctx.fillRect((i * 37) % 128, (i * 19) % 128, 3, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.needsUpdate = true;
    mat.map = tex;
    mat.color.set(0xffffff);
    mat.roughness = 0.74;
    mat.metalness = 0.02;
    mat.needsUpdate = true;
  }
  mesh.visible = true;
}

function applyShape(look) {
  for (const slider of FACE_SLIDERS) {
    if (slider.id === "eyeSize" || slider.id === "eyeSpace" || slider.id === "eyeHeight") continue;
    if (slider.id === "smile" || slider.id === "brow") continue;
    if (slider.id === "lipFull" || slider.id === "lipWidth" || slider.id === "lipHeight") continue;
    setFace(slider.id, Number(look[slider.id]) || 0);
  }
  const full = Number(look.lipFull) || 0;
  const wide = Number(look.lipWidth) || 0;
  const lift = Number(look.lipHeight) || 0;
  setFace("mouthUpperUpLeft", Math.max(0, full));
  setFace("mouthUpperUpRight", Math.max(0, full));
  setFace("mouthLowerDownLeft", Math.max(0, full) * 0.85);
  setFace("mouthLowerDownRight", Math.max(0, full) * 0.85);
  setFace("mouthRollUpper", Math.max(0, -full));
  setFace("mouthRollLower", Math.max(0, -full));
  setFace("mouthStretchLeft", Math.max(0, wide));
  setFace("mouthStretchRight", Math.max(0, wide));
  setFace("mouthPucker", Math.max(0, -wide));
  setFace("mouthShrugUpper", lift * 0.7);
  setFace("mouthShrugLower", -lift * 0.55);
  const smile = Number(look.smile) || 0;
  setFace("mouthSmileLeft", smile);
  setFace("mouthSmileRight", smile);
  const brow = Number(look.brow) || 0;
  setFace("browInnerUp", brow);
  setFace("browOuterUpLeft", brow * 0.6);
  setFace("browOuterUpRight", brow * 0.6);
  if (avatar.meshes.Wolf3D_Glasses) avatar.meshes.Wolf3D_Glasses.visible = look.glasses !== false;
  avatar.look = look;
  applyEyes(look);
}

function clothMat(color, rough = 0.62) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.04 });
}

function metalMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.72 });
}

function hairCap(sx, sy, sz, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
    clothMat(0x2a2118, 0.78),
  );
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(0, y, z);
  mesh.visible = false;
  return mesh;
}

function tattooTexture(kind) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = "#1a1a1a";
  g.fillStyle = "#1a1a1a";
  g.lineWidth = 4;
  g.lineCap = "round";
  if (kind === "mark") {
    g.beginPath();
    g.arc(64, 64, 7, 0, Math.PI * 2);
    g.fill();
  } else if (kind === "star") {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const b = a + Math.PI / 5;
      g.lineTo(64 + Math.cos(a) * 36, 64 + Math.sin(a) * 36);
      g.lineTo(64 + Math.cos(b) * 16, 64 + Math.sin(b) * 16);
    }
    g.closePath();
    g.fill();
  } else if (kind === "band") {
    g.fillRect(0, 48, 128, 28);
    g.strokeStyle = "#c6a15a";
    g.strokeRect(8, 54, 112, 16);
  } else if (kind === "sleeve") {
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(20 + (i % 3) * 40, 30 + Math.floor(i / 3) * 60, 16, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(10, 110);
    g.lineTo(118, 18);
    g.stroke();
  } else if (kind === "rose") {
    for (let i = 4; i >= 1; i--) {
      g.beginPath();
      g.arc(64, 58, 8 + i * 8, 0, Math.PI * 1.7);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(64, 78);
    g.quadraticCurveTo(40, 100, 48, 120);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let hairStrandMat = null;
let maleHairMat = null;
function hairMaterial() {
  if (hairStrandMat) return hairStrandMat;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.fillStyle = "#8d8d8d";
  g.fillRect(0, 0, 64, 128);
  for (let x = 1; x < 64; x += 3) {
    g.strokeStyle = x % 6 === 1 ? "#3a3a3a" : "#b5b5b5";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + (x % 5) - 2, 128);
    g.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  hairStrandMat = new THREE.MeshStandardMaterial({ map, color: 0x3b2a22, roughness: 0.92, side: THREE.DoubleSide });
  return hairStrandMat;
}

function maleHairMaterial() {
  if (maleHairMat) return maleHairMat;
  maleHairMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, side: THREE.DoubleSide });
  return maleHairMat;
}

function hairMesh(geo) {
  const mesh = new THREE.Mesh(geo, hairMaterial());
  mesh.castShadow = true;
  return mesh;
}

function hairShell(y, radius, sy, depth, z = 0.012) {
  const cap = hairMesh(new THREE.SphereGeometry(radius, 28, 18, 0, Math.PI * 2, 0, depth));
  cap.scale.set(1.04, sy, 0.9);
  cap.position.set(0, y, z);
  return cap;
}

function hairGroup(parts) {
  const group = new THREE.Group();
  group.add(...parts);
  group.visible = false;
  return group;
}

function scalp(radius, y, z, sy, depth) {
  const cap = hairMesh(new THREE.SphereGeometry(radius, 22, 16, 0, Math.PI * 2, 0, depth));
  cap.scale.set(1.12, sy, 0.86);
  cap.position.set(0, y, z);
  return cap;
}

function temples(y) {
  return [-1, 1].map((s) => {
    const side = hairMesh(new THREE.SphereGeometry(0.018, 8, 6));
    side.scale.set(0.7, 1.3, 0.55);
    side.position.set(s * 0.068, y, 0.02);
    return side;
  });
}

function hairBob() {
  const cap = scalp(0.112, 0.11, -0.02, 0.95, Math.PI * 0.7);
  const locks = [-1, 1].map((s) => {
    const lock = hairMesh(new THREE.CapsuleGeometry(0.026, 0.1, 4, 8));
    lock.position.set(s * 0.07, 0.02, -0.01);
    return lock;
  });
  return hairGroup([cap, ...locks]);
}

function hairShort() {
  return hairGroup([scalp(0.11, 0.125, -0.022, 0.82, Math.PI * 0.6), ...temples(0.07)]);
}

function maleHairCut(style) {
  const opt = {
    crop: { lenTop: 0.036, lenSide: 0.012, flow: [0, 0.05, 0.8], lift: 0.05 },
    neat: { lenTop: 0.024, lenSide: 0.01, flow: [0, 0.02, 0.35], lift: 0 },
    side: { lenTop: 0.038, lenSide: 0.012, flow: [0.9, 0.04, 0.15], lift: 0.04, part: 0.36 },
    quiff: { lenTop: 0.05, lenSide: 0.012, flow: [0, 0.85, 0.3], lift: 0.7 },
    buzz: { lenTop: 0.012, lenSide: 0.006, flow: [0, 0.04, 0.2], lift: 0 },
    fade: { lenTop: 0.046, lenSide: 0.005, flow: [0.1, 0.16, 0.65], lift: 0.14 },
    slick: { lenTop: 0.03, lenSide: 0.01, flow: [0, 0.08, -0.9], lift: 0 },
  }[style];
  const pos = [];
  const uv = [];
  const index = [];
  let base = 0;
  const push = (a, b, c, d) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    base += 4;
  };
  const rows = 8;
  const cols = 18;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u = (col + 0.5) / cols;
      if (opt.part !== undefined && Math.abs(u - opt.part) < 0.04) continue;
      const around = (u - 0.5) * Math.PI * 1.35;
      const down = 0.16 + (row / (rows - 1)) * 1.02;
      const nx = Math.sin(down) * Math.sin(around);
      const ny = Math.cos(down);
      const nz = Math.sin(down) * Math.cos(around);
      const radial = new THREE.Vector3(nx, ny, nz);
      const root = new THREE.Vector3(nx * 0.098, 0.118 + ny * 0.066, 0.004 + nz * 0.078);
      root.addScaledVector(radial, 0.016);
      if (root.y < 0.1) continue;
      if (root.z > 0.068 && root.y < 0.135) continue;
      const sideW = Math.min(1, Math.abs(nx) / 0.7);
      const len = opt.lenSide + (opt.lenTop - opt.lenSide) * Math.max(0, ny) * (1 - sideW * (style === "fade" || style === "buzz" ? 0.9 : 0.45));
      const flow = new THREE.Vector3(...opt.flow);
      if (style === "quiff" && nz > 0.2 && ny > 0.35) flow.set(0, 1, 0.2);
      flow.addScaledVector(radial, -flow.dot(radial) * 0.7);
      if (flow.lengthSq() < 1e-5) flow.copy(radial);
      flow.normalize();
      const bitangent = new THREE.Vector3().crossVectors(radial, flow);
      if (bitangent.lengthSq() < 1e-6) bitangent.set(1, 0, 0);
      bitangent.normalize().multiplyScalar(0.02);
      const tip = root.clone().addScaledVector(flow, len).addScaledVector(radial, 0.004);
      const reach = Math.hypot(tip.x - root.x, tip.z - root.z);
      if (reach > 0.022) {
        const scale = 0.022 / reach;
        tip.x = root.x + (tip.x - root.x) * scale;
        tip.z = root.z + (tip.z - root.z) * scale;
      }
      const halfTip = bitangent.clone().multiplyScalar(0.5);
      push(root.clone().add(bitangent), root.clone().sub(bitangent), tip.clone().add(halfTip), tip.clone().sub(halfTip));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const strands = new THREE.Mesh(geo, maleHairMaterial());
  strands.castShadow = true;
  strands.frustumCulled = false;
  return hairGroup([strands]);
}

function hairNeat() {
  return maleHairCut("neat");
}

function hairBun() {
  const cap = scalp(0.108, 0.122, -0.02, 0.78, Math.PI * 0.58);
  const ball = hairMesh(new THREE.SphereGeometry(0.04, 14, 12));
  ball.position.set(0, 0.19, -0.06);
  return hairGroup([cap, ball]);
}

function hairPony() {
  const cap = scalp(0.11, 0.118, -0.02, 0.84, Math.PI * 0.62);
  const tail = hairMesh(new THREE.CapsuleGeometry(0.02, 0.16, 4, 8));
  tail.position.set(0, 0.06, -0.09);
  tail.rotation.x = 0.7;
  return hairGroup([cap, tail]);
}

function hairCrop() {
  return maleHairCut("crop");
}

function hairSide() {
  return maleHairCut("side");
}

function hairQuiff() {
  return maleHairCut("quiff");
}

function hairBuzz() {
  return maleHairCut("buzz");
}

function hairFade() {
  return maleHairCut("fade");
}

function hairSlick() {
  return maleHairCut("slick");
}

let logoMap = null;
function logoTexture() {
  if (logoMap) return logoMap;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = "#f4f1ea";
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#1a2744";
  g.font = "700 74px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("Z", 64, 70);
  logoMap = new THREE.CanvasTexture(canvas);
  logoMap.colorSpace = THREE.SRGBColorSpace;
  return logoMap;
}

function maleClothes(root) {
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0x243044, roughness: 0.74 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x24344c, roughness: 0.82 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.46 });
  const soleMat = new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.62 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd7a37a, roughness: 0.72 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6 });
  const mark = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const on = (boneName, mesh) => {
    const bone = boneNamed(root, new RegExp(`^${boneName}$`));
    if (bone) bone.add(mesh);
    mesh.visible = false;
    return mesh;
  };
  const shirt = new THREE.Group();
  const chest = mark(new THREE.Mesh(new THREE.SphereGeometry(0.17, 22, 16), shirtMat));
  chest.scale.set(1.55, 0.95, 0.78);
  chest.position.set(0, 0.02, 0.015);
  const waist = mark(new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), shirtMat));
  waist.scale.set(1.25, 0.7, 0.7);
  waist.position.set(0, -0.08, 0.02);
  const collar = mark(new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 18), white));
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.1, 0.03);
  const badge = mark(new THREE.Mesh(new THREE.CircleGeometry(0.034, 18), new THREE.MeshStandardMaterial({ map: logoTexture(), transparent: true, roughness: 0.45, depthWrite: false })));
  badge.position.set(0.045, 0.02, 0.125);
  const stripeA = mark(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.018, 0.012), white));
  stripeA.position.set(0, 0.04, 0.12);
  const stripeB = mark(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.018, 0.012), white));
  stripeB.position.set(0, -0.02, 0.115);
  shirt.add(chest, waist, collar, badge, stripeA, stripeB);
  on("Spine2", shirt);
  const bare = new THREE.Group();
  const bareChest = mark(new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), skinMat));
  bareChest.scale.set(1.45, 0.9, 0.7);
  bareChest.position.set(0, 0.02, 0.02);
  const bareWaist = mark(new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skinMat));
  bareWaist.scale.set(1.15, 0.65, 0.62);
  bareWaist.position.set(0, -0.08, 0.02);
  bare.add(bareChest, bareWaist);
  on("Spine2", bare);
  const sleeves = [];
  for (const boneName of ["LeftArm", "RightArm"]) {
    const sleeve = mark(new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.12, 12), shirtMat));
    sleeve.position.y = 0.02;
    sleeve.visible = false;
    const bone = boneNamed(root, new RegExp(`^${boneName}$`));
    if (bone) bone.add(sleeve);
    sleeves.push(sleeve);
  }
  const pants = [];
  const pockets = [];
  const legStripes = [];
  const hip = mark(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.18), pantsMat));
  hip.position.set(0, 0.02, 0.01);
  hip.visible = false;
  const hipBone = boneNamed(root, /^Hips$/);
  if (hipBone) hipBone.add(hip);
  pants.push(hip);
  for (const [boneName, side] of [["LeftUpLeg", -1], ["RightUpLeg", 1]]) {
    const thigh = mark(new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.055, 0.3, 12), pantsMat));
    thigh.position.y = -0.12;
    thigh.visible = false;
    const bone = boneNamed(root, new RegExp(`^${boneName}$`));
    if (bone) bone.add(thigh);
    pants.push(thigh);
    const pocket = mark(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.012), white));
    pocket.position.set(side * 0.04, -0.08, 0.06);
    pocket.visible = false;
    if (bone) bone.add(pocket);
    pockets.push(pocket);
    const band = mark(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.28, 0.012), white));
    band.position.set(side * 0.05, -0.12, 0.02);
    band.visible = false;
    if (bone) bone.add(band);
    legStripes.push(band);
  }
  for (const boneName of ["LeftLeg", "RightLeg"]) {
    const calf = mark(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.26, 12), pantsMat));
    calf.position.y = -0.1;
    calf.visible = false;
    const bone = boneNamed(root, new RegExp(`^${boneName}$`));
    if (bone) bone.add(calf);
    pants.push(calf);
  }
  const shoes = [];
  for (const boneName of ["LeftFoot", "RightFoot"]) {
    const upper = mark(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.18), shoeMat));
    upper.position.set(0, 0.035, 0.04);
    upper.visible = false;
    const sole = mark(new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.016, 0.2), soleMat));
    sole.position.set(0, 0.012, 0.04);
    sole.visible = false;
    const bone = boneNamed(root, new RegExp(`^${boneName}$`));
    if (bone) bone.add(upper, sole);
    shoes.push(upper, sole);
  }
  return { shirt, bare, sleeves, pants, pockets, legStripes, shoes, collar, badge, stripes: [stripeA, stripeB], shirtMat, pantsMat, shoeMat, skinMat };
}

function beardKit() {
  const mat = clothMat(0x2a211c, 0.92);
  const puff = (x, y, z, sx, sy, sz) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), mat);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    return mesh;
  };
  const mustache = new THREE.Group();
  mustache.add(puff(0, 0.03, 0.096, 1.7, 0.28, 0.38));
  const chin = new THREE.Group();
  chin.add(puff(0, 0.004, 0.088, 0.9, 1.05, 0.5), puff(0, -0.012, 0.08, 0.65, 0.7, 0.4));
  const jaw = new THREE.Group();
  for (const s of [-1, 1]) {
    jaw.add(puff(s * 0.034, 0.008, 0.078, 1.15, 0.85, 0.6));
    jaw.add(puff(s * 0.022, -0.008, 0.086, 0.85, 0.9, 0.5));
  }
  const cheek = new THREE.Group();
  for (const s of [-1, 1]) cheek.add(puff(s * 0.042, 0.018, 0.062, 0.95, 0.75, 0.5));
  const root = new THREE.Group();
  root.add(mustache, chin, jaw, cheek);
  root.visible = false;
  return { root, mustache, chin, jaw, cheek, mat };
}

function hatCap() {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), clothMat(0x243044));
  crown.scale.set(1.08, 0.5, 1.08);
  crown.position.y = 0.03;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.1), clothMat(0x1a2230));
  brim.position.set(0, 0.01, 0.1);
  brim.rotation.x = -0.35;
  g.add(crown, brim);
  g.position.set(0, 0.12, 0.01);
  g.visible = false;
  return g;
}

function hatBeanie() {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.108, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), clothMat(0x8d3b3b));
  dome.scale.set(1.02, 0.85, 1.02);
  dome.position.y = 0.02;
  const fold = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 18), clothMat(0x6e2c2c));
  fold.rotation.x = Math.PI / 2;
  fold.position.y = -0.01;
  g.add(dome, fold);
  g.position.set(0, 0.13, 0);
  g.visible = false;
  return g;
}

function hatFedora() {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.078, 0.09, 16), clothMat(0x2a241c));
  crown.position.y = 0.05;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 24), clothMat(0x1c1c1c));
  brim.position.y = 0.004;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.016, 16), clothMat(0x6e2c2c));
  band.position.y = 0.02;
  g.add(crown, brim, band);
  g.position.set(0, 0.125, 0.01);
  g.visible = false;
  return g;
}

function hatBeret() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), clothMat(0x1d2b4a));
  disc.scale.set(1.15, 0.35, 1.05);
  disc.position.set(0.03, 0.02, 0.01);
  disc.rotation.z = -0.35;
  g.add(disc);
  g.position.set(0, 0.145, 0);
  g.visible = false;
  return g;
}

function hatBrim() {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.07, 16), clothMat(0xf4f1ea));
  crown.position.y = 0.04;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.01, 24), clothMat(0xf7f4ee));
  brim.position.y = 0.006;
  g.add(crown, brim);
  g.position.set(0, 0.13, 0);
  g.visible = false;
  return g;
}

function hatBucket() {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.07, 16), clothMat(0xc4a574));
  crown.position.y = 0.04;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.02, 20), clothMat(0xb08a55));
  brim.position.y = -0.01;
  g.add(crown, brim);
  g.position.set(0, 0.13, 0);
  g.visible = false;
  return g;
}

function attachGear(root, store) {
  const head = boneNamed(root, /^Head$/);
  const finger = boneNamed(root, /RightHandIndex2$/) || boneNamed(root, /RightHandIndex1$/);
  const leftArm = boneNamed(root, /^LeftArm$/);
  const rightArm = boneNamed(root, /^RightArm$/);
  const gear = store || {};
  const hats = {
    cap: hatCap(),
    beanie: hatBeanie(),
    fedora: hatFedora(),
    beret: hatBeret(),
    brim: hatBrim(),
    bucket: hatBucket(),
  };
  const studMat = metalMat(0xe8d7a2);
  const studL = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 10), studMat);
  const studR = studL.clone();
  studL.position.set(0.074, 0.03, 0.02);
  studR.position.set(-0.074, 0.03, 0.02);
  const hoopL = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0026, 8, 18), studMat);
  const hoopR = hoopL.clone();
  hoopL.position.set(0.076, 0.012, 0.028);
  hoopR.position.set(-0.076, 0.012, 0.028);
  hoopL.rotation.y = Math.PI / 2;
  hoopR.rotation.y = Math.PI / 2;
  const dropL = new THREE.Group();
  const dropR = new THREE.Group();
  for (const [group, side] of [[dropL, 1], [dropR, -1]]) {
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0018, 6, 12), studMat);
    hook.rotation.y = Math.PI / 2;
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), metalMat(0xd7dde8));
    gem.position.y = -0.02;
    group.add(hook, gem);
    group.position.set(side * 0.076, 0.008, 0.03);
  }
  const cuffL = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, 6, 14), metalMat(0xd9dde2));
  const cuffR = cuffL.clone();
  cuffL.position.set(0.078, 0.055, 0.01);
  cuffR.position.set(-0.078, 0.055, 0.01);
  cuffL.rotation.z = Math.PI / 2;
  cuffR.rotation.z = Math.PI / 2;
  const piercing = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0024, 12, 22), metalMat(0xf2f6f8));
  piercing.position.set(0, 0.052, 0.108);
  piercing.rotation.y = Math.PI / 2;
  const barL = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.028, 8), studMat);
  const barR = barL.clone();
  barL.rotation.z = Math.PI / 2;
  barR.rotation.z = Math.PI / 2;
  barL.position.set(0.078, 0.02, 0.03);
  barR.position.set(-0.078, 0.02, 0.03);
  const cuts = {
    crop: hairCrop(),
    neat: hairNeat(),
    side: hairSide(),
    quiff: hairQuiff(),
    buzz: hairBuzz(),
    fade: hairFade(),
    slick: hairSlick(),
  };
  const beard = beardKit();
  const kit = maleClothes(root);
  if (head) head.add(studL, studR, hoopL, hoopR, dropL, dropR, cuffL, cuffR, barL, barR, piercing, beard.root, ...Object.values(hats), ...Object.values(cuts));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0022, 8, 16), metalMat(0xe8d7a2));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.012, 0);
  if (finger) finger.add(ring);
  const tattoo = new THREE.Group();
  const inkKinds = ["mark", "star", "band", "sleeve", "rose"];
  const tattooMeshes = {};
  for (const kind of inkKinds) {
    const mat = new THREE.MeshBasicMaterial({ map: tattooTexture(kind), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const piece = new THREE.Mesh(kind === "sleeve" || kind === "band" ? new THREE.CylinderGeometry(0.058, 0.055, kind === "sleeve" ? 0.16 : 0.05, 16, 1, true) : new THREE.CircleGeometry(kind === "rose" ? 0.05 : 0.028, 16), mat);
    if (kind !== "sleeve" && kind !== "band") piece.position.z = 0.055;
    piece.visible = false;
    tattooMeshes[kind] = piece;
    tattoo.add(piece);
  }
  tattoo.position.y = 0.12;
  if (leftArm) leftArm.add(tattoo);
  const tattooR = tattoo.clone();
  if (rightArm) rightArm.add(tattooR);
  for (const mesh of Object.values(hats)) mesh.visible = false;
  studL.visible = false;
  studR.visible = false;
  hoopL.visible = false;
  hoopR.visible = false;
  dropL.visible = false;
  dropR.visible = false;
  cuffL.visible = false;
  cuffR.visible = false;
  barL.visible = false;
  barR.visible = false;
  piercing.visible = false;
  ring.visible = false;
  tattoo.visible = false;
  tattooR.visible = false;
  Object.assign(gear, {
    hats, studL, studR, hoopL, hoopR, dropL, dropR, cuffL, cuffR, barL, barR, piercing, ring, tattoo, tattooR, tattooMeshes, cuts, beard, kit, styles: {}, bun: new THREE.Group(), hair: null,
  });
  root.traverse((obj) => {
    if (obj.name === "Wolf3D_Hair") gear.hair = obj;
  });
  return gear;
}

function applyGear(look) {
  const gear = avatar.gear;
  if (!gear) return;
  const hatId = look.hat === true ? "cap" : look.hat || "off";
  if (gear.hats) {
    for (const [name, mesh] of Object.entries(gear.hats)) mesh.visible = name === hatId;
  }
  const ears = look.earrings || "off";
  if (gear.studL) {
    gear.studL.visible = ears === "stud";
    gear.studR.visible = ears === "stud";
    gear.hoopL.visible = ears === "hoop";
    gear.hoopR.visible = ears === "hoop";
    gear.dropL.visible = ears === "drop";
    gear.dropR.visible = ears === "drop";
    gear.cuffL.visible = ears === "cuff";
    gear.cuffR.visible = ears === "cuff";
    if (gear.barL) {
      gear.barL.visible = ears === "bar";
      gear.barR.visible = ears === "bar";
    }
  }
  if (gear.piercing) gear.piercing.visible = !!look.piercing;
  if (gear.ring) gear.ring.visible = !!look.ring;
  let ink = look.tattoo === true ? "star" : look.tattoo || "off";
  const side = look.tattooSide || "right";
  if (gear.tattoo) {
    gear.tattoo.visible = ink !== "off" && (side === "left" || side === "both");
    gear.tattooR.visible = ink !== "off" && (side === "right" || side === "both");
    gear.tattoo.children.forEach((piece, i) => {
      const kinds = ["mark", "star", "band", "sleeve", "rose"];
      piece.visible = kinds[i] === ink;
    });
    gear.tattooR.children.forEach((piece, i) => {
      const kinds = ["mark", "star", "band", "sleeve", "rose"];
      piece.visible = kinds[i] === ink;
    });
  }
  const male = bodySex() === "m";
  const cutId = MALE_CUTS.includes(look.hairStyle) ? look.hairStyle : "crop";
  if (gear.cuts) {
    const tint = new THREE.Color(hairTint(look.hair));
    for (const [name, mesh] of Object.entries(gear.cuts)) {
      mesh.visible = male && name === cutId;
      mesh.traverse((obj) => {
        if (obj.material?.color) obj.material.color.copy(tint);
      });
    }
  }
  if (gear.beard) {
    const kind = BEARDS.includes(look.beard) ? look.beard : "off";
    const show = male && kind !== "off" && kind !== "stubble";
    gear.beard.root.visible = show;
    gear.beard.mustache.visible = show && (kind === "mustache" || kind === "goatee" || kind === "short" || kind === "full");
    gear.beard.chin.visible = show && (kind === "goatee" || kind === "short" || kind === "full");
    gear.beard.jaw.visible = show && (kind === "short" || kind === "full");
    gear.beard.cheek.visible = show && kind === "full";
    const ink = new THREE.Color(hairTint(look.hair));
    ink.multiplyScalar(0.72);
    gear.beard.mat.color.copy(ink);
  }
  if (gear.kit) {
    gear.kit.shirt.visible = false;
    gear.kit.bare.visible = false;
    for (const piece of [...gear.kit.sleeves, ...gear.kit.pants, ...gear.kit.pockets, ...gear.kit.legStripes, ...gear.kit.shoes]) piece.visible = false;
  }
  if (gear.hair) {
    gear.hair.visible = !male;
    gear.hair.scale.setScalar(1);
    const inf = gear.hair.morphTargetInfluences;
    const dict = gear.hair.morphTargetDictionary || {};
    if (inf) {
      for (const name of Object.keys(dict)) {
        if (name.startsWith("hair")) inf[dict[name]] = 0;
      }
      const id = male
        ? {
            crop: "hairCrop",
            neat: "hairNeat",
            side: "hairSide",
            quiff: "hairQuiff",
            buzz: "hairBuzz",
            fade: "hairFade",
            slick: "hairSlick",
          }[cutId]
        : {
            bob: "hairBob",
            bun: "hairBun",
            pony: "hairPony",
            short: "hairShort",
          }[look.hairStyle];
      if (id && dict[id] !== undefined) inf[dict[id]] = 1;
    }
  }
  if (avatar.meshes?.Wolf3D_Glasses) avatar.meshes.Wolf3D_Glasses.visible = look.glasses !== false;
}

function applyLook(look) {
  applyColors(look);
  applyShape(look);
  applyGear(look);
}

let openWardrobe = () => {};
let refreshSex = () => {};

function closePops() {
  for (const id of ["menu", "help", "settings", "market", "admin", "tasks", "atelier"]) {
    document.getElementById(id).classList.add("hidden");
  }
}

function reading() {
  if (wardrobeOpen || bagOpen) return true;
  return ["help", "settings", "market", "admin", "tasks", "atelier"].some((id) => !document.getElementById(id).classList.contains("hidden"));
}

function pushMorph(mesh, id, write) {
  if (!mesh?.geometry?.attributes?.position) return;
  if (!mesh.userData.ownMorphGeo) {
    mesh.geometry = mesh.geometry.clone();
    mesh.userData.ownMorphGeo = true;
  }
  const geo = mesh.geometry;
  geo.morphTargetsRelative = true;
  const pos = geo.attributes.position;
  if (!geo.morphAttributes.position) geo.morphAttributes.position = [];
  const arr = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const out = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    out.set(0, 0, 0);
    write(v, out);
    arr[i * 3] = out.x;
    arr[i * 3 + 1] = out.y;
    arr[i * 3 + 2] = out.z;
  }
  geo.morphAttributes.position.push(new THREE.BufferAttribute(arr, 3));
  const index = geo.morphAttributes.position.length - 1;
  if (!mesh.morphTargetInfluences) mesh.morphTargetInfluences = [];
  while (mesh.morphTargetInfluences.length < geo.morphAttributes.position.length) mesh.morphTargetInfluences.push(0);
  if (!mesh.morphTargetDictionary) mesh.morphTargetDictionary = {};
  mesh.morphTargetDictionary[id] = index;
  if (!avatar.morphs.includes(mesh)) avatar.morphs.push(mesh);
}

function installBodyShapes() {
  // Measured on this GLB: the bust is the shirt front at y≈1.34, z≈0.15.
  // Shoulders are the shirt sides at y≈1.18, |x|≈0.36. The jaw is the head at y≈1.47.
  const chest = (v, out) => {
    if (v.z < 0.06 || v.y < 1.27 || v.y > 1.41) return;
    const w = falloff(v, 0, 1.34, 0.145, 0.13, 0.07, 0.045);
    out.z = -0.18 * w;
    const ax = Math.abs(v.x);
    if (ax > 0.1 && ax < 0.28) out.x = Math.sign(v.x) * 0.028 * w;
  };
  const hips = (v, out) => {
    const ax = Math.abs(v.x);
    if (ax < 0.06) return;
    if (v.y >= 0.76 && v.y <= 1.0) {
      const w = falloff(v, Math.sign(v.x) * 0.17, 0.88, 0.04, 0.05, 0.1, 0.1);
      out.x = -Math.sign(v.x) * 0.07 * w;
    } else if (v.y > 1.04 && v.y < 1.2) {
      const w = falloff(v, Math.sign(v.x) * 0.11, 1.12, 0.02, 0.05, 0.07, 0.1);
      out.x = Math.sign(v.x) * 0.06 * w;
    }
  };
  const shoulders = (v, out) => {
    const ax = Math.abs(v.x);
    if (v.y < 1.12 || v.y > 1.28 || ax < 0.2) return;
    const w = falloff(v, Math.sign(v.x) * 0.34, 1.19, 0.02, 0.08, 0.08, 0.1);
    out.x = Math.sign(v.x) * 0.2 * w;
  };
  const arms = (v, out) => {
    const side = v.x > 0.2 ? 1 : v.x < -0.2 ? -1 : 0;
    if (!side || v.y < 0.82 || v.y > 1.28) return;
    const cx = side * 0.32;
    const cy = 1.05;
    const dx = v.x - cx;
    const dy = v.y - cy;
    const dz = v.z - 0.02;
    const len = Math.hypot(dx, dy, dz) || 1;
    const w = Math.min(1, (0.12 - Math.min(len, 0.12)) / 0.12);
    out.x = (dx / len) * 0.035 * w;
    out.y = (dy / len) * 0.02 * w;
    out.z = (dz / len) * 0.02 * w;
  };
  const neck = (v, out) => {
    if (v.y < 1.43 || v.y > 1.52) return;
    const w = falloff(v, 0, 1.47, 0.03, 0.07, 0.05, 0.06);
    out.x = v.x * 0.45 * w;
  };
  const body = avatar.meshes.Wolf3D_Body;
  const top = avatar.meshes.Wolf3D_Outfit_Top;
  const pants = avatar.meshes.Wolf3D_Outfit_Bottom;
  if (body) {
    pushMorph(body, "chestFlat", chest);
    pushMorph(body, "hipNarrow", hips);
    pushMorph(body, "shoulderWide", shoulders);
    pushMorph(body, "neckWide", neck);
    pushMorph(body, "armThick", arms);
    body.frustumCulled = false;
    body.visible = true;
  }
  if (top) {
    pushMorph(top, "chestFlat", chest);
    pushMorph(top, "shoulderWide", shoulders);
    top.frustumCulled = false;
  }
  if (pants) {
    pushMorph(pants, "hipNarrow", hips);
    pants.frustumCulled = false;
    pants.visible = true;
  }
  const head = avatar.meshes.Wolf3D_Head;
  if (head) {
    pushMorph(head, "neckWide", neck);
    pushMorph(head, "maleJaw", (v, out) => {
      if (v.y < 1.44 || v.y > 1.51 || Math.abs(v.x) < 0.025) return;
      const w = falloff(v, Math.sign(v.x) * 0.055, 1.47, 0.05, 0.035, 0.04, 0.05);
      out.x = Math.sign(v.x) * 0.04 * w;
    });
    pushMorph(head, "maleLip", (v, out) => {
      if (v.y < 1.5 || v.y > 1.545 || v.z < 0.09) return;
      const w = falloff(v, 0, 1.52, 0.132, 0.035, 0.022, 0.03);
      out.z = -0.028 * w;
    });
    pushMorph(head, "maleBrow", (v, out) => {
      if (v.y < 1.6 || v.y > 1.67 || v.z < 0.09) return;
      const w = falloff(v, 0, 1.635, 0.14, 0.06, 0.03, 0.035);
      out.y = -0.028 * w;
      out.z = 0.016 * w;
    });
  }
  installHairShapes();
}

function installHairShapes() {
  const hair = avatar.meshes.Wolf3D_Hair;
  if (!hair) return;
  const hang = (v, floor) => {
    if (v.y > 1.64 && v.z > 0.05) return 0;
    if (v.y >= floor) return 0;
    return Math.min(1, (floor - v.y) / 0.24);
  };
  const tidy = (floor, lift, pinch) => (v, out) => {
    const k = hang(v, floor);
    if (!k) return;
    out.y = (floor - v.y) * lift * k;
    out.x = -v.x * pinch * k;
    out.z = (0.0 - v.z) * pinch * 0.55 * k;
  };
  const maleCut = (opt) => (v, out) => {
    const ax = Math.abs(v.x);
    const side = Math.min(1, Math.max(0, (ax - 0.04) / 0.08));
    const front = Math.min(1, Math.max(0, (v.z - 0.02) / 0.08));
    const top = Math.min(1, Math.max(0, (v.y - 1.64) / 0.08));
    const floor = (opt.floor || 1.6) + side * (opt.side || 0) - front * top * (opt.frontKeep || 0);
    if (v.y < floor) {
      const k = Math.min(1, (floor - v.y) / 0.22);
      out.y += (floor - v.y) * 0.94 * k;
      out.x += -v.x * (opt.tuck || 0.28) * k;
      out.z += (0.01 - v.z) * (opt.tuck || 0.28) * 0.65 * k;
    }
    if (v.z > 0.03 && v.y < 1.75 && v.y > 1.52 && !opt.keepFringe) {
      const fringe = Math.min(1, (v.z - 0.03) / 0.07) * Math.min(1, (1.75 - v.y) / 0.16);
      out.y += 0.05 * fringe;
      out.z -= 0.075 * fringe;
    }
    if (opt.flat && v.y > 1.7) out.y -= (v.y - 1.7) * opt.flat;
    if (opt.sweep && front > 0 && v.y > 1.55) out.x += opt.sweep * front;
    if (opt.slick && top > 0) out.z -= opt.slick * top;
    if (opt.lift && front > 0.35 && v.y > 1.6 && v.y < 1.74) out.y += opt.lift * front;
    if (ax > 0.095 && v.y < 1.74) out.x -= Math.sign(v.x) * (ax - 0.095) * (opt.sideClamp ?? 0.85);
  };
  pushMorph(hair, "hairBob", tidy(1.52, 0.82, 0.18));
  pushMorph(hair, "hairShort", tidy(1.6, 0.9, 0.42));
  pushMorph(hair, "hairCrop", maleCut({ floor: 1.6, tuck: 0.34 }));
  pushMorph(hair, "hairNeat", maleCut({ floor: 1.62, tuck: 0.38, flat: 0.15, side: 0.02 }));
  pushMorph(hair, "hairSide", maleCut({ floor: 1.6, tuck: 0.3, sweep: 0.05 }));
  pushMorph(hair, "hairQuiff", maleCut({ floor: 1.58, tuck: 0.26, lift: 0.055, frontKeep: 0.04 }));
  pushMorph(hair, "hairBuzz", maleCut({ floor: 1.68, tuck: 0.62, side: 0.02, flat: 0.7, sideClamp: 1.15 }));
  pushMorph(hair, "hairFade", maleCut({ floor: 1.54, tuck: 0.22, side: 0.12 }));
  pushMorph(hair, "hairSlick", maleCut({ floor: 1.62, tuck: 0.36, slick: 0.06, flat: 0.25 }));
  pushMorph(hair, "hairBun", (v, out) => {
    const k = hang(v, 1.62);
    if (!k) return;
    out.x = (v.x * 0.28 - v.x) * 0.9 * k;
    out.y = (1.72 - v.y) * 0.92 * k;
    out.z = (-0.05 - v.z) * 0.8 * k;
  });
  pushMorph(hair, "hairPony", (v, out) => {
    const k = hang(v, 1.6);
    if (!k) return;
    out.x = -v.x * 0.78 * k;
    out.y = (1.5 - v.y) * 0.45 * k;
    out.z = (-0.16 - v.z) * 0.88 * k;
  });
  hair.frustumCulled = false;
  const mats = Array.isArray(hair.material) ? hair.material : [hair.material];
  for (const mat of mats) if (mat) mat.needsUpdate = true;
}

let heroRoot = null;
let suitWorn = "";
let detachSuit = null;

function visitGear(fn) {
  const gear = avatar.gear;
  if (!gear) return;
  for (const item of Object.values(gear)) {
    if (item?.isObject3D) fn(item);
    else if (item && typeof item === "object") {
      for (const piece of Object.values(item)) {
        if (piece?.isObject3D) fn(piece);
      }
    }
  }
}

function holdHidden(obj) {
  if (!obj) return;
  if (obj.userData.suitHeld == null) obj.userData.suitHeld = obj.visible;
  obj.visible = false;
}

function concealBody() {
  for (const [name, mesh] of Object.entries(avatar.meshes)) {
    if (mesh && /Wolf3D|Eye|Teeth/.test(name)) holdHidden(mesh);
  }
  visitGear(holdHidden);
}

function restoreGear() {
  for (const mesh of Object.values(avatar.meshes)) {
    if (!mesh || mesh.userData.suitHeld == null) continue;
    mesh.visible = mesh.userData.suitHeld;
    mesh.userData.suitHeld = null;
  }
  visitGear((obj) => {
    if (obj.userData.suitHeld == null) return;
    obj.visible = obj.userData.suitHeld;
    obj.userData.suitHeld = null;
  });
}

function readSuits() {
  try {
    const data = JSON.parse(localStorage.getItem(SUIT_KEY) || "{}");
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function equipSuit(kind, persist) {
  if (!heroRoot) return;
  if (detachSuit) detachSuit();
  detachSuit = mountSuit(heroRoot, kind);
  suitWorn = kind;
  if (persist) localStorage.setItem(WORN_KEY, kind);
}

function clearSuit() {
  if (detachSuit) detachSuit();
  detachSuit = null;
  suitWorn = "";
  restoreGear();
  localStorage.removeItem(WORN_KEY);
}

function applyFrameBody() {
  if (suitWorn) {
    concealBody();
    return;
  }
  const male = bodySex() === "m";
  const amount = male ? 1 : 0;
  for (const mesh of avatar.morphs) {
    const dict = mesh.morphTargetDictionary;
    if (!dict || !mesh.morphTargetInfluences) continue;
    if (dict.chestFlat !== undefined) mesh.morphTargetInfluences[dict.chestFlat] = amount;
    if (dict.hipNarrow !== undefined) mesh.morphTargetInfluences[dict.hipNarrow] = amount;
    if (dict.shoulderWide !== undefined) mesh.morphTargetInfluences[dict.shoulderWide] = amount;
    if (dict.neckWide !== undefined) mesh.morphTargetInfluences[dict.neckWide] = amount;
    if (dict.armThick !== undefined) mesh.morphTargetInfluences[dict.armThick] = amount;
    if (dict.maleJaw !== undefined) mesh.morphTargetInfluences[dict.maleJaw] = amount;
    if (dict.maleLip !== undefined) mesh.morphTargetInfluences[dict.maleLip] = amount;
    if (dict.maleBrow !== undefined) mesh.morphTargetInfluences[dict.maleBrow] = amount;
    if (mesh.name === "Wolf3D_Hair" && avatar.look) {
      const maleNow = bodySex() === "m";
      mesh.visible = !maleNow;
      const cut = MALE_CUTS.includes(avatar.look.hairStyle) ? avatar.look.hairStyle : "crop";
      const id = maleNow
        ? { crop: "hairCrop", neat: "hairNeat", side: "hairSide", quiff: "hairQuiff", buzz: "hairBuzz", fade: "hairFade", slick: "hairSlick" }[cut]
        : { bob: "hairBob", bun: "hairBun", pony: "hairPony", short: "hairShort" }[avatar.look.hairStyle];
      for (const name of Object.keys(dict)) {
        if (name.startsWith("hair")) mesh.morphTargetInfluences[dict[name]] = name === id ? 1 : 0;
      }
    }
  }
  if (avatar.meshes.Wolf3D_Body) avatar.meshes.Wolf3D_Body.visible = true;
  if (avatar.meshes.Wolf3D_Outfit_Top) avatar.meshes.Wolf3D_Outfit_Top.visible = true;
  if (avatar.meshes.Wolf3D_Outfit_Bottom) avatar.meshes.Wolf3D_Outfit_Bottom.visible = true;
  if (avatar.meshes.Wolf3D_Outfit_Footwear) avatar.meshes.Wolf3D_Outfit_Footwear.visible = true;
}

function setupWardrobe(hero) {
  installFaceShapes(hero);
  hero.traverse((obj) => {
    if (!obj.isMesh) return;
    avatar.meshes[obj.name] = obj;
    if (obj.morphTargetDictionary) avatar.morphs.push(obj);
  });
  avatar.root = hero;
  installBodyShapes();
  const hairMesh = avatar.meshes.Wolf3D_Hair;
  if (hairMesh && !avatar.morphs.includes(hairMesh)) avatar.morphs.push(hairMesh);

  let look = {
    name: "",
    skin: "#ffffff",
    hair: "#ffffff",
    eyes: "#ffffff",
    top: "#ffffff",
    pants: "#ffffff",
    shoes: "#ffffff",
    glasses: true,
    hat: false,
    earrings: "off",
    piercing: false,
    ring: false,
    tattoo: "off",
    tattooSide: "right",
    hairStyle: "loose",
    topStyle: "plain",
    pantsStyle: "plain",
    smile: 0.12,
    brow: 0,
  };
  for (const slider of FACE_SLIDERS) {
    if (look[slider.id] === undefined) look[slider.id] = slider.min === 0 ? 0 : 0;
  }
  let created = localStorage.getItem("zv-created") === "1";
  try {
    const saved = JSON.parse(localStorage.getItem(LOOK_KEY) || "null");
    if (saved) {
      look = { ...look, ...saved };
      if (look.tattoo === true) look.tattoo = "star";
      if (!look.tattoo) look.tattoo = "off";
      if (look.hat === true) look.hat = "cap";
      if (!look.hat || look.hat === false) look.hat = "off";
      created = true;
    }
  } catch {
    /* keep defaults */
  }

  const panel = document.getElementById("wardrobe");
  const body = document.getElementById("wardrobe-body");
  const close = document.getElementById("wardrobe-close");
  const title = panel.querySelector("h2");

  const hint = document.createElement("p");
  hint.className = "mirror-hint";
  hint.dataset.i18n = "wardrobeHint";
  hint.textContent = t("wardrobeHint");
  title.after(hint);

  const tabs = document.createElement("div");
  tabs.className = "look-tabs";
  hint.after(tabs);

  const zoomRow = document.createElement("div");
  zoomRow.className = "mirror-zoom";
  for (const [zoom, key] of [
    [0.78, "zoomFace"],
    [2.15, "zoomBody"],
  ]) {
    const zoomBtn = document.createElement("button");
    zoomBtn.type = "button";
    zoomBtn.dataset.i18n = key;
    zoomBtn.textContent = t(key);
    zoomBtn.addEventListener("click", () => {
      mirrorZoom = zoom;
      mirrorPitch = zoom < 1 ? 0 : -0.08;
    });
    zoomRow.appendChild(zoomBtn);
  }
  tabs.after(zoomRow);

  function save(repaint) {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
    if (lookArmed) markReady("look");
    if (repaint) applyColors(look);
    applyShape(look);
    applyGear(look);
    body.querySelectorAll(".swatch").forEach((el) => {
      el.classList.toggle("on", el.dataset.color === look[el.dataset.row]);
    });
  }

  function showTab(tab) {
    body.querySelectorAll(".look-group").forEach((group) => {
      group.classList.toggle("hidden", group.dataset.tab !== tab);
    });
    tabs.querySelectorAll(".look-tab").forEach((el) => {
      el.classList.toggle("on", el.dataset.tab === tab);
    });
  }

  const groups = new Map();
  function groupFor(tab, titleText) {
    const key = `${tab}:${titleText}`;
    if (groups.has(key)) return groups.get(key);
    const group = document.createElement("div");
    group.className = "look-group";
    group.dataset.tab = tab;
    const heading = document.createElement("h3");
    heading.dataset.i18n = titleText;
    heading.textContent = t(titleText);
    group.appendChild(heading);
    body.appendChild(group);
    groups.set(key, group);
    return group;
  }

  for (const slider of FACE_SLIDERS) {
    const wrap = document.createElement("div");
    wrap.className = "look-row";
    const label = document.createElement("span");
    label.dataset.i18n = slider.label;
    label.textContent = t(slider.label);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(slider.min ?? -1);
    input.max = String(slider.max ?? 1);
    input.step = "0.01";
    input.dataset.slider = slider.id;
    input.value = String(look[slider.id] ?? 0);
    input.addEventListener("input", () => {
      look[slider.id] = Number(input.value);
      save(false);
    });
    wrap.append(label, input);
    groupFor(slider.tab, slider.group).appendChild(wrap);
  }

  const colorTabs = { skin: "colori", hair: "colori", eyes: "occhi", top: "abiti", pants: "abiti", shoes: "abiti" };
  for (const row of LOOKS) {
    const wrap = document.createElement("div");
    wrap.className = "look-row";
    const label = document.createElement("span");
    label.dataset.i18n = row.label;
    label.textContent = t(row.label);
    wrap.appendChild(label);
    const swatches = document.createElement("div");
    swatches.className = "swatches";
    for (const color of row.colors) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "swatch";
      swatch.dataset.row = row.id;
      swatch.dataset.color = color;
      swatch.style.background = color === "#ffffff" ? "linear-gradient(135deg,#fff,#c8c8c8)" : color;
      swatch.dataset.original = color === "#ffffff" ? "1" : "";
      swatch.title = color === "#ffffff" ? t("original") : color;
      swatch.addEventListener("click", () => {
        look[row.id] = color;
        save(true);
      });
      swatches.appendChild(swatch);
    }
    wrap.appendChild(swatches);
    groupFor(colorTabs[row.id], row.label).appendChild(wrap);
  }

  const glasses = document.createElement("div");
  glasses.className = "look-row";
  const glassesLabel = document.createElement("span");
  glassesLabel.dataset.i18n = "glasses";
  glassesLabel.textContent = t("glasses");
  const glassesBtn = document.createElement("button");
  glassesBtn.type = "button";
  glassesBtn.dataset.i18n = "glassesToggle";
  glassesBtn.textContent = t("glassesToggle");
  glassesBtn.addEventListener("click", () => {
    look.glasses = !look.glasses;
    save(false);
  });
  glasses.append(glassesLabel, glassesBtn);
  groupFor("abiti", "glasses").appendChild(glasses);

  function choiceRow(field, labelKey, options, tab = "extra") {
    const wrap = document.createElement("div");
    wrap.className = "look-row";
    const label = document.createElement("span");
    label.dataset.i18n = labelKey;
    label.textContent = t(labelKey);
    const row = document.createElement("div");
    row.className = "look-tabs";
    for (const [value, key, who] of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "look-tab" + (String(look[field] ?? "off") === value ? " on" : "");
      btn.dataset.i18n = key;
      btn.dataset.value = value;
      btn.dataset.field = field;
      btn.dataset.for = who || "any";
      btn.textContent = t(key);
      btn.addEventListener("click", () => {
        look[field] = value;
        save(field === "topStyle" || field === "pantsStyle" || field === "hairStyle" || field === "beard");
        row.querySelectorAll("button").forEach((el) => el.classList.toggle("on", el.dataset.value === String(look[field])));
      });
      row.appendChild(btn);
    }
    const sexes = new Set(options.map((item) => item[2] || "any"));
    if (sexes.size === 1 && !sexes.has("any")) wrap.dataset.for = [...sexes][0];
    wrap.append(label, row);
    groupFor(tab, labelKey).appendChild(wrap);
  }

  function toggleRow(field, labelKey) {
    const wrap = document.createElement("div");
    wrap.className = "look-row";
    const label = document.createElement("span");
    label.dataset.i18n = labelKey;
    label.textContent = t(labelKey);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "look-tab" + (look[field] ? " on" : "");
    btn.dataset.i18n = look[field] ? "on" : "off";
    btn.textContent = t(look[field] ? "on" : "off");
    btn.addEventListener("click", () => {
      look[field] = !look[field];
      btn.className = "look-tab" + (look[field] ? " on" : "");
      btn.dataset.i18n = look[field] ? "on" : "off";
      btn.textContent = t(look[field] ? "on" : "off");
      save(false);
    });
    wrap.append(label, btn);
    groupFor("extra", "tab.extra").appendChild(wrap);
  }

  const faceGrid = document.createElement("div");
  faceGrid.className = "face-grid";
  const facePresets = [
    ["face.eu", { noseWidth: 0, noseLength: 0, lipFull: 0.05, lipWidth: 0, jaw: 0, cheek: 0, eyeSpace: 0, eyeSize: 0, smile: 0.12 }, "f"],
    ["face.east", { noseWidth: -0.7, noseLength: -0.4, lipFull: -0.15, lipWidth: 0.1, jaw: 0.22, cheek: 0.28, eyeSpace: 0.22, eyeSize: 0.1, cheekBone: 0.18 }, "f"],
    ["face.south", { noseWidth: 0.18, noseLength: 0.28, lipFull: 0.42, jaw: 0.12, brow: 0.28, cheekBone: 0.22, smile: 0.16 }, "f"],
    ["face.af", { noseWidth: 0.8, noseLength: 0.1, lipFull: 0.75, lipWidth: 0.2, jaw: 0.55, cheek: 0.42, noseBridge: -0.3, smile: 0.1 }, "f"],
    ["face.lat", { noseWidth: 0.28, lipFull: 0.48, lipWidth: 0.12, jaw: 0.18, cheekBone: 0.38, smile: 0.32 }, "f"],
    ["face.square", { jaw: 0.78, chin: 0.4, chinWidth: 0.5, lipFull: -0.62, lipWidth: 0.1, browHeight: -0.34, noseWidth: 0.2, noseLength: 0.24, cheek: -0.2, smile: 0.04 }, "m"],
    ["face.soft", { jaw: 0.32, chin: 0.12, lipFull: -0.22, browHeight: -0.08, cheek: 0.12, smile: 0.2, eyeSize: 0.04 }, "m"],
    ["face.wide", { jaw: 0.9, chinWidth: 0.62, cheekBone: 0.4, noseWidth: 0.42, lipFull: -0.35, smile: 0.08 }, "m"],
    ["face.sharp", { chin: 0.62, jaw: 0.36, noseLength: 0.58, noseBridge: 0.35, lipFull: -0.7, lipWidth: -0.15, browHeight: -0.42, smile: 0 }, "m"],
    ["face.young", { jaw: 0.18, chin: -0.08, lipFull: -0.08, eyeSize: 0.16, smile: 0.24, cheek: 0.22, browHeight: 0.05 }, "m"],
  ];
  for (const [key, preset, who] of facePresets) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "face-pick";
    btn.dataset.i18n = key;
    btn.dataset.for = who;
    btn.textContent = t(key);
    btn.addEventListener("click", () => {
      Object.assign(look, preset);
      for (const [id, value] of Object.entries(preset)) {
        const input = body.querySelector(`input[data-slider="${id}"]`);
        if (input) input.value = String(value);
      }
      save(false);
      faceGrid.querySelectorAll("button").forEach((el) => el.classList.toggle("on", el === btn));
    });
    faceGrid.appendChild(btn);
  }
  const faceGroup = groupFor("viso", "facePreset");
  faceGroup.appendChild(faceGrid);
  body.prepend(faceGroup);

  choiceRow("hairStyle", "hairStyle", [
    ["loose", "loose", "f"],
    ["bob", "bob", "f"],
    ["bun", "bun", "f"],
    ["pony", "pony", "f"],
    ["short", "short", "f"],
    ["crop", "crop", "m"],
    ["neat", "neat", "m"],
    ["side", "side", "m"],
    ["quiff", "quiff", "m"],
    ["buzz", "buzz", "m"],
    ["fade", "fade", "m"],
    ["slick", "slick", "m"],
  ], "capelli");
  choiceRow("beard", "beard", [
    ["off", "off", "m"],
    ["stubble", "beard.stubble", "m"],
    ["mustache", "beard.mustache", "m"],
    ["goatee", "beard.goatee", "m"],
    ["short", "beard.short", "m"],
    ["full", "beard.full", "m"],
  ], "capelli");
  choiceRow("topStyle", "topStyle", [
    ["plain", "plain", "f"],
    ["stripe", "stripe", "f"],
    ["block", "block", "f"],
    ["dot", "dot", "f"],
    ["rib", "rib", "f"],
    ["plain", "plain", "m"],
    ["logo", "logo", "m"],
    ["polo", "polo", "m"],
    ["rugby", "rugby", "m"],
    ["vest", "vest", "m"],
    ["none", "none", "m"],
  ], "abiti");
  choiceRow("pantsStyle", "pantsStyle", [
    ["plain", "plain", "f"],
    ["stripe", "stripe", "f"],
    ["check", "check", "f"],
    ["jean", "jean", "f"],
    ["rib", "rib", "f"],
    ["plain", "plain", "m"],
    ["jean", "jean", "m"],
    ["cargo", "cargo", "m"],
    ["chino", "chino", "m"],
    ["track", "track", "m"],
  ], "abiti");
  choiceRow("earrings", "earrings", [
    ["off", "off", "f"],
    ["stud", "studs", "f"],
    ["hoop", "hoops", "f"],
    ["drop", "drops", "f"],
    ["cuff", "cuffs", "f"],
    ["off", "off", "m"],
    ["stud", "studs", "m"],
    ["hoop", "hoops", "m"],
    ["bar", "bar", "m"],
  ]);
  choiceRow("hat", "hat", [
    ["off", "off", "f"],
    ["beret", "beret", "f"],
    ["brim", "brim", "f"],
    ["bucket", "bucket", "f"],
    ["off", "off", "m"],
    ["cap", "cap", "m"],
    ["beanie", "beanie", "m"],
    ["fedora", "fedora", "m"],
  ]);
  choiceRow("tattoo", "tattoo", [
    ["off", "off", "any"],
    ["mark", "tattoo.mark", "any"],
    ["star", "tattoo.star", "any"],
    ["band", "tattoo.band", "any"],
    ["sleeve", "tattoo.sleeve", "any"],
    ["rose", "tattoo.rose", "any"],
  ]);
  choiceRow("tattooSide", "tattooSide", [
    ["left", "arm.left", "any"],
    ["right", "arm.right", "any"],
    ["both", "arm.both", "any"],
  ]);
  toggleRow("piercing", "piercing");
  toggleRow("ring", "ring");

  for (const [id, key] of [
    ["viso", "tab.face"],
    ["occhi", "tab.eyes"],
    ["naso", "tab.nose"],
    ["colori", "tab.colors"],
    ["abiti", "tab.clothes"],
    ["capelli", "hairStyle"],
    ["extra", "tab.extra"],
  ]) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "look-tab";
    tab.dataset.tab = id;
    tab.dataset.i18n = key;
    tab.textContent = t(key);
    tab.addEventListener("click", () => showTab(id));
    tabs.appendChild(tab);
  }
  showTab("viso");
  let sexRow = null;
  if (!created) {
    sexRow = document.createElement("div");
    sexRow.className = "sex-once";
    const label = document.createElement("p");
    label.dataset.i18n = "sexOnce";
    label.textContent = t("sexOnce");
    const row = document.createElement("div");
    row.className = "look-tabs";
    for (const [value, key] of [["f", "female"], ["m", "male"]]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "look-tab" + (bodySex() === value ? " on" : "");
      btn.dataset.i18n = key;
      btn.dataset.sex = value;
      btn.textContent = t(key);
      btn.addEventListener("click", () => {
        localStorage.setItem("zv-sex", value);
        row.querySelectorAll("button").forEach((el) => el.classList.toggle("on", el.dataset.sex === value));
        refreshSex();
      });
      row.appendChild(btn);
    }
    sexRow.append(label, row);
    zoomRow.after(sexRow);
  }

  refreshSex = () => {
    const male = bodySex() === "m";
    const next = male ? "m" : "f";
    if (refreshSex._sex && refreshSex._sex !== next) {
      localStorage.setItem(refreshSex._sex === "m" ? "zv-look-m" : "zv-look-f", JSON.stringify(look));
      const raw = localStorage.getItem(next === "m" ? "zv-look-m" : "zv-look-f");
      if (raw) {
        try {
          Object.assign(look, JSON.parse(raw));
        } catch {
          /* keep the current look */
        }
      } else if (next === "m") Object.assign(look, MALE_START);
    }
    refreshSex._sex = next;
    body.querySelectorAll("[data-for]").forEach((el) => {
      el.classList.toggle("hidden", el.dataset.for !== "any" && el.dataset.for !== next);
    });
    const hairOk = male ? MALE_CUTS : ["loose", "bob", "bun", "pony", "short"];
    if (!hairOk.includes(look.hairStyle)) look.hairStyle = male ? "crop" : "loose";
    if (male && !BEARDS.includes(look.beard)) look.beard = "stubble";
    const topOk = male ? ["plain", "logo", "polo", "rugby", "vest", "none"] : ["plain", "stripe", "block", "dot", "rib"];
    if (!topOk.includes(look.topStyle || "plain")) look.topStyle = male ? "polo" : "plain";
    const pantsOk = male ? ["plain", "jean", "cargo", "chino", "track"] : ["plain", "stripe", "check", "jean", "rib"];
    if (!pantsOk.includes(look.pantsStyle || "plain")) look.pantsStyle = male ? "jean" : "plain";
    const hatOk = male ? ["off", "cap", "beanie", "fedora"] : ["off", "beret", "brim", "bucket"];
    if (!hatOk.includes(look.hat)) look.hat = "off";
    const earOk = male ? ["off", "stud", "hoop", "bar"] : ["off", "stud", "hoop", "drop", "cuff"];
    if (!earOk.includes(look.earrings || "off")) look.earrings = "off";
    body.querySelectorAll("input[data-slider]").forEach((input) => {
      if (look[input.dataset.slider] !== undefined) input.value = String(look[input.dataset.slider]);
    });
    body.querySelectorAll("button[data-field]").forEach((el) => {
      el.classList.toggle("on", el.dataset.value === String(look[el.dataset.field] ?? "off"));
    });
    applyLook(look);
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
  };
  refreshSex();

  function setWardrobe(open) {
    wardrobeOpen = open;
    panel.classList.toggle("hidden", !open);
    document.body.classList.toggle("mirroring", open);
    if (open) {
      closePops();
      setBagOpen(false);
      mirrorYaw = 0;
      mirrorZoom = 0.82;
      mirrorPitch = 0;
      document.exitPointerLock();
    }
    resizeView();
  }

  openWardrobe = setWardrobe;
  close.addEventListener("click", () => {
    localStorage.setItem("zv-created", "1");
    created = true;
    sexRow?.remove();
    sexRow = null;
    save(false);
    setWardrobe(false);
  });
  window.addEventListener("keydown", (e) => {
    if (e.code !== "KeyC" || e.repeat) return;
    if (e.target instanceof HTMLInputElement) return;
    setWardrobe(!wardrobeOpen);
  });

  save(true);
  lookArmed = true;
  onLang(() => {
    body.querySelectorAll(".swatch").forEach((el) => {
      if (el.dataset.original) el.title = t("original");
    });
  });
  if (!created) setWardrobe(true);
}

async function boot() {
  setLoad(t("boot"));
  const basePack = await Promise.all([
    loadGltf("/models/hero.glb"),
    loadGltf("/models/idle.glb"),
    loadGltf("/models/walk.glb"),
    loadGltf("/models/jog.glb"),
  ]);
  const [heroGltf, idleGltf, walkGltf, jogGltf] = basePack;
  const parrot = phone ? null : await loadGltf(MODELS.parrot);

  pinHipsXZ(idleGltf.animations);
  pinHipsXZ(walkGltf.animations);
  pinHipsXZ(jogGltf.animations);
  idleGltf.animations[0].name = "idle";
  walkGltf.animations[0].name = "walk";
  jogGltf.animations[0].name = "run";

  const hero = cloneSkeleton(heroGltf.scene);
  ownMaterials(hero);
  fitOnGround(hero);
  player.group.add(hero);
  avatar.gear = attachGear(hero);
  attachBadge(hero);
  setupWardrobe(hero);
  heroRoot = hero;
  const savedSuit = localStorage.getItem(WORN_KEY);
  if (savedSuit && readSuits()[savedSuit]) equipSuit(savedSuit, true);
  if (player.placeholder) {
    player.placeholder.removeFromParent();
    player.placeholder = null;
  }
  player.mixer = new THREE.AnimationMixer(hero);
  player.actions = setupActions(player.mixer, [
    idleGltf.animations[0],
    walkGltf.animations[0],
    jogGltf.animations[0],
  ]);
  mixers.push(player.mixer);
  city.bind(hero, idleGltf.animations[0]);

  const crowdN = phone ? 2 : 10;
  for (let i = 0; i < crowdN; i++) {
    const body = cloneSkeleton(heroGltf.scene);
    ownMaterials(body);
    spawnCitizen(body, i, [idleGltf.animations[0], walkGltf.animations[0]]);
  }
  if (!phone && parrot) {
    for (let i = 0; i < 5; i++) spawnBird(parrot, i);
    spawnKindBirds();
  }

  document.getElementById("boot").classList.add("hidden");
}

function setPlayerAnim(moving, running) {
  const { idle, walk, run } = player.actions;
  const wIdle = moving ? 0 : 1;
  const wWalk = moving && !running ? 1 : 0;
  const wRun = moving && running ? 1 : 0;
  if (idle) idle.setEffectiveWeight(THREE.MathUtils.lerp(idle.getEffectiveWeight(), wIdle, 0.15));
  if (walk) {
    walk.setEffectiveWeight(THREE.MathUtils.lerp(walk.getEffectiveWeight(), wWalk, 0.15));
    walk.setEffectiveTimeScale(WALK_SPEED / 1.45);
  }
  if (run) {
    run.setEffectiveWeight(THREE.MathUtils.lerp(run.getEffectiveWeight(), wRun, 0.15));
    run.setEffectiveTimeScale(RUN_SPEED / 4.2);
  }
}

function updatePlayer(dt) {
  let forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0);
  let side = (keys.KeyD || keys.ArrowRight ? 1 : 0) + (keys.KeyA || keys.ArrowLeft ? -1 : 0);
  if (walkStick.on) {
    forward += -walkStick.y;
    side += walkStick.x;
  }
  const typing = document.activeElement;
  const typingTag = typing && typing.tagName;
  if (reading() || city.blocksMove() || typingTag === "INPUT" || typingTag === "TEXTAREA" || typingTag === "SELECT") {
    forward = 0;
    side = 0;
  }
  const running = !!(keys.ShiftLeft || keys.ShiftRight || runHeld);
  if (city.driving()) {
    const moved = city.drive(dt, forward, side, (pos, radius, from) => {
      collideFountain(pos);
      collideBlocks(pos, radius);
      collideCircles(pos, radius);
      collidePeople(pos, radius);
      if (blockClimb(from.x, from.z, pos.x, pos.z)) {
        pos.x = from.x;
        pos.z = from.z;
        return true;
      }
      return false;
    });
    noteWalk(moved);
    setPlayerAnim(false, false);
    return;
  }
  const skating = city.riding();
  const speed = (skating ? 9.4 : running ? RUN_SPEED : WALK_SPEED) * dt;

  const camSin = Math.sin(yaw);
  const camCos = Math.cos(yaw);
  let mx = 0;
  let mz = 0;
  if (forward || side) {
    const len = Math.hypot(forward, side) || 1;
    const f = forward / len;
    const s = side / len;
    mx = (-f * camSin + s * camCos) * speed;
    mz = (-f * camCos - s * camSin) * speed;
    player.group.rotation.y = Math.atan2(mx, mz);
  }

  if (aiming && inventory[selectedSlot]?.id === "pistola") {
    camera.getWorldDirection(shotDir);
    const face = Math.atan2(shotDir.x, shotDir.z);
    let turn = face - player.group.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    player.group.rotation.y += turn * (1 - Math.exp(-9 * dt));
  }

  const stepFrom = player.group.position.clone();
  player.group.position.x += mx;
  player.group.position.z += mz;

  collideFountain(player.group.position);
  collideBlocks(player.group.position, player.radius);
  collideCircles(player.group.position, player.radius);
  collidePeople(player.group.position, player.radius);
  if (blockClimb(stepFrom.x, stepFrom.z, player.group.position.x, player.group.position.z)) {
    player.group.position.x = stepFrom.x;
    player.group.position.z = stepFrom.z;
  }
  const floorY = groundAt(player.group.position.x, player.group.position.z);
  const lift = city.skateStep(dt, skating, floorY);
  player.group.position.y = floorY + (skating ? 0.48 : 0) + lift;
  player.velY = skating && city.skateAir() ? 1 : 0;
  player.grounded = !city.skateAir();
  const dist = Math.hypot(player.group.position.x, player.group.position.z);
  const cap = 206;
  if (dist > cap) {
    player.group.position.x *= cap / dist;
    player.group.position.z *= cap / dist;
  }

  noteWalk(Math.hypot(player.group.position.x - stepFrom.x, player.group.position.z - stepFrom.z));
  setPlayerAnim(!skating && Math.abs(forward) + Math.abs(side) > 0 && player.grounded, !skating && running);
}

const camGoal = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camReady = false;

function gatePassage() {
  const p = player.group.position;
  for (const gate of plazaGates) {
    if (!gate.span) continue;
    const ox = Math.cos(gate.a);
    const oz = Math.sin(gate.a);
    const along = (p.x - gate.x) * ox + (p.z - gate.z) * oz;
    const lateral = Math.abs((p.x - gate.x) * oz - (p.z - gate.z) * ox);
    if (lateral < gate.span && Math.abs(along) < 3.2) return true;
  }
  return false;
}

function updateCamera() {
  if (wardrobeOpen) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.setViewOffset(w, h, w * 0.18, 0, w, h);
    const focusY = player.group.position.y + (mirrorZoom < 1.15 ? 1.58 : 1.02);
    camGoal.set(
      player.group.position.x + Math.sin(mirrorYaw) * mirrorZoom,
      focusY + Math.sin(mirrorPitch) * 0.35,
      player.group.position.z + Math.cos(mirrorYaw) * mirrorZoom,
    );
    if (!camReady) {
      camera.position.copy(camGoal);
      camReady = true;
    } else {
      camera.position.lerp(camGoal, 0.22);
    }
    camLook.set(player.group.position.x, focusY, player.group.position.z);
    camera.lookAt(camLook);
    return;
  }
  camera.clearViewOffset();
  const decor = city.decorView ? city.decorView() : null;
  if (decor) {
    if (!decorOrbit) decorOrbit = { yaw: 0, pitch: 0.92, dist: 13 };
    camera.up.set(0, 1, 0);
    const flat = Math.cos(decorOrbit.pitch) * decorOrbit.dist;
    camGoal.set(
      decor.x + Math.sin(decorOrbit.yaw) * flat,
      decor.y + 0.4 + Math.sin(decorOrbit.pitch) * decorOrbit.dist,
      decor.z + Math.cos(decorOrbit.yaw) * flat,
    );
    camera.position.copy(camGoal);
    camera.lookAt(decor.x, decor.y + 0.4, decor.z);
    camReady = true;
    return;
  }
  decorOrbit = null;
  camera.up.set(0, 1, 0);
  const p = THREE.MathUtils.clamp(pitch, -0.08, 0.62);
  const room = city.indoors ? city.indoors() : null;
  const dist = city.driving() ? Math.max(camDist, 7.6) : room ? Math.min(Math.max(camDist, 3.6), 5.4) : gatePassage() ? Math.min(camDist, 2.1) : camDist;
  const span = Math.cos(p) * dist;
  camGoal.set(
    player.group.position.x + Math.sin(yaw) * span,
    player.group.position.y + Math.sin(p) * dist,
    player.group.position.z + Math.cos(yaw) * span,
  );
  if (room && room.minX < room.maxX && room.minZ < room.maxZ) {
    camGoal.x = THREE.MathUtils.clamp(camGoal.x, room.minX, room.maxX);
    camGoal.z = THREE.MathUtils.clamp(camGoal.z, room.minZ, room.maxZ);
  }
  if (!camReady) {
    camera.position.copy(camGoal);
    camReady = true;
  } else {
    camera.position.lerp(camGoal, gatePassage() ? 0.42 : 0.16);
  }
  camLook.set(player.group.position.x, player.group.position.y + 0.9, player.group.position.z);
  camera.lookAt(camLook);
}

const TASK_XP = { daily: 8, walk: 10, pet: 6, board: 5, look: 8 };

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function monthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

function xpNeed(level) {
  return 25 + level * 4;
}

function syncLevel() {
  let level = 0;
  let left = Math.max(0, progress.xp);
  while (level < MAX_LEVEL && left >= xpNeed(level)) {
    left -= xpNeed(level);
    level += 1;
  }
  progress.level = level;
  progress.into = level >= MAX_LEVEL ? 0 : left;
  progress.next = level >= MAX_LEVEL ? 0 : xpNeed(level);
}

function saveProgress() {
  localStorage.setItem(PROG_KEY, JSON.stringify(progress));
}

function ensureDay() {
  const day = todayKey();
  if (progress.day === day) return;
  progress.day = day;
  progress.walked = 0;
  progress.tasks = {};
  saveProgress();
}

function grantXp(amount) {
  ensureDay();
  if (progress.level >= MAX_LEVEL || amount <= 0) return;
  progress.xp += amount;
  syncLevel();
  saveProgress();
  paintBadge();
  paintTasks();
  paintBoard();
}

function markReady(id) {
  ensureDay();
  if (!TASK_XP[id] || progress.tasks[id]) return;
  progress.tasks[id] = "ready";
  saveProgress();
  paintTasks();
}

function claimTask(id) {
  ensureDay();
  if (id === "daily") {
    if (progress.tasks.daily === "done") return;
    progress.tasks.daily = "done";
    saveProgress();
    grantXp(TASK_XP.daily);
    return;
  }
  if (progress.tasks[id] !== "ready") return;
  progress.tasks[id] = "done";
  saveProgress();
  grantXp(TASK_XP[id]);
}

function noteWalk(meters) {
  if (meters <= 0) return;
  ensureDay();
  const before = progress.walked;
  progress.walked += meters;
  if (progress.walked >= 200) markReady("walk");
  else if (Math.floor(before / 5) !== Math.floor(progress.walked / 5)) saveProgress();
}

function paintBadge() {
  if (!badgeCanvas) return;
  syncLevel();
  const ctx = badgeCanvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.save();
  ctx.fillStyle = "#2c241c";
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "rgba(255, 186, 90, 1)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = "#ffd89a";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 64, 42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#fff6df";
  ctx.font = "700 60px Georgia, Times New Roman, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(progress.level), 64, 66);
  ctx.restore();
  if (badgeTexture) badgeTexture.needsUpdate = true;
}

function createLevelBadge() {
  badgeCanvas = document.createElement("canvas");
  badgeCanvas.width = 128;
  badgeCanvas.height = 128;
  badgeTexture = new THREE.CanvasTexture(badgeCanvas);
  badgeTexture.colorSpace = THREE.SRGBColorSpace;
  const stone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.086, 0.092, 0.03, 40),
    new THREE.MeshStandardMaterial({ color: 0xfffaf4, roughness: 0.32, metalness: 0.08 }),
  );
  stone.rotation.x = Math.PI / 2;
  stone.castShadow = true;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.088, 0.01, 10, 40),
    new THREE.MeshStandardMaterial({
      color: 0xffe2b0,
      emissive: 0xffb45a,
      emissiveIntensity: 1.35,
      roughness: 0.22,
      metalness: 0.42,
    }),
  );
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 36),
    new THREE.MeshBasicMaterial({ map: badgeTexture, transparent: true }),
  );
  face.position.z = 0.016;
  levelBadge = new THREE.Group();
  levelBadge.add(stone, rim, face);
  levelBadge.position.set(0, 1.2, -0.22);
  player.group.add(levelBadge);
  syncLevel();
  ensureDay();
  paintBadge();
}

function boneNamed(root, pattern) {
  let found = null;
  root.traverse((obj) => {
    if (found || !obj.isBone || !pattern.test(obj.name)) return;
    found = obj;
  });
  return found;
}

function attachBadge(root) {
  const spine = boneNamed(root, /Spine2$/) || boneNamed(root, /Spine1$/) || boneNamed(root, /Spine$/);
  if (!spine || !levelBadge) return;
  spine.add(levelBadge);
  levelBadge.position.set(0, -0.1, -0.125);
  levelBadge.rotation.set(0, Math.PI, 0);
  levelBadge.scale.setScalar(1);
}

function paintBoard() {
  if (!boardCanvas) return;
  const ctx = boardCanvas.getContext("2d");
  ctx.clearRect(0, 0, 512, 640);
  ctx.fillStyle = "#f7f1e8";
  ctx.fillRect(0, 0, 512, 640);
  ctx.fillStyle = "#241c16";
  ctx.fillRect(0, 0, 512, 86);
  ctx.fillStyle = "#f7f1e8";
  ctx.font = "600 34px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(t("boardTitle"), 256, 54);
  const board = JSON.parse(localStorage.getItem("zv-board") || "null") || { month: monthKey(), rows: [] };
  if (board.month !== monthKey()) board.rows = [];
  const rows = (board.rows || []).filter((row) => row.id !== "local");
  rows.push({ id: "local", name: t("you"), zcoin: Math.floor(zcoin || 0), level: progress.level });
  rows.sort((a, b) => b.zcoin - a.zcoin || b.level - a.level);
  const top = rows.slice(0, 10);
  localStorage.setItem("zv-board", JSON.stringify({ month: monthKey(), rows: top }));
  ctx.textAlign = "left";
  for (let i = 0; i < 10; i++) {
    const row = top[i];
    const y = 130 + i * 48;
    ctx.fillStyle = i % 2 ? "#efe6da" : "#f7f1e8";
    ctx.fillRect(24, y - 28, 464, 44);
    ctx.fillStyle = "#241c16";
    ctx.font = "600 22px Segoe UI, sans-serif";
    ctx.fillText(`${i + 1}`, 40, y);
    ctx.font = "500 22px Segoe UI, sans-serif";
    ctx.fillText(row ? `${row.name}  ·  ${row.level}` : "—", 84, y);
    ctx.textAlign = "right";
    ctx.fillText(row ? String(row.zcoin) : "", 470, y);
    ctx.textAlign = "left";
  }
  if (boardTexture) boardTexture.needsUpdate = true;
}

function addBoard() {
  boardCanvas = document.createElement("canvas");
  boardCanvas.width = 512;
  boardCanvas.height = 640;
  boardTexture = new THREE.CanvasTexture(boardCanvas);
  boardTexture.colorSpace = THREE.SRGBColorSpace;
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.8 });
  const group = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.12), new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.85 }));
  panel.position.y = 1.55;
  panel.castShadow = true;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.86, 2.28, 0.08), wood);
  frame.position.y = 1.55;
  frame.position.z = -0.05;
  const postL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), wood);
  postL.position.set(-0.7, 0.6, -0.08);
  const postR = postL.clone();
  postR.position.x = 0.7;
  group.add(frame, panel, postL, postR);
  group.position.copy(BOARD_AT);
  group.rotation.y = Math.PI * 0.85;
  scene.add(group);
  addBlock(BOARD_AT.x - 1.05, BOARD_AT.x + 1.05, BOARD_AT.z - 0.75, BOARD_AT.z + 0.75);
}


function parkPoint() {
  for (let n = 0; n < 10; n++) {
    const a = Math.random() * Math.PI * 2;
    const r = 7.4 + Math.random() * 4.2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x, z) < 6.2) continue;
    if (Math.hypot(x - BOARD_AT.x, z - BOARD_AT.z) < 1.8) continue;
    return new THREE.Vector3(x, groundAt(x, z) + 0.04, z);
  }
  return new THREE.Vector3(8, 0.04, 6);
}

function airPoint() {
  const a = Math.random() * Math.PI * 2;
  const roll = Math.random();
  if (roll < 0.42) {
    const r = 20 + Math.random() * 74;
    const y = 18 + Math.random() * 26;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  const inside = roll < 0.72;
  const r = inside ? 6.4 + Math.random() * 5 : 22 + Math.random() * 16;
  const y = inside ? 2.5 + Math.random() * 1.6 : 8 + Math.random() * 6;
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
}

function beginBird(bird, state) {
  bird.state = state;
  bird.from.copy(bird.root.position);
  if (state === "descend") bird.to.copy(parkPoint());
  else if (state === "eat") bird.to.copy(bird.root.position);
  else bird.to.copy(airPoint());
  const dist = Math.max(0.4, bird.from.distanceTo(bird.to));
  bird.dur = state === "eat" ? 4.5 + Math.random() * 3.5 : Math.max(1.1, dist / (state === "cruise" ? 3.2 : 2.2));
  bird.timer = bird.dur;
  if (bird.action) bird.action.timeScale = state === "eat" ? 0.12 : 1;
}

function updateBirds(dt) {
  for (const bird of birds) {
    bird.timer -= dt;
    if (bird.state === "eat") {
      bird.peck += dt * 8;
      bird.root.position.y = bird.to.y + Math.abs(Math.sin(bird.peck)) * 0.025;
      bird.root.rotation.x = Math.sin(bird.peck) * 0.45;
      if (bird.timer <= 0) beginBird(bird, "ascend");
    } else {
      const k = THREE.MathUtils.clamp(1 - bird.timer / bird.dur, 0, 1);
      bird.root.position.lerpVectors(bird.from, bird.to, k);
      if (bird.state === "cruise") bird.root.position.y += Math.sin(k * Math.PI) * 0.25;
      const look = bird.to.clone();
      look.y = bird.root.position.y;
      if (bird.root.position.distanceTo(look) > 0.08) bird.root.lookAt(look);
    }
    if (bird.joints) {
      const flying = bird.state !== "eat";
      const flap = Math.sin(performance.now() * (flying ? 0.013 : 0.003) + bird.peck);
      const lift = flying ? flap : -0.7;
      for (const joint of bird.joints) {
        joint.root.rotation.z = joint.sign * lift * 1.05;
        joint.root.rotation.x = flying ? -0.55 : 0.35;
        joint.elbow.rotation.z = joint.sign * (-0.35 - Math.max(0, -lift) * 0.55);
      }
      if (bird.tail) bird.tail.rotation.x = flying ? -0.15 + flap * 0.1 : 0.05;
      if (bird.legs) bird.legs.visible = !flying;
    }
    if (bird.timer <= 0) {
      if (bird.state === "cruise") beginBird(bird, bird.root.position.y > 12 && Math.random() < 0.62 ? "cruise" : "descend");
      else if (bird.state === "descend") beginBird(bird, "eat");
      else beginBird(bird, "cruise");
    }
  }
}

function paintTasks() {
  const line = document.getElementById("level-line");
  const list = document.getElementById("task-list");
  if (!line || !list) return;
  ensureDay();
  syncLevel();
  line.textContent = progress.level >= MAX_LEVEL
    ? t("levelMax")
    : t("levelLine").replace("{level}", String(progress.level)).replace("{have}", String(Math.floor(progress.into))).replace("{need}", String(progress.next));
  list.replaceChildren();
  const rows = [
    ["daily", t("task.daily"), progress.tasks.daily === "done" ? "done" : "ready"],
    ["walk", `${t("task.walk")}  ${Math.min(200, Math.floor(progress.walked))}/200`, progress.tasks.walk || "wait"],
    ["board", t("task.board"), progress.tasks.board || "wait"],
    ["look", t("task.look"), progress.tasks.look || "wait"],
  ];
  for (const [id, label, state] of rows) {
    const row = document.createElement("div");
    row.className = "task-row";
    const name = document.createElement("span");
    name.textContent = label;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.disabled = state !== "ready";
    btn.textContent = state === "done" ? t("taskDone") : state === "ready" ? t("claim") : t("taskWait");
    btn.addEventListener("click", () => claimTask(id));
    row.append(name, btn);
    list.appendChild(row);
  }
}

function noteBoard() {
  const dist = Math.hypot(player.group.position.x - BOARD_AT.x, player.group.position.z - BOARD_AT.z);
  if (dist < 2.8) markReady("board");
}

const npcBendQ = new THREE.Quaternion();
const npcBendE = new THREE.Euler();

function bendNpc(bone, x, y, z) {
  if (!bone) return;
  npcBendE.set(x, y, z);
  npcBendQ.setFromEuler(npcBendE);
  bone.quaternion.multiply(npcBendQ);
}

function poseCrowd() {
  for (const n of npcs) {
    if (n.mixer?._zvSkip) continue;
    if (n.phone) n.phone.visible = n.mode === "phone";
    if (n.hunch) bendNpc(n.bones?.Spine, n.hunch, 0, 0);
    if (n.mode === "phone") {
      bendNpc(n.bones?.RightArm, -1.05, 0.1, -0.35);
      bendNpc(n.bones?.RightForeArm, 0, 0, -0.9);
      bendNpc(n.bones?.Head, 0.42, 0, 0);
    } else if (n.mode === "sit") {
      bendNpc(n.bones?.LeftUpLeg, 1.15, 0.08, 0);
      bendNpc(n.bones?.RightUpLeg, 1.15, -0.08, 0);
      bendNpc(n.bones?.LeftLeg, -1.15, 0, 0);
      bendNpc(n.bones?.RightLeg, -1.15, 0, 0);
      bendNpc(n.bones?.Spine, 0.12 + (n.hunch || 0), 0, 0);
    }
  }
}

function updateCrowd(dt, time) {
  const px = player.group.position.x;
  const pz = player.group.position.z;
  let phoneNear = null;
  if (phone) {
    phoneNear = new Set();
    const ranked = npcs.map((n) => {
      const dx = (n.pivot?.position.x || 0) - px;
      const dz = (n.pivot?.position.z || 0) - pz;
      return { n, d: dx * dx + dz * dz };
    });
    ranked.sort((a, b) => a.d - b.d);
    for (let i = 0; i < ranked.length && phoneNear.size < 3; i++) {
      if (ranked[i].d < 18 * 18) phoneNear.add(ranked[i].n);
    }
  }
  for (const n of npcs) {
    if (phone && n.pivot) {
      const far = !phoneNear.has(n);
      n.pivot.visible = !far;
      if (n.mixer) n.mixer._zvSkip = far;
      if (far) continue;
    }
    if (n.down) {
      n.downT -= dt;
      n.pivot.rotation.x = Math.PI / 2;
      n.pivot.position.y = groundAt(n.pivot.position.x, n.pivot.position.z) + 0.35;
      if (n.downT <= 0) {
        n.down = false;
        n.hp = 100;
        n.pivot.rotation.x = 0;
        n.mode = "walk";
        setNpcAnim(n, true);
      }
      continue;
    }
    if (!n.route) continue;
    if (n.mode !== "walk") {
      n.modeT -= dt;
      if (n.modeT <= 0) {
        n.mode = "walk";
        setNpcAnim(n, true);
      }
      continue;
    }
    const wp = n.route[n.wp];
    const dx = wp[0] - n.pivot.position.x;
    const dz = wp[1] - n.pivot.position.z;
    const dist = Math.hypot(dx, dz) || 0.0001;
    if (dist < 0.55) {
      n.wp = (n.wp + 1) % n.route.length;
      const roll = Math.random();
      if (roll < 0.34) {
        n.mode = roll < 0.16 ? "phone" : "sit";
        n.modeT = 3.2 + Math.random() * 3.4;
        setNpcAnim(n, false);
      }
      continue;
    }
    const step = Math.min(dist, n.speed * dt);
    let nx = n.pivot.position.x + (dx / dist) * step;
    let nz = n.pivot.position.z + (dz / dist) * step;
    if (city.keepOut && (city.keepOut(nx, nz) || city.keepOut(n.pivot.position.x, n.pivot.position.z))) {
      const out = city.keepOut(n.pivot.position.x, n.pivot.position.z);
      if (out) n.pivot.position.set(out.x, groundAt(out.x, out.z), out.z);
      n.wp = (n.wp + 1) % n.route.length;
      continue;
    }
    if (plazaShut(n.pivot.position.x, n.pivot.position.z, nx, nz)) continue;
    const core = Math.hypot(nx, nz);
    if (core < 5.4) {
      nx = (nx / core) * 5.4;
      nz = (nz / core) * 5.4;
    }
    n.pivot.position.set(nx, groundAt(nx, nz), nz);
    n.pivot.rotation.y = Math.atan2(dx, dz);
  }
  for (const h of animals) {
    const a = time * (h.linear / h.radius) + h.phase;
    let x = Math.cos(a) * h.radius;
    let z = Math.sin(a) * h.radius;
    if (city.keepOut) {
      const out = city.keepOut(x, z);
      if (out) {
        x = out.x;
        z = out.z;
      }
    }
    h.pivot.position.set(x, groundAt(x, z), z);
    h.pivot.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
  }
}


function spaceFor(id, count) {
  let left = count;
  for (const list of [inventory, bag]) {
    for (const slot of list) {
      if (slot?.id === id) left -= Math.max(0, 64 - slot.count);
      else if (!slot) left -= 64;
      if (left <= 0) return true;
    }
  }
  return false;
}

const ORE_PAY = { bronzo: 1, ferro: 1, smeraldo: 2, rubino: 2, oro: 3, diamante: 5 };
const FISH_PAY = { alborella: 1, persico: 1, trota: 2, carpa: 2, luccio: 3, storione: 5 };

function hasRod() {
  return [...bag, ...inventory].some((slot) => slot?.id === "canna");
}

function listFish() {
  const rows = {};
  for (const list of [bag, inventory]) {
    for (const slot of list) {
      if (!slot || !FISH_PAY[slot.id]) continue;
      rows[slot.id] = (rows[slot.id] || 0) + slot.count;
    }
  }
  return rows;
}

function sellFish() {
  let pay = 0;
  for (const list of [bag, inventory]) {
    for (let i = 0; i < list.length; i++) {
      const slot = list[i];
      if (!slot || !FISH_PAY[slot.id]) continue;
      pay += FISH_PAY[slot.id] * slot.count;
      list[i] = null;
    }
  }
  if (pay <= 0) return 0;
  zcoin = Math.floor(zcoin) + pay;
  saveZcoin();
  renderHotbar();
  return pay;
}

function buyRod() {
  if (hasRod()) return "have";
  if (zcoin < ROD_PRICE) return "money";
  if (!bagRoom("canna", 1)) return "full";
  zcoin = Math.floor(zcoin) - ROD_PRICE;
  saveZcoin();
  addToBag("canna", t("item.canna"), 1);
  return "ok";
}

function hasSkate() {
  return [...bag, ...inventory].some((slot) => slot?.id === "skate");
}

function hasItem(id) {
  return [...bag, ...inventory].some((slot) => slot?.id === id);
}

function takeOne(id) {
  for (const list of [inventory, bag]) {
    for (let i = 0; i < list.length; i++) {
      const slot = list[i];
      if (!slot || slot.id !== id) continue;
      slot.count -= 1;
      if (slot.count <= 0) list[i] = null;
      renderHotbar();
      return true;
    }
  }
  return false;
}

function getHeld() {
  if (bagOpen && picked?.list === "bag" && bag[picked.index]) return bag[picked.index];
  return inventory[selectedSlot];
}

function countItem(id) {
  let n = 0;
  for (const list of [bag, inventory]) {
    for (const slot of list) if (slot?.id === id) n += slot.count;
  }
  return n;
}

function saveMag() {
  localStorage.setItem("zv-mag", String(mag));
}

function buyAmmo() {
  const room = AMMO_CAP - countItem("colpi");
  if (room <= 0) return "cap";
  if (zcoin < AMMO_PRICE) return "money";
  const n = Math.min(AMMO_PACK, room);
  if (!bagRoom("colpi", n)) return "full";
  zcoin = Math.floor(zcoin) - AMMO_PRICE;
  saveZcoin();
  addToBag("colpi", t("item.colpi"), n);
  return "ok";
}

function inSafeZone(x, z) {
  return Math.hypot(x, z) < 14.4;
}

function reloadGun() {
  if (!hasItem("pistola")) return;
  let moved = 0;
  while (mag < AMMO_CAP && takeOne("colpi")) {
    mag += 1;
    moved += 1;
  }
  saveMag();
  if (!moved) city.say(t("needAmmo"));
}

function fireGun() {
  if (inventory[selectedSlot]?.id !== "pistola" || !aiming) return;
  if (mag <= 0) {
    city.say(t("needAmmo"));
    return;
  }
  mag -= 1;
  saveMag();
  playShot();
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const from = new THREE.Vector3();
  const barrel = new THREE.Vector3();
  if (!city.muzzle(from, barrel)) from.copy(camera.position);
  const dir = barrel.lengthSq() > 0.5 ? barrel.clone().normalize() : camDir.clone();
  let best = null;
  let bestT = 42;
  let hitPoint = null;
  for (const n of npcs) {
    if (n.down) continue;
    const aimPoint = n.pivot.position.clone();
    aimPoint.y += 1.05;
    const rel = aimPoint.sub(from);
    const tHit = rel.dot(dir);
    if (tHit < 0.4 || tHit > bestT) continue;
    const point = from.clone().addScaledVector(dir, tHit);
    const dx = point.x - n.pivot.position.x;
    const dz = point.z - n.pivot.position.z;
    if (dx * dx + dz * dz > 0.42 * 0.42) continue;
    best = { n, head: point.y > n.pivot.position.y + 1.38 };
    bestT = tHit;
    hitPoint = point;
  }
  const reach = best ? bestT : 16;
  spawnShot(from, dir, Math.max(1.5, reach));
  if (hitPoint) spawnSpark(hitPoint);
  if (!best) return;
  if (inSafeZone(best.n.pivot.position.x, best.n.pivot.position.z)) {
    city.say(t("safeHit"));
    return;
  }
  if (best.n.hp == null) best.n.hp = 100;
  best.n.hp -= best.head ? 50 : 20;
  if (best.n.hp <= 0) {
    best.n.down = true;
    best.n.downT = 600;
    best.n.mode = "down";
    setNpcAnim(best.n, false);
    city.say(t("downed"));
  }
}

function syncCombatUi() {
  const on = inventory[selectedSlot]?.id === "pistola";
  document.getElementById("aim-btn")?.classList.toggle("hidden", !on);
  document.getElementById("fire-btn")?.classList.toggle("hidden", !on);
  document.getElementById("reload-btn")?.classList.toggle("hidden", !on);
  document.getElementById("hop-btn")?.classList.toggle("hidden", !city.riding());
  document.getElementById("reticle")?.classList.toggle("hidden", !(on && aiming));
  const zone = document.getElementById("zone-tag");
  if (zone) {
    const safe = inSafeZone(player.group.position.x, player.group.position.z);
    zone.textContent = t(safe ? "safeZone" : "redZone");
    zone.classList.toggle("safe", safe);
    zone.classList.toggle("red", !safe);
  }
  city.showGun(on);
  city.aimGun(on && aiming);
}

function buySkate() {
  if (hasSkate()) return "have";
  if (zcoin < SKATE_PRICE) return "money";
  if (!bagRoom("skate", 1)) return "full";
  zcoin = Math.floor(zcoin) - SKATE_PRICE;
  saveZcoin();
  addToBag("skate", t("item.skate"), 1);
  return "ok";
}

function bagRoom(id, count) {
  let left = count;
  for (const slot of bag) {
    if (slot?.id === id) left -= Math.max(0, 64 - slot.count);
    else if (!slot) left -= 64;
    if (left <= 0) return true;
  }
  return false;
}

function addToBag(id, name, count = 1) {
  if (!bagRoom(id, count)) return false;
  let left = count;
  for (const slot of bag) {
    if (!slot || slot.id !== id || slot.count >= 64) continue;
    const n = Math.min(64 - slot.count, left);
    slot.count += n;
    left -= n;
  }
  for (let i = 0; i < bag.length && left > 0; i++) {
    if (bag[i]) continue;
    const n = Math.min(64, left);
    bag[i] = { id, name, count: n };
    left -= n;
  }
  renderHotbar();
  return left <= 0;
}

function listOres() {
  const rows = {};
  for (const list of [bag, inventory]) {
    for (const slot of list) {
      if (!slot || !ORE_PAY[slot.id]) continue;
      rows[slot.id] = (rows[slot.id] || 0) + slot.count;
    }
  }
  return rows;
}

function sellOres() {
  let pay = 0;
  for (const list of [bag, inventory]) {
    for (let i = 0; i < list.length; i++) {
      const slot = list[i];
      if (!slot || !ORE_PAY[slot.id]) continue;
      pay += ORE_PAY[slot.id] * slot.count;
      list[i] = null;
    }
  }
  if (pay <= 0) return 0;
  zcoin = Math.floor(zcoin) + pay;
  saveZcoin();
  renderHotbar();
  return pay;
}

function addItem(id, name, count = 1) {
  if (id === "zmc" || id === "pickaxe") return false;
  if (!spaceFor(id, count)) return false;
  let left = count;
  for (const list of [inventory, bag]) {
    for (const slot of list) {
      if (!slot || slot.id !== id || slot.count >= 64) continue;
      const n = Math.min(64 - slot.count, left);
      slot.count += n;
      left -= n;
    }
  }
  for (const list of [inventory, bag]) {
    for (let i = 0; i < list.length && left > 0; i++) {
      if (list[i]) continue;
      const n = Math.min(64, left);
      list[i] = { id, name, count: n };
      left -= n;
    }
  }
  return true;
}

const VITAL_KEY = "zv-vitals";
const vitals = { life: 100, hunger: 100, thirst: 100 };
try {
  Object.assign(vitals, JSON.parse(localStorage.getItem(VITAL_KEY) || "null") || {});
} catch {
  /* keep full */
}

function updateVitals(dt) {
  vitals.hunger = Math.max(0, vitals.hunger - dt * (100 / 7200));
  vitals.thirst = Math.max(0, vitals.thirst - dt * (100 / 5400));
  const dry = vitals.hunger <= 0 || vitals.thirst <= 0;
  if (dry) vitals.life = Math.max(0, vitals.life - dt * 2.2);
  else vitals.life = Math.min(100, vitals.life + dt * 3);
  const bad = dry || vitals.life <= 0;
  document.body.classList.toggle("dulled", bad);
  document.getElementById("senses").classList.toggle("on", bad);
  document.getElementById("vital-life").style.width = `${vitals.life}%`;
  document.getElementById("vital-hunger").style.width = `${vitals.hunger}%`;
  document.getElementById("vital-thirst").style.width = `${vitals.thirst}%`;
}

let vitalSave = 0;
function persistVitals(dt) {
  vitalSave += dt;
  if (vitalSave < 2) return;
  vitalSave = 0;
  localStorage.setItem(VITAL_KEY, JSON.stringify(vitals));
}

function consumeHeld() {
  const item = inventory[selectedSlot];
  if (!item) return false;
  if (item.id === "pane") {
    vitals.hunger = Math.min(100, vitals.hunger + 36);
    vitals.life = Math.min(100, vitals.life + 6);
  } else if (item.id === "acqua") {
    vitals.thirst = Math.min(100, vitals.thirst + 40);
    vitals.life = Math.min(100, vitals.life + 4);
  } else {
    return false;
  }
  item.count -= 1;
  if (item.count <= 0) inventory[selectedSlot] = null;
  renderHotbar();
  return true;
}

const hotbarEl = document.getElementById("hotbar");
const hintEl = document.getElementById("tool-hint");
const bagEl = document.getElementById("bag");
const bagGrid = document.getElementById("bag-grid");
const bagTitle = document.getElementById("bag-title");
const bagQty = document.getElementById("bag-qty");
const pickupBtn = document.getElementById("pickup-btn");
function drawItemIcon(id) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  const stone = (a, b, c) => {
    g.fillStyle = a;
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = i % 3 === 0 ? b : c;
      g.globalAlpha = 0.55;
      g.fillRect((i * 13) % 64, (i * 17) % 64, 2 + (i % 3), 2);
    }
    g.globalAlpha = 1;
    const glow = g.createRadialGradient(22, 20, 2, 28, 26, 26);
    glow.addColorStop(0, c);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, 64, 64);
  };
  const fish = (body, fin) => {
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = fin;
    g.beginPath();
    g.moveTo(14, 32);
    g.lineTo(4, 18);
    g.lineTo(4, 46);
    g.fill();
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(36, 32, 20, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1b1b1b";
    g.beginPath();
    g.arc(48, 28, 2, 0, Math.PI * 2);
    g.fill();
  };
  if (id === "pane") {
    g.fillStyle = "#c9843a";
    g.beginPath();
    g.roundRect(6, 14, 52, 36, 10);
    g.fill();
    g.fillStyle = "#f3d7a4";
    g.beginPath();
    g.roundRect(12, 20, 40, 24, 6);
    g.fill();
    g.fillStyle = "#e7c48a";
    for (const [x, y] of [[22, 28], [34, 34], [40, 26], [28, 38]]) {
      g.beginPath();
      g.ellipse(x, y, 3, 2, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (id === "acqua") {
    g.fillStyle = "rgba(210, 236, 248, 0.95)";
    g.beginPath();
    g.moveTo(18, 16);
    g.lineTo(14, 54);
    g.quadraticCurveTo(32, 62, 50, 54);
    g.lineTo(46, 16);
    g.closePath();
    g.fill();
    g.fillStyle = "#3aa4d4";
    g.beginPath();
    g.moveTo(20, 28);
    g.lineTo(17, 52);
    g.quadraticCurveTo(32, 58, 47, 52);
    g.lineTo(44, 28);
    g.closePath();
    g.fill();
    g.strokeStyle = "#f7fbff";
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(32, 16, 14, 5, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (id === "canna") {
    g.fillStyle = "#efe6d6";
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "#6a4124";
    g.lineWidth = 5;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(10, 50);
    g.quadraticCurveTo(30, 20, 54, 12);
    g.stroke();
    g.strokeStyle = "#d7d7d7";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(54, 12);
    g.lineTo(48, 40);
    g.stroke();
  } else if (id === "skate") {
    g.fillStyle = "#141414";
    g.beginPath();
    g.roundRect(6, 20, 52, 16, 8);
    g.fill();
    g.fillStyle = "#1f8a4c";
    g.fillRect(14, 24, 36, 7);
    g.fillStyle = "#3dff9a";
    g.fillRect(16, 40, 10, 5);
    g.fillRect(38, 40, 10, 5);
  } else if (id === "bronzo") stone("#6a3a22", "#c47a3a", "#e8c39a");
  else if (id === "ferro") stone("#2c3136", "#7d868f", "#d5dde4");
  else if (id === "smeraldo") stone("#083528", "#14915c", "#b6f3d4");
  else if (id === "rubino") stone("#3a0a14", "#c4163a", "#ffc0cc");
  else if (id === "oro") stone("#5c3e0c", "#e2b43a", "#fff1b8");
  else if (id === "diamante") stone("#d5e8f4", "#f7fbff", "#9fd0ea");
  else if (id === "alborella") fish("#d5dde4", "#9aa3ad");
  else if (id === "persico") fish("#6a9a3a", "#3e6a28");
  else if (id === "trota") fish("#8a7048", "#c4a06a");
  else if (id === "carpa") fish("#e0a030", "#f2d48a");
  else if (id === "luccio") fish("#3e7a4a", "#1d4a32");
  else if (id === "storione") fish("#8d8478", "#d9d3c8");
  else if (id === "guida") {
    g.fillStyle = "#f6f1e8";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#2a2118";
    g.fillRect(8, 12, 48, 40);
    g.fillStyle = "#f4efe6";
    g.fillRect(12, 16, 40, 32);
    g.fillStyle = "#c45a3a";
    g.fillRect(18, 28, 28, 10);
    g.fillRect(22, 22, 20, 8);
    g.fillStyle = "#1c1c1c";
    g.fillRect(16, 34, 8, 8);
    g.fillRect(40, 34, 8, 8);
  } else if (id === "chiave") {
    g.fillStyle = "#f6f1e8";
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "#b8862f";
    g.lineWidth = 5;
    g.lineCap = "round";
    g.beginPath();
    g.arc(18, 32, 8, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(26, 32);
    g.lineTo(52, 32);
    g.moveTo(46, 32);
    g.lineTo(46, 40);
    g.moveTo(38, 32);
    g.lineTo(38, 38);
    g.stroke();
  } else {
    let hue = 0;
    for (let i = 0; i < id.length; i++) hue = (hue * 31 + id.charCodeAt(i)) % 360;
    g.fillStyle = `hsl(${hue} 36% 46%)`;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#fffaf4";
    g.fillRect(8, 10, 48, 44);
    g.fillStyle = `hsl(${hue} 42% 32%)`;
    g.font = "700 16px Outfit, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(id.slice(0, 3).toUpperCase(), 32, 34);
  }
  return canvas.toDataURL();
}

const ITEM_SRC = Object.fromEntries(
  ["pane", "acqua", "canna", "skate", "bronzo", "ferro", "smeraldo", "rubino", "oro", "diamante", "alborella", "persico", "trota", "carpa", "luccio", "storione"].map(
    (id) => [id, drawItemIcon(id)],
  ),
);

function itemName(item) {
  if (!item) return "";
  const key = `item.${item.id}`;
  const label = t(key);
  return label === key ? item.name : label;
}

function itemMarkup(item) {
  if (!item) return "";
  if (!ITEM_SRC[item.id] && item.id !== "terra") ITEM_SRC[item.id] = drawItemIcon(item.id);
  const icon = item.id === "terra"
    ? `<span class="dirt-icon"></span>`
    : ITEM_SRC[item.id]
      ? `<img class="item-icon" alt="" src="${ITEM_SRC[item.id]}">`
      : `<span class="item-icon food"></span>`;
  return `${icon}<span class="count">${item.count}</span>`;
}

let armedSnack = null;

function currentStack() {
  if (!picked) return null;
  const list = picked.list === "bag" ? bag : inventory;
  return list[picked.index] || null;
}

function renderHotbar() {
  hotbarEl.replaceChildren();
  for (let i = 0; i < SLOTS; i++) {
    const slot = document.createElement("button");
    slot.type = "button";
    const marked = picked?.list === "hot" && picked.index === i;
    slot.className = "slot" + (i === selectedSlot ? " selected" : "") + (marked ? " on" : "");
    const item = inventory[i];
    slot.innerHTML = `<span class="key">${i + 1}</span>${itemMarkup(item)}`;
    slot.addEventListener("click", () => onHotbarClick(i));
    hotbarEl.appendChild(slot);
  }
  const item = inventory[selectedSlot];
  hintEl.textContent = item ? itemName(item) : "";
  hintEl.classList.toggle("hidden", !item);
  if (bagOpen) renderBag();
  try {
    localStorage.setItem("zv-pack", JSON.stringify({ inventory, bag }));
  } catch {
    /* private mode */
  }
}

function renderBag() {
  bagGrid.replaceChildren();
  for (let i = 0; i < BAG_SIZE; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    const ridingMark = bag[i]?.id === "skate" && city.riding();
    cell.className = "bag-cell" + (ridingMark || (picked?.list === "bag" && picked.index === i) ? " on" : "");
    cell.innerHTML = itemMarkup(bag[i]);
    cell.addEventListener("click", () => {
      if (bag[i]?.id === "skate") {
        city.toggleSkate();
        renderBag();
        renderHotbar();
        return;
      }
      if (bag[i] && city.isFurn(bag[i].id) && picked?.list === "bag" && picked.index === i) {
        city.placeHeld(bag[i].id);
        return;
      }
      picked = { list: "bag", index: i };
      renderBag();
      renderHotbar();
    });
    bagGrid.appendChild(cell);
  }
  const stack = currentStack();
  bagTitle.textContent = stack ? itemName(stack) : t("choose");
  bagQty.max = String(stack?.count || 1);
  if (stack && Number(bagQty.value) > stack.count) bagQty.value = String(stack.count);
  if (!stack) bagQty.value = "1";
}

function onHotbarClick(index) {
  if (bagOpen && picked?.list === "bag") {
    const from = bag[picked.index];
    bag[picked.index] = inventory[index];
    inventory[index] = from;
    picked = { list: "hot", index };
    selectedSlot = index;
  } else if (bagOpen) {
    picked = { list: "hot", index };
    selectedSlot = index;
  } else if (index === selectedSlot) {
    const item = inventory[index];
    if (item?.id === "skate") {
      city.toggleSkate();
    } else if (item?.id === "pistola") {
      aiming = !aiming;
    } else if (item && city.isFurn(item.id)) {
      city.placeHeld(item.id);
    } else if (item && (item.id === "pane" || item.id === "acqua")) {
      if (armedSnack !== item.id) {
        armedSnack = item.id;
        city.holdSnack(item.id);
      } else city.bite(item.id, () => {
        consumeHeld();
        armedSnack = null;
      });
    } else consumeHeld();
  } else {
    selectedSlot = index;
    aiming = false;
    if (armedSnack) {
      armedSnack = null;
      city.holdSnack(null);
    }
  }
  renderHotbar();
}

function setBagOpen(open) {
  if (wardrobeOpen) open = false;
  bagOpen = open;
  bagEl.classList.toggle("hidden", !open);
  document.body.classList.toggle("bag-open", open);
  if (open) {
    closePops();
    document.exitPointerLock();
    renderBag();
  }
}

const drops = [];
let nearestDrop = null;
const DROP_COLOR = { pane: 0xd8a15a, acqua: 0x6eb6e0, terra: 0x7a4e2a };

function spawnDrop(id, name, count, x, z) {
  if (id === "zmc" || id === "pickaxe") return;
  const mesh = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: DROP_COLOR[id] || 0xdddddd, roughness: 0.45 });
  const geo = id === "acqua"
    ? new THREE.CylinderGeometry(0.1, 0.1, 0.28, 14)
    : new THREE.BoxGeometry(0.28, 0.16, 0.28);
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;
  mesh.add(body);
  mesh.position.set(x, 0.22, z);
  scene.add(mesh);
  drops.push({ mesh, id, name, count, bob: Math.random() * 6 });
}

function dropSelected() {
  const stack = currentStack();
  if (!stack || stack.id === "zmc" || stack.id === "pickaxe" || stack.id === "chiave" || city.isFurn(stack.id)) return;
  const list = picked.list === "bag" ? bag : inventory;
  const qty = Math.max(1, Math.min(stack.count, Number(bagQty.value) || 1));
  const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(player.group.quaternion);
  spawnDrop(
    stack.id,
    stack.name,
    qty,
    player.group.position.x + ahead.x * 1.15,
    player.group.position.z + ahead.z * 1.15,
  );
  stack.count -= qty;
  if (stack.count <= 0) list[picked.index] = null;
  renderHotbar();
  renderBag();
}

function updateDrops(time) {
  nearestDrop = null;
  let best = 1.7;
  for (const drop of drops) {
    drop.mesh.position.y = 0.22 + Math.sin(time * 2.2 + drop.bob) * 0.05;
    drop.mesh.rotation.y = time * 0.7;
    const dist = Math.hypot(
      drop.mesh.position.x - player.group.position.x,
      drop.mesh.position.z - player.group.position.z,
    );
    if (dist < best) {
      best = dist;
      nearestDrop = drop;
    }
  }
  pickupBtn.textContent = nearestDrop ? `${t("pickup")} ${itemName(nearestDrop)}` : t("pickup");
  pickupBtn.classList.toggle("hidden", !nearestDrop || bagOpen || wardrobeOpen);
}

function tryPickup() {
  if (!nearestDrop) return;
  if (!addItem(nearestDrop.id, nearestDrop.name, nearestDrop.count)) {
    pickupBtn.textContent = t("pickupFull");
    return;
  }
  nearestDrop.mesh.removeFromParent();
  drops.splice(drops.indexOf(nearestDrop), 1);
  nearestDrop = null;
  renderHotbar();
  if (bagOpen) renderBag();
}

const MAINT_KEY = "zv-maintenance";
const BAN_KEY = "zv-bans";
const maintenance = JSON.parse(localStorage.getItem(MAINT_KEY) || "null") || {
  on: false,
  text: t("maintDefault"),
};

function applyMaintenance() {
  document.getElementById("maintenance").classList.add("hidden");
  const note = document.getElementById("maint-note");
  note.textContent = t("maintLive");
  note.classList.toggle("hidden", !maintenance.on);
  document.getElementById("maintenance-text").textContent = maintenance.text || t("maintDefault");
}

function renderAdminLog() {
  const log = document.getElementById("admin-log");
  const bans = JSON.parse(localStorage.getItem(BAN_KEY) || "[]");
  log.replaceChildren();
  for (const line of bans) {
    const li = document.createElement("li");
    li.textContent = line;
    log.appendChild(li);
  }
}

function notePlayer(action) {
  const name = document.getElementById("admin-name").value.trim();
  if (!name) return;
  const bans = JSON.parse(localStorage.getItem(BAN_KEY) || "[]");
  bans.push(`${action}: ${name}`);
  localStorage.setItem(BAN_KEY, JSON.stringify(bans));
  renderAdminLog();
}

function setupAdmin() {
  const panel = document.getElementById("admin");
  const toggle = document.getElementById("maint-toggle");
  const text = document.getElementById("maint-text");
  toggle.checked = maintenance.on;
  if (isDefaultMaint(maintenance.text)) maintenance.text = t("maintDefault");
  text.value = maintenance.text;
  applyMaintenance();
  renderAdminLog();
  document.getElementById("admin-close").addEventListener("click", () => panel.classList.add("hidden"));
  toggle.addEventListener("change", () => {
    maintenance.on = toggle.checked;
    maintenance.text = text.value.trim() || maintenance.text;
    localStorage.setItem(MAINT_KEY, JSON.stringify(maintenance));
    applyMaintenance();
  });
  document.getElementById("maint-save").addEventListener("click", () => {
    maintenance.text = text.value.trim() || t("maintDefault");
    localStorage.setItem(MAINT_KEY, JSON.stringify(maintenance));
    applyMaintenance();
  });
  document.getElementById("admin-plaza").addEventListener("click", () => {
    player.group.position.set(0, groundAt(0, 8), 8);
    panel.classList.add("hidden");
  });
  const sex = document.getElementById("admin-sex");
  sex.value = localStorage.getItem("zv-sex") === "m" ? "m" : "f";
  sex.addEventListener("change", () => {
    localStorage.setItem("zv-sex", sex.value);
    refreshSex();
  });
  const giftStatus = document.getElementById("admin-gift");
  const sendSupply = (id) => {
    const who = document.getElementById("admin-tg").value.trim().replace(/^@/, "");
    if (!who) {
      giftStatus.textContent = addItem(id, t(`item.${id}`), 1) ? t("sentSelf") : t("pickupFull");
      renderHotbar();
      return;
    }
    const key = "zv-parcels";
    const parcels = JSON.parse(localStorage.getItem(key) || "{}");
    const list = Array.isArray(parcels[who]) ? parcels[who] : [];
    while (list.length < 24) list.push(null);
    let left = 1;
    for (const slot of list) {
      if (slot?.id === id) left -= Math.max(0, 64 - slot.count);
      else if (!slot) left -= 64;
      if (left <= 0) break;
    }
    if (left > 0) {
      giftStatus.textContent = t("theirBagFull");
      return;
    }
    const held = list.find((slot) => slot?.id === id && slot.count < 64);
    if (held) held.count += 1;
    else {
      const empty = list.findIndex((slot) => !slot);
      list[empty] = { id, count: 1 };
    }
    parcels[who] = list.filter(Boolean);
    localStorage.setItem(key, JSON.stringify(parcels));
    giftStatus.textContent = t("sentOther").replace("{name}", who);
  };
  document.getElementById("admin-bread").addEventListener("click", () => sendSupply("pane"));
  document.getElementById("admin-water").addEventListener("click", () => sendSupply("acqua"));
  const coinStatus = document.getElementById("admin-coin-status");
  const adjustCoins = (sign) => {
    const who = document.getElementById("admin-tg").value.trim().replace(/^@/, "").toLowerCase();
    const n = Math.floor(Number(document.getElementById("admin-coin").value));
    if (!Number.isFinite(n) || n <= 0) return;
    if (!who || who === "zoom0100") {
      zcoin = Math.max(0, Math.floor(zcoin) + sign * n);
      saveZcoin();
      coinStatus.textContent = t("coinSelf").replace("{n}", String(Math.floor(zcoin)));
      return;
    }
    const book = JSON.parse(localStorage.getItem("zv-zcoin-ledger") || "{}");
    book[who] = Math.max(0, Math.floor(Number(book[who]) || 0) + sign * n);
    localStorage.setItem("zv-zcoin-ledger", JSON.stringify(book));
    coinStatus.textContent = t("coinOther").replace("{name}", who).replace("{n}", String(book[who]));
  };
  document.getElementById("admin-coin-add").addEventListener("click", () => adjustCoins(1));
  document.getElementById("admin-coin-sub").addEventListener("click", () => adjustCoins(-1));
  document.getElementById("admin-ban").addEventListener("click", () => notePlayer(t("ban")));
  document.getElementById("admin-move").addEventListener("click", () => notePlayer(t("move")));
  document.getElementById("bag-drop").addEventListener("click", dropSelected);
  document.getElementById("bag-close").addEventListener("click", () => setBagOpen(false));
  pickupBtn.addEventListener("click", tryPickup);
}

const ZCOIN_KEY = "zv-zcoin";
const CLAIMED_KEY = "zv-claimed";
let zcoin = Number(localStorage.getItem(ZCOIN_KEY) || "0") || 0;
let paying = false;

function paintZcoin() {
  const line = document.getElementById("zcoin-line");
  const amount = String(Math.floor(zcoin));
  if (line) line.textContent = t("zcoin").replace("{n}", amount);
  const chip = document.getElementById("zc-amount");
  if (chip) chip.textContent = amount;
}

function saveZcoin() {
  zcoin = Math.max(0, Math.floor(zcoin));
  localStorage.setItem(ZCOIN_KEY, String(zcoin));
  paintZcoin();
  paintBoard();
}

function commentOf(msg) {
  const body = msg?.decoded_body;
  if (!body || typeof body !== "object") return "";
  if (typeof body.text === "string") return body.text;
  if (typeof body.comment === "string") return body.comment;
  return "";
}

async function watchPayment(comment, nanoton) {
  const claimed = new Set(JSON.parse(localStorage.getItem(CLAIMED_KEY) || "[]"));
  const started = Math.floor(Date.now() / 1000) - 30;
  for (let i = 0; i < 24; i++) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    let data;
    try {
      const res = await fetch(`https://tonapi.io/v2/blockchain/accounts/${PAYMENT_WALLET}/transactions?limit=20`);
      if (!res.ok) continue;
      data = await res.json();
    } catch {
      continue;
    }
    for (const tx of data.transactions || []) {
      if (!tx?.hash || claimed.has(tx.hash) || (tx.utime || 0) < started) continue;
      const msg = tx.in_msg;
      if (!commentOf(msg).includes(comment) || Number(msg?.value || 0) < nanoton * 0.95) continue;
      claimed.add(tx.hash);
      localStorage.setItem(CLAIMED_KEY, JSON.stringify([...claimed].slice(-40)));
      return true;
    }
  }
  return false;
}

function setPay(message) {
  const el = document.getElementById("pay-status");
  if (el) el.textContent = message;
}

async function buyZcoin() {
  if (paying) return;
  paying = true;
  const buy = document.getElementById("buy-zcoin");
  if (buy) buy.disabled = true;
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const comment = `ZCOIN ${code}`;
  const nanoton = 1_000_000_000;
  const url = `https://app.tonkeeper.com/transfer/${PAYMENT_WALLET}?amount=${nanoton}&text=${encodeURIComponent(comment)}`;
  window.open(url, "_blank", "noopener");
  setPay(t("payWait"));
  const ok = await watchPayment(comment, nanoton);
  if (ok) {
    zcoin += ZCOIN_PER_GRAM;
    saveZcoin();
    grantXp(20);
  }
  setPay(ok ? t("paySeen") : t("payMiss"));
  paying = false;
  if (buy) buy.disabled = false;
}

function buyGoods(cost, id) {
  if (zcoin < cost) {
    setPay(t("payNeed"));
    return;
  }
  if (!addItem(id, t(`item.${id}`), 1)) {
    setPay(t("pickupFull"));
    return;
  }
  zcoin -= cost;
  saveZcoin();
  grantXp(5);
  renderHotbar();
  setPay(t("bought"));
}

function paintAtelier() {
  const el = document.getElementById("atelier");
  if (!el) return;
  const owned = readSuits();
  el.innerHTML = `<h2>${t("suitTitle")}</h2><p>${t("suitLead")}</p>`;
  for (const id of suitIds()) {
    const block = document.createElement("div");
    const name = document.createElement("p");
    const mine = !!owned[id];
    const on = suitWorn === id;
    const label = t(`suit${id[0].toUpperCase()}${id.slice(1)}`);
    name.textContent = mine ? `${label} · ${t("suitYours")}` : `${label} · 8 GRAM`;
    block.appendChild(name);
    const primary = document.createElement("button");
    primary.type = "button";
    if (on) {
      primary.textContent = t("suitOff");
      primary.addEventListener("click", () => {
        clearSuit();
        paintAtelier();
      });
    } else if (mine) {
      primary.textContent = t("suitWear");
      primary.addEventListener("click", () => {
        equipSuit(id, true);
        paintAtelier();
      });
    } else {
      primary.textContent = t("suitBuy");
      primary.addEventListener("click", () => buySuit(id));
    }
    block.appendChild(primary);
    if (!mine && !on) {
      const trial = document.createElement("button");
      trial.type = "button";
      trial.textContent = t("suitTry");
      trial.addEventListener("click", () => {
        equipSuit(id, false);
        paintAtelier();
      });
      block.appendChild(trial);
    }
    el.appendChild(block);
  }
  const status = document.createElement("p");
  status.id = "suit-status";
  el.appendChild(status);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = t("close");
  close.addEventListener("click", () => el.classList.add("hidden"));
  el.appendChild(close);
}

async function buySuit(id) {
  if (paying) return;
  if (readSuits()[id]) {
    equipSuit(id, true);
    paintAtelier();
    return;
  }
  paying = true;
  const status = document.getElementById("suit-status");
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const comment = `SUIT ${id} ${code}`;
  const nanoton = SUIT_GRAM * 1_000_000_000;
  const url = `https://app.tonkeeper.com/transfer/${PAYMENT_WALLET}?amount=${nanoton}&text=${encodeURIComponent(comment)}`;
  window.open(url, "_blank", "noopener");
  if (status) status.textContent = t("suitWait");
  const ok = await watchPayment(comment, nanoton);
  if (ok) {
    const data = readSuits();
    data[id] = 1;
    localStorage.setItem(SUIT_KEY, JSON.stringify(data));
    equipSuit(id, true);
    grantXp(20);
  }
  if (status) status.textContent = ok ? t("suitSeen") : t("suitMiss");
  paying = false;
  paintAtelier();
  const again = document.getElementById("suit-status");
  if (again) again.textContent = ok ? t("suitSeen") : t("suitMiss");
}

function setupShell() {
  document.getElementById("house-wallet").textContent = PAYMENT_WALLET;
  paintZcoin();
  const menu = document.getElementById("menu");
  document.getElementById("menu-btn").addEventListener("click", () => {
    const willOpen = menu.classList.contains("hidden");
    closePops();
    if (willOpen) menu.classList.remove("hidden");
  });
  document.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.open;
      closePops();
      if (id === "wardrobe") {
        setBagOpen(false);
        openWardrobe(true);
        return;
      }
      if (id === "bag") {
        setBagOpen(true);
        return;
      }
      document.getElementById(id).classList.remove("hidden");
      if (id === "tasks") paintTasks();
    });
  });
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.close === "bag") setBagOpen(false);
      else document.getElementById(btn.dataset.close).classList.add("hidden");
    });
  });
  const list = document.getElementById("lang-list");
  for (const item of LANGS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.label;
    btn.dataset.lang = item.id;
    btn.addEventListener("click", () => setLanguage(item.id));
    list.appendChild(btn);
  }
  const markLang = () => {
    const current = localStorage.getItem("zv-lang") || "en";
    list.querySelectorAll("button").forEach((btn) => btn.classList.toggle("on", btn.dataset.lang === current));
    if (isDefaultMaint(maintenance.text)) {
      maintenance.text = t("maintDefault");
      document.getElementById("maint-text").value = maintenance.text;
      localStorage.setItem(MAINT_KEY, JSON.stringify(maintenance));
      applyMaintenance();
    }
    applyMaintenance();
    paintZcoin();
    renderHotbar();
    paintBoard();
    paintTasks();
    paintBadge();
  };
  onLang(markLang);
  markLang();
  document.getElementById("buy-zcoin").addEventListener("click", buyZcoin);
  document.getElementById("buy-bread").addEventListener("click", () => buyGoods(BREAD_PRICE, "pane"));
  document.getElementById("buy-water").addEventListener("click", () => buyGoods(WATER_PRICE, "acqua"));
}

setupAdmin();
setupShell();

let clickCtx;
let shotNoise;
const shotUp = new THREE.Vector3(0, 1, 0);
const shotDir = new THREE.Vector3();
const reticlePt = new THREE.Vector3();
const reticleFrom = new THREE.Vector3();
const reticleDir = new THREE.Vector3();

function placeReticle() {
  const el = document.getElementById("reticle");
  if (!el || el.classList.contains("hidden")) return;
  if (!city.muzzle(reticleFrom, reticleDir)) return;
  reticlePt.copy(reticleFrom).addScaledVector(reticleDir, 14);
  reticlePt.project(camera);
  if (reticlePt.z > 1) return;
  el.style.left = `${(reticlePt.x * 0.5 + 0.5) * window.innerWidth}px`;
  el.style.top = `${(-reticlePt.y * 0.5 + 0.5) * window.innerHeight}px`;
  el.style.margin = "0";
  el.style.transform = "translate(-50%, -50%)";
}
const flashGeo = new THREE.SphereGeometry(0.09, 8, 6);
const sparkGeo = new THREE.SphereGeometry(0.05, 6, 5);
const traceGeo = new THREE.CylinderGeometry(0.012, 0.004, 1, 5);
traceGeo.translate(0, 0.5, 0);
const flashMat = new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, depthWrite: false, toneMapped: false });
const traceMat = new THREE.MeshBasicMaterial({ color: 0xffd56a, transparent: true, depthWrite: false, toneMapped: false });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, depthWrite: false, toneMapped: false });
const flashMesh = new THREE.Mesh(flashGeo, flashMat);
const traceMesh = new THREE.Mesh(traceGeo, traceMat);
const sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
flashMesh.visible = false;
traceMesh.visible = false;
sparkMesh.visible = false;
flashMesh.frustumCulled = false;
traceMesh.frustumCulled = false;
scene.add(flashMesh, traceMesh, sparkMesh);
let shotAge = 1;
let sparkAge = 1;

function spawnShot(from, dir, length) {
  flashMesh.visible = true;
  flashMesh.position.copy(from);
  flashMesh.scale.setScalar(1);
  flashMat.opacity = 1;
  traceMesh.visible = true;
  traceMesh.position.copy(from);
  traceMesh.quaternion.setFromUnitVectors(shotUp, dir);
  traceMesh.scale.set(1, Math.min(length, 14), 1);
  traceMat.opacity = 1;
  shotAge = 0;
}

function spawnSpark(at) {
  sparkMesh.visible = true;
  sparkMesh.position.copy(at);
  sparkMesh.scale.setScalar(1);
  sparkMat.opacity = 1;
  sparkAge = 0;
}

function updateShots(dt) {
  if (shotAge < 0.09) {
    shotAge += dt;
    const fade = Math.max(0, 1 - shotAge / 0.09);
    flashMat.opacity = fade;
    flashMesh.scale.setScalar(1 + shotAge * 8);
    traceMat.opacity = fade;
    if (fade === 0) {
      flashMesh.visible = false;
      traceMesh.visible = false;
    }
  }
  if (sparkAge < 0.08) {
    sparkAge += dt;
    const fade = Math.max(0, 1 - sparkAge / 0.08);
    sparkMat.opacity = fade;
    if (fade === 0) sparkMesh.visible = false;
  }
}

function playClick() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  if (!clickCtx) clickCtx = new Ctx();
  if (clickCtx.state === "suspended") clickCtx.resume();
  const t0 = clickCtx.currentTime;
  const osc = clickCtx.createOscillator();
  const gain = clickCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1480, t0);
  osc.frequency.exponentialRampToValueAtTime(980, t0 + 0.028);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.03, t0 + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.038);
  osc.connect(gain);
  gain.connect(clickCtx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.04);
}

function playShot() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  if (!clickCtx) clickCtx = new Ctx();
  if (clickCtx.state === "suspended") clickCtx.resume();
  const rate = clickCtx.sampleRate;
  if (!shotNoise) {
    const len = Math.floor(rate * 0.16);
    shotNoise = clickCtx.createBuffer(1, len, rate);
    const data = shotNoise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  const t0 = clickCtx.currentTime;
  const noise = clickCtx.createBufferSource();
  noise.buffer = shotNoise;
  const band = clickCtx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.setValueAtTime(2200, t0);
  band.frequency.exponentialRampToValueAtTime(700, t0 + 0.08);
  band.Q.value = 0.6;
  const crack = clickCtx.createGain();
  crack.gain.setValueAtTime(0.0001, t0);
  crack.gain.exponentialRampToValueAtTime(0.2, t0 + 0.004);
  crack.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
  noise.connect(band);
  band.connect(crack);
  crack.connect(clickCtx.destination);
  const thump = clickCtx.createOscillator();
  const body = clickCtx.createGain();
  thump.type = "triangle";
  thump.frequency.setValueAtTime(160, t0);
  thump.frequency.exponentialRampToValueAtTime(48, t0 + 0.07);
  body.gain.setValueAtTime(0.0001, t0);
  body.gain.exponentialRampToValueAtTime(0.16, t0 + 0.006);
  body.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  thump.connect(body);
  body.connect(clickCtx.destination);
  noise.start(t0);
  noise.stop(t0 + 0.16);
  thump.start(t0);
  thump.stop(t0 + 0.1);
}
document.addEventListener(
  "pointerdown",
  (e) => {
    if (!(e.target instanceof Element) || !e.target.closest("button, .swatch")) return;
    playClick();
  },
  true,
);

function plazaShut(x0, z0, x1, z1) {
  for (const gate of plazaGates) {
    if (gate.block.shut === false) continue;
    const ox = Math.cos(gate.a);
    const oz = Math.sin(gate.a);
    const a0 = (x0 - gate.x) * ox + (z0 - gate.z) * oz;
    const a1 = (x1 - gate.x) * ox + (z1 - gate.z) * oz;
    const lat = Math.abs((x0 - gate.x) * oz - (z0 - gate.z) * ox);
    if (lat < gate.span + 0.35 && a0 * a1 <= 0 && Math.abs(a0) < 3.2 && Math.abs(a1) < 3.2) return true;
  }
  return false;
}

function updatePlazaDoors(dt) {
  const bodies = [player.group.position];
  for (const n of npcs) bodies.push(n.pivot.position);
  for (const gate of plazaGates) {
    const ox = Math.cos(gate.a);
    const oz = Math.sin(gate.a);
    let want = false;
    let dir = gate.dir;
    let best = 99;
    for (const p of bodies) {
      const relX = p.x - gate.x;
      const relZ = p.z - gate.z;
      const along = relX * ox + relZ * oz;
      const lateral = Math.abs(relX * oz - relZ * ox);
      const approach = lateral < gate.span * 0.95 && Math.abs(along) < 8.2;
      const passing = lateral < gate.span && Math.abs(along) < 2.4;
      if (!(approach || passing)) continue;
      want = true;
      if (Math.abs(along) < best) {
        best = Math.abs(along);
        dir = along > 0.08 ? -1 : 1;
      }
    }
    if (want && gate.phase === "shut") {
      gate.dir = dir;
      gate.phase = "open";
    }
    let swung = 0;
    for (const leaf of gate.leaves) {
      const target = want ? gate.dir * leaf.out : 0;
      leaf.pivot.rotation.y = THREE.MathUtils.damp(leaf.pivot.rotation.y, target, 5.5, dt);
      swung = Math.max(swung, Math.abs(leaf.pivot.rotation.y));
    }
    if (!want && swung < 0.05) gate.phase = "shut";
    gate.block.shut = swung < 1.1;
  }
}

let whereAt = 0;

function saveWhere() {
  const p = player.group.position;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
  try {
    localStorage.setItem(
      "zv-where",
      JSON.stringify({
        x: Math.round(p.x * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        face: Math.round(player.group.rotation.y * 1000) / 1000,
      }),
    );
  } catch {
    /* private mode */
  }
}

let phoneTick = 0;
let phoneHeavy = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.04);
  const now = clock.elapsedTime;
  phoneTick += 1;
  const phoneLiteFrame = phone && phoneTick % 2 === 1;

  if (!phone) {
    for (const flame of hearthFlames) {
      const i = flame.userData.i;
      flame.scale.y = 0.72 + Math.sin(now * 11 + i * 2.1) * 0.32;
      flame.scale.x = 0.8 + Math.sin(now * 8 + i) * 0.18;
      flame.material.opacity = 0.58 + Math.sin(now * 14 + i) * 0.22;
    }
  }
  updateVitals(dt);
  persistVitals(dt);
  updatePlayer(dt);
  if (!phoneLiteFrame) noteBoard();
  updateCrowd(dt, now);
  if (!phone) {
    updateBirds(dt);
    updateBlooms();
    updateCritters(dt);
    updateFountain(dt);
  }
  phoneHeavy += dt;
  if (!phone || phoneHeavy > 0.12) {
    if (phone) phoneHeavy = 0;
    updatePlazaDoors(dt);
  }
  syncCombatUi();
  for (const m of mixers) {
    if (m._zvSkip) continue;
    m.update(dt);
  }
  if (!phoneLiteFrame) poseCrowd();
  if (avatar.look && !phoneLiteFrame) applyEyes(avatar.look);
  if (!phoneLiteFrame) applyFrameBody();
  camera.getWorldDirection(shotDir);
  city.bendAim(shotDir, dt);
  placeReticle();
  updateShots(dt);
  if (!phoneLiteFrame) {
    city.update(dt * (phone ? 2 : 1), now);
    world.update(dt * (phone ? 2 : 1), now);
  }
  updateDrops(now);
  updateCamera();
  renderer.render(scene, camera);
  whereAt += dt;
  if (whereAt > 2) {
    whereAt = 0;
    saveWhere();
  }
  requestAnimationFrame(tick);
}

window.addEventListener("pagehide", saveWhere);

window.addEventListener("keydown", (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (typing) return;
  keys[e.code] = true;
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat && !reading() && !city.blocksMove()) city.trySkateJump();
  }
  if (!typing && e.code === "KeyI" && !e.repeat) setBagOpen(!bagOpen);
  if (!typing && e.code === "KeyE" && !e.repeat) tryPickup();
  if (!typing && e.code === "KeyF" && !e.repeat) city.tryDrive();
  if (/^Digit[1-6]$/.test(e.code)) {
    selectedSlot = Number(e.code.slice(5)) - 1;
    if (armedSnack) {
      armedSnack = null;
      city.holdSnack(null);
    }
    renderHotbar();
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});
window.addEventListener("mousemove", (e) => {
  if (mirrorDragging) {
    mirrorYaw -= e.movementX * 0.01;
    mirrorPitch = THREE.MathUtils.clamp(mirrorPitch - e.movementY * 0.005, -0.35, 0.45);
    return;
  }
  if (!pointerLocked || wardrobeOpen) return;
  yaw -= e.movementX * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0018, -0.08, 0.62);
});
document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
});

let dragging = false;
let decorDragging = false;
let pointerTravel = 0;
const placeRay = new THREE.Raycaster();
const placeNdc = new THREE.Vector2();
const walkStick = { on: false, id: -1, x: 0, y: 0, ox: 0, oy: 0 };
const stickEl = document.getElementById("stick");
const stickKnob = document.getElementById("stick-knob");
let lookTouch = -1;
let lookX = 0;
let lookY = 0;

function stickBlocked(target) {
  return target instanceof Element && !!target.closest("button, input, textarea, a, #decor, #phone, #minimap, #chat-form");
}

function hideStick() {
  walkStick.on = false;
  walkStick.x = 0;
  walkStick.y = 0;
  if (stickEl) stickEl.hidden = true;
  if (stickKnob) stickKnob.style.transform = "";
}

window.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch" || wardrobeOpen || decorOrbit || stickBlocked(e.target)) return;
  if (e.clientX < window.innerWidth * 0.46) {
    if (walkStick.on) return;
    walkStick.on = true;
    walkStick.id = e.pointerId;
    walkStick.ox = e.clientX;
    walkStick.oy = e.clientY;
    walkStick.x = 0;
    walkStick.y = 0;
    if (stickEl) {
      stickEl.hidden = false;
      stickEl.style.left = `${e.clientX}px`;
      stickEl.style.top = `${e.clientY}px`;
    }
    return;
  }
  if (e.target === renderer.domElement && lookTouch < 0) {
    lookTouch = e.pointerId;
    lookX = e.clientX;
    lookY = e.clientY;
  }
});
window.addEventListener("pointermove", (e) => {
  if (walkStick.on && e.pointerId === walkStick.id) {
    const dx = e.clientX - walkStick.ox;
    const dy = e.clientY - walkStick.oy;
    const len = Math.hypot(dx, dy) || 1;
    const cap = Math.min(1, len / 54);
    walkStick.x = (dx / len) * cap;
    walkStick.y = (dy / len) * cap;
    if (stickKnob) stickKnob.style.transform = `translate(${walkStick.x * 32}px, ${walkStick.y * 32}px)`;
    return;
  }
  if (e.pointerId === lookTouch) {
    yaw -= (e.clientX - lookX) * 0.006;
    pitch = THREE.MathUtils.clamp(pitch - (e.clientY - lookY) * 0.004, -0.08, 0.62);
    lookX = e.clientX;
    lookY = e.clientY;
  }
});
window.addEventListener("pointerup", (e) => {
  if (e.pointerId === walkStick.id) hideStick();
  if (e.pointerId === lookTouch) lookTouch = -1;
});
window.addEventListener("pointercancel", (e) => {
  if (e.pointerId === walkStick.id) hideStick();
  if (e.pointerId === lookTouch) lookTouch = -1;
});

window.addEventListener("mousedown", (e) => {
  if (walkStick.on) return;
  if (e.target === renderer.domElement) pointerTravel = 0;
  if (decorOrbit && e.target === renderer.domElement) {
    if (city.holdingFurn && city.holdingFurn()) return;
    decorDragging = true;
    return;
  }
  if (wardrobeOpen && e.target === renderer.domElement) {
    mirrorDragging = true;
    return;
  }
  if (e.target === renderer.domElement) dragging = true;
});
window.addEventListener("mouseup", () => {
  dragging = false;
  decorDragging = false;
  mirrorDragging = false;
});
window.addEventListener("click", (e) => {
  if (e.target !== renderer.domElement || pointerTravel > 8 || !city.dropFurn) return;
  const rect = renderer.domElement.getBoundingClientRect();
  placeNdc.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  placeRay.setFromCamera(placeNdc, camera);
  const dir = placeRay.ray.direction;
  if (Math.abs(dir.y) < 0.02) return;
  const hitT = (0.05 - placeRay.ray.origin.y) / dir.y;
  if (hitT < 0) return;
  city.dropFurn(
    placeRay.ray.origin.x + dir.x * hitT,
    placeRay.ray.origin.z + dir.z * hitT,
  );
});
window.addEventListener("mousemove", (e) => {
  if (dragging || decorDragging || mirrorDragging) pointerTravel += Math.hypot(e.movementX, e.movementY);
  if (decorDragging && decorOrbit && !(city.holdingFurn && city.holdingFurn())) {
    decorOrbit.yaw -= e.movementX * 0.008;
    decorOrbit.pitch = THREE.MathUtils.clamp(decorOrbit.pitch - e.movementY * 0.005, 0.28, 1.32);
    return;
  }
  if (wardrobeOpen || pointerLocked || !dragging) return;
  yaw -= e.movementX * 0.006;
  pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.004, -0.08, 0.62);
});
window.addEventListener(
  "wheel",
  (e) => {
    if (wardrobeOpen) {
      mirrorZoom = THREE.MathUtils.clamp(mirrorZoom + (e.deltaY > 0 ? 0.08 : -0.08), 0.4, 2.7);
      return;
    }
    if (decorOrbit && e.target === renderer.domElement) {
      decorOrbit.dist = THREE.MathUtils.clamp(decorOrbit.dist + (e.deltaY > 0 ? 0.7 : -0.7), 5.5, 24);
      return;
    }
    if (e.target !== renderer.domElement && !pointerLocked) return;
    camDist = THREE.MathUtils.clamp(camDist + (e.deltaY > 0 ? 0.38 : -0.38), 2.2, 9);
  },
  { passive: true },
);

function gameHeight() {
  const tg = window.Telegram?.WebApp;
  if (tg?.viewportStableHeight > 0) return tg.viewportStableHeight;
  return window.innerHeight;
}

function placeChat() {
  const form = document.getElementById("chat-form");
  if (!form) return;
  const tg = window.Telegram?.WebApp;
  let covered = 0;
  if (tg?.viewportStableHeight && tg.viewportHeight) covered = Math.max(0, tg.viewportStableHeight - tg.viewportHeight);
  else if (window.visualViewport) covered = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
  form.style.bottom = covered > 8 ? `${12 + covered}px` : "";
}

function holdTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.disableVerticalSwipes();
  } catch {
    /* older Telegram */
  }
  if (!tg.isFullscreen) {
    try {
      tg.requestFullscreen();
    } catch {
      /* fullscreen needs a newer Telegram */
    }
  }
}

function resizeView() {
  const panel = !phone && wardrobeOpen ? Math.min(400, Math.round(window.innerWidth * 0.34)) : 0;
  const width = Math.max(1, window.innerWidth - panel);
  const height = Math.max(1, gameHeight());
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(fitRatio());
  renderer.setSize(width, height, false);
  placeChat();
}

window.addEventListener("resize", resizeView);
window.visualViewport?.addEventListener("resize", placeChat);
holdTelegram();
window.Telegram?.WebApp?.onEvent?.("viewportChanged", () => {
  holdTelegram();
  resizeView();
});
document.addEventListener(
  "touchmove",
  (e) => {
    if (e.target instanceof Element && e.target.closest("input, textarea, select, .panel, .pop, .sheet, #wardrobe, #bag, #handset, #phone-body")) return;
    e.preventDefault();
  },
  { passive: false },
);
document.addEventListener("pointerdown", holdTelegram);
resizeView();

let pinchDist = 0;
let decorTouch = null;
renderer.domElement.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length === 2) {
      pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      decorTouch = null;
      return;
    }
    if (e.touches.length === 1 && decorOrbit && !(city.holdingFurn && city.holdingFurn())) {
      decorTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  },
  { passive: true },
);
renderer.domElement.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length === 2 && pinchDist) {
      const next = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const scale = pinchDist / next;
      if (decorOrbit) decorOrbit.dist = THREE.MathUtils.clamp(decorOrbit.dist * scale, 5.5, 24);
      else camDist = THREE.MathUtils.clamp(camDist * scale, 2.2, 9);
      pinchDist = next;
      e.preventDefault();
      return;
    }
    if (city.holdingFurn && city.holdingFurn()) {
      e.preventDefault();
      return;
    }
    if (decorOrbit && decorTouch && e.touches.length === 1) {
      const t = e.touches[0];
      decorOrbit.yaw -= (t.clientX - decorTouch.x) * 0.008;
      decorOrbit.pitch = THREE.MathUtils.clamp(decorOrbit.pitch - (t.clientY - decorTouch.y) * 0.005, 0.28, 1.32);
      decorTouch = { x: t.clientX, y: t.clientY };
      e.preventDefault();
    }
  },
  { passive: false },
);
renderer.domElement.addEventListener("touchend", () => {
  pinchDist = 0;
  decorTouch = null;
});

const world = createWorld({
  scene,
  renderer,
  player,
  sky: skyPack.sky,
  sunLight: lights.sun,
  hemiLight: lights.hemi,
  fillLight: lights.fill,
  streetLights,
  lampGlow,
  lampLimit: phone ? 0 : 8,
  plainSky: phone,
  addCircle,
  lakes: LAKES,
  swayTrees,
  rippleMaterial,
  quarry: QUARRY,
  importAt: IMPORT_AT,
  marketAt: MARKET_AT,
  pescaAt: PESCA_AT,
  atelierAt: ATELIER_AT,
});

const city = createCity({
  scene,
  camera,
  renderer,
  player,
  npcs,
  groundAt,
  addBlock,
  lite: phone,
  benches: benchSpots.concat(world.benches),
  getZcoin: () => zcoin,
  setZcoin: (n) => {
    zcoin = n;
  },
  saveZcoin,
  addToBag,
  bagRoom,
  listOres,
  sellOres,
  orePay: ORE_PAY,
  hasRod,
  listFish,
  sellFish,
  fishPay: FISH_PAY,
  buyRod,
  hasSkate,
  buySkate,
  buyAmmo,
  hasItem,
  takeOne,
  getHeld,
  circles,
  marketAt: MARKET_AT,
  pescaAt: PESCA_AT,
  atelierAt: ATELIER_AT,
  lakes: LAKES,
  listBag: () => [...bag, ...inventory].filter(Boolean),
  openAtelier() {
    closePops();
    paintAtelier();
    document.getElementById("atelier").classList.remove("hidden");
  },
  quarry: QUARRY,
  importAt: IMPORT_AT,
  addCircle,
  look(dx, dy) {
    yaw -= dx * 0.006;
    pitch = THREE.MathUtils.clamp(pitch - dy * 0.004, -0.08, 0.62);
  },
});

document.getElementById("aim-btn").addEventListener("click", () => {
  if (inventory[selectedSlot]?.id !== "pistola") return;
  aiming = !aiming;
});
document.getElementById("fire-btn").addEventListener("click", () => fireGun());
document.getElementById("reload-btn").addEventListener("click", () => reloadGun());
document.getElementById("hop-btn").addEventListener("click", () => {
  if (reading() || city.blocksMove()) return;
  city.trySkateJump();
});

const runBtn = document.getElementById("run-btn");
function setRunHeld(on) {
  runHeld = on;
  runBtn.classList.toggle("on", on);
}
runBtn.addEventListener("pointerup", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  setRunHeld(!runHeld);
});
clock.start();
renderHotbar();
tick();

boot().catch((err) => {
  console.error(err);
  setLoad(t("bootErr"));
});
