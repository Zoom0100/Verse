import * as THREE from "three";
import { LANGS, onLang, setLanguage, t } from "./i18n.js";
import { softGeo } from "./soft.js";
import { mannequin } from "./suits.js";

const ESTATE_KEY = "zv-estate";
const PHONE_KEY = "zv-phone";
const BANK_KEY = "zv-bank";
const CLEAN_KEY = "zv-hygiene";
const UNLOCK_KEY = "zv-unlocks";

const HOUSES = [
  { id: "bassa", price: 350, en: "Low house", it: "Casa bassa", w: 7.8, d: 8.0, h: 3.7, gap: 1.08, style: "house" },
  { id: "villa", price: 800, en: "Villa", it: "Villa", w: 8.6, d: 8.4, h: 4.3, gap: 1.16, style: "villa" },
  { id: "attico", price: 550, en: "Tall house", it: "Attico", w: 7.6, d: 8.0, h: 6.8, gap: 1.08, style: "attic" },
];
const GARAGES = [
  { id: "box", price: 150, en: "Box", it: "Box", w: 4.8, d: 7.4, h: 3.2, gap: 1.35, style: "garage" },
  { id: "doppio", price: 280, en: "Double garage", it: "Garage doppio", w: 8.2, d: 7.4, h: 3.2, gap: 2.05, style: "garage" },
  { id: "rimessa", price: 220, en: "Shed", it: "Rimessa", w: 5.6, d: 7.8, h: 3.5, gap: 1.5, style: "garage" },
];

function L(en, it) {
  return (localStorage.getItem("zv-lang") || "en") === "it" ? it : en;
}

function loadJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function createCity(api) {
  const {
    scene, camera, renderer, player, npcs, groundAt, addBlock, getZcoin, setZcoin, saveZcoin, look, benches = [],
    addToBag, bagRoom, listOres, sellOres, orePay = {}, quarry, importAt, addCircle,
    hasRod, listFish, sellFish, fishPay = {}, buyRod, hasSkate, buySkate, buyAmmo, marketAt, pescaAt, atelierAt, lakes = [], listBag = () => [],
    hasItem, takeOne, getHeld, circles = [], openAtelier, lite = false,
  } = api;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const aimDelta = new THREE.Quaternion();
  const handParentQ = new THREE.Quaternion();
  const handBasis = new THREE.Matrix4();
  const handX = new THREE.Vector3();
  const handY = new THREE.Vector3();
  const handZ = new THREE.Vector3();
  const gripFrom = new THREE.Vector3();
  const gripTo = new THREE.Vector3();
  const gunRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.1, -1.2));
  const gunAimRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const gunRestPos = new THREE.Vector3(0.02, 0.08, 0.03);
  const gunAimPos = new THREE.Vector3(0.0, 0.05, 0.012);
  const gunParentQ = new THREE.Quaternion();
  const gunWorldQ = new THREE.Quaternion();
  const gunBasis = new THREE.Matrix4();
  const gunX = new THREE.Vector3();
  const gunY = new THREE.Vector3();
  const gunZ = new THREE.Vector3();
  const gunDown = new THREE.Vector3(0, -1, 0);
  const gunAhead = new THREE.Vector3();
  let aimBlend = 0;
  const head = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let estate = loadJson(ESTATE_KEY, { houses: [], garages: [] });
  if (!Array.isArray(estate.houses)) estate = { houses: [], garages: [] };
  let phone = loadJson(PHONE_KEY, null);
  let bank = Number(localStorage.getItem(BANK_KEY) || "0") || 0;
  let hygiene = Number(localStorage.getItem(CLEAN_KEY) || "100");
  if (!Number.isFinite(hygiene)) hygiene = 100;
  const SMELL_WAIT_KEY = "zv-smell-wait";
  const stinkAfterMs = 30 * 60 * 1000;
  let smellWait = localStorage.getItem(SMELL_WAIT_KEY);
  if (smellWait == null) {
    smellWait = hygiene < 15 ? String(Date.now() + stinkAfterMs) : "0";
    localStorage.setItem(SMELL_WAIT_KEY, smellWait);
  }
  let unlocks = loadJson(UNLOCK_KEY, []);
  if (!Array.isArray(unlocks)) unlocks = [];

  let bones = {};
  let hero = null;
  let pose = null;
  let poseT = 0;
  let seat = null;
  const chats = [];
  let camMode = "photo";
  let offer = null;
  let placeMode = null;
  let screen = "setup";
  let phoneOpen = false;
  let toastTimer = 0;
  let cleanSave = 0;
  let rec = null;
  let feedFrame = 0;
  let smokePuff = null;
  const pads = [];
  const doors = [];
  const roofs = [];

  const mat = (color, extra) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.04, ...extra });
  const plaster = mat(0xf3efe6);
  const stone = mat(0xd7d0c4);
  const wood = mat(0x8d5a3c);
  const glass = lite
    ? new THREE.MeshStandardMaterial({
        color: 0xd5e7f5,
        roughness: 0.35,
        metalness: 0.05,
        transparent: true,
        opacity: 0.4,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0xd5e7f5,
        roughness: 0.08,
        metalness: 0.02,
        transparent: true,
        opacity: 0.45,
      });
  function addLiteLight(parent, light) {
    if (lite) return null;
    parent.add(light);
    return light;
  }

  function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function sign(text, x, y, z, yaw) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const g = canvas.getContext("2d");
    g.fillStyle = "#f7f3ec";
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = "#241c16";
    g.font = "600 28px Segoe UI, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.45),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    scene.add(mesh);
  }

  function swingLeaf(x, z, yaw, leaf, tall = 2.2) {
    const pivot = new THREE.Group();
    pivot.position.set(x, groundAt(x, z), z);
    pivot.rotation.y = yaw;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(leaf, tall, 0.08), wood);
    slab.position.set(leaf / 2, tall / 2, 0);
    slab.castShadow = true;
    const panelMat = mat(0x6a432c, { roughness: 0.58 });
    const brass = mat(0xd8c27a, { metalness: 0.72, roughness: 0.28 });
    const panels = [];
    for (const py of [0.62, 1.48]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.28, leaf * 0.62), 0.62, 0.025), panelMat);
      panel.position.set(leaf * 0.5, py, 0.05);
      panels.push(panel);
    }
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 10), brass);
    rose.rotation.x = Math.PI / 2;
    rose.position.set(leaf * 0.72, 1.05, 0.06);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.028), brass);
    lever.position.set(leaf * 0.82, 1.05, 0.07);
    pivot.add(slab, ...panels, rose, lever);
    scene.add(pivot);
    return pivot;
  }

  function hinge(x, z, yaw, open, at, leaf = 0.92, plotId = null, tall = 2.2) {
    const pivot = swingLeaf(x, z, yaw, leaf, tall);
    doors.push({ pivot, base: yaw, open, at: at || new THREE.Vector3(x, 0, z), plot: plotId, ajar: false });
  }

  function doubleDoor(a, b, at, plotId) {
    doors.push({
      leaves: [
        { pivot: swingLeaf(a.x, a.z, a.yaw, a.leaf), base: a.yaw, open: a.open },
        { pivot: swingLeaf(b.x, b.z, b.yaw, b.leaf), base: b.yaw, open: b.open },
      ],
      at,
      plot: plotId,
      ajar: false,
    });
  }

  const walkTone = mat(0xd5cec2, { roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const bikeTone = mat(0xa34b38, { roughness: 0.74, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const asphalt = mat(0x3a4046, { roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  function road(x, z, w, d) {
    const alongX = w >= d;
    const h = 0.06;
    const lane = 0.7;
    const gap = 0.04;
    function slab(sw, sd, sx, sz, material) {
      const lift = material === asphalt ? 0.11 : material === bikeTone ? 0.135 : 0.155;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sw, h, sd), material);
      mesh.position.set(sx, lift, sz);
      mesh.receiveShadow = false;
      mesh.castShadow = false;
      scene.add(mesh);
    }
    if (alongX) {
      const roadD = d - lane - gap;
      slab(w, roadD, x, z - (lane + gap) / 2, asphalt);
      slab(w, lane, x, z + d / 2 - lane / 2, bikeTone);
      slab(w, 1.05, x, z + d / 2 + 0.66, walkTone);
      slab(w, 1.05, x, z - d / 2 - 0.66, walkTone);
    } else {
      const roadW = w - lane - gap;
      slab(roadW, d, x - (lane + gap) / 2, z, asphalt);
      slab(lane, d, x + w / 2 - lane / 2, z, bikeTone);
      slab(1.05, d, x + w / 2 + 0.66, z, walkTone);
      slab(1.05, d, x - w / 2 - 0.66, z, walkTone);
    }
  }

  road(54.25, 0, 39.5, 6.2);
  road(-54.25, 0, 39.5, 6.2);
  road(20.3, 25.1, 21.4, 5.2);
  road(-20.3, 25.1, 21.4, 5.2);
  road(22.1, -23.1, 17.8, 5.2);
  road(-22.1, -23.1, 17.8, 5.2);
  road(27.2, 13.05, 5.2, 15.9);
  road(27.2, -12.05, 5.2, 13.9);
  road(-27.2, 13.05, 5.2, 15.9);
  road(-27.2, -12.05, 5.2, 13.9);
  road(-7.4, 25.1, 4, 5.2);
  road(7.4, 25.1, 4, 5.2);
  road(-9.2, -23.1, 7.2, 5.2);
  road(9.2, -23.1, 7.2, 5.2);
  road(-8, 70, 112, 6.2);
  road(-36, -46, 72, 6.2);
  road(-40, 34.9, 6.2, 60.2);
  road(-40, -23.8, 6.2, 37.2);
  if (importAt) road(importAt.x, 19.4, 5.4, 25.2);
  road(114.5, 0, 81, 6.2);
  road(-114.5, 0, 81, 6.2);
  road(-106, 70, 84, 6.2);
  road(-110, -46, 76, 6.2);
  road(128, -11, 6.2, 178);
  road(-128, 4, 6.2, 208);
  road(0, -100, 296, 6.2);
  road(-89, 108, 118, 6.2);

  const stripe = new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.62 });
  stripe.polygonOffset = true;
  stripe.polygonOffsetFactor = -6;
  stripe.polygonOffsetUnits = -6;
  function zebra(x, z, alongX) {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.38 : 3.1, 0.02, alongX ? 3.1 : 0.38), stripe);
      const o = (i - 2.5) * 0.72;
      mesh.position.set(alongX ? x + o : x, 0.185, alongX ? z : z + o);
      mesh.receiveShadow = false;
      scene.add(mesh);
    }
  }
  zebra(-40, 0, true);
  zebra(-40, 70, true);
  zebra(-40, -46, true);
  zebra(27.2, 3.6, true);
  zebra(-27.2, 3.6, true);
  zebra(27.2, -3.6, true);
  zebra(-27.2, -3.6, true);
  zebra(0, 22.4, false);
  zebra(0, -20.6, false);
  zebra(128, 0, false);
  zebra(-128, 0, false);
  zebra(-128, 70, false);
  zebra(-128, -46, false);
  zebra(128, -100, false);
  zebra(-128, -100, false);
  zebra(-128, 108, false);

  const signals = [];
  function signal(x, z, yaw, offset) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.075, 3.1, 8),
      mat(0x2c3136, { roughness: 0.45, metalness: 0.35 }),
    );
    pole.position.y = 1.55;
    group.add(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.82, 0.22),
      mat(0x1a1e22, { roughness: 0.5, metalness: 0.2 }),
    );
    head.position.set(0, 2.9, 0);
    group.add(head);
    const bulbs = [0, 1, 2].map((i) => {
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 10, 8),
        mat(0x241416, { emissive: 0x000000, emissiveIntensity: 0, roughness: 0.4 }),
      );
      bulb.position.set(0, 3.14 - i * 0.24, 0.12);
      group.add(bulb);
      return bulb;
    });
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    scene.add(group);
    signals.push({ bulbs, offset });
  }
  function junction(x, z, hx, hz, offset) {
    const spots = [
      [x - hx, z + hz],
      [x + hx, z + hz],
      [x + hx, z - hz],
      [x - hx, z - hz],
    ];
    spots.forEach(([sx, sz], i) => {
      signal(sx, sz, Math.atan2(x - sx, z - sz), offset + (i % 2) * 10);
    });
  }
  junction(-40, 0, 4.35, 4.35, 0);
  junction(-40, 70, 4.35, 4.15, 4);
  junction(-40, -46, 4.35, 4.15, 8);
  junction(27.2, 0, 4.15, 4.35, 2);
  junction(-27.2, 0, 4.15, 4.35, 6);
  junction(27.2, 25.1, 4.05, 3.9, 1);
  junction(-27.2, 25.1, 4.05, 3.9, 5);
  junction(27.2, -23.1, 4.05, 3.9, 3);
  junction(-27.2, -23.1, 4.05, 3.9, 7);
  signal(-5.55, 24.4, Math.atan2(0, -1), 0);
  signal(5.45, 24.4, Math.atan2(0, -1), 10);
  signal(-5.55, -24.4, Math.atan2(0, 1), 5);
  signal(5.45, -24.4, Math.atan2(0, 1), 15);
  signal(24.4, -4.15, Math.atan2(-1, 0), 2);
  signal(24.4, 4.05, Math.atan2(-1, 0), 12);
  signal(-24.4, -4.15, Math.atan2(1, 0), 8);
  signal(-24.4, 4.05, Math.atan2(1, 0), 18);
  junction(128, 0, 4.35, 4.35, 3);
  junction(-128, 0, 4.35, 4.35, 7);
  junction(-128, 70, 4.35, 4.15, 1);
  junction(-128, -46, 4.35, 4.15, 5);
  junction(128, -100, 4.35, 4.15, 9);
  junction(-128, -100, 4.35, 4.15, 11);
  junction(-128, 108, 4.35, 4.15, 13);

  function paintTex(draw) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    draw(canvas.getContext("2d"));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  function mapped(tex, rx, ry, rough, metal = 0) {
    const map = tex.clone();
    map.needsUpdate = true;
    map.repeat.set(rx, ry);
    return new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: metal });
  }
  const plasterTex = paintTex((g) => {
    g.fillStyle = "#f4eee6";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = i % 2 ? "rgba(170,140,110,0.16)" : "rgba(255,255,255,0.22)";
      g.fillRect((i * 17) % 128, (i * 29) % 128, 2, 2);
    }
  });
  const brickTex = paintTex((g) => {
    g.fillStyle = "#d7c8b6";
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 8; row++) {
      const shift = row % 2 ? 16 : 0;
      for (let col = -1; col < 5; col++) {
        g.fillStyle = (row + col) % 3 ? "#c15a42" : "#a84634";
        g.fillRect(col * 32 + shift + 1, row * 16 + 1, 30, 13);
      }
    }
  });
  const stoneTex = paintTex((g) => {
    g.fillStyle = "#cfc6b8";
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 4; row++) {
      const shift = row % 2 ? 22 : 0;
      for (let col = -1; col < 4; col++) {
        g.fillStyle = (row + col) % 2 ? "#b7ad9c" : "#ddd4c6";
        g.fillRect(col * 44 + shift + 2, row * 32 + 2, 40, 27);
        g.strokeStyle = "rgba(90,80,68,0.35)";
        g.strokeRect(col * 44 + shift + 2, row * 32 + 2, 40, 27);
      }
    }
  });
  const concreteTex = paintTex((g) => {
    g.fillStyle = "#c5c8cc";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = "rgba(80,84,90,0.18)";
      g.fillRect((i * 23) % 128, (i * 11) % 128, 18, 2);
    }
  });
  const woodTex = paintTex((g) => {
    g.fillStyle = "#8a5a38";
    g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 16) {
      g.fillStyle = x % 32 ? "#a06a42" : "#6e442c";
      g.fillRect(x, 0, 15, 128);
      g.strokeStyle = "rgba(60,32,16,0.35)";
      g.beginPath();
      g.moveTo(x + 4, 0);
      g.bezierCurveTo(x + 8, 40, x + 2, 80, x + 6, 128);
      g.stroke();
    }
  });
  const tileTex = paintTex((g) => {
    g.fillStyle = "#9a3a2a";
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 8; row++) {
      const shift = row % 2 ? 12 : 0;
      for (let col = -1; col < 7; col++) {
        g.fillStyle = row % 2 ? "#b04a36" : "#8c3224";
        g.beginPath();
        g.arc(col * 22 + shift, row * 16 + 14, 12, Math.PI, 0);
        g.fill();
      }
    }
  });
  const houseWall = mapped(plasterTex, 3, 2, 0.84);
  const atticWall = mapped(brickTex, 3, 3, 0.78);
  const villaWall = mapped(stoneTex, 3, 2, 0.68);
  const garageWall = mapped(concreteTex, 2, 2, 0.86);
  const floorWood = mapped(woodTex, 4, 4, 0.72);
  const roofTile = mapped(tileTex, 4, 3, 0.7);
  const villaTrim = mat(0xe7e0d4, { roughness: 0.55 });
  const sash = mapped(woodTex, 1, 2, 0.48);
  function windowLook(lit) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 320;
    const g = canvas.getContext("2d");
    g.fillStyle = "#6a4a32";
    g.fillRect(0, 0, 256, 320);
    g.fillStyle = "#f3eadc";
    g.fillRect(12, 12, 232, 296);
    g.fillStyle = "#5c4030";
    g.fillRect(22, 22, 212, 276);
    const sky = g.createLinearGradient(0, 30, 40, 290);
    if (lit) {
      sky.addColorStop(0, "#ffe6b0");
      sky.addColorStop(0.42, "#fff3d2");
      sky.addColorStop(1, "#e2ae62");
    } else {
      sky.addColorStop(0, "#e7f4fb");
      sky.addColorStop(0.38, "#8ebad4");
      sky.addColorStop(1, "#3c6d90");
    }
    g.fillStyle = sky;
    g.fillRect(32, 34, 88, 112);
    g.fillRect(136, 34, 88, 112);
    g.fillRect(32, 162, 88, 122);
    g.fillRect(136, 162, 88, 122);
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(44, 52);
    g.lineTo(92, 44);
    g.lineTo(78, 108);
    g.stroke();
    g.beginPath();
    g.moveTo(150, 58);
    g.lineTo(204, 48);
    g.lineTo(186, 112);
    g.stroke();
    g.fillStyle = lit ? "rgba(122, 36, 48, 0.34)" : "rgba(92, 32, 42, 0.28)";
    g.fillRect(32, 34, 16, 250);
    g.fillRect(208, 34, 16, 250);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.32,
      metalness: 0.06,
      emissive: lit ? 0xffc98a : 0x000000,
      emissiveIntensity: lit ? 0.22 : 0,
      emissiveMap: lit ? tex : null,
      side: THREE.DoubleSide,
    });
  }
  const winDay = windowLook(false);
  const winLit = windowLook(true);

  function hall(cx, cz, w, d, h, face, spec, plotId = null) {
    const style = spec && spec.style ? spec.style : "house";
    const y0 = groundAt(cx, cz);
    box(w - 0.28, 0.06, d - 0.28, floorWood, cx, y0 + 0.04, cz);
    const hx = w / 2;
    const hz = d / 2;
    const wall = style === "villa" ? villaWall : style === "attic" ? atticWall : style === "garage" ? garageWall : houseWall;
    const gap = spec && spec.gap ? spec.gap : 0.62;
      const leafW = Math.max(0.7, gap + 0.04);
    function houseDoors(ax, az, ay, ao, bx, bz, by, bo) {
      if (style === "garage") return;
      doubleDoor(
        { x: ax, z: az, yaw: ay, open: ao, leaf: leafW },
        { x: bx, z: bz, yaw: by, open: bo, leaf: leafW },
        new THREE.Vector3((ax + bx) / 2, 0, (az + bz) / 2),
        plotId,
      );
    }
    if (face === "s") {
      box(w, h, 0.16, wall, cx, y0 + h / 2, cz + hz);
      box(0.16, h, d, wall, cx - hx, y0 + h / 2, cz);
      box(0.16, h, d, wall, cx + hx, y0 + h / 2, cz);
      box(w / 2 - gap, h, 0.16, wall, cx - (w / 4 + gap / 2), y0 + h / 2, cz - hz);
      box(w / 2 - gap, h, 0.16, wall, cx + (w / 4 + gap / 2), y0 + h / 2, cz - hz);
      houseDoors(cx - gap, cz - hz, 0, 1.55, cx + gap, cz - hz, Math.PI, -1.55);
      addBlock(cx - hx, cx + hx, cz + hz - 0.2, cz + hz + 0.2);
      addBlock(cx - hx - 0.2, cx - hx + 0.2, cz - hz, cz + hz);
      addBlock(cx + hx - 0.2, cx + hx + 0.2, cz - hz, cz + hz);
      addBlock(cx - hx, cx - gap, cz - hz - 0.2, cz - hz + 0.2);
      addBlock(cx + gap, cx + hx, cz - hz - 0.2, cz - hz + 0.2);
    } else if (face === "n") {
      box(w, h, 0.16, wall, cx, y0 + h / 2, cz - hz);
      box(0.16, h, d, wall, cx - hx, y0 + h / 2, cz);
      box(0.16, h, d, wall, cx + hx, y0 + h / 2, cz);
      box(w / 2 - gap, h, 0.16, wall, cx - (w / 4 + gap / 2), y0 + h / 2, cz + hz);
      box(w / 2 - gap, h, 0.16, wall, cx + (w / 4 + gap / 2), y0 + h / 2, cz + hz);
      houseDoors(cx - gap, cz + hz, 0, -1.55, cx + gap, cz + hz, Math.PI, 1.55);
      addBlock(cx - hx, cx + hx, cz - hz - 0.2, cz - hz + 0.2);
      addBlock(cx - hx - 0.2, cx - hx + 0.2, cz - hz, cz + hz);
      addBlock(cx + hx - 0.2, cx + hx + 0.2, cz - hz, cz + hz);
      addBlock(cx - hx, cx - gap, cz + hz - 0.2, cz + hz + 0.2);
      addBlock(cx + gap, cx + hx, cz + hz - 0.2, cz + hz + 0.2);
    } else if (face === "e") {
      box(0.16, h, d, wall, cx - hx, y0 + h / 2, cz);
      box(w, h, 0.16, wall, cx, y0 + h / 2, cz - hz);
      box(w, h, 0.16, wall, cx, y0 + h / 2, cz + hz);
      box(0.16, h, d / 2 - gap, wall, cx + hx, y0 + h / 2, cz - (d / 4 + gap / 2));
      box(0.16, h, d / 2 - gap, wall, cx + hx, y0 + h / 2, cz + (d / 4 + gap / 2));
      houseDoors(cx + hx, cz - gap, -Math.PI / 2, 1.55, cx + hx, cz + gap, Math.PI / 2, -1.55);
      addBlock(cx - hx - 0.2, cx - hx + 0.2, cz - hz, cz + hz);
      addBlock(cx - hx, cx + hx, cz - hz - 0.2, cz - hz + 0.2);
      addBlock(cx - hx, cx + hx, cz + hz - 0.2, cz + hz + 0.2);
      addBlock(cx + hx - 0.2, cx + hx + 0.2, cz - hz, cz - gap);
      addBlock(cx + hx - 0.2, cx + hx + 0.2, cz + gap, cz + hz);
    } else {
      box(0.16, h, d, wall, cx + hx, y0 + h / 2, cz);
      box(w, h, 0.16, wall, cx, y0 + h / 2, cz - hz);
      box(w, h, 0.16, wall, cx, y0 + h / 2, cz + hz);
      box(0.16, h, d / 2 - gap, wall, cx - hx, y0 + h / 2, cz - (d / 4 + gap / 2));
      box(0.16, h, d / 2 - gap, wall, cx - hx, y0 + h / 2, cz + (d / 4 + gap / 2));
      houseDoors(cx - hx, cz - gap, -Math.PI / 2, -1.55, cx - hx, cz + gap, Math.PI / 2, 1.55);
      addBlock(cx + hx - 0.2, cx + hx + 0.2, cz - hz, cz + hz);
      addBlock(cx - hx, cx + hx, cz - hz - 0.2, cz - hz + 0.2);
      addBlock(cx - hx, cx + hx, cz + hz - 0.2, cz + hz + 0.2);
      addBlock(cx - hx - 0.2, cx - hx + 0.2, cz - hz, cz - gap);
      addBlock(cx - hx - 0.2, cx - hx + 0.2, cz + gap, cz + hz);
    }
    const roof = new THREE.Mesh(softGeo(w + 0.55, 0.18, d + 0.55, 0.05), roofTile);
    roof.position.set(cx, y0 + h + 0.1, cz);
    roof.castShadow = true;
    roof.receiveShadow = true;
    scene.add(roof);
    if (plotId) roofs.push({ plot: plotId, mesh: roof });
    const postGeo = new THREE.CylinderGeometry(0.14, 0.15, h, 12);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, wall);
        post.position.set(cx + sx * hx, y0 + h / 2, cz + sz * hz);
        post.castShadow = true;
        scene.add(post);
      }
    }
    function front(along, out) {
      if (face === "s") return [cx + along, cz - hz - out];
      if (face === "n") return [cx + along, cz + hz + out];
      if (face === "e") return [cx + hx + out, cz + along];
      return [cx - hx - out, cz + along];
    }
    if (style === "garage") {
      const [x, z] = front(0, 0.02);
      const wide = face === "e" || face === "w";
      const doorW = gap * 2 - 0.12;
      const doorH = h - 0.5;
      box(wide ? 0.22 : doorW + 0.16, 0.28, wide ? doorW + 0.16 : 0.22, garageWall, x, y0 + h - 0.16, z);
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(wide ? 0.07 : doorW, doorH, wide ? doorW : 0.07),
        floorWood,
      );
      panel.position.set(x, y0 + doorH / 2, z);
      panel.castShadow = true;
      scene.add(panel);
      doors.push({
        garage: true,
        panel,
        closedY: y0 + doorH / 2,
        openY: y0 + h - 0.15,
        ajar: false,
        plot: plotId,
        at: new THREE.Vector3(x, 0, z),
      });
    }
    if (style === "attic") {
      const loft = box(w - 0.4, 0.1, d - 0.4, floorWood, cx, y0 + h * 0.5, cz);
      if (plotId && loft) roofs.push({ plot: plotId, mesh: loft });
      const [x, z] = front(0, 0.15);
      const wide = face === "e" || face === "w";
      box(wide ? 0.08 : w * 0.7, 0.08, wide ? w * 0.7 : 0.08, villaTrim, x, y0 + h * 0.52, z);
    }
    if (style !== "garage") {
      const [lx, lz] = front(0, 0);
      const wide = face === "e" || face === "w";
      const openW = gap * 2;
      const header = h - 2.22;
      if (header > 0.15) box(wide ? 0.2 : openW, header, wide ? openW : 0.2, wall, lx, y0 + 2.22 + header / 2, lz);
    }
    if (style === "villa") {
      for (const side of [-1.55, 1.55]) {
        const [x, z] = front(side, 0.7);
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, h * 0.78, 12), villaTrim);
        column.position.set(x, y0 + h * 0.4, z);
        column.castShadow = true;
        scene.add(column);
      }
      const [lx, lz] = front(0, 0.7);
      const wide = face === "e" || face === "w";
      box(wide ? 0.7 : 3.6, 0.16, wide ? 3.6 : 0.7, villaTrim, lx, y0 + h * 0.82, lz);
      const cap = box(w + 0.2, 0.22, d + 0.2, roofTile, cx, y0 + h + 0.32, cz);
      if (plotId && cap) roofs.push({ plot: plotId, mesh: cap });
    }
    if (style !== "garage") {
      const ww = style === "villa" ? 1.05 : 0.86;
      const wh = style === "villa" ? 1.28 : 1.05;
      function pane(x, y, z, yaw, lit) {
        const nearDoor =
          (face === "s" && z < cz - hz + 0.25 && Math.abs(x - cx) < gap + 0.2) ||
          (face === "n" && z > cz + hz - 0.25 && Math.abs(x - cx) < gap + 0.2) ||
          (face === "e" && x > cx + hx - 0.25 && Math.abs(z - cz) < gap + 0.2) ||
          (face === "w" && x < cx - hx + 0.25 && Math.abs(z - cz) < gap + 0.2);
        if (nearDoor && y < y0 + 2.5) return;
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.rotation.y = yaw;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, 0.06), sash);
        const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(ww * 0.86, wh * 0.84), lit ? winLit : winDay);
        glassPane.position.z = 0.02;
        const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.045, wh * 0.8, 0.04), sash);
        const mullionH = new THREE.Mesh(new THREE.BoxGeometry(ww * 0.8, 0.045, 0.04), sash);
        mullionV.position.z = 0.03;
        mullionH.position.z = 0.03;
        const sill = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.12, 0.07, 0.14), sash);
        sill.position.set(0, -wh * 0.5, 0.04);
        group.add(frame, glassPane, mullionV, mullionH, sill);
        scene.add(group);
        const inner = group.clone();
        if (Math.abs(yaw) < 0.2) inner.position.z -= 0.26;
        else if (Math.abs(Math.abs(yaw) - Math.PI) < 0.2) inner.position.z += 0.26;
        else if (yaw > 0) inner.position.x -= 0.26;
        else inner.position.x += 0.26;
        scene.add(inner);
      }
      const rows = style === "attic" ? [y0 + 1.7, y0 + h * 0.68] : [y0 + 1.72];
      rows.forEach((y, row) => {
        const lit = row === 0;
        for (const ax of [-w * 0.28, w * 0.28]) {
          pane(cx + ax, y, cz - hz - 0.1, Math.PI, lit);
          pane(cx + ax, y, cz + hz + 0.1, 0, !lit);
        }
        for (const az of [-d * 0.22, d * 0.22]) {
          pane(cx - hx - 0.1, y, cz + az, -Math.PI / 2, lit);
          pane(cx + hx + 0.1, y, cz + az, Math.PI / 2, !lit);
        }
      });
      if (style !== "house") {
        const [x, z] = front(0, 0.12);
        const yaw = face === "s" ? Math.PI : face === "n" ? 0 : face === "e" ? Math.PI / 2 : -Math.PI / 2;
        pane(x, y0 + h * 0.72, z, yaw, true);
      }
    }
    const lastDoor = doors[doors.length - 1];
    if (lastDoor && lastDoor.plot === plotId && !lastDoor.block) {
      const leaf = face === "s"
        ? addBlock(cx - gap + 0.05, cx + gap - 0.05, cz - hz - 0.12, cz - hz + 0.12)
        : face === "n"
          ? addBlock(cx - gap + 0.05, cx + gap - 0.05, cz + hz - 0.12, cz + hz + 0.12)
          : face === "e"
            ? addBlock(cx + hx - 0.12, cx + hx + 0.12, cz - gap + 0.05, cz + gap - 0.05)
            : addBlock(cx - hx - 0.12, cx - hx + 0.12, cz - gap + 0.05, cz + gap - 0.05);
      lastDoor.block = leaf;
    }
  }

  function plaque(text, x, y, z, yaw, w, h, bg, fg) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const g = canvas.getContext("2d");
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = fg;
    g.font = "700 62px Georgia, Times New Roman, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 256, 66);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42 }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    scene.add(mesh);
  }

  function paintTiles(colors) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    g.fillStyle = colors[1];
    g.fillRect(0, 0, 128, 256);
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      const shift = row % 2 ? 20 : 0;
      g.fillStyle = colors[row % 2];
      for (let col = -1; col < 5; col++) {
        g.beginPath();
        g.arc(col * 36 + shift + 18, y + 22, 18, Math.PI, 0);
        g.fill();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 2);
    return tex;
  }

  function wallCloth(base, fleck) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const g = canvas.getContext("2d");
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 320; i++) {
      g.fillStyle = i % 3 ? fleck : "rgba(255,255,255,0.2)";
      g.fillRect((i * 17) % 128, (i * 29) % 128, 3, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78 });
  }

  function palazzo(cx, cz, yaw, kind) {
    const group = new THREE.Group();
    group.position.set(cx, groundAt(cx, cz), cz);
    group.rotation.y = yaw;
    scene.add(group);
    const hw = 6.5;
    const hd = 4.7;
    const wallH = 6.15;
    const bank = kind === "bank";
    const plasterMat = wallCloth(bank ? "#e4dccb" : "#f4f1ea", bank ? "#cfc4b2" : "#e7d9cc");
    const baseMat = mat(bank ? 0xcbbfa8 : 0xb7c3c8, { roughness: 0.62 });
    const trimMat = mat(bank ? 0x8d7348 : 0x2c343c, { roughness: 0.4, metalness: bank ? 0.35 : 0.2 });
    const darkMat = mat(0x2a2622, { roughness: 0.5 });
    const tile = paintTiles(bank ? ["#b84c34", "#c85a40", "#a3412c"] : ["#3d4650", "#4a5560", "#2e363e"]);
    const roofMat = new THREE.MeshStandardMaterial({ map: tile, color: 0xffffff, roughness: 0.7 });
    const winMat = new THREE.MeshStandardMaterial({
      color: bank ? 0xd5e6f2 : 0xc5d7e4,
      emissive: 0xffe2b0,
      emissiveIntensity: 0.18,
      roughness: 0.16,
      metalness: 0.08,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    function piece(w, h, d, material, x, y, z) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    }
    function toWorld(x, z) {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      return [cx + x * c + z * s, cz - x * s + z * c];
    }
    function blockLocal(x0, x1, z0, z1) {
      const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => toWorld(x, z));
      const xs = pts.map((p) => p[0]);
      const zs = pts.map((p) => p[1]);
      addBlock(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs));
    }
    piece(hw * 2 + 1.1, 0.12, hd * 2 + 1.4, mat(0xd9d0c2, { roughness: 0.8 }), 0, 0.08, 0);
    const doorW = 0.95;
    piece(hw * 2, wallH, 0.24, plasterMat, 0, 0.55 + wallH / 2, hd);
    piece(0.24, wallH, hd * 2, plasterMat, -hw, 0.55 + wallH / 2, 0);
    piece(0.24, wallH, hd * 2, plasterMat, hw, 0.55 + wallH / 2, 0);
    piece(hw - doorW, wallH, 0.24, plasterMat, -(hw + doorW) / 2, 0.55 + wallH / 2, -hd);
    piece(hw - doorW, wallH, 0.24, plasterMat, (hw + doorW) / 2, 0.55 + wallH / 2, -hd);
    piece(doorW * 2, wallH - 2.4, 0.24, plasterMat, 0, 2.4 + (wallH - 2.4) / 2, -hd);
    piece(hw - doorW, 0.72, 0.32, baseMat, -(hw + doorW) / 2, 0.46, -hd);
    piece(hw - doorW, 0.72, 0.32, baseMat, (hw + doorW) / 2, 0.46, -hd);
    piece(0.32, 0.72, hd * 2, baseMat, -hw, 0.46, 0);
    piece(0.32, 0.72, hd * 2, baseMat, hw, 0.46, 0);
    piece(hw * 2 + 0.28, 0.72, 0.32, baseMat, 0, 0.46, hd);
    piece(hw * 2 + 0.16, 0.16, 0.2, trimMat, 0, 3.15, -hd - 0.08);
    const edge = new THREE.CylinderGeometry(0.18, 0.2, wallH, 14);
    for (const sx of [-hw, hw]) {
      for (const sz of [-hd, hd]) {
        const post = new THREE.Mesh(edge, plasterMat);
        post.position.set(sx, 0.55 + wallH / 2, sz);
        post.castShadow = true;
        group.add(post);
      }
    }
    piece(hw * 2 + 0.5, 0.22, hd * 2 + 0.7, trimMat, 0, wallH + 0.55, 0.1);
    const path = piece(3.2, 0.06, 7.2, mat(0xe4ddd0, { roughness: 0.84 }), 0, 0.05, -hd - 3.3);
    path.receiveShadow = true;

    function windowAt(x, y, z, rotY, tall) {
      const frame = new THREE.Group();
      frame.position.set(x, y, z);
      frame.rotation.y = rotY;
      const gh = tall ? 1.55 : 1.15;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.78, gh), winMat);
      frame.add(pane);
      const inner = pane.clone();
      inner.position.z = -0.42;
      inner.rotation.y = Math.PI;
      frame.add(inner);
      if (tall) {
        const arch = new THREE.Mesh(new THREE.CircleGeometry(0.39, 18, 0, Math.PI), winMat);
        arch.position.y = gh / 2;
        frame.add(arch);
      }
      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.07, 0.1), baseMat);
      sill.position.y = -gh / 2 - 0.02;
      frame.add(sill);
      for (const side of [-0.42, 0.42]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, gh + 0.15, 0.07), darkMat);
        bar.position.set(side, 0.04, 0);
        frame.add(bar);
      }
      group.add(frame);
    }
    for (const x of [-4.2, -2.5, 2.5, 4.2]) windowAt(x, 1.85, -hd - 0.2, Math.PI, true);
    for (const x of [-4.6, -2.7, -0.9, 0.9, 2.7, 4.6]) windowAt(x, 4.55, -hd - 0.2, Math.PI, false);
    for (const x of [-4.2, -2.1, 0, 2.1, 4.2]) {
      windowAt(x, 1.9, hd + 0.2, 0, true);
      windowAt(x, 4.5, hd + 0.2, 0, false);
    }
    for (const z of [-2.2, 0, 2.2]) {
      windowAt(-hw - 0.2, 1.9, z, Math.PI / 2, true);
      windowAt(hw + 0.2, 1.9, z, -Math.PI / 2, true);
      windowAt(-hw - 0.2, 4.5, z, Math.PI / 2, false);
      windowAt(hw + 0.2, 4.5, z, -Math.PI / 2, false);
    }

    if (bank) {
      const columnGeo = new THREE.CylinderGeometry(0.22, 0.26, 3.15, 14);
      for (const x of [-2.15, -0.75, 0.75, 2.15]) {
        const column = new THREE.Mesh(columnGeo, plasterMat);
        column.position.set(x, 1.7, -hd - 0.85);
        column.castShadow = true;
        group.add(column);
      }
      piece(6.2, 0.28, 0.7, plasterMat, 0, 3.35, -hd - 0.85);
      const tri = new THREE.Shape();
      tri.moveTo(-3.2, 0);
      tri.lineTo(3.2, 0);
      tri.lineTo(0, 1.15);
      const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.46, bevelEnabled: false }), plasterMat);
      ped.position.set(-0, 3.48, -hd - 1.1);
      ped.castShadow = true;
      group.add(ped);
      const gable = new THREE.Shape();
      gable.moveTo(-(hd + 0.4), 0);
      gable.lineTo(0, 2.15);
      gable.lineTo(hd + 0.4, 0);
      const roofGeo = new THREE.ExtrudeGeometry(gable, { depth: hw * 2 + 0.8, bevelEnabled: false });
      roofGeo.translate(0, 0, -(hw + 0.4));
      roofGeo.rotateY(Math.PI / 2);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(0, wallH + 0.62, 0.1);
      roof.castShadow = true;
      group.add(roof);
      for (let i = 0; i < 4; i++) piece(2.4, 0.1, 1.15, baseMat, 0, 0.08 + i * 0.08, -hd - 1.5 - i * 0.85);
    } else {
      piece(hw * 2 + 0.4, 0.35, 0.9, trimMat, 0, 3.35, -hd - 0.15);
      piece(hw * 2 - 0.4, 0.08, 0.12, mat(0x7fd4ff, { emissive: 0x3ec0ff, emissiveIntensity: 0.8, roughness: 0.2 }), 0, 3.05, -hd - 0.2);
      const gable = new THREE.Shape();
      gable.moveTo(-(hd + 0.2), 0);
      gable.lineTo(0, 1.15);
      gable.lineTo(hd + 0.2, 0);
      const roofGeo = new THREE.ExtrudeGeometry(gable, { depth: hw * 2 + 0.5, bevelEnabled: false });
      roofGeo.translate(0, 0, -(hw + 0.25));
      roofGeo.rotateY(Math.PI / 2);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(0, wallH + 0.7, 0.1);
      roof.castShadow = true;
      group.add(roof);
      piece(hw * 2 + 0.3, 0.45, 0.4, plasterMat, 0, wallH + 1.95, 0);
      for (let i = 0; i < 3; i++) piece(3.4, 0.1, 1.3, baseMat, 0, 0.08 + i * 0.08, -hd - 1.35 - i * 0.95);
      for (const x of [-1.6, -0.55, 0.55, 1.6]) {
        piece(0.08, 0.42, 0.22, darkMat, x, 1.15, -hd + 0.55);
        piece(0.03, 0.3, 0.14, mat(0xd7ecff, { emissive: 0x8ec8ff, emissiveIntensity: 0.45 }), x, 1.16, -hd + 0.42);
      }
    }

    const signY = bank ? 3.72 : 3.32;
    const signZ = bank ? -hd - 1.35 : -hd - 0.62;
    const board = document.createElement("canvas");
    board.width = 512;
    board.height = 128;
    const bg = board.getContext("2d");
    bg.fillStyle = bank ? "#f7f2ea" : "#1c2833";
    bg.fillRect(0, 0, 512, 128);
    bg.fillStyle = bank ? "#2a241c" : "#e9f6ff";
    bg.font = "700 64px Georgia, Times New Roman, serif";
    bg.textAlign = "center";
    bg.textBaseline = "middle";
    bg.fillText(bank ? "BANK" : "ELECTRONICS", 256, 66);
    const signTex = new THREE.CanvasTexture(board);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(bank ? 2.4 : 4.2, 0.55),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.45 }),
    );
    sign.position.set(0, signY, signZ);
    sign.rotation.y = Math.PI;
    group.add(sign);

    piece(2.2, 0.95, 0.7, mat(0xf6f1e8, { roughness: 0.4 }), 0, 0.6, 1.4);
    piece(2.05, 0.72, 0.55, darkMat, 0, 0.5, 1.55);
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.07, 16),
      mat(bank ? 0xc6a15a : 0x8ec8ff, { metalness: 0.62, roughness: 0.28, emissive: bank ? 0x6a4a18 : 0x1a3a55, emissiveIntensity: 0.35 }),
    );
    bell.position.set(0.72, 1.14, 1.05);
    group.add(bell);
    const lamp = new THREE.PointLight(bank ? 0xffe0b0 : 0xd7ecff, 7, 14, 2);
    lamp.position.set(0, 3.4, 0);
    addLiteLight(group, lamp);

    blockLocal(-hw, hw, hd - 0.2, hd + 0.2);
    blockLocal(-hw - 0.2, -hw + 0.2, -hd, hd);
    blockLocal(hw - 0.2, hw + 0.2, -hd, hd);
    blockLocal(-hw, -doorW, -hd - 0.2, -hd + 0.2);
    blockLocal(doorW, hw, -hd - 0.2, -hd + 0.2);
    const doorWood = mat(0x6b4630, { roughness: 0.5 });
    const knobMat = mat(0xe8d7a2, { metalness: 0.7, roughness: 0.28 });
    const leafW = doorW + 0.06;
    const doorH = 2.4;
    function swingDoor(side) {
      const pivot = new THREE.Group();
      pivot.position.set(side * doorW, 0, -hd - 0.12);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(leafW, doorH, 0.08), doorWood);
      slab.position.set(side < 0 ? leafW / 2 : -leafW / 2, doorH / 2, 0);
      slab.castShadow = true;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), knobMat);
      knob.position.set(side < 0 ? leafW * 0.78 : -leafW * 0.78, 1.05, 0.045);
      pivot.add(slab, knob);
      group.add(pivot);
      return pivot;
    }
    const [dx, dz] = toWorld(0, -hd);
    const doorAt = new THREE.Vector3(dx, 0, dz);
    doors.push({ pivot: swingDoor(-1), base: 0, open: -1.5, at: doorAt });
    doors.push({ pivot: swingDoor(1), base: 0, open: 1.5, at: doorAt });
  }

  palazzo(-34, 18.2, 0, "bank");
  palazzo(34, -18.2, Math.PI, "shop");

  const hallDoor = new THREE.Vector3(0, 0, 51.35);
  hinge(-1.15, 50.92, 0, 1.7, hallDoor, 1.12);
  hinge(1.15, 50.92, Math.PI, -1.7, hallDoor, 1.12);
  for (const door of doors.slice(-2)) door.pivot.position.y = 0.18;
  box(1.5, 0.92, 0.5, wood, 2.3, 0.55, 52.7);
  sign("COMUNE", 2.3, 1.55, 52.35, Math.PI);

  const plots = [];
  for (const street of ["e", "w"]) {
    for (const side of ["n", "s"]) {
      for (let i = 0; i < 3; i++) {
        const x = (street === "e" ? 42 : -42) + (street === "e" ? 1 : -1) * i * 10;
        const z = side === "n" ? 9.8 : -9.8;
        plots.push({ id: `${street}${side}${i}`, x, z, side, street });
      }
    }
  }
  function lot(id, x, z, side) {
    plots.push({ id, x, z, side, street: "x" });
  }
  [-56, -44, -32, -20].forEach((x, i) => lot(`nN${i}`, x, 80, "n"));
  [-56, -44, -32, -20, 28, 40].forEach((x, i) => lot(`nS${i}`, x, 60, "s"));
  [-64, -52, -40, -28, -16, -4].forEach((x, i) => {
    lot(`sN${i}`, x, -36, "n");
    lot(`sS${i}`, x, -56, "s");
  });

  function padMesh(plot) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 24),
      new THREE.MeshStandardMaterial({ color: 0xf2efe4, emissive: 0x8d7a42, emissiveIntensity: 0.15, roughness: 0.8 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    const dir = plot.side === "n" ? -1 : 1;
    mesh.position.set(plot.x, 0.08, plot.z + dir * 5.65);
    mesh.userData.plot = plot.id;
    scene.add(mesh);
    pads.push(mesh);
  }
  for (const plot of plots) padMesh(plot);

  const FURN = [
    { id: "divano", price: 80 }, { id: "tappeto", price: 40 }, { id: "tavolo", price: 60 },
    { id: "sedia", price: 25 }, { id: "tv", price: 120 }, { id: "computer", price: 140 },
    { id: "letto", price: 150 }, { id: "lettino", price: 90 }, { id: "forno", price: 70 },
    { id: "ripiani", price: 45 }, { id: "frigo", price: 100 }, { id: "microonde", price: 55 },
    { id: "lavatrice", price: 85 }, { id: "lavastoviglie", price: 85 },
    { id: "luce1", price: 30 }, { id: "luce2", price: 30 }, { id: "luce3", price: 30 },
    { id: "luce4", price: 30 }, { id: "luce5", price: 30 },
    { id: "quadro1", price: 35 }, { id: "quadro2", price: 35 }, { id: "quadro3", price: 35 },
    { id: "quadro4", price: 35 }, { id: "quadro5", price: 35 },
    { id: "scrivania", price: 70 }, { id: "sediaScr", price: 40 }, { id: "armadio", price: 110 },
    { id: "doccia", price: 95 }, { id: "bidet", price: 40 }, { id: "water", price: 40 },
    { id: "lavandino", price: 50 }, { id: "porta", price: 60 },
  ];
  const FURN_IDS = new Set(FURN.map((item) => item.id));
  const FURN_KEY = "zv-furn";
  let furnSave = loadJson(FURN_KEY, {});
  if (!furnSave || typeof furnSave !== "object") furnSave = {};
  const homes = [];
  let lifting = null;
  let decorHome = null;
  let decorPick = null;
  let decorTint = "#ffffff";
  let decorTurn = 0;
  let decorSelected = null;
  let pendingKey = false;
  const furnCloth = mat(0x6d3a48, { roughness: 0.82 });
  const furnSteel = mat(0xd5dbe2, { metalness: 0.62, roughness: 0.3 });
  const furnDark = mat(0x2a2e32, { metalness: 0.3, roughness: 0.45 });
  const furnLinen = mat(0xf6f1e8, { roughness: 0.82 });
  const furnCeramic = mat(0xf7f7f5, { roughness: 0.28 });
  const furnScreen = new THREE.MeshStandardMaterial({ color: 0x102028, emissive: 0x3d8eb0, emissiveIntensity: 0.45, roughness: 0.2 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0xfff6e8, transparent: true, opacity: 0.38, roughness: 1, depthWrite: false });
  const padHot = new THREE.MeshStandardMaterial({ color: 0xf0c14a, transparent: true, opacity: 0.78, emissive: 0xc48a2a, emissiveIntensity: 0.35, roughness: 0.45, depthWrite: false });
  const padGeo = new THREE.PlaneGeometry(1.05, 0.9);

  function part(group, w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(softGeo(w, h, d, Math.min(0.09, Math.min(w, h, d) * 0.28)), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function artPlane(group, colors) {
    const tex = paintTex((g) => {
      g.fillStyle = "#f7f1e8";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = colors[0];
      g.fillRect(10, 10, 108, 108);
      g.fillStyle = colors[1];
      g.beginPath();
      g.arc(64, 78, 34, Math.PI, 0);
      g.fill();
      g.fillStyle = colors[2];
      g.fillRect(18, 78, 92, 30);
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.55), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    mesh.position.set(0, 0.85, 0);
    group.add(mesh);
    part(group, 0.78, 0.62, 0.04, furnDark, 0, 0.85, -0.03);
  }

  const oak = mapped(paintTex((g) => {
    g.fillStyle = "#c9a36a";
    g.fillRect(0, 0, 128, 128);
    for (let y = 4; y < 128; y += 8) {
      g.strokeStyle = y % 16 ? "#a67c42" : "#e6c48a";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(36, y + 3, 80, y - 3, 128, y + 1);
      g.stroke();
    }
  }), 1, 1, 0.58);
  const weave = mapped(paintTex((g) => {
    g.fillStyle = "#8d3b4a";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i += 4) {
      g.strokeStyle = i % 8 ? "rgba(255,255,255,0.14)" : "rgba(60,16,24,0.28)";
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 128);
      g.moveTo(0, i);
      g.lineTo(128, i);
      g.stroke();
    }
  }), 2, 2, 0.86);
  const rugTex = mapped(paintTex((g) => {
    g.fillStyle = "#6e2d3a";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#e2c27a";
    g.lineWidth = 6;
    g.strokeRect(8, 8, 112, 112);
    g.strokeRect(20, 20, 88, 88);
    g.fillStyle = "#f2d7a2";
    g.beginPath();
    g.arc(64, 64, 18, 0, Math.PI * 2);
    g.fill();
  }), 1, 1, 0.9);
  const chrome = mat(0xd5dbe2, { metalness: 0.82, roughness: 0.22 });
  const tile = mapped(paintTex((g) => {
    g.fillStyle = "#f4f7f8";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#c5d0d6";
    g.lineWidth = 3;
    for (let i = 0; i <= 128; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 128);
      g.moveTo(0, i);
      g.lineTo(128, i);
      g.stroke();
    }
  }), 1, 1, 0.32);
  const mattress = mapped(paintTex((g) => {
    g.fillStyle = "#f7f4ee";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#e4ddd0";
    g.lineWidth = 2;
    for (let y = 8; y < 128; y += 10) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(128, y);
      g.stroke();
    }
  }), 1, 1, 0.84);

  function ownMats(group) {
    group.traverse((obj) => {
      if (!obj.isMesh || !obj.material || obj.userData.noTint) return;
      obj.material = obj.material.clone();
      obj.userData.tintable = true;
    });
  }

  function applyTint(group, tint) {
    const color = new THREE.Color(tint || "#ffffff");
    group.traverse((obj) => {
      if (!obj.isMesh || !obj.userData.tintable) return;
      obj.material.color.copy(color);
    });
  }

  function makeFurn(id, tint) {
    const group = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({ color: 0xd7eef8, transparent: true, opacity: 0.38, roughness: 0.06 });
    if (id === "divano") {
      part(group, 1.15, 0.16, 0.62, oak, 0, 0.16, 0);
      part(group, 1.05, 0.16, 0.5, weave, 0, 0.3, 0.02);
      part(group, 1.05, 0.42, 0.1, weave, 0, 0.52, -0.24);
      part(group, 0.1, 0.28, 0.5, weave, -0.52, 0.36, 0.02);
      part(group, 0.1, 0.28, 0.5, weave, 0.52, 0.36, 0.02);
      part(group, 0.28, 0.08, 0.22, furnLinen, -0.28, 0.4, 0.04);
      part(group, 0.28, 0.08, 0.22, furnLinen, 0.28, 0.4, 0.04);
    } else if (id === "tappeto") {
      part(group, 1.2, 0.025, 0.9, rugTex, 0, 0.03, 0);
    } else if (id === "tavolo" || id === "scrivania") {
      const w = id === "scrivania" ? 1.05 : 1.1;
      part(group, w, 0.06, 0.62, oak, 0, 0.74, 0);
      part(group, w - 0.08, 0.04, 0.5, oak, 0, 0.68, 0);
      for (const x of [-0.42, 0.42]) {
        for (const z of [-0.22, 0.22]) part(group, 0.06, 0.7, 0.06, oak, x, 0.36, z);
      }
    } else if (id === "sedia" || id === "sediaScr") {
      part(group, 0.42, 0.05, 0.42, weave, 0, 0.46, 0);
      part(group, 0.4, 0.36, 0.05, id === "sediaScr" ? furnDark : weave, 0, 0.72, -0.18);
      for (const x of [-0.16, 0.16]) {
        for (const z of [-0.16, 0.16]) part(group, 0.04, 0.44, 0.04, oak, x, 0.22, z);
      }
    } else if (id === "tv") {
      part(group, 0.7, 0.08, 0.28, oak, 0, 0.28, 0);
      part(group, 0.08, 0.22, 0.08, furnDark, 0, 0.42, 0);
      part(group, 0.92, 0.54, 0.05, furnDark, 0, 0.78, 0);
      const screen = part(group, 0.8, 0.42, 0.02, furnScreen, 0, 0.78, 0.03);
      screen.userData.noTint = true;
    } else if (id === "computer") {
      part(group, 0.22, 0.04, 0.18, furnDark, 0, 0.5, 0);
      part(group, 0.06, 0.16, 0.06, furnDark, 0, 0.6, -0.02);
      part(group, 0.52, 0.34, 0.04, furnDark, 0, 0.82, -0.04);
      const screen = part(group, 0.44, 0.26, 0.015, furnScreen, 0, 0.82, -0.015);
      screen.userData.noTint = true;
      part(group, 0.46, 0.02, 0.16, furnDark, 0, 0.48, 0.12);
    } else if (id === "letto" || id === "lettino") {
      const w = id === "letto" ? 1.15 : 0.78;
      part(group, w, 0.12, 1.7, oak, 0, 0.18, 0);
      part(group, w - 0.08, 0.04, 1.62, oak, 0, 0.26, 0);
      part(group, w + 0.04, 0.28, 0.06, oak, 0, 0.36, -0.82);
      part(group, w - 0.12, 0.12, 1.35, mattress, 0, 0.34, 0.06);
      part(group, w - 0.28, 0.08, 0.32, furnLinen, 0, 0.44, -0.55);
      part(group, w - 0.2, 0.04, 0.7, weave, 0, 0.42, 0.28);
    } else if (id === "forno") {
      part(group, 0.62, 0.7, 0.58, furnDark, 0, 0.4, 0);
      part(group, 0.62, 0.04, 0.58, chrome, 0, 0.76, 0);
      for (const x of [-0.16, 0.16]) {
        for (const z of [-0.12, 0.12]) part(group, 0.1, 0.02, 0.1, furnDark, x, 0.79, z);
      }
      const door = part(group, 0.46, 0.36, 0.02, furnScreen, 0, 0.42, 0.29);
      door.userData.noTint = true;
      part(group, 0.16, 0.03, 0.03, chrome, 0, 0.22, 0.31);
    } else if (id === "microonde") {
      part(group, 0.5, 0.32, 0.38, furnSteel, 0, 0.72, 0);
      const door = part(group, 0.32, 0.22, 0.02, furnScreen, 0.04, 0.72, 0.2);
      door.userData.noTint = true;
      part(group, 0.04, 0.12, 0.03, furnDark, 0.22, 0.72, 0.2);
    } else if (id === "ripiani") {
      part(group, 0.08, 1.15, 0.32, oak, -0.36, 0.58, 0);
      part(group, 0.08, 1.15, 0.32, oak, 0.36, 0.58, 0);
      part(group, 0.72, 0.04, 0.3, oak, 0, 0.28, 0);
      part(group, 0.72, 0.04, 0.3, oak, 0, 0.62, 0);
      part(group, 0.72, 0.04, 0.3, oak, 0, 0.96, 0);
    } else if (id === "frigo") {
      part(group, 0.58, 1.35, 0.55, furnSteel, 0, 0.7, 0);
      part(group, 0.5, 0.02, 0.02, furnDark, 0, 0.85, 0.28);
      part(group, 0.03, 0.28, 0.03, furnDark, 0.22, 1.05, 0.28);
      part(group, 0.03, 0.18, 0.03, furnDark, 0.22, 0.5, 0.28);
    } else if (id === "lavatrice" || id === "lavastoviglie") {
      part(group, 0.58, 0.82, 0.55, furnSteel, 0, 0.44, 0);
      const porthole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), glass);
      porthole.rotation.x = Math.PI / 2;
      porthole.position.set(0, 0.42, 0.28);
      porthole.userData.noTint = true;
      group.add(porthole);
      part(group, 0.36, 0.03, 0.03, chrome, 0, 0.42, 0.3);
    } else if (id.startsWith("luce")) {
      const glow = mat(0xfff3d2, { emissive: 0xffc56a, emissiveIntensity: 0.8, roughness: 0.3 });
      part(group, 0.08, id === "luce2" ? 1.15 : 0.55, 0.08, furnDark, 0, 0.4, 0);
      part(group, id === "luce1" ? 0.42 : 0.26, 0.1, 0.26, weave, 0, id === "luce2" ? 1.05 : 0.72, 0);
      const bulb = part(group, 0.12, 0.06, 0.12, glow, 0, id === "luce2" ? 0.98 : 0.66, 0);
      bulb.userData.noTint = true;
      const lamp = new THREE.PointLight(0xffe2b0, 1.6, 5.5, 2);
      lamp.position.y = 0.95;
      addLiteLight(group, lamp);
    } else if (id.startsWith("quadro")) {
      const palette = {
        quadro1: ["#1d4e89", "#7ec8e3", "#e7d7b8"],
        quadro2: ["#6ea84a", "#f2d15a", "#3f7a32"],
        quadro3: ["#1c2438", "#f4f1ea", "#31425f"],
        quadro4: ["#c45a3a", "#e2b43a", "#6a8f3a"],
        quadro5: ["#8d7348", "#d7c4b0", "#4e555c"],
      };
      artPlane(group, palette[id] || palette.quadro1);
      part(group, 0.84, 0.04, 0.06, oak, 0, 0.52, 0);
    } else if (id === "armadio") {
      part(group, 0.9, 0.08, 0.46, oak, 0, 0.08, 0);
      part(group, 0.86, 1.35, 0.4, oak, 0, 0.78, 0);
      part(group, 0.02, 1.2, 0.02, furnDark, 0, 0.78, 0.21);
      part(group, 0.04, 0.08, 0.04, chrome, -0.08, 0.78, 0.22);
      part(group, 0.04, 0.08, 0.04, chrome, 0.08, 0.78, 0.22);
    } else if (id === "doccia") {
      part(group, 0.85, 0.08, 0.85, tile, 0, 0.05, 0);
      part(group, 0.85, 1.7, 0.06, tile, 0, 0.9, -0.4);
      const pane = part(group, 0.04, 1.45, 0.7, glass, -0.4, 0.85, 0.02);
      pane.userData.noTint = true;
      part(group, 0.04, 1.35, 0.04, chrome, 0.1, 1.15, -0.32);
      part(group, 0.18, 0.04, 0.18, chrome, 0.1, 1.55, -0.28);
      part(group, 0.06, 0.06, 0.06, chrome, 0.18, 1.15, -0.28);
    } else if (id === "water") {
      part(group, 0.38, 0.28, 0.5, furnCeramic, 0, 0.28, 0);
      part(group, 0.28, 0.08, 0.28, tile, 0, 0.44, 0.02);
      part(group, 0.36, 0.42, 0.08, furnCeramic, 0, 0.62, -0.2);
      part(group, 0.08, 0.22, 0.08, chrome, 0.1, 0.55, -0.16);
    } else if (id === "bidet") {
      part(group, 0.38, 0.28, 0.52, furnCeramic, 0, 0.28, 0);
      part(group, 0.22, 0.06, 0.22, tile, 0, 0.44, 0);
      part(group, 0.04, 0.16, 0.04, chrome, 0, 0.52, -0.12);
    } else if (id === "lavandino") {
      part(group, 0.16, 0.7, 0.16, furnCeramic, 0, 0.36, 0);
      part(group, 0.55, 0.12, 0.4, furnCeramic, 0, 0.76, 0);
      part(group, 0.36, 0.06, 0.24, tile, 0, 0.82, 0);
      part(group, 0.04, 0.16, 0.04, chrome, 0, 0.92, -0.08);
      part(group, 0.1, 0.03, 0.04, chrome, 0, 1.0, 0.02);
    } else if (id === "porta") {
      part(group, 0.08, 1.9, 0.08, oak, -0.32, 0.95, 0);
      part(group, 0.08, 1.9, 0.08, oak, 0.32, 0.95, 0);
      part(group, 0.64, 0.08, 0.08, oak, 0, 1.86, 0);
      part(group, 0.58, 1.7, 0.05, oak, 0, 0.95, 0);
      part(group, 0.04, 0.1, 0.04, chrome, 0.18, 0.95, 0.04);
    } else {
      part(group, 0.5, 0.4, 0.5, oak, 0, 0.25, 0);
    }
    ownMats(group);
    if (tint && tint !== "#ffffff") applyTint(group, tint);
    return group;
  }

  function layoutOf(spec) {
    const inset = 0.2;
    const spanX = Math.max(1.6, spec.w - inset * 2);
    const spanZ = Math.max(1.6, spec.d - inset * 2);
    const cols = Math.max(2, Math.round(spanX / 1.05));
    const rows = Math.max(2, Math.round(spanZ / 1.05));
    return { cols, rows, cellX: spanX / cols, cellZ: spanZ / rows, spanX, spanZ };
  }

  function cellPos(home, c, r) {
    const { cellX, cellZ, cols, rows } = layoutOf(home.spec);
    const x0 = home.plot.x - ((cols - 1) * cellX) / 2;
    const z0 = home.plot.z - ((rows - 1) * cellZ) / 2;
    return { x: x0 + c * cellX, z: z0 + r * cellZ };
  }

  function pieceYaw(home, turn) {
    const base = home.plot.side === "s" ? Math.PI : 0;
    return base + (Number(turn) || 0) * (Math.PI / 2);
  }

  function halfExtent(id, turn) {
    const known = {
      divano: [0.6, 0.36],
      tappeto: [0.62, 0.48],
      tavolo: [0.58, 0.34],
      scrivania: [0.55, 0.34],
      sedia: [0.24, 0.24],
      sediaScr: [0.24, 0.24],
      tv: [0.48, 0.18],
      computer: [0.28, 0.16],
      letto: [0.62, 0.9],
      lettino: [0.42, 0.9],
      forno: [0.34, 0.32],
      microonde: [0.28, 0.22],
      ripiani: [0.4, 0.2],
      frigo: [0.32, 0.3],
      lavatrice: [0.32, 0.3],
      lavastoviglie: [0.32, 0.3],
      armadio: [0.48, 0.26],
      doccia: [0.46, 0.46],
      water: [0.22, 0.3],
      bidet: [0.22, 0.3],
      lavandino: [0.3, 0.24],
      porta: [0.36, 0.1],
    };
    let pair = known[id];
    if (!pair && id.startsWith("luce")) pair = [0.24, 0.16];
    if (!pair && id.startsWith("quadro")) pair = [0.44, 0.08];
    if (!pair) pair = [0.32, 0.32];
    return (Number(turn) || 0) % 2 ? [pair[1], pair[0]] : pair;
  }

  function clampPiece(home, id, x, z, turn) {
    const [hx, hz] = halfExtent(id, turn);
    const wall = 0.16;
    let minX = home.plot.x - home.spec.w / 2 + wall + hx;
    let maxX = home.plot.x + home.spec.w / 2 - wall - hx;
    let minZ = home.plot.z - home.spec.d / 2 + wall + hz;
    let maxZ = home.plot.z + home.spec.d / 2 - wall - hz;
    if (minX > maxX) minX = maxX = home.plot.x;
    if (minZ > maxZ) minZ = maxZ = home.plot.z;
    return {
      x: Math.min(maxX, Math.max(minX, x)),
      z: Math.min(maxZ, Math.max(minZ, z)),
    };
  }

  function overRoom(home, x, z) {
    return Math.abs(x - home.plot.x) < home.spec.w / 2 - 0.05 && Math.abs(z - home.plot.z) < home.spec.d / 2 - 0.05;
  }

  function saveFurn() {
    const data = {};
    for (const home of homes) data[home.plot.id] = home.pieces.map((piece) => ({ id: piece.id, c: piece.c, r: piece.r, x: piece.x, z: piece.z, tint: piece.tint || "#ffffff", turn: piece.turn || 0 }));
    furnSave = data;
    localStorage.setItem(FURN_KEY, JSON.stringify(data));
  }

  function occupado(home, c, r) {
    return home.pieces.some((piece) => piece !== lifting?.piece && piece.c === c && piece.r === r);
  }

  function bindPiece(home, id, c, r, tint, turn = 0, at) {
    const raw = at || cellPos(home, c, r);
    const pos = clampPiece(home, id, raw.x, raw.z, turn);
    const mesh = makeFurn(id, tint);
    const y = groundAt(pos.x, pos.z);
    mesh.position.set(pos.x, y, pos.z);
    mesh.rotation.y = pieceYaw(home, turn);
    scene.add(mesh);
    const piece = { id, c, r, tint: tint || "#ffffff", turn: Number(turn) || 0, mesh, x: pos.x, z: pos.z, circle: null };
    const slim = id === "tappeto" || id.startsWith("luce") || id.startsWith("quadro");
    if (!slim) {
      piece.circle = { x: pos.x, z: pos.z, radius: 0.34 };
      circles.push(piece.circle);
    }
    home.pieces.push(piece);
    return piece;
  }

  function nearestSquare(home) {
    const p = player.group.position;
    const { cols, rows } = layoutOf(home.spec);
    let best = null;
    let bestD = 6;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (occupado(home, c, r)) continue;
        const pos = cellPos(home, c, r);
        const d = Math.hypot(p.x - pos.x, p.z - pos.z);
        if (d < bestD) {
          bestD = d;
          best = { c, r, ...pos };
        }
      }
    }
    return best;
  }

  function homeHere() {
    const p = player.group.position;
    for (const home of homes) {
      if (Math.abs(p.x - home.plot.x) < home.spec.w * 0.46 && Math.abs(p.z - home.plot.z) < home.spec.d * 0.46) return home;
    }
    return null;
  }

  function nearestPiece(home) {
    const p = player.group.position;
    let best = null;
    let bestD = 1.15;
    for (const piece of home.pieces) {
      const d = Math.hypot(p.x - piece.x, p.z - piece.z);
      if (d < bestD) {
        bestD = d;
        best = piece;
      }
    }
    return best;
  }

  function cellUnder(home, x, z) {
    const { cols, rows, cellX, cellZ } = layoutOf(home.spec);
    let best = null;
    let bestD = Math.hypot(cellX, cellZ) * 0.5;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (occupado(home, c, r)) continue;
        const pos = cellPos(home, c, r);
        const d = Math.hypot(x - pos.x, z - pos.z);
        if (d < bestD) {
          bestD = d;
          best = { c, r };
        }
      }
    }
    return best;
  }

  function dropFurn(x, z) {
    if (dragBlockClick) {
      dragBlockClick = false;
      return false;
    }
    const home = decorHome || homeHere();
    if (!home) return false;
    const held = !decorHome && getHeld ? getHeld() : null;
    const id = decorHome ? decorPick : held && FURN_IDS.has(held.id) ? held.id : null;
    if (!id) return false;
    const cell = cellUnder(home, x, z);
    if (!cell) return false;
    if (!takeOne || !takeOne(id)) {
      toast(t("decorEmpty"));
      return false;
    }
    bindPiece(home, id, cell.c, cell.r, decorTint, decorTurn);
    saveFurn();
    if (decorHome) paintDecor();
    else toast(t("furnOk"));
    return true;
  }

  function placeHeld(id) {
    const home = homeHere();
    if (!home) {
      toast(t("furnOut"));
      return;
    }
    const cell = nearestSquare(home);
    if (!cell) {
      toast(t("furnBusy"));
      return;
    }
    if (!takeOne || !takeOne(id)) {
      toast(t("bagFull"));
      return;
    }
    bindPiece(home, id, cell.c, cell.r, "#ffffff", decorTurn);
    saveFurn();
    toast(t("furnOk"));
  }

  function beginMove() {
    const home = homeHere();
    if (!home || lifting) return;
    const piece = nearestPiece(home);
    if (!piece) return;
    if (piece.circle) {
      const index = circles.indexOf(piece.circle);
      if (index >= 0) circles.splice(index, 1);
      piece.circle = null;
    }
    lifting = { home, piece };
  }

  function dropMove() {
    if (!lifting) return;
    const home = homeHere();
    if (!home) {
      toast(t("furnOut"));
      return;
    }
    const cell = nearestSquare(home);
    if (!cell) {
      toast(t("furnBusy"));
      return;
    }
    const spot = cellPos(home, cell.c, cell.r);
    const pos = clampPiece(home, lifting.piece.id, spot.x, spot.z, lifting.piece.turn);
    const piece = lifting.piece;
    if (home !== lifting.home) {
      lifting.home.pieces = lifting.home.pieces.filter((item) => item !== piece);
      home.pieces.push(piece);
    }
    piece.c = cell.c;
    piece.r = cell.r;
    piece.x = pos.x;
    piece.z = pos.z;
    piece.mesh.position.set(pos.x, groundAt(pos.x, pos.z), pos.z);
    piece.mesh.rotation.y = pieceYaw(home, piece.turn);
    const slim = piece.id === "tappeto" || piece.id.startsWith("luce") || piece.id.startsWith("quadro");
    if (!slim) {
      piece.circle = { x: pos.x, z: pos.z, radius: 0.34 };
      circles.push(piece.circle);
    }
    lifting = null;
    saveFurn();
    toast(t("furnOk"));
  }

  function usePiece(piece) {
    const y = groundAt(piece.x, piece.z);
    if (piece.id === "doccia" || piece.id === "lavandino" || piece.id === "bidet" || piece.id === "water") {
      pose = "shower";
      poseT = 0;
      seat = { x: piece.x, z: piece.z + 0.45, y };
      return;
    }
    if (piece.id === "letto" || piece.id === "lettino") {
      pose = "sleep";
      poseT = 0;
      seat = { x: piece.x, z: piece.z, y: y + 0.35, yaw: player.group.rotation.y };
      return;
    }
    if (piece.id === "sedia" || piece.id === "sediaScr" || piece.id === "divano") {
      pose = "sit";
      poseT = 0;
      seat = { x: piece.x, z: piece.z + 0.12, y };
    }
  }

  const decorEl = document.getElementById("decor");
  const decorBtn = document.getElementById("decor-btn");
  const TINTS = ["#ffffff", "#c45a3a", "#1d4e89", "#2f6a3c", "#e2b43a", "#6b2d5b", "#1c1c1c", "#f4f1ea"];

  const furnRay = new THREE.Raycaster();
  let furnDrag = null;
  let dragBlockClick = false;

  function floorAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    furnRay.setFromCamera(ndc, camera);
    const dir = furnRay.ray.direction;
    if (Math.abs(dir.y) < 0.02) return null;
    const y = decorHome ? groundAt(decorHome.plot.x, decorHome.plot.z) : 0.05;
    const dist = (y - furnRay.ray.origin.y) / dir.y;
    if (dist < 0) return null;
    return {
      x: furnRay.ray.origin.x + dir.x * dist,
      z: furnRay.ray.origin.z + dir.z * dist,
    };
  }

  function pieceUnder(clientX, clientY) {
    if (!decorHome) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    furnRay.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    let best = null;
    let bestD = Infinity;
    for (const piece of decorHome.pieces) {
      const hits = furnRay.intersectObject(piece.mesh, true);
      if (hits[0] && hits[0].distance < bestD) {
        bestD = hits[0].distance;
        best = piece;
      }
    }
    return best;
  }

  function nearestCell(home, x, z) {
    const { cols, rows } = layoutOf(home.spec);
    let best = { c: 0, r: 0 };
    let bestD = Infinity;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pos = cellPos(home, c, r);
        const d = Math.hypot(x - pos.x, z - pos.z);
        if (d < bestD) {
          bestD = d;
          best = { c, r };
        }
      }
    }
    return best;
  }

  function clearGhost(drag) {
    if (!drag?.ghost) return;
    drag.ghost.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        const list = Array.isArray(obj.material) ? obj.material : [obj.material];
        list.forEach((material) => material.dispose());
      }
    });
    drag.ghost.removeFromParent();
    drag.ghost = null;
  }

  function moveFurnDrag(e) {
    if (!furnDrag || e.pointerId !== furnDrag.pointerId || !decorHome) return;
    if (!furnDrag.moved && Math.hypot(e.clientX - furnDrag.sx, e.clientY - furnDrag.sy) < 8) return;
    furnDrag.moved = true;
    const hit = floorAt(e.clientX, e.clientY);
    if (!hit) return;
    furnDrag.raw = hit;
    const id = furnDrag.piece ? furnDrag.piece.id : furnDrag.id;
    const turn = furnDrag.piece ? furnDrag.piece.turn : decorTurn;
    const pos = clampPiece(decorHome, id, hit.x, hit.z, turn);
    furnDrag.at = pos;
    const mesh = furnDrag.piece ? furnDrag.piece.mesh : furnDrag.ghost;
    if (!mesh && furnDrag.id) {
      furnDrag.ghost = makeFurn(furnDrag.id, decorTint);
      furnDrag.ghost.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        obj.material = obj.material.clone();
        obj.material.transparent = true;
        obj.material.opacity = 0.72;
      });
      scene.add(furnDrag.ghost);
    }
    const shown = furnDrag.piece ? furnDrag.piece.mesh : furnDrag.ghost;
    if (!shown) return;
    shown.position.set(pos.x, groundAt(pos.x, pos.z), pos.z);
    shown.rotation.y = pieceYaw(decorHome, turn);
  }

  function endFurnDrag(e) {
    if (!furnDrag || (e && e.pointerId !== furnDrag.pointerId)) return;
    const drag = furnDrag;
    furnDrag = null;
    if (!drag.moved) {
      clearGhost(drag);
      if (drag.piece) paintDecor();
      return;
    }
    dragBlockClick = true;
    if (drag.piece && drag.at) {
      drag.piece.x = drag.at.x;
      drag.piece.z = drag.at.z;
      if (drag.piece.circle) {
        drag.piece.circle.x = drag.at.x;
        drag.piece.circle.z = drag.at.z;
      }
      const cell = nearestCell(decorHome, drag.at.x, drag.at.z);
      drag.piece.c = cell.c;
      drag.piece.r = cell.r;
      saveFurn();
      paintDecor();
      return;
    }
    clearGhost(drag);
    if (!decorHome || !drag.at || !drag.raw || !overRoom(decorHome, drag.raw.x, drag.raw.z)) return;
    if (!drag.id || !takeOne || !takeOne(drag.id)) {
      toast(t("decorEmpty"));
      return;
    }
    const cell = nearestCell(decorHome, drag.at.x, drag.at.z);
    bindPiece(decorHome, drag.id, cell.c, cell.r, decorTint, decorTurn, drag.at);
    saveFurn();
    paintDecor();
  }

  window.addEventListener("pointermove", moveFurnDrag);
  window.addEventListener("pointerup", endFurnDrag);
  window.addEventListener("pointercancel", endFurnDrag);
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (!decorHome || e.button !== 0) return;
    const piece = pieceUnder(e.clientX, e.clientY);
    if (!piece) return;
    furnDrag = { piece, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    decorSelected = piece;
    decorTurn = piece.turn || 0;
    decorPick = null;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });

  function bagFurn() {
    const rows = {};
    for (const slot of listBag()) {
      if (!slot || !FURN_IDS.has(slot.id)) continue;
      rows[slot.id] = (rows[slot.id] || 0) + slot.count;
    }
    return rows;
  }

  function paintDecor() {
    if (!decorEl || !decorHome) return;
    const { cols, rows } = layoutOf(decorHome.spec);
    decorEl.innerHTML = `<h2>${t("decorTitle")}</h2><p>${t("decorLead")}</p>`;
    const stock = document.createElement("div");
    stock.className = "decor-stock";
    const owned = bagFurn();
    const ids = Object.keys(owned);
    if (!ids.length) {
      const empty = document.createElement("p");
      empty.textContent = t("decorEmpty");
      stock.appendChild(empty);
    }
    for (const id of ids) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${t(`item.${id}`)} ×${owned[id]}`;
      btn.classList.toggle("on", decorPick === id);
      btn.addEventListener("pointerdown", (e) => {
        if (!decorHome || e.button !== 0) return;
        furnDrag = { id, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
        try { btn.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      });
      btn.addEventListener("click", () => {
        if (dragBlockClick) {
          dragBlockClick = false;
          return;
        }
        decorPick = id;
        decorSelected = null;
        paintDecor();
      });
      stock.appendChild(btn);
    }
    decorEl.appendChild(stock);
    const colors = document.createElement("div");
    colors.className = "decor-colors";
    for (const tint of TINTS) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "swatch";
      swatch.style.background = tint;
      swatch.classList.toggle("on", decorTint === tint);
      swatch.addEventListener("click", () => {
        decorTint = tint;
        if (decorSelected) {
          decorSelected.tint = tint;
          applyTint(decorSelected.mesh, tint);
          saveFurn();
        }
        paintDecor();
      });
      colors.appendChild(swatch);
    }
    decorEl.appendChild(colors);
    const turnBtn = document.createElement("button");
    turnBtn.type = "button";
    turnBtn.textContent = `${t("decorTurn")} ${decorTurn * 90}°`;
    turnBtn.addEventListener("click", () => {
      decorTurn = (decorTurn + 1) % 4;
      if (decorSelected && decorHome) {
        decorSelected.turn = decorTurn;
        const pos = clampPiece(decorHome, decorSelected.id, decorSelected.x, decorSelected.z, decorTurn);
        decorSelected.x = pos.x;
        decorSelected.z = pos.z;
        decorSelected.mesh.position.set(pos.x, groundAt(pos.x, pos.z), pos.z);
        decorSelected.mesh.rotation.y = pieceYaw(decorHome, decorTurn);
        if (decorSelected.circle) {
          decorSelected.circle.x = pos.x;
          decorSelected.circle.z = pos.z;
        }
        saveFurn();
      }
      paintDecor();
    });
    decorEl.appendChild(turnBtn);
    const grid = document.createElement("div");
    grid.className = "decor-grid";
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const piece = decorHome.pieces.find((item) => item.c === c && item.r === r);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.textContent = piece ? t(`item.${piece.id}`).slice(0, 6) : "";
        cell.classList.toggle("on", decorSelected === piece && !!piece);
        cell.addEventListener("click", () => decorTap(c, r));
        grid.appendChild(cell);
      }
    }
    decorEl.appendChild(grid);
    if (decorSelected) {
      const back = document.createElement("button");
      back.type = "button";
      back.textContent = t("decorTake");
      back.addEventListener("click", () => recallPiece(decorSelected));
      decorEl.appendChild(back);
    }
    const done = document.createElement("button");
    done.type = "button";
    done.textContent = t("decorDone");
    done.addEventListener("click", stopDecor);
    decorEl.appendChild(done);
  }

  function decorTap(c, r) {
    if (!decorHome) return;
    const piece = decorHome.pieces.find((item) => item.c === c && item.r === r);
    if (piece) {
      decorSelected = piece;
      decorPick = null;
      decorTurn = piece.turn || 0;
      paintDecor();
      return;
    }
    if (decorSelected) {
      const raw = cellPos(decorHome, c, r);
      const pos = clampPiece(decorHome, decorSelected.id, raw.x, raw.z, decorSelected.turn);
      decorSelected.c = c;
      decorSelected.r = r;
      decorSelected.x = pos.x;
      decorSelected.z = pos.z;
      decorSelected.mesh.position.set(pos.x, groundAt(pos.x, pos.z), pos.z);
      if (decorSelected.circle) {
        decorSelected.circle.x = pos.x;
        decorSelected.circle.z = pos.z;
      }
      saveFurn();
      paintDecor();
      return;
    }
    if (!decorPick || !takeOne || !takeOne(decorPick)) {
      toast(t("decorEmpty"));
      return;
    }
    bindPiece(decorHome, decorPick, c, r, decorTint, decorTurn);
    saveFurn();
    paintDecor();
  }

  function recallPiece(piece) {
    if (!decorHome || !piece) return;
    decorHome.pieces = decorHome.pieces.filter((item) => item !== piece);
    if (piece.circle) {
      const index = circles.indexOf(piece.circle);
      if (index >= 0) circles.splice(index, 1);
    }
    piece.mesh.removeFromParent();
    if (addToBag) addToBag(piece.id, t(`item.${piece.id}`), 1);
    decorSelected = null;
    saveFurn();
    paintDecor();
  }

  function startDecor() {
    const home = homeHere();
    if (!home) return;
    decorHome = home;
    decorPick = null;
    decorSelected = null;
    paintDecor();
    if (decorEl) decorEl.classList.remove("hidden");
  }

  function stopDecor() {
    decorHome = null;
    decorPick = null;
    decorSelected = null;
    if (decorEl) decorEl.classList.add("hidden");
  }

  if (decorBtn) decorBtn.addEventListener("click", startDecor);

  function spawnOwned(entry, kind) {
    const spec = (kind === "houses" ? HOUSES : GARAGES).find((s) => s.id === entry.type);
    const plot = plots.find((p) => p.id === entry.plot);
    if (!spec || !plot) return;
    const face = plot.side === "n" ? "s" : "n";
    hall(plot.x, plot.z, spec.w, spec.d, spec.h, face, spec, plot.id);
    if (kind !== "houses") return;
    const home = { plot, spec, pieces: [], pads: [] };
    const { cols, rows, cellX, cellZ } = layoutOf(spec);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pos = cellPos(home, c, r);
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.rotation.x = -Math.PI / 2;
        pad.scale.set((cellX / 1.05) * 0.98, (cellZ / 0.9) * 0.98, 1);
        pad.position.set(pos.x, groundAt(pos.x, pos.z) + 0.05, pos.z);
        pad.visible = false;
        pad.userData.cell = { c, r };
        scene.add(pad);
        home.pads.push(pad);
      }
    }
    homes.push(home);
    const saved = Array.isArray(furnSave[plot.id]) ? furnSave[plot.id] : [];
    for (const item of saved) {
      if (!FURN_IDS.has(item.id)) continue;
      if (item.c < 0 || item.r < 0 || item.c >= cols || item.r >= rows) continue;
      if (occupado(home, item.c, item.r)) continue;
      const at = Number.isFinite(item.x) && Number.isFinite(item.z) ? { x: item.x, z: item.z } : null;
      bindPiece(home, item.id, item.c, item.r, item.tint, item.turn || 0, at);
    }
  }
  for (const entry of estate.houses) spawnOwned(entry, "houses");
  for (const entry of estate.garages) spawnOwned(entry, "garages");

  function shellOf(x, z) {
    const lists = [[estate.houses, HOUSES], [estate.garages, GARAGES]];
    for (const [entries, specs] of lists) {
      for (const entry of entries) {
        if (!entry.plot) continue;
        const plot = plots.find((p) => p.id === entry.plot);
        const spec = specs.find((s) => s.id === entry.type);
        if (!plot || !spec) continue;
        if (Math.abs(x - plot.x) < spec.w * 0.42 && Math.abs(z - plot.z) < spec.d * 0.42) {
          const inset = 0.72;
          return {
            plot: plot.id,
            minX: plot.x - spec.w * 0.5 + inset,
            maxX: plot.x + spec.w * 0.5 - inset,
            minZ: plot.z - spec.d * 0.5 + inset,
            maxZ: plot.z + spec.d * 0.5 - inset,
          };
        }
      }
    }
    return null;
  }

  function ownsAny() {
    return estate.houses.length + estate.garages.length > 0;
  }

  function grantKey(announce) {
    if (!ownsAny() || !hasItem || !addToBag) return;
    if (hasItem("chiave")) {
      pendingKey = false;
      return;
    }
    if (!bagRoom("chiave", 1)) {
      pendingKey = true;
      if (announce) toast(t("bagFull"));
      return;
    }
    addToBag("chiave", t("item.chiave"), 1);
    pendingKey = false;
    if (announce) toast(t("keyGot"));
  }
  grantKey(false);

  function nearestOwnedDoor() {
    const p = player.group.position;
    let best = null;
    let bestD = 4.6;
    for (const door of doors) {
      if (!door.plot) continue;
      const mine = estate.houses.some((h) => h.plot === door.plot) || estate.garages.some((g) => g.plot === door.plot);
      if (!mine) continue;
      const d = Math.hypot(p.x - door.at.x, p.z - door.at.z);
      if (d < bestD) {
        bestD = d;
        best = door;
      }
    }
    return best;
  }

  const keyBtn = document.getElementById("key-btn");
  keyBtn.addEventListener("click", () => {
    if (!hasItem || !hasItem("chiave")) return;
    const door = nearestOwnedDoor();
    if (door) door.ajar = !door.ajar;
  });

  const flies = new THREE.Group();
  player.group.add(flies);
  flies.visible = false;
  const gnatBody = mat(0x161616, { roughness: 0.62 });
  const gnatWing = new THREE.MeshBasicMaterial({
    color: 0xe8eef2,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const gnatBodyGeo = new THREE.CapsuleGeometry(0.0028, 0.0055, 2, 5);
  const gnatHeadGeo = new THREE.SphereGeometry(0.0022, 5, 4);
  const gnatWingGeo = new THREE.PlaneGeometry(0.01, 0.0036);
  for (let i = 0; i < 12; i++) {
    const gnat = new THREE.Group();
    const body = new THREE.Mesh(gnatBodyGeo, gnatBody);
    body.rotation.z = Math.PI / 2;
    const head = new THREE.Mesh(gnatHeadGeo, gnatBody);
    head.position.x = 0.0048;
    const wingL = new THREE.Mesh(gnatWingGeo, gnatWing);
    const wingR = new THREE.Mesh(gnatWingGeo, gnatWing);
    wingL.position.set(-0.001, 0.0012, 0.0024);
    wingR.position.set(-0.001, 0.0012, -0.0024);
    gnat.add(body, head, wingL, wingR);
    gnat.userData = {
      a: Math.random() * Math.PI * 2,
      bob: 0.95 + Math.random() * 0.5,
      speed: 2.6 + Math.random() * 2.4,
      wingL,
      wingR,
    };
    flies.add(gnat);
  }
  const mistCanvas = document.createElement("canvas");
  mistCanvas.width = 64;
  mistCanvas.height = 64;
  const mg = mistCanvas.getContext("2d");
  const grad = mg.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, "rgba(150,170,70,0.45)");
  grad.addColorStop(1, "rgba(150,170,70,0)");
  mg.fillStyle = grad;
  mg.fillRect(0, 0, 64, 64);
  const mist = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mistCanvas), transparent: true, depthWrite: false }),
  );
  mist.visible = false;
  const wisps = [];
  for (let i = 0; i < 6; i++) {
    const wisp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: mist.material.map,
        color: 0x8fb83a,
        transparent: true,
        depthWrite: false,
        opacity: 0.4,
      }),
    );
    wisp.visible = false;
    wisp.scale.set(0.12, 0.12, 1);
    player.group.add(wisp);
    wisps.push(wisp);
  }

  const cig = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6), mat(0xf4f1ea));
  const pickaxe = new THREE.Group();
  const pickHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.42, 6), mat(0x8a5a32, { roughness: 0.7 }));
  pickHandle.rotation.z = Math.PI / 2;
  const pickMetal = mat(0xd5dbe2, { metalness: 0.74, roughness: 0.24 });
  const pickHead = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.055, 0.05), pickMetal);
  pickHead.position.set(0.2, 0, 0);
  const pickPoint = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.12, 6), pickMetal);
  pickPoint.rotation.z = -Math.PI / 2;
  pickPoint.position.set(0.32, 0, 0);
  const pickBack = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.1, 6), pickMetal);
  pickBack.rotation.z = Math.PI / 2;
  pickBack.position.set(0.08, 0, 0);
  pickaxe.add(pickHandle, pickHead, pickPoint, pickBack);
  pickaxe.scale.setScalar(1.55);
  pickaxe.visible = false;
  const rod = new THREE.Group();
  const rodWood = mat(0x6a4124, { roughness: 0.62 });
  const rodShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, 1.05, 6), rodWood);
  rodShaft.rotation.z = Math.PI / 2;
  rodShaft.position.x = 0.42;
  const rodTip = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.009, 0.48, 5), mat(0x2c2c2c, { metalness: 0.45, roughness: 0.35 }));
  rodTip.rotation.z = Math.PI / 2;
  rodTip.position.x = 1.05;
  const fishLine = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.72, 4), mat(0xf2f2f2));
  fishLine.position.set(1.28, -0.32, 0);
  const caughtFish = new THREE.Group();
  const fishBody = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mat(0xd8a24a, { roughness: 0.45 }));
  fishBody.scale.set(1.5, 0.62, 0.42);
  const fishTail = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.07, 4), mat(0xc4842a, { roughness: 0.5 }));
  fishTail.rotation.z = Math.PI / 2;
  fishTail.position.x = -0.09;
  caughtFish.add(fishBody, fishTail);
  caughtFish.position.set(1.28, -0.68, 0);
  caughtFish.visible = false;
  rod.add(rodShaft, rodTip, fishLine, caughtFish);
  rod.scale.setScalar(1.35);
  rod.visible = false;
  const gun = new THREE.Group();
  const slideTex = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    g.fillStyle = "#4a4e54";
    g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 2) {
      g.strokeStyle = y % 4 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.18)";
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(128, y + 1);
      g.stroke();
    }
    g.fillStyle = "#2e3136";
    for (let i = 0; i < 9; i++) g.fillRect(18, 188 + i * 7, 92, 3);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const gripTex = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    g.fillStyle = "#16181b";
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 520; i++) {
      g.fillStyle = i % 3 ? "#2a2d32" : "#0c0d0f";
      g.beginPath();
      g.arc((i * 19) % 128, (i * 31) % 256, 1.5, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const slideMat = new THREE.MeshStandardMaterial({ map: slideTex, color: 0xffffff, metalness: 0.72, roughness: 0.38 });
  const gripMat = new THREE.MeshStandardMaterial({ map: gripTex, color: 0xffffff, roughness: 0.82 });
  const gunDark = mat(0x1a1c1f, { roughness: 0.45, metalness: 0.35 });
  const slide = new THREE.Mesh(softGeo(0.038, 0.042, 0.168, 0.006), slideMat);
  slide.position.set(0, 0.02, 0.012);
  const gunGrip = new THREE.Mesh(softGeo(0.034, 0.078, 0.046, 0.008), gripMat);
  gunGrip.position.set(0, -0.03, -0.02);
  gunGrip.rotation.x = 0.28;
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 12, Math.PI), gunDark);
  guard.rotation.y = Math.PI / 2;
  guard.position.set(0, -0.006, 0.012);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 10), mat(0x2c2e32, { metalness: 0.84, roughness: 0.22 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, 0.1);
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.008), gunDark);
  frontSight.position.set(0, 0.046, 0.078);
  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.01, 0.012), gunDark);
  rearSight.position.set(0, 0.046, -0.05);
  const mag = new THREE.Mesh(softGeo(0.028, 0.02, 0.034, 0.004), gunDark);
  mag.position.set(0, -0.072, -0.028);
  const muzzleTip = new THREE.Object3D();
  muzzleTip.position.set(0, 0.012, 0.13);
  gun.add(slide, gunGrip, guard, barrel, frontSight, rearSight, mag, muzzleTip);
  gun.position.set(0.02, 0.08, 0.03);
  gun.rotation.set(0.2, 0.1, -1.2);
  gun.visible = false;
  let gunAim = false;
  cig.visible = false;
  let riding = false;
  let driving = false;
  let carSpeed = 0;
  let carSteer = 0;
  const car = new THREE.Group();
  const carPaintTex = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    const wash = g.createLinearGradient(0, 0, 0, 256);
    wash.addColorStop(0, "#e7f3f8");
    wash.addColorStop(0.16, "#8ec3d4");
    wash.addColorStop(0.42, "#4e93ab");
    wash.addColorStop(0.7, "#2f6d84");
    wash.addColorStop(1, "#1c4d60");
    g.fillStyle = wash;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "rgba(255,255,255,0.2)";
    g.fillRect(0, 16, 256, 18);
    g.strokeStyle = "rgba(6,14,18,0.65)";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(0, 176);
    g.lineTo(256, 176);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.14)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 166);
    g.lineTo(256, 166);
    g.stroke();
    for (let i = 0; i < 70; i++) {
      g.fillStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
      g.fillRect((i * 47) % 256, (i * 29) % 256, 2, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const carPaint = mat(0xffffff, { map: carPaintTex, roughness: 0.4, metalness: 0.28 });
  const carRoof = mat(0xe6e0d4, { roughness: 0.48, metalness: 0.08 });
  const carSkirt = mat(0x23262b, { roughness: 0.55, metalness: 0.25 });
  const carGlass = new THREE.MeshStandardMaterial({
    color: 0xb7d4e2,
    roughness: 0.06,
    metalness: 0.2,
    transparent: true,
    opacity: 0.42,
  });
  const carRubber = mat(0x17191c, { roughness: 0.9 });
  const carRim = mat(0xd5dbe2, { metalness: 0.72, roughness: 0.28 });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff8ea,
    emissive: 0xffe7b0,
    emissiveIntensity: 1.6,
    toneMapped: false,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff4a3a,
    emissive: 0xff2a22,
    emissiveIntensity: 0.55,
    toneMapped: false,
  });
  const carPad = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.04, 2.35), mat(0x3a4046, { roughness: 0.92 }));
  carPad.position.set(-18, 0.04, 64.2);
  carPad.receiveShadow = true;
  scene.add(carPad);
  function carPart(geo, material, x, y, z) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = material !== carGlass;
    car.add(mesh);
    return mesh;
  }
  carPart(softGeo(1.66, 0.5, 3.95, 0.08), carPaint, 0, 0.56, 0.02);
  carPart(softGeo(1.72, 0.12, 4.02, 0.04), carSkirt, 0, 0.28, 0.02);
  carPart(softGeo(1.5, 0.14, 1.22, 0.05), carPaint, 0, 0.82, 1.22);
  carPart(softGeo(1.5, 0.16, 0.92, 0.05), carPaint, 0, 0.86, -1.42);
  carPart(softGeo(0.08, 0.5, 1.55, 0.03), carPaint, -0.8, 1.02, 0.02);
  carPart(softGeo(0.08, 0.5, 1.55, 0.03), carPaint, 0.8, 1.02, 0.02);
  carPart(softGeo(1.5, 0.1, 1.85, 0.05), carRoof, 0, 1.68, -0.08);
  carPart(new THREE.BoxGeometry(1.42, 0.46, 0.04), carGlass, 0, 1.38, 0.72).rotation.x = -0.42;
  carPart(new THREE.BoxGeometry(1.36, 0.4, 0.04), carGlass, 0, 1.36, -0.96).rotation.x = 0.36;
  carPart(new THREE.BoxGeometry(0.04, 0.4, 1.22), carGlass, -0.8, 1.4, -0.05);
  carPart(new THREE.BoxGeometry(0.04, 0.4, 1.22), carGlass, 0.8, 1.4, -0.05);
  carPart(softGeo(0.46, 0.08, 0.42, 0.03), carSkirt, -0.5, 0.7, 0.15);
  carPart(softGeo(0.46, 0.28, 0.08, 0.03), carSkirt, -0.5, 0.86, -0.02);
  carPart(new THREE.BoxGeometry(0.06, 0.08, 0.16), carRim, -0.88, 0.96, 0.42);
  carPart(new THREE.BoxGeometry(0.06, 0.08, 0.16), carRim, 0.88, 0.96, -0.15);
  carPart(softGeo(0.16, 0.08, 0.22, 0.02), carSkirt, -0.9, 1.18, 0.48);
  carPart(softGeo(0.16, 0.08, 0.22, 0.02), carSkirt, 0.9, 1.18, 0.48);
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.16, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.18, 12);
  hubGeo.rotateZ(Math.PI / 2);
  const carWheels = [];
  for (const [x, z] of [[-0.98, 1.22], [0.98, 1.22], [-0.98, -1.28], [0.98, -1.28]]) {
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, carRubber);
    const hub = new THREE.Mesh(hubGeo, carRim);
    spin.add(tire, hub);
    pivot.add(spin);
    pivot.position.set(x, 0.32, z);
    car.add(pivot);
    carWheels.push({ pivot, spin, front: z > 0 });
  }
  carPart(new THREE.BoxGeometry(0.24, 0.12, 0.08), headMat, -0.52, 0.64, 1.96);
  carPart(new THREE.BoxGeometry(0.24, 0.12, 0.08), headMat, 0.52, 0.64, 1.96);
  carPart(new THREE.BoxGeometry(0.55, 0.16, 0.06), carSkirt, 0, 0.58, 1.98);
  carPart(new THREE.BoxGeometry(0.3, 0.1, 0.05), tailMat, -0.55, 0.7, -1.86);
  carPart(new THREE.BoxGeometry(0.3, 0.1, 0.05), tailMat, 0.55, 0.7, -1.86);
  const steerMount = new THREE.Group();
  steerMount.position.set(-0.5, 1.02, 0.48);
  steerMount.rotation.x = -0.55;
  const steerSpin = new THREE.Group();
  const steerRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 18), carRim);
  const steerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), carSkirt);
  steerHub.rotation.x = Math.PI / 2;
  steerSpin.add(steerRing, steerHub);
  steerMount.add(steerSpin);
  car.add(steerMount);
  const keyPivot = new THREE.Group();
  keyPivot.position.set(-0.66, 0.84, 0.58);
  const keyShaft = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.012), carRim);
  const keyHead = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.028, 0.008), carRim);
  keyHead.position.y = 0.046;
  keyPivot.add(keyShaft, keyHead);
  car.add(keyPivot);
  function carLamp(x) {
    if (lite) return { intensity: 0 };
    const spot = new THREE.SpotLight(0xfff1cc, 0, 22, 0.52, 0.42, 1.3);
    spot.position.set(x, 0.64, 1.9);
    const target = new THREE.Object3D();
    target.position.set(x, 0.15, 10);
    car.add(spot, target);
    spot.target = target;
    return spot;
  }
  const headBeams = [carLamp(-0.55), carLamp(0.55)];
  car.rotation.y = Math.PI / 2;
  car.position.set(-18, groundAt(-18, 64.2), 64.2);
  scene.add(car);
  const CAR_KEY = "zv-car";
  const CAR_PRICE = 1400;
  const carSave = loadJson(CAR_KEY, null);
  let carOwned = !!(carSave && carSave.owned);
  let carSaveAt = 0;
  if (carOwned && Number.isFinite(carSave.x) && Number.isFinite(carSave.z) && Math.hypot(carSave.x, carSave.z) <= 206) {
    car.position.set(carSave.x, groundAt(carSave.x, carSave.z), carSave.z);
    if (Number.isFinite(carSave.yaw)) car.rotation.y = carSave.yaw;
  }
  function saveCar() {
    try {
      localStorage.setItem(CAR_KEY, JSON.stringify({
        owned: carOwned,
        x: Math.round(car.position.x * 100) / 100,
        z: Math.round(car.position.z * 100) / 100,
        yaw: Math.round(car.rotation.y * 1000) / 1000,
      }));
    } catch {
      /* private mode */
    }
  }
  function ownedGarageNear(x, z, reach) {
    let best = null;
    let bestD = reach;
    for (const entry of estate.garages) {
      if (!entry.plot) continue;
      const door = doors.find((d) => d.garage && d.plot === entry.plot);
      if (!door) continue;
      const d = Math.hypot(x - door.at.x, z - door.at.z);
      if (d < bestD) {
        bestD = d;
        best = { entry, door };
      }
    }
    return best;
  }
  function parkCar(hit) {
    const plot = plots.find((p) => p.id === hit.entry.plot);
    if (!plot) return;
    const face = plot.side === "n" ? "s" : "n";
    car.position.set(plot.x, groundAt(plot.x, plot.z), plot.z);
    car.rotation.y = face === "s" ? Math.PI : 0;
    driving = false;
    carSpeed = 0;
    carSteer = 0;
    steerSpin.rotation.z = 0;
    const outZ = face === "s" ? hit.door.at.z - 1.8 : hit.door.at.z + 1.8;
    player.group.position.set(hit.door.at.x, groundAt(hit.door.at.x, outZ), outZ);
    saveCar();
    toast(t("carParked"));
  }
  const seatLocal = new THREE.Vector3(-0.5, 0, 0.06);
  const doorLocal = new THREE.Vector3(-1.32, 0, 0.22);
  const seatWorld = new THREE.Vector3();
  const doorWorld = new THREE.Vector3();
  const SEAT_LIFT = 0.42;
  function placeDriver() {
    seatWorld.copy(seatLocal).applyAxisAngle(gunY.set(0, 1, 0), car.rotation.y);
    player.group.position.set(car.position.x + seatWorld.x, car.position.y + SEAT_LIFT, car.position.z + seatWorld.z);
    player.group.rotation.y = car.rotation.y;
  }
  function tryDrive() {
    if (driving) {
      driving = false;
      carSpeed = 0;
      carSteer = 0;
      steerSpin.rotation.z = 0;
      const out = new THREE.Vector3(-1.6, 0, 0.15).applyAxisAngle(gunY.set(0, 1, 0), car.rotation.y);
      player.group.position.x = car.position.x + out.x;
      player.group.position.z = car.position.z + out.z;
      player.group.position.y = groundAt(player.group.position.x, player.group.position.z);
      saveCar();
      return;
    }
    if (riding || pose) return;
    const p = player.group.position;
    if (Math.hypot(p.x - car.position.x, p.z - car.position.z) > 3.3) return;
    if (!carOwned) {
      toast(t("needCar"));
      return;
    }
    if (!hasItem || !hasItem("guida")) {
      toast(t("needDrive"));
      return;
    }
    pose = "carIn";
    poseT = 0;
    carSpeed = 0;
    carSteer = 0;
  }
  function drive(dt, throttle, steer, collide) {
    const step = Math.min(Math.max(dt, 0.001), 0.05);
    const gas = THREE.MathUtils.clamp(throttle, -1, 1);
    const turn = THREE.MathUtils.clamp(steer, -1, 1);
    carSteer = THREE.MathUtils.damp(carSteer, turn, 8, step);
    const max = 16;
    if (gas > 0.12) carSpeed = Math.min(max, carSpeed + 8.5 * gas * step);
    else if (gas < -0.12) {
      if (carSpeed > 0.35) carSpeed = Math.max(0, carSpeed - 14 * step);
      else carSpeed = Math.max(-5.5, carSpeed + 6 * gas * step);
    } else {
      const drag = Math.abs(carSpeed) > 6 ? 3.2 : 5;
      carSpeed -= Math.sign(carSpeed) * drag * step;
      if (Math.abs(carSpeed) < 0.06) carSpeed = 0;
    }
    tailMat.emissiveIntensity = gas < -0.12 || (Math.abs(gas) < 0.12 && carSpeed > 3) ? 3.4 : 0.5;
    if (Math.abs(carSpeed) > 0.25) {
      car.rotation.y -= carSteer * 1.65 * Math.sign(carSpeed) * step * THREE.MathUtils.clamp(Math.abs(carSpeed) / 5, 0.25, 1);
    }
    const from = { x: car.position.x, z: car.position.z };
    const next = {
      x: car.position.x + Math.sin(car.rotation.y) * carSpeed * step,
      z: car.position.z + Math.cos(car.rotation.y) * carSpeed * step,
    };
    const blocked = collide(next, 1.2, from);
    let lake = false;
    for (const pond of lakes) {
      if (Math.hypot(next.x - pond.x, next.z - pond.z) < pond.r + 1.3) lake = true;
    }
    const gy = groundAt(next.x, next.z);
    if (blocked || lake || gy < car.position.y - 0.5) {
      next.x = from.x;
      next.z = from.z;
      carSpeed *= 0.2;
    } else if (Math.hypot(next.x - (from.x + Math.sin(car.rotation.y) * carSpeed * step), next.z - (from.z + Math.cos(car.rotation.y) * carSpeed * step)) > 0.04) {
      carSpeed *= 0.45;
    }
    const cap = 206;
    const reach = Math.hypot(next.x, next.z);
    if (reach > cap) {
      next.x *= cap / reach;
      next.z *= cap / reach;
      carSpeed *= 0.3;
    }
    const moved = Math.hypot(next.x - from.x, next.z - from.z);
    car.position.x = next.x;
    car.position.z = next.z;
    car.position.y = groundAt(car.position.x, car.position.z);
    const roll = carSpeed * step / 0.32;
    for (const w of carWheels) {
      w.spin.rotation.x += roll;
      w.pivot.rotation.y = w.front ? -carSteer * 0.42 : 0;
    }
    steerSpin.rotation.z = -carSteer * 1.15;
    placeDriver();
    return moved;
  }
  let skateSpeed = 0;
  let trailGap = 0;
  let trailI = 0;
  const skatePrev = new THREE.Vector3();
  let skateReady = false;
  let helmetThrown = false;
  let susp = 0;
  let suspV = 0;
  let prevGround = 0;
  let groundReady = false;
  let hopPhase = "none";
  let hopT = 0;
  let hopV = 0;
  let hopH = 0;
  let hopGround = 0;
  const groundHelmets = [];
  const board = new THREE.Group();
  const deckCanvas = document.createElement("canvas");
  deckCanvas.width = 128;
  deckCanvas.height = 320;
  const deckG = deckCanvas.getContext("2d");
  const deckFade = deckG.createLinearGradient(0, 0, 128, 320);
  deckFade.addColorStop(0, "#14324a");
  deckFade.addColorStop(0.45, "#1f8a7a");
  deckFade.addColorStop(1, "#d7a441");
  deckG.fillStyle = deckFade;
  deckG.fillRect(0, 0, 128, 320);
  deckG.strokeStyle = "rgba(255,244,214,0.85)";
  deckG.lineWidth = 6;
  deckG.beginPath();
  deckG.moveTo(18, 40);
  deckG.quadraticCurveTo(64, 150, 18, 280);
  deckG.stroke();
  deckG.beginPath();
  deckG.moveTo(110, 40);
  deckG.quadraticCurveTo(64, 170, 110, 280);
  deckG.stroke();
  deckG.fillStyle = "#fff6df";
  deckG.font = "700 42px Segoe UI, sans-serif";
  deckG.textAlign = "center";
  deckG.fillText("ZV", 64, 170);
  const deckMap = new THREE.CanvasTexture(deckCanvas);
  deckMap.colorSpace = THREE.SRGBColorSpace;
  const deck = new THREE.Mesh(
    softGeo(0.36, 0.05, 1.12, 0.02),
    mat(0xffffff, { map: deckMap, roughness: 0.38, metalness: 0.18 }),
  );
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.035, 0.16),
    mat(0xf4efe4, { roughness: 0.4 }),
  );
  nose.position.set(0, 0.02, 0.56);
  nose.rotation.x = -0.35;
  const tail = nose.clone();
  tail.position.z = -0.56;
  tail.rotation.x = 0.35;
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.01, 0.62),
    mat(0x12342e, { roughness: 0.72, emissive: 0x0c3a32, emissiveIntensity: 0.2 }),
  );
  grip.position.y = 0.024;
  const underglow = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.018, 0.46),
    mat(0x7dffb0, { emissive: 0x3dff9a, emissiveIntensity: 1.6, roughness: 0.25 }),
  );
  underglow.position.y = -0.038;
  const truckA = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.028, 0.07), mat(0x9aa0a8, { metalness: 0.65, roughness: 0.32 }));
  truckA.position.set(0, -0.028, 0.24);
  const truckB = truckA.clone();
  truckB.position.z = -0.24;
  const finL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.16), mat(0xd7a441, { roughness: 0.35, metalness: 0.4 }));
  finL.position.set(-0.16, -0.02, -0.28);
  const finR = finL.clone();
  finR.position.x = 0.16;
  const ledTex = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    g.fillStyle = "#03160c";
    g.fillRect(0, 0, 64, 256);
    g.fillStyle = "#0c3d22";
    g.fillRect(10, 0, 44, 256);
    const chunk = g.createLinearGradient(0, 18, 0, 108);
    chunk.addColorStop(0, "rgba(40,255,120,0)");
    chunk.addColorStop(0.28, "#6dffb0");
    chunk.addColorStop(0.48, "#f4fff8");
    chunk.addColorStop(0.7, "#2ee56a");
    chunk.addColorStop(1, "rgba(12,60,30,0)");
    g.fillStyle = chunk;
    g.fillRect(8, 18, 48, 92);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  })();
  const ledMat = mat(0xb8ffd4, {
    map: ledTex,
    emissive: 0x46ff86,
    emissiveMap: ledTex,
    emissiveIntensity: 2.6,
    roughness: 0.28,
    toneMapped: false,
  });
  const railL = new THREE.Mesh(
    softGeo(0.025, 0.02, 0.72, 0.008),
    mat(0x12382a, { emissive: 0x0c3a28, emissiveIntensity: 0.35, roughness: 0.4 }),
  );
  railL.position.set(-0.16, 0.02, 0.02);
  const railR = railL.clone();
  railR.position.x = 0.16;
  function ledStrip(x) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.78), ledMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.036, 0.02);
    return strip;
  }
  const ledL = ledStrip(-0.155);
  const ledR = ledStrip(0.155);
  const trailMap = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const g = canvas.getContext("2d");
    const side = g.createLinearGradient(0, 0, 256, 0);
    side.addColorStop(0, "rgba(0,40,12,0)");
    side.addColorStop(0.22, "rgba(0,160,40,0.25)");
    side.addColorStop(0.42, "rgba(80,255,70,0.75)");
    side.addColorStop(0.5, "rgba(236,255,214,1)");
    side.addColorStop(0.58, "rgba(80,255,70,0.75)");
    side.addColorStop(0.78, "rgba(0,160,40,0.25)");
    side.addColorStop(1, "rgba(0,40,12,0)");
    g.fillStyle = side;
    g.fillRect(0, 0, 256, 512);
    g.strokeStyle = "rgba(190,255,120,0.9)";
    g.lineWidth = 7;
    g.lineJoin = "round";
    for (let y = 28; y < 500; y += 64) {
      g.beginPath();
      g.moveTo(78, y + 22);
      g.lineTo(128, y);
      g.lineTo(178, y + 22);
      g.stroke();
    }
    g.fillStyle = "rgba(245,255,230,0.95)";
    for (let i = 0; i < 36; i++) {
      const x = 96 + ((i * 53) % 64);
      const y = (i * 71) % 500;
      g.beginPath();
      g.arc(x, y, 1.4 + (i % 3), 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = "destination-out";
    const fade = g.createLinearGradient(0, 0, 0, 512);
    fade.addColorStop(0, "rgba(0,0,0,0.15)");
    fade.addColorStop(0.18, "rgba(0,0,0,0)");
    fade.addColorStop(0.62, "rgba(0,0,0,0.05)");
    fade.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = fade;
    g.fillRect(0, 0, 256, 512);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  })();
  function trailMat() {
    return mat(0x3dff55, {
      map: trailMap,
      emissive: 0x2dff4a,
      emissiveMap: trailMap,
      emissiveIntensity: 2.2,
      transparent: true,
      opacity: 0,
      roughness: 0.35,
      metalness: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  }
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 2.4), trailMat());
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(0, -0.04, -1.35);
  board.add(deck, nose, tail, grip, underglow, truckA, truckB, finL, finR, railL, railR, ledL, ledR, wake);
  board.visible = false;
  board.position.set(0, 0.02, 0.1);
  player.group.add(board);
  const helmet = new THREE.Group();
  const helmetMap = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    g.fillStyle = "#16181c";
    g.fillRect(0, 0, 512, 256);
    const crown = g.createLinearGradient(0, 0, 0, 256);
    crown.addColorStop(0, "rgba(255,255,255,0.16)");
    crown.addColorStop(0.35, "rgba(255,255,255,0.02)");
    crown.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = crown;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = "#1f8a7a";
    g.fillRect(0, 168, 512, 34);
    g.fillStyle = "#d7a441";
    g.fillRect(0, 198, 512, 6);
    g.strokeStyle = "rgba(255,255,255,0.14)";
    g.lineWidth = 2;
    for (let x = 40; x < 512; x += 86) {
      g.beginPath();
      g.moveTo(x, 20);
      g.quadraticCurveTo(x + 18, 120, x - 8, 250);
      g.stroke();
    }
    g.fillStyle = "#0e1013";
    for (const x of [92, 148, 360, 416]) g.fillRect(x, 78, 28, 8);
    g.fillStyle = "#fff6df";
    g.font = "700 54px Segoe UI, sans-serif";
    g.textAlign = "center";
    g.fillText("ZV", 128, 150);
    g.strokeStyle = "rgba(215,164,65,0.9)";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(128, 118, 46, 0.4, Math.PI - 0.2);
    g.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  })();
  const helmetRough = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext("2d");
    const fade = g.createLinearGradient(0, 0, 0, 64);
    fade.addColorStop(0, "#3a3a3a");
    fade.addColorStop(0.55, "#6a6a6a");
    fade.addColorStop(1, "#9a9a9a");
    g.fillStyle = fade;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  })();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
    mat(0xffffff, {
      map: helmetMap,
      roughnessMap: helmetRough,
      roughness: 0.42,
      metalness: 0.55,
    }),
  );
  shell.scale.set(1.05, 0.82, 1.08);
  const visorMap = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const g = canvas.getContext("2d");
    g.fillStyle = "#0c2430";
    g.fillRect(0, 0, 256, 64);
    const shine = g.createLinearGradient(0, 0, 256, 64);
    shine.addColorStop(0, "rgba(180,255,220,0)");
    shine.addColorStop(0.42, "rgba(210,255,236,0.55)");
    shine.addColorStop(0.5, "rgba(255,255,255,0.8)");
    shine.addColorStop(0.58, "rgba(80,220,160,0.25)");
    shine.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = shine;
    g.fillRect(0, 0, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.05, 0.02),
    mat(0xffffff, {
      map: visorMap,
      roughness: 0.08,
      metalness: 0.72,
      emissive: 0x12382c,
      emissiveMap: visorMap,
      emissiveIntensity: 0.45,
    }),
  );
  visor.position.set(0, -0.02, 0.11);
  const helmLed = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.09), ledMat);
  helmLed.geometry.rotateZ(Math.PI / 2);
  helmLed.position.set(0, 0.03, -0.125);
  helmLed.rotation.y = Math.PI;
  helmet.add(shell, visor, helmLed);
  helmet.visible = false;
  helmet.position.set(0, 0.11, 0.02);
  const trailBits = [];
  for (let i = 0; i < 16; i++) {
    const puff = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.95), trailMat());
    puff.rotation.order = "YXZ";
    puff.visible = false;
    scene.add(puff);
    trailBits.push({ mesh: puff, life: 0 });
  }
  function updateSkateMotion(dt, now) {
    const here = player.group.position;
    if (skateReady) {
      skateSpeed = Math.hypot(here.x - skatePrev.x, here.z - skatePrev.z) / Math.max(dt, 0.001);
    }
    skatePrev.copy(here);
    skateReady = true;
    const moving = riding && skateSpeed > 0.7;
    const go = moving ? Math.min(1, skateSpeed / 8) : 0;
    wake.material.opacity = go * 0.9;
    wake.scale.y = 0.7 + go * 1.15;
    trailMap.offset.y = (trailMap.offset.y - dt * (0.35 + go * 2.4)) % 1;
    if (moving) {
      trailGap += skateSpeed * dt;
      if (trailGap > 0.42) {
        trailGap = 0;
        const bit = trailBits[trailI % trailBits.length];
        trailI += 1;
        const yaw = player.group.rotation.y;
        bit.mesh.position.set(
          here.x - Math.sin(yaw) * 0.85,
          here.y - 0.42,
          here.z - Math.cos(yaw) * 0.85,
        );
        bit.mesh.rotation.set(-Math.PI / 2, yaw, 0);
        bit.mesh.visible = true;
        bit.life = 1;
      }
    }
    for (const bit of trailBits) {
      if (bit.life <= 0) continue;
      bit.life -= dt * 0.7;
      bit.mesh.material.opacity = Math.max(0, bit.life) * 0.85;
      const stretch = 0.8 + (1 - Math.max(0, bit.life)) * 0.7;
      bit.mesh.scale.set(0.85 + (1 - Math.max(0, bit.life)) * 0.5, stretch, 1);
      if (bit.life <= 0) bit.mesh.visible = false;
    }
    ledTex.offset.y = (ledTex.offset.y + 1 - dt * 0.72) % 1;
    if (riding) {
      const crouch = hopPhase === "crouch" ? Math.min(1, hopT / 0.16) : hopPhase === "land" ? 1 - smooth(Math.min(1, hopT / 0.28)) : 0;
      const nose = hopPhase === "air" ? THREE.MathUtils.clamp(hopV / 5.5, -0.22, 0.32) : crouch * 0.2;
      board.position.y = 0.05 + susp * 0.85 - crouch * 0.018;
      board.rotation.z = Math.sin(now * (2.4 + go * 2)) * 0.04 * go;
      board.rotation.x = -0.04 * go + nose;
      const truck = -0.028 + Math.min(0, susp) * 0.55;
      truckA.position.y = truck;
      truckB.position.y = truck;
    } else if (pose !== "skateOn") {
      board.rotation.z = 0;
      board.rotation.x = 0;
      if (!board.visible) board.position.y = 0.02;
    }
  }
  function resetHop() {
    susp = 0;
    suspV = 0;
    groundReady = false;
    hopPhase = "none";
    hopT = 0;
    hopV = 0;
    hopH = 0;
  }
  function trySkateJump() {
    if (!riding || hopPhase !== "none") return;
    hopPhase = "crouch";
    hopT = 0;
  }
  function skateStep(dt, onBoard, groundY) {
    if (!onBoard) {
      resetHop();
      return 0;
    }
    const step = Math.min(Math.max(dt, 0.001), 0.04);
    if (groundReady && hopPhase !== "air" && hopPhase !== "crouch") suspV -= (groundY - prevGround) * 2.6;
    if (hopPhase !== "air") prevGround = groundY;
    groundReady = true;
    if (hopPhase === "crouch") {
      hopT += step;
      const u = Math.min(1, hopT / 0.16);
      susp = -0.048 * u;
      suspV = 0;
      if (hopT >= 0.16) {
        hopPhase = "air";
        hopGround = groundY;
        hopV = 5.5;
        hopH = susp;
        suspV = 1.6;
        return hopH;
      }
      return susp;
    }
    if (hopPhase === "air") {
      hopV -= 14.2 * step;
      hopH += hopV * step;
      if (hopH <= 0 && hopV < 0) {
        hopH = 0;
        hopPhase = "land";
        hopT = 0;
        susp = -0.055;
        suspV = 0.4;
        prevGround = groundY;
      }
      return hopH + (hopGround - groundY);
    }
    const k = 58;
    const damp = 10.5;
    suspV += (-k * susp - damp * suspV) * step;
    susp += suspV * step;
    susp = Math.max(-0.06, Math.min(0.03, susp));
    if (hopPhase === "land") {
      hopT += step;
      const blend = smooth(Math.min(1, hopT / 0.24));
      if (hopT >= 0.24) hopPhase = "none";
      return (hopGround - groundY) * (1 - blend) + susp * 0.4;
    }
    return susp * 0.4;
  }
  function toggleSkate() {
    if (driving) return;
    if (pose === "mine" || pose === "eat" || pose === "drink" || pose === "fish" || pose === "skateOn" || pose === "skateOff" || pose === "carIn") return;
    if (riding) {
      riding = false;
      pose = "skateOff";
      poseT = 0;
      helmetThrown = false;
      board.visible = true;
      helmet.visible = true;
      helmet.scale.setScalar(1);
      return;
    }
    if (!hasSkate || !hasSkate()) {
      toast(t("needSkate"));
      return;
    }
    if (!hasItem || !hasItem("patente")) {
      toast(t("needLicense"));
      return;
    }
    pose = "skateOn";
    poseT = 0;
    board.visible = true;
    helmet.visible = true;
    helmet.scale.setScalar(0.15);
  }
  const phoneProp = new THREE.Group();
  const phoneShell = new THREE.Mesh(
    softGeo(0.074, 0.152, 0.008, 0.0032),
    mat(0x1a1c1e, { roughness: 0.28, metalness: 0.62 }),
  );
  const phoneScreenMap = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    g.fillStyle = "#d5e7fb";
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = "#f4f9ff";
    g.fillRect(0, 0, 128, 34);
    g.fillStyle = "#1b2430";
    g.font = "bold 18px sans-serif";
    g.fillText("14:57", 38, 24);
    const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
    colors.forEach((color, i) => {
      g.fillStyle = color;
      g.fillRect(16 + (i % 3) * 36, 64 + Math.floor(i / 3) * 46, 26, 26);
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const phoneScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.066, 0.138, 0.001),
    mat(0xffffff, {
      map: phoneScreenMap,
      emissive: 0xffffff,
      emissiveMap: phoneScreenMap,
      emissiveIntensity: 1.35,
      roughness: 0.22,
      metalness: 0,
    }),
  );
  phoneScreen.position.z = 0.0046;
  const island = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, 0.006, 0.0012),
    mat(0x050505, { roughness: 0.4 }),
  );
  island.position.set(0, 0.058, 0.0052);
  const cameraBump = new THREE.Mesh(
    new THREE.BoxGeometry(0.026, 0.026, 0.003),
    mat(0x111214, { roughness: 0.35, metalness: 0.4 }),
  );
  cameraBump.position.set(-0.016, 0.05, -0.005);
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.002, 10),
    mat(0x1a3a55, { roughness: 0.12, metalness: 0.7, emissive: 0x0a2030, emissiveIntensity: 0.4 }),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.set(-0.016, 0.05, -0.007);
  const sideKey = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.018, 0.003), mat(0xc8ccd0, { metalness: 0.7, roughness: 0.25 }));
  sideKey.position.set(0.038, 0.03, 0);
  phoneProp.add(phoneShell, phoneScreen, island, cameraBump, lens, sideKey);
  phoneProp.visible = false;
  phoneProp.scale.setScalar(1);
  const snack = new THREE.Group();
  const loaf = new THREE.Group();
  const breadTex = foodTexture("bread");
  const breadBite = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 18),
    new THREE.MeshStandardMaterial({ map: breadTex, roughness: 0.72, color: 0xfff1d2 }),
  );
  breadBite.scale.set(0.058, 0.028, 0.04);
  const crumb = new THREE.Mesh(
    new THREE.CircleGeometry(0.03, 20),
    new THREE.MeshStandardMaterial({ map: foodTexture("crumb"), roughness: 0.9, color: 0xfff6e4, side: THREE.DoubleSide }),
  );
  crumb.position.set(0.05, 0, 0);
  const score = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.004, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x8a4e22, roughness: 0.8 }),
  );
  score.position.set(0, 0.026, 0);
  score.rotation.z = 0.15;
  loaf.add(breadBite, crumb, score);
  const glassCup = new THREE.Group();
  const cupMat = new THREE.MeshPhysicalMaterial({
    color: 0xeaf7ff,
    roughness: 0.04,
    metalness: 0,
    transmission: 0.94,
    thickness: 0.22,
    ior: 1.45,
    transparent: true,
    opacity: 0.28,
  });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.023, 0.108, 24, 1, true), cupMat);
  const cupBottom = new THREE.Mesh(
    new THREE.CircleGeometry(0.022, 20),
    new THREE.MeshPhysicalMaterial({ color: 0xd7eef8, roughness: 0.08, transmission: 0.7, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
  );
  cupBottom.rotation.x = Math.PI / 2;
  cupBottom.position.y = -0.052;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0035, 8, 24), mat(0xf4fbff, { roughness: 0.06, metalness: 0.04 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.054;
  const drops = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0292, 0.0242, 0.098, 24, 1, true),
    new THREE.MeshStandardMaterial({
      map: foodTexture("drops"),
      transparent: true,
      depthWrite: false,
      roughness: 0.2,
      color: 0xffffff,
    }),
  );
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.019, 0.062, 24),
    new THREE.MeshPhysicalMaterial({
      color: 0x2f8ec4,
      roughness: 0.05,
      transmission: 0.62,
      thickness: 0.4,
      transparent: true,
      opacity: 0.78,
    }),
  );
  water.position.y = -0.012;
  const waterTop = new THREE.Mesh(
    new THREE.CircleGeometry(0.021, 20),
    new THREE.MeshStandardMaterial({
      map: foodTexture("surface"),
      color: 0xd8f4ff,
      roughness: 0.04,
      metalness: 0.12,
      emissive: 0x8fd4ef,
      emissiveIntensity: 0.18,
      side: THREE.DoubleSide,
    }),
  );
  waterTop.rotation.x = -Math.PI / 2;
  waterTop.position.y = 0.019;
  glassCup.add(cup, cupBottom, rim, drops, water, waterTop);
  glassCup.visible = false;
  snack.add(loaf, glassCup);
  snack.visible = false;
  snack.scale.setScalar(1);

  function saveEstate() {
    localStorage.setItem(ESTATE_KEY, JSON.stringify(estate));
  }
  function savePhone() {
    try {
      localStorage.setItem(PHONE_KEY, JSON.stringify(phone));
    } catch {
      toast(L("This phone is full", "Memoria del telefono piena"));
    }
  }
  function saveBank() {
    localStorage.setItem(BANK_KEY, String(Math.floor(bank)));
  }

  function toast(text) {
    const el = document.getElementById("toast");
    el.textContent = text;
    el.classList.remove("hidden");
    toastTimer = 2.4;
  }

  function spend(n) {
    if (getZcoin() < n) {
      toast(t("needCoin"));
      return false;
    }
    setZcoin(getZcoin() - n);
    saveZcoin();
    return true;
  }

  function nameOf(spec) {
    return L(spec.en, spec.it);
  }

  function taken(id) {
    return estate.houses.some((h) => h.plot === id) || estate.garages.some((g) => g.plot === id);
  }

  const actBtn = document.getElementById("act-btn");
  const stopBtn = document.getElementById("pose-stop");
  const acts = document.getElementById("acts");
  const civic = document.getElementById("civic");
  const bankEl = document.getElementById("bank");
  const shopEl = document.getElementById("shop");
  const importEl = document.getElementById("import");
  const marketEl = document.getElementById("zcmarket");
  const pescaEl = document.getElementById("pesca");
  const banner = document.getElementById("place-banner");
  const bubble = document.getElementById("chat-stack");
  const npcBubble = document.getElementById("npc-bubble");
  const phoneRoot = document.getElementById("phone");
  const phoneBody = document.getElementById("phone-body");
  const phoneToggle = document.getElementById("phone-toggle");

  function hidePop(el) {
    el.classList.add("hidden");
  }

  function startPose(id, spot) {
    pose = id;
    poseT = 0;
    seat = spot || null;
    if (spot) {
      player.group.position.x = spot.x;
      player.group.position.z = spot.z;
      if (typeof spot.y === "number") player.group.position.y = spot.y;
      if (typeof spot.yaw === "number") player.group.rotation.y = spot.yaw;
    }
    hidePop(acts);
  }

  function locks() {
    return !!pose && pose !== "phone" && pose !== "cam" && pose !== "selfie" && pose !== "snack";
  }

  let biteDone = null;

  function holdPhone() {
    if (!phoneOpen) return;
    if (pose === "skateOn" || pose === "skateOff" || pose === "mine" || pose === "eat" || pose === "drink" || pose === "fish" || pose === "carIn") return;
    if (screen === "camera" && camMode === "selfie") pose = "selfie";
    else if (screen === "camera") pose = "cam";
    else pose = "phone";
  }

  const dances = [
    ["dance1", () => L("Sway", "Ondeggiare")],
    ["dance2", () => L("Bounce", "Saltello")],
    ["dance3", () => L("Clap", "Batti le mani")],
    ["dance4", () => L("Twist", "Torsione")],
    ["dance5", () => L("Step", "Passo")],
  ];
  const paid = [
    ["dance6", 40, () => L("Spin", "Giro")],
    ["dance7", 60, () => L("Wave", "Saluto largo")],
  ];
  const emotes = [
    ["sit", () => t("sit")],
    ["sleep", () => t("sleep")],
    ["think", () => t("think")],
    ["smoke", () => t("smoke")],
    ["stretch", () => t("stretch")],
  ];

  function paintActs() {
    acts.innerHTML = `<h2>${t("actions")}</h2>`;
    const add = (id, label, cost) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = cost ? `${label} · ${cost} ZCOIN` : label;
      btn.addEventListener("click", () => {
        if (cost && !unlocks.includes(id)) {
          if (!spend(cost)) return;
          unlocks.push(id);
          localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocks));
        }
        startPose(id);
      });
      acts.appendChild(btn);
    };
    for (const [id, label] of emotes) add(id, label());
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = t("close");
    close.addEventListener("click", () => hidePop(acts));
    acts.appendChild(close);
  }

  function paintCivic() {
    civic.innerHTML = `<h2>${L("Town hall", "Comune")}</h2><p>${L("Houses and garages are separate. Every house is empty.", "Case e garage sono liste separate. Ogni casa è vuota.")}</p>`;
    const tabs = document.createElement("div");
    tabs.className = "pad-row";
    const body = document.createElement("div");
    const show = (kind) => {
      body.innerHTML = "";
      const list = kind === "houses" ? HOUSES : GARAGES;
      const key = kind;
      for (const spec of list) {
        const owned = estate[key].find((e) => e.type === spec.id);
        const btn = document.createElement("button");
        btn.type = "button";
        if (!owned) btn.textContent = `${nameOf(spec)} · ${spec.price} ZCOIN`;
        else if (!owned.plot) btn.textContent = `${nameOf(spec)} · ${t("place")}`;
        else btn.textContent = `${nameOf(spec)} · ${t("placed")}`;
        btn.disabled = !!(owned && owned.plot);
        btn.addEventListener("click", () => {
          if (!owned) {
            if (!spend(spec.price)) return;
            estate[key].push({ type: spec.id, plot: null });
            saveEstate();
            grantKey(true);
          }
          placeMode = { kind: key, type: spec.id };
          hidePop(civic);
          banner.textContent = L("Walk to a free lot and confirm", "Cammina su un lotto libero e conferma");
          banner.classList.remove("hidden");
          paintCivic();
        });
        body.appendChild(btn);
      }
    };
    for (const [kind, label] of [
      ["houses", t("houses")],
      ["garages", t("garages")],
    ]) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.textContent = label;
      tab.addEventListener("click", () => show(kind));
      tabs.appendChild(tab);
    }
    civic.append(tabs, body);
    const buyPaper = (id, price, label, haveKey, gotKey) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = t(label);
      btn.addEventListener("click", () => {
        if (hasItem && hasItem(id)) {
          toast(t(haveKey));
          return;
        }
        if (getZcoin() < price) {
          toast(t("needCoin"));
          return;
        }
        if (!bagRoom(id, 1)) {
          toast(t("bagFull"));
          return;
        }
        setZcoin(getZcoin() - price);
        saveZcoin();
        addToBag(id, t(`item.${id}`), 1);
        toast(t(gotKey));
      });
      civic.appendChild(btn);
    };
    buyPaper("porto", 900, "portoBuy", "portoHave", "portoGot");
    buyPaper("patente", 280, "licenseBuy", "licenseHave", "licenseGot");
    buyPaper("guida", 650, "driveBuy", "driveHave", "driveGot");
    const carBtn = document.createElement("button");
    carBtn.type = "button";
    carBtn.textContent = t("carBuy");
    carBtn.addEventListener("click", () => {
      if (carOwned) {
        toast(t("carHave"));
        return;
      }
      if (getZcoin() < CAR_PRICE) {
        toast(t("needCoin"));
        return;
      }
      setZcoin(getZcoin() - CAR_PRICE);
      saveZcoin();
      carOwned = true;
      saveCar();
      toast(t("carGot"));
    });
    civic.appendChild(carBtn);
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = t("close");
    close.addEventListener("click", () => hidePop(civic));
    civic.appendChild(close);
    show("houses");
  }

  function paintBank() {
    bankEl.innerHTML = `<h2>${t("bank")}</h2><p>${t("wallet")}: ${Math.floor(getZcoin())} ZCOIN</p><p>${t("bankBal")}: ${Math.floor(bank)} ZCOIN</p>`;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.value = "10";
    const dep = document.createElement("button");
    dep.type = "button";
    dep.textContent = t("deposit");
    dep.addEventListener("click", () => {
      const n = Math.floor(Number(input.value) || 0);
      if (n <= 0) return;
      if (getZcoin() < n) return toast(t("needCoin"));
      setZcoin(getZcoin() - n);
      bank += n;
      saveBank();
      saveZcoin();
      paintBank();
    });
    const wit = document.createElement("button");
    wit.type = "button";
    wit.textContent = t("withdraw");
    wit.addEventListener("click", () => {
      const n = Math.floor(Number(input.value) || 0);
      if (n <= 0 || bank < n) return;
      bank -= n;
      setZcoin(getZcoin() + n);
      saveBank();
      saveZcoin();
      paintBank();
    });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = t("close");
    close.addEventListener("click", () => hidePop(bankEl));
    bankEl.append(input, dep, wit, close);
  }

  function paintShop() {
    shopEl.innerHTML = `<h2>${t("phoneShop")}</h2>`;
    const btn = document.createElement("button");
    btn.type = "button";
    if (phone) btn.textContent = L("You already have it", "Ce l'hai già");
    else btn.textContent = `${t("buyPhone")} · 150 ZCOIN`;
    btn.disabled = !!phone;
    btn.addEventListener("click", () => {
      if (phone || !spend(150)) return;
      let number = "3";
      for (let i = 0; i < 9; i++) number += Math.floor(Math.random() * 10);
      phone = {
        lang: null,
        pin: null,
        number,
        contacts: [],
        threads: {},
        gallery: [],
        posts: [],
        profile: null,
        calls: [],
      };
      savePhone();
      phoneToggle.classList.remove("hidden");
      hidePop(shopEl);
      openPhone();
    });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = t("close");
    close.addEventListener("click", () => hidePop(shopEl));
    shopEl.append(btn, close);
  }

  function nearestPlot() {
    const p = player.group.position;
    let best = null;
    let bestD = 3.2;
    for (const plot of plots) {
      if (taken(plot.id)) continue;
      const dir = plot.side === "n" ? -1 : 1;
      const px = plot.x;
      const pz = plot.z + dir * 5.65;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < bestD) {
        bestD = d;
        best = plot;
      }
    }
    return best;
  }

  function placeOn(plot) {
    if (!placeMode || !plot || taken(plot.id)) return;
    const entry = estate[placeMode.kind].find((e) => e.type === placeMode.type && !e.plot);
    if (!entry) return;
    entry.plot = plot.id;
    saveEstate();
    spawnOwned(entry, placeMode.kind);
    placeMode = null;
    banner.classList.add("hidden");
    toast(t("placed"));
  }

  const spots = [
    { x: 2.3, z: 52.15, r: 1.35, label: () => t("counter"), run: () => { paintCivic(); civic.classList.remove("hidden"); } },
    { x: -34, z: 18.75, r: 1.45, label: () => t("counter"), run: () => { paintBank(); bankEl.classList.remove("hidden"); } },
    { x: 34, z: -18.75, r: 1.45, label: () => t("counter"), run: () => { paintShop(); shopEl.classList.remove("hidden"); } },
  ];
  for (const bench of benches) {
    spots.push({
      x: bench.x,
      z: bench.z,
      r: 2.15,
      label: () => t("sit"),
      run: () => startPose("sit", bench),
    });
  }

  const ORES = [
    { id: "bronzo", w: 42 },
    { id: "ferro", w: 32 },
    { id: "smeraldo", w: 12 },
    { id: "oro", w: 9 },
    { id: "rubino", w: 4 },
    { id: "diamante", w: 1 },
  ];
  const SIZES = [
    { mult: 1, time: 2.4, scale: 0.62, w: 46 },
    { mult: 2, time: 3.5, scale: 0.84, w: 30 },
    { mult: 3, time: 4.8, scale: 1.05, w: 16 },
    { mult: 4, time: 6.2, scale: 1.28, w: 8 },
  ];
  const GEM = new Set(["smeraldo", "rubino", "diamante"]);
  const ORE_LOOK = {
    bronzo: { color: 0xb87333, emissive: 0x8a4e18, metal: 0.72, rough: 0.38, a: "#6a3a22", b: "#c47a3a", c: "#e8c39a" },
    ferro: { color: 0x8b9098, emissive: 0x3a3e44, metal: 0.62, rough: 0.4, a: "#2c3136", b: "#7d868f", c: "#d5dde4" },
    smeraldo: { color: 0x1fa86a, emissive: 0x0c6b40, metal: 0.12, rough: 0.16, a: "#083528", b: "#14915c", c: "#b6f3d4" },
    rubino: { color: 0xc4163a, emissive: 0x8a1028, metal: 0.1, rough: 0.16, a: "#3a0a14", b: "#c4163a", c: "#ffc0cc" },
    oro: { color: 0xe2b43a, emissive: 0xa67c12, metal: 0.86, rough: 0.26, a: "#5c3e0c", b: "#e2b43a", c: "#fff1b8" },
    diamante: { color: 0xf4fbff, emissive: 0xb7e4f5, metal: 0.2, rough: 0.05, a: "#d5e8f4", b: "#f7fbff", c: "#9fd0ea" },
  };

  function weighted(list) {
    let total = 0;
    for (const item of list) total += item.w;
    let roll = Math.random() * total;
    for (const item of list) {
      roll -= item.w;
      if (roll <= 0) return item;
    }
    return list[0];
  }

  function oreTexture(look) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const g = canvas.getContext("2d");
    g.fillStyle = look.a;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 420; i++) {
      const n = (i * 17) % 90;
      g.fillStyle = n > 55 ? look.b : n > 25 ? look.c : look.a;
      g.globalAlpha = 0.35 + (i % 5) * 0.08;
      g.fillRect((i * 13) % 128, (i * 29) % 128, 1 + (i % 3), 1 + (i % 2));
    }
    g.globalAlpha = 0.85;
    for (let i = 0; i < 9; i++) {
      const grd = g.createRadialGradient((i * 41) % 120, (i * 27) % 120, 1, (i * 41) % 120, (i * 27) % 120, 16 + (i % 4) * 4);
      grd.addColorStop(0, look.c);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc((i * 41) % 120, (i * 27) % 120, 18, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 0.7;
    g.strokeStyle = look.c;
    g.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo((i * 19) % 128, 0);
      g.lineTo((i * 37) % 128, 128);
      g.stroke();
    }
    g.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const oreMats = {};
  const hostMat = new THREE.MeshStandardMaterial({ color: 0x4a453f, roughness: 0.92, metalness: 0.04 });
  for (const ore of ORES) {
    const look = ORE_LOOK[ore.id];
    if (GEM.has(ore.id)) {
      const ior = ore.id === "diamante" ? 2.42 : ore.id === "rubino" ? 1.76 : 1.58;
      oreMats[ore.id] = new THREE.MeshPhysicalMaterial({
        color: look.color,
        roughness: ore.id === "diamante" ? 0.02 : 0.06,
        metalness: 0,
        transmission: ore.id === "diamante" ? 0.92 : 0.72,
        thickness: 0.8,
        ior,
        emissive: look.emissive,
        emissiveIntensity: ore.id === "diamante" ? 0.22 : 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
      });
    } else {
      oreMats[ore.id] = new THREE.MeshStandardMaterial({
        map: oreTexture(look),
        color: look.color,
        emissive: look.emissive,
        emissiveIntensity: 0.16,
        metalness: look.metal,
        roughness: look.rough,
      });
    }
  }

  const veins = [];
  let mineNode = null;
  let mineDur = 2.4;
  if (quarry) {
    const spotsIn = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      spotsIn.push([Math.cos(a) * 3.4, Math.sin(a) * 3.4]);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.15;
      spotsIn.push([Math.cos(a) * 7.1, Math.sin(a) * 7.1]);
    }
    for (const [dx, dz] of spotsIn) {
      const group = new THREE.Group();
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52, 0), oreMats.bronzo);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), oreMats.smeraldo);
      gem.position.set(0.04, 0.28, 0.06);
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 14, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.18 }),
      );
      orb.position.set(0.28, 0.72, 0.1);
      orb.visible = false;
      group.add(chunk, gem);
      const x = quarry.x + dx;
      const z = quarry.z + dz;
      group.position.set(x, groundAt(x, z) + 0.28, z);
      scene.add(group);
      veins.push({ x, z, group, chunk, gem, orb, alive: false, back: 0, ore: "bronzo", mult: 1, time: 2.4, scale: 0.7 });
    }
  }

  function rollVein(vein) {
    const ore = weighted(ORES);
    const size = weighted(SIZES);
    vein.ore = ore.id;
    vein.mult = size.mult;
    vein.time = size.time;
    vein.scale = size.scale;
    vein.alive = true;
    vein.group.visible = true;
    vein.group.scale.setScalar(size.scale);
    const crystal = GEM.has(ore.id);
    vein.chunk.visible = true;
    vein.gem.visible = crystal;
    vein.chunk.material = crystal ? hostMat : oreMats[ore.id];
    vein.gem.material = oreMats[ore.id];
    const look = ORE_LOOK[ore.id];
    vein.orb.material.color.set(look.color);
    vein.orb.material.emissive.set(look.emissive);
    vein.group.rotation.y = Math.random() * Math.PI * 2;
  }
  for (const vein of veins) rollVein(vein);

  function beginMine(vein) {
    if (!vein.alive || pose === "mine") return;
    if (!bagRoom || !bagRoom(vein.ore, vein.mult)) {
      toast(t("bagFull"));
      return;
    }
    const p = player.group.position;
    const dx = p.x - vein.x;
    const dz = p.z - vein.z;
    const len = Math.hypot(dx, dz) || 1;
    const x = vein.x + (dx / len) * 1.2;
    const z = vein.z + (dz / len) * 1.2;
    mineNode = vein;
    mineDur = vein.time;
    startPose("mine", { x, z, y: groundAt(x, z), yaw: Math.atan2(vein.x - x, vein.z - z) });
  }

  const FISHES = [
    { id: "alborella", w: 34, color: 0xd5dde4 },
    { id: "persico", w: 26, color: 0x6a9a3a },
    { id: "trota", w: 16, color: 0x8a7048 },
    { id: "carpa", w: 12, color: 0xe0a030 },
    { id: "luccio", w: 8, color: 0x3e7a4a },
    { id: "storione", w: 4, color: 0x8d8478 },
  ];
  let fishCatch = null;
  const shores = [];
  for (const lake of lakes) {
    const reach = lake.r + 1.45;
    shores.push({ x: lake.x + reach * 0.75, z: lake.z - reach * 0.62, lake, r: 2.35 });
    shores.push({ x: lake.x - reach * 0.35, z: lake.z + reach * 0.9, lake, r: 2.35 });
  }

  function beginFish(shore) {
    if (pose === "fish" || pose === "mine") return;
    if (!hasRod || !hasRod()) {
      toast(t("needRod"));
      return;
    }
    if (!bagRoom || !bagRoom("alborella", 1)) {
      toast(t("bagFull"));
      return;
    }
    const p = player.group.position;
    fishCatch = weighted(FISHES);
    fishBody.material.color.set(fishCatch.color);
    fishTail.material.color.set(fishCatch.color);
    startPose("fish", {
      x: p.x,
      z: p.z,
      y: groundAt(p.x, p.z),
      yaw: Math.atan2(shore.lake.x - p.x, shore.lake.z - p.z),
    });
  }

  function addImport() {
    if (!importAt) return;
    const cx = importAt.x;
    const cz = importAt.z;
    const y0 = groundAt(cx, cz);
    const plasterW = wallCloth("#f6f1e6", "#e4d3bc");
    const base = mat(0xc8b49a, { roughness: 0.7 });
    const copper = mat(0xb86a3d, { metalness: 0.45, roughness: 0.38 });
    const dark = mat(0x2c2824, { roughness: 0.5 });
    const brass = mat(0xd8c27a, { metalness: 0.65, roughness: 0.28 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xc5d4e2,
      roughness: 0.16,
      metalness: 0.08,
      transparent: true,
      opacity: 0.94,
    });
    box(9.2, 0.12, 7.2, mat(0xe7e0d2), cx, y0 + 0.06, cz);
    box(9.4, 0.45, 0.28, base, cx, y0 + 0.28, cz + 3.45);
    box(9.4, 0.45, 0.28, base, cx, y0 + 0.28, cz - 3.45);
    box(0.28, 0.45, 7.2, base, cx - 4.55, y0 + 0.28, cz);
    box(0.28, 0.45, 7.2, base, cx + 4.55, y0 + 0.28, cz);
    box(9.2, 2.7, 0.16, plasterW, cx, y0 + 1.8, cz + 3.4);
    box(0.18, 2.7, 7.0, plasterW, cx - 4.5, y0 + 1.8, cz);
    box(0.18, 2.7, 7.0, plasterW, cx + 4.5, y0 + 1.8, cz);
    box(3.3, 2.7, 0.16, plasterW, cx - 2.85, y0 + 1.8, cz - 3.4);
    box(3.3, 2.7, 0.16, plasterW, cx + 2.85, y0 + 1.8, cz - 3.4);
    box(2.4, 0.7, 0.16, plasterW, cx, y0 + 2.85, cz - 3.4);
    box(9.6, 0.16, 7.6, copper, cx, y0 + 3.28, cz);
    box(8.8, 0.08, 6.6, mat(0xf4efe6, { roughness: 0.9 }), cx, y0 + 3.02, cz);
    box(8.4, 0.1, 6.6, mat(0x8d4e2c, { metalness: 0.35, roughness: 0.4 }), cx, y0 + 3.4, cz);
    for (const x of [-2.2, 2.2]) {
      box(1.5, 1.35, 0.06, glassMat, cx + x, y0 + 1.7, cz - 3.5);
      box(1.35, 1.2, 0.05, glassMat, cx + x, y0 + 1.7, cz - 3.28);
      box(1.7, 0.08, 0.1, brass, cx + x, y0 + 2.42, cz - 3.48);
      box(1.7, 0.08, 0.1, brass, cx + x, y0 + 0.98, cz - 3.48);
    }
    for (const z of [-1.4, 1.4]) {
      box(0.06, 1.25, 1.15, glassMat, cx - 4.62, y0 + 1.7, cz + z);
      box(0.06, 1.25, 1.15, glassMat, cx + 4.62, y0 + 1.7, cz + z);
      box(0.05, 1.1, 1.0, glassMat, cx - 4.36, y0 + 1.7, cz + z);
      box(0.05, 1.1, 1.0, glassMat, cx + 4.36, y0 + 1.7, cz + z);
    }
    box(2.2, 1.5, 0.06, glassMat, cx, y0 + 1.7, cz + 3.52);
    box(2.0, 1.35, 0.05, glassMat, cx, y0 + 1.7, cz + 3.28);
    const board = document.createElement("canvas");
    board.width = 640;
    board.height = 160;
    const bg = board.getContext("2d");
    bg.fillStyle = "#241c16";
    bg.fillRect(0, 0, 640, 160);
    bg.strokeStyle = "#e2b43a";
    bg.lineWidth = 10;
    bg.strokeRect(8, 8, 624, 144);
    bg.fillStyle = "#f3e2a8";
    bg.font = "700 78px Georgia, Times New Roman, serif";
    bg.textAlign = "center";
    bg.textBaseline = "middle";
    bg.fillText("IMPORT", 320, 86);
    const signTex = new THREE.CanvasTexture(board);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4, metalness: 0.15, emissive: 0x3a2a12, emissiveIntensity: 0.25 }),
    );
    plaque.position.set(cx, y0 + 2.82, cz - 3.58);
    plaque.rotation.y = Math.PI;
    scene.add(plaque);
    const counterBody = new THREE.Mesh(softGeo(2.6, 0.9, 0.7, 0.08), dark);
    counterBody.position.set(cx, y0 + 0.95, cz + 1.7);
    counterBody.castShadow = true;
    counterBody.receiveShadow = true;
    scene.add(counterBody);
    box(2.7, 0.08, 0.8, brass, cx, y0 + 1.42, cz + 1.7);
    for (const side of [-1, 1]) {
      const crate = new THREE.Mesh(softGeo(0.7, 0.55, 0.7, 0.07), mat(0xa56b3c, { roughness: 0.75 }));
      crate.position.set(cx + side * 3.3, y0 + 0.4, cz - 4.3);
      crate.castShadow = true;
      scene.add(crate);
      const nugget = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.16, 0),
        oreMats[side < 0 ? "oro" : "smeraldo"],
      );
      nugget.position.set(cx + side * 3.3, y0 + 0.82, cz - 4.3);
      scene.add(nugget);
    }
    dressRoom(cx, cz, y0, "import");
    const porch = new THREE.PointLight(0xffe0b0, 6, 11, 2);
    porch.position.set(cx, y0 + 2.4, cz);
    addLiteLight(scene, porch);
    hinge(cx - 1.22, cz - 3.52, 0, 1.45, new THREE.Vector3(cx, 0, cz - 3.4), 1.26, null, 2.46);
    hinge(cx + 1.22, cz - 3.52, Math.PI, -1.45, new THREE.Vector3(cx, 0, cz - 3.4), 1.26, null, 2.46);
    addBlock(cx - 4.7, cx - 4.3, cz - 3.5, cz + 3.5);
    addBlock(cx + 4.3, cx + 4.7, cz - 3.5, cz + 3.5);
    addBlock(cx - 4.6, cx + 4.6, cz + 3.25, cz + 3.6);
    addBlock(cx - 4.6, cx - 0.9, cz - 3.6, cz - 3.2);
    addBlock(cx + 0.9, cx + 4.6, cz - 3.6, cz - 3.2);
    addBlock(cx - 1.35, cx + 1.35, cz + 1.35, cz + 2.1);
    spots.push({
      x: cx,
      z: cz + 0.55,
      r: 1.55,
      label: () => t("counter"),
      run: () => {
        paintImport();
        importEl.classList.remove("hidden");
      },
    });
  }

  function paintImport() {
    if (!importEl) return;
    const rows = listOres ? listOres() : {};
    const ids = Object.keys(rows);
    let pay = 0;
    importEl.innerHTML = `<h2>${t("importTitle")}</h2><p>${t("importLead")}</p>`;
    if (!ids.length) {
      const empty = document.createElement("p");
      empty.textContent = t("importEmpty");
      importEl.appendChild(empty);
    } else {
      for (const id of ids) {
        const line = document.createElement("p");
        const each = orePay[id] || 0;
        pay += each * rows[id];
        line.textContent = `${t(`item.${id}`)} ×${rows[id]} · ${each * rows[id]} ZCOIN`;
        importEl.appendChild(line);
      }
      const hand = document.createElement("button");
      hand.type = "button";
      hand.textContent = `${t("importHand")} · ${pay} ZCOIN`;
      hand.addEventListener("click", () => {
        const got = sellOres ? sellOres() : 0;
        if (got > 0) toast(t("importPaid").replace("{n}", String(got)));
        paintImport();
      });
      importEl.appendChild(hand);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = t("close");
    close.addEventListener("click", () => importEl.classList.add("hidden"));
    importEl.appendChild(close);
  }

  addImport();

  function dressRoom(cx, cz, y0, kind) {
    const weave = paintTex((g) => {
      g.fillStyle = kind === "pesca" ? "#2c4a62" : "#6d3a48";
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 4) {
        g.fillStyle = y % 8 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
        g.fillRect(0, y, 128, 2);
      }
    });
    const cloth = mapped(weave, 2, 2, 0.84);
    const steel = mat(0xd8dde2, { metalness: 0.7, roughness: 0.28 });
    const darkApp = mat(0x2a2e32, { metalness: 0.35, roughness: 0.4 });
    const screen = new THREE.MeshStandardMaterial({
      color: 0x102028,
      emissive: 0x3d8eb0,
      emissiveIntensity: 0.45,
      roughness: 0.18,
    });
    box(2.4, 0.03, 1.6, cloth, cx - 1.35, y0 + 0.08, cz - 0.55);
    box(1.7, 0.28, 0.62, cloth, cx - 1.55, y0 + 0.34, cz - 0.7);
    box(1.7, 0.42, 0.12, cloth, cx - 1.55, y0 + 0.62, cz - 0.98);
    box(0.12, 0.42, 0.62, cloth, cx - 2.35, y0 + 0.48, cz - 0.7);
    box(0.12, 0.42, 0.62, cloth, cx - 0.75, y0 + 0.48, cz - 0.7);
    addBlock(cx - 2.45, cx - 0.65, cz - 1.1, cz - 0.35);
    box(1.05, 0.06, 0.62, floorWood, cx + 1.35, y0 + 0.74, cz - 0.45);
    for (const [dx, dz] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) {
      box(0.05, 0.68, 0.05, floorWood, cx + 1.35 + dx, y0 + 0.36, cz - 0.45 + dz);
    }
    for (const side of [-0.55, 0.55]) {
      box(0.38, 0.08, 0.38, floorWood, cx + 1.35 + side, y0 + 0.46, cz - 1.15);
      box(0.06, 0.4, 0.06, darkApp, cx + 1.35 + side, y0 + 0.24, cz - 1.15);
    }
    addBlock(cx + 0.8, cx + 1.95, cz - 0.85, cz - 0.1);
    box(0.08, 0.62, 1.05, darkApp, cx + 3.55, y0 + 1.35, cz - 0.2);
    box(0.04, 0.48, 0.86, screen, cx + 3.48, y0 + 1.38, cz - 0.2);
    const art = paintTex((g) => {
      g.fillStyle = "#f4efe6";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = kind === "pesca" ? "#3d7ea6" : "#c46a4a";
      g.beginPath();
      g.arc(64, 78, 36, Math.PI, 0);
      g.fill();
      g.fillStyle = "#2f6a3c";
      g.fillRect(20, 78, 88, 28);
    });
    const painting = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.55),
      new THREE.MeshStandardMaterial({ map: art, roughness: 0.6 }),
    );
    painting.position.set(cx - 2.2, y0 + 1.7, cz + 2.7);
    scene.add(painting);
    box(0.78, 0.04, 0.04, darkApp, cx - 2.2, y0 + 1.7, cz + 2.72);
    if (kind === "import") {
      const linen = mat(0xf6f1e8, { roughness: 0.82 });
      const ceramic = mat(0xf7f7f5, { roughness: 0.28 });
      box(1.55, 0.18, 2.05, floorWood, cx - 2.85, y0 + 0.16, cz + 0.15);
      box(1.4, 0.1, 1.25, linen, cx - 2.85, y0 + 0.3, cz + 0.35);
      box(0.55, 0.1, 0.35, linen, cx - 3.15, y0 + 0.38, cz - 0.7);
      box(0.72, 1.55, 0.42, floorWood, cx - 3.55, y0 + 0.85, cz + 1.7);
      box(0.42, 0.4, 0.55, ceramic, cx + 2.9, y0 + 0.28, cz - 1.55);
      box(0.36, 0.12, 0.48, ceramic, cx + 3.15, y0 + 0.55, cz - 1.15);
      const lampShade = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.14, 8),
        mat(0xfff3d8, { emissive: 0xffc56a, emissiveIntensity: 0.55, roughness: 0.4 }),
      );
      lampShade.position.set(cx + 0.2, y0 + 1.85, cz - 1.4);
      scene.add(lampShade);
      const roomLamp = new THREE.PointLight(0xffe2b0, 4, 6, 2);
      roomLamp.position.set(cx + 0.2, y0 + 1.7, cz - 1.4);
      addLiteLight(scene, roomLamp);
    }
    if (kind === "market") {
      box(0.7, 1.35, 0.62, steel, cx + 2.5, y0 + 0.75, cz + 1.55);
      box(0.5, 0.08, 0.02, darkApp, cx + 2.5, y0 + 1.05, cz + 1.22);
      box(0.62, 0.85, 0.55, steel, cx + 1.5, y0 + 0.5, cz + 1.7);
      box(0.7, 0.04, 0.34, floorWood, cx - 2.6, y0 + 1.15, cz + 0.4);
      box(0.7, 0.04, 0.34, floorWood, cx - 2.6, y0 + 1.55, cz + 0.4);
      addBlock(cx + 2.1, cx + 2.95, cz + 1.15, cz + 2.0);
    }
  }

  function addStore(at, spec) {
    if (!at) return;
    const cx = at.x;
    const cz = at.z;
    const y0 = groundAt(cx, cz);
    const wall = wallCloth("#" + spec.wall.toString(16).padStart(6, "0"), "#d9cfc2");
    const trim = mat(spec.trim, { metalness: 0.35, roughness: 0.4 });
    const frost = new THREE.MeshStandardMaterial({ color: 0xd5e2ec, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.94 });
    box(8.2, 0.1, 6.4, mat(0xe7e0d2), cx, y0 + 0.05, cz);
    box(8.2, 2.55, 0.18, wall, cx, y0 + 1.55, cz + 3.05);
    box(0.18, 2.55, 6.1, wall, cx - 4, y0 + 1.55, cz);
    box(0.18, 2.55, 6.1, wall, cx + 4, y0 + 1.55, cz);
    box(2.7, 2.55, 0.18, wall, cx - 2.55, y0 + 1.55, cz - 3.05);
    box(2.7, 2.55, 0.18, wall, cx + 2.55, y0 + 1.55, cz - 3.05);
    box(2.2, 0.62, 0.18, wall, cx, y0 + 2.55, cz - 3.05);
    box(8.6, 0.14, 6.8, trim, cx, y0 + 2.95, cz);
    box(7.6, 0.08, 5.8, mat(0xf7f4ee), cx, y0 + 2.78, cz);
    box(1.35, 1.15, 0.06, frost, cx - 2.5, y0 + 1.55, cz - 3.16);
    box(1.35, 1.15, 0.06, frost, cx + 2.5, y0 + 1.55, cz - 3.16);
    box(1.15, 1.0, 0.05, frost, cx - 2.5, y0 + 1.55, cz - 2.9);
    box(1.15, 1.0, 0.05, frost, cx + 2.5, y0 + 1.55, cz - 2.9);
    for (const z of [-1.1, 1.15]) {
      box(0.06, 1.15, 1.15, frost, cx - 4.12, y0 + 1.55, cz + z);
      box(0.06, 1.15, 1.15, frost, cx + 4.12, y0 + 1.55, cz + z);
      box(0.05, 1.0, 1.0, frost, cx - 3.86, y0 + 1.55, cz + z);
      box(0.05, 1.0, 1.0, frost, cx + 3.86, y0 + 1.55, cz + z);
    }
    const board = document.createElement("canvas");
    board.width = 640;
    board.height = 140;
    const bg = board.getContext("2d");
    bg.fillStyle = "#172018";
    bg.fillRect(0, 0, 640, 140);
    bg.strokeStyle = spec.sign;
    bg.lineWidth = 8;
    bg.strokeRect(8, 8, 624, 124);
    bg.fillStyle = spec.sign;
    bg.font = "700 64px Georgia, Times New Roman, serif";
    bg.textAlign = "center";
    bg.textBaseline = "middle";
    bg.fillText(spec.title, 320, 74);
    const signTex = new THREE.CanvasTexture(board);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 0.78),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.45, emissive: spec.emissive, emissiveIntensity: 0.2 }),
    );
    plaque.position.set(cx, y0 + 2.42, cz - 3.22);
    plaque.rotation.y = Math.PI;
    scene.add(plaque);
    const shopCounter = new THREE.Mesh(softGeo(2.4, 0.85, 0.6, 0.07), mat(0x2c2824));
    shopCounter.position.set(cx, y0 + 0.85, cz + 1.15);
    shopCounter.castShadow = true;
    shopCounter.receiveShadow = true;
    scene.add(shopCounter);
    box(2.5, 0.07, 0.7, mat(spec.trim, { metalness: 0.5, roughness: 0.3 }), cx, y0 + 1.3, cz + 1.15);
    for (const side of [-1.6, 1.6]) {
      const cab = new THREE.Mesh(softGeo(1.1, 0.9, 0.38, 0.05), mat(0x8d5a3c, { roughness: 0.7 }));
      cab.position.set(cx + side, y0 + 1.15, cz + 0.2);
      cab.castShadow = true;
      scene.add(cab);
    }
    for (const [sx, color] of spec.goods) {
      const prop = new THREE.Mesh(spec.goodGeo, mat(color, { roughness: 0.45 }));
      prop.position.set(cx + sx, y0 + 1.7, cz + 0.2);
      scene.add(prop);
    }
    const lamp = new THREE.PointLight(spec.light, 5, 9, 2);
    lamp.position.set(cx, y0 + 2.3, cz);
    addLiteLight(scene, lamp);
    dressRoom(cx, cz, y0, spec.title === "ZC MARKET" ? "market" : "pesca");
    hinge(cx - 1.22, cz - 3.18, 0, 1.45, new THREE.Vector3(cx, 0, cz - 3.05), 1.26, null, 2.22);
    hinge(cx + 1.22, cz - 3.18, Math.PI, -1.45, new THREE.Vector3(cx, 0, cz - 3.05), 1.26, null, 2.22);
    addBlock(cx - 4.2, cx - 3.8, cz - 3.2, cz + 3.2);
    addBlock(cx + 3.8, cx + 4.2, cz - 3.2, cz + 3.2);
    addBlock(cx - 4.1, cx + 4.1, cz + 2.9, cz + 3.25);
    addBlock(cx - 4.1, cx - 0.85, cz - 3.25, cz - 2.85);
    addBlock(cx + 0.85, cx + 4.1, cz - 3.25, cz - 2.85);
    addBlock(cx - 1.25, cx + 1.25, cz + 0.85, cz + 1.5);
    spots.push({
      x: cx,
      z: cz + 0.15,
      r: 1.5,
      label: () => t("counter"),
      run: spec.run,
    });
  }

  function paintMarket() {
    if (!marketEl) return;
    marketEl.innerHTML = `<h2>${t("marketTitle")}</h2><p>${t("marketLead")}</p>`;
    const buy = document.createElement("button");
    buy.type = "button";
    buy.textContent = t("rodBuy");
    buy.addEventListener("click", () => {
      const result = buyRod ? buyRod() : "money";
      if (result === "have") toast(t("haveRod"));
      else if (result === "money") toast(t("needCoin"));
      else if (result === "full") toast(t("bagFull"));
      else if (result === "ok") toast(t("rodBought"));
      paintMarket();
    });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = t("close");
    close.addEventListener("click", () => marketEl.classList.add("hidden"));
    const skateBtn = document.createElement("button");
    skateBtn.type = "button";
    skateBtn.textContent = t("skateBuy");
    skateBtn.addEventListener("click", () => {
      const result = buySkate ? buySkate() : "money";
      if (result === "have") toast(t("haveSkate"));
      else if (result === "money") toast(t("needCoin"));
      else if (result === "full") toast(t("bagFull"));
      else if (result === "ok") toast(t("skateBought"));
      paintMarket();
    });
    const head = document.createElement("p");
    head.textContent = t("furnShop");
    const pistolBtn = document.createElement("button");
    pistolBtn.type = "button";
    pistolBtn.textContent = t("pistolBuy");
    pistolBtn.addEventListener("click", () => {
      if (!hasItem || !hasItem("porto")) {
        toast(t("needPorto"));
        return;
      }
      if (hasItem("pistola")) {
        toast(t("pistolHave"));
        return;
      }
      if (getZcoin() < 4200) {
        toast(t("needCoin"));
        return;
      }
      if (!bagRoom("pistola", 1)) {
        toast(t("bagFull"));
        return;
      }
      setZcoin(getZcoin() - 4200);
      saveZcoin();
      addToBag("pistola", t("item.pistola"), 1);
      toast(t("pistolGot"));
      paintMarket();
    });
    const ammoBtn = document.createElement("button");
    ammoBtn.type = "button";
    ammoBtn.textContent = t("ammoBuy");
    ammoBtn.addEventListener("click", () => {
      const result = buyAmmo ? buyAmmo() : "money";
      if (result === "money") toast(t("needCoin"));
      else if (result === "full") toast(t("bagFull"));
      else if (result === "cap") toast(t("ammoFull"));
      else if (result === "ok") toast(t("ammoGot"));
      paintMarket();
    });
    marketEl.append(buy, skateBtn, pistolBtn, ammoBtn, head);
    for (const spec of FURN) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${t(`item.${spec.id}`)} · ${spec.price} ZCOIN`;
      button.addEventListener("click", () => {
        if (getZcoin() < spec.price) {
          toast(t("needCoin"));
          return;
        }
        if (!bagRoom(spec.id, 1)) {
          toast(t("bagFull"));
          return;
        }
        setZcoin(getZcoin() - spec.price);
        saveZcoin();
        addToBag(spec.id, t(`item.${spec.id}`), 1);
        toast(t("furnBag"));
      });
      marketEl.appendChild(button);
    }
    marketEl.appendChild(close);
  }

  function paintPesca() {
    if (!pescaEl) return;
    const rows = listFish ? listFish() : {};
    const ids = Object.keys(rows);
    let pay = 0;
    pescaEl.innerHTML = `<h2>${t("pescaTitle")}</h2><p>${t("pescaLead")}</p>`;
    if (!ids.length) {
      const empty = document.createElement("p");
      empty.textContent = t("pescaEmpty");
      pescaEl.appendChild(empty);
    } else {
      for (const id of ids) {
        const line = document.createElement("p");
        const each = fishPay[id] || 0;
        pay += each * rows[id];
        line.textContent = `${t(`item.${id}`)} ×${rows[id]} · ${each * rows[id]} ZCOIN`;
        pescaEl.appendChild(line);
      }
      const hand = document.createElement("button");
      hand.type = "button";
      hand.textContent = `${t("importHand")} · ${pay} ZCOIN`;
      hand.addEventListener("click", () => {
        const got = sellFish ? sellFish() : 0;
        if (got > 0) toast(t("importPaid").replace("{n}", String(got)));
        paintPesca();
      });
      pescaEl.appendChild(hand);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = t("close");
    close.addEventListener("click", () => pescaEl.classList.add("hidden"));
    pescaEl.appendChild(close);
  }

  const rodGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.55, 6);
  rodGeo.rotateZ(Math.PI / 2);
  const fishGeo = new THREE.SphereGeometry(0.1, 8, 6);
  fishGeo.scale(1.6, 0.55, 0.4);
  addStore(marketAt, {
    title: "ZC MARKET",
    wall: 0xf4f7f2,
    trim: 0x1f8a4c,
    sign: "#d7f5e2",
    emissive: 0x12331f,
    light: 0xfff4e0,
    goodGeo: rodGeo,
    goods: [[-1.6, 0x6a4124], [1.6, 0x6a4124]],
    run: () => {
      paintMarket();
      marketEl.classList.remove("hidden");
    },
  });
  function addAtelier(at) {
    if (!at) return;
    const cx = at.x;
    const cz = at.z;
    const y0 = groundAt(cx, cz);
    const wall = wallCloth("#6e2438", "#8a3a4c");
    const trim = mat(0xe2c27a, { metalness: 0.62, roughness: 0.32 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xfff4ea, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.35 });
    box(8.2, 0.1, 6.4, mat(0xf3e6ea), cx, y0 + 0.05, cz);
    box(8.2, 2.55, 0.18, wall, cx, y0 + 1.55, cz - 3.05);
    box(0.18, 2.55, 6.1, wall, cx - 4, y0 + 1.55, cz);
    box(0.18, 2.55, 6.1, wall, cx + 4, y0 + 1.55, cz);
    box(2.7, 2.55, 0.18, wall, cx - 2.55, y0 + 1.55, cz + 3.05);
    box(2.7, 2.55, 0.18, wall, cx + 2.55, y0 + 1.55, cz + 3.05);
    box(2.2, 0.62, 0.18, wall, cx, y0 + 2.55, cz + 3.05);
    box(8.6, 0.16, 6.8, trim, cx, y0 + 2.95, cz);
    box(1.55, 1.35, 0.06, glass, cx - 2.55, y0 + 1.55, cz + 3.16);
    box(1.55, 1.35, 0.06, glass, cx + 2.55, y0 + 1.55, cz + 3.16);
    box(1.35, 1.15, 0.05, glass, cx - 2.55, y0 + 1.55, cz + 2.9);
    box(1.35, 1.15, 0.05, glass, cx + 2.55, y0 + 1.55, cz + 2.9);
    for (const z of [-1.1, 1.1]) {
      box(0.06, 1.2, 1.15, glass, cx - 4.12, y0 + 1.55, cz + z);
      box(0.06, 1.2, 1.15, glass, cx + 4.12, y0 + 1.55, cz + z);
      box(0.05, 1.05, 1.0, glass, cx - 3.86, y0 + 1.55, cz + z);
      box(0.05, 1.05, 1.0, glass, cx + 3.86, y0 + 1.55, cz + z);
    }
    const board = document.createElement("canvas");
    board.width = 640;
    board.height = 140;
    const bg = board.getContext("2d");
    bg.fillStyle = "#3a1020";
    bg.fillRect(0, 0, 640, 140);
    bg.strokeStyle = "#e8c56b";
    bg.lineWidth = 8;
    bg.strokeRect(8, 8, 624, 124);
    bg.fillStyle = "#f6e2a8";
    bg.font = "700 58px Georgia, Times New Roman, serif";
    bg.textAlign = "center";
    bg.textBaseline = "middle";
    bg.fillText("ATELIER", 320, 74);
    const signTex = new THREE.CanvasTexture(board);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 0.78),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4, emissive: 0x4a1828, emissiveIntensity: 0.35 }),
    );
    plaque.position.set(cx, y0 + 2.42, cz + 3.22);
    scene.add(plaque);
    const shopCounter = new THREE.Mesh(softGeo(2.4, 0.85, 0.62, 0.08), mat(0x2a161c));
    shopCounter.position.set(cx, y0 + 0.85, cz - 1.05);
    shopCounter.castShadow = true;
    scene.add(shopCounter);
    box(2.5, 0.07, 0.7, trim, cx, y0 + 1.3, cz - 1.05);
    const dolls = [
      ["dino", -2.55, 1.7],
      ["balloon", 2.55, 1.7],
      ["bear", -2.45, 0.15],
    ];
    for (const [kind, ox, oz] of dolls) {
      const doll = mannequin(kind);
      doll.position.set(cx + ox, y0, cz + oz);
      scene.add(doll);
    }
    const lamp = new THREE.PointLight(0xffd0c8, 6, 10, 2);
    lamp.position.set(cx, y0 + 2.35, cz);
    addLiteLight(scene, lamp);
    hinge(cx - 1.22, cz + 3.18, 0, 1.45, new THREE.Vector3(cx, 0, cz + 3.05), 1.26, null, 2.22);
    hinge(cx + 1.22, cz + 3.18, Math.PI, -1.45, new THREE.Vector3(cx, 0, cz + 3.05), 1.26, null, 2.22);
    addBlock(cx - 4.2, cx - 3.8, cz - 3.2, cz + 3.2);
    addBlock(cx + 3.8, cx + 4.2, cz - 3.2, cz + 3.2);
    addBlock(cx - 4.1, cx + 4.1, cz - 3.25, cz - 2.85);
    addBlock(cx - 4.1, cx - 0.85, cz + 2.85, cz + 3.25);
    addBlock(cx + 0.85, cx + 4.1, cz + 2.85, cz + 3.25);
    addBlock(cx - 1.25, cx + 1.25, cz - 1.4, cz - 0.7);
    spots.push({
      x: cx,
      z: cz - 0.2,
      r: 1.6,
      label: () => t("suitCounter"),
      run: () => openAtelier && openAtelier(),
    });
  }

  addStore(pescaAt, {
    title: "PESCA",
    wall: 0xe7f3f8,
    trim: 0x1d6f9a,
    sign: "#d7f1ff",
    emissive: 0x123044,
    light: 0xfff4e0,
    goodGeo: fishGeo,
    goods: [[-1.6, 0xd5dde4], [0, 0xe0a030], [1.6, 0x3e7a4a]],
    run: () => {
      paintPesca();
      pescaEl.classList.remove("hidden");
    },
  });
  addAtelier(atelierAt);

  function project(obj, x, y, z, el) {
    head.set(x, y, z);
    if (obj) {
      obj.updateMatrixWorld(true);
      head.applyMatrix4(obj.matrixWorld);
    }
    ndc.copy(head).project(camera);
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    const xPx = (ndc.x * 0.5 + 0.5) * w;
    const yPx = (-ndc.y * 0.5 + 0.5) * h;
    if (ndc.z < -1 || ndc.z > 1 || xPx < -80 || xPx > w + 80 || yPx < -80 || yPx > h + 80) {
      el.classList.add("hidden");
      return;
    }
    el.style.left = `${xPx}px`;
    el.style.top = `${yPx}px`;
    el.classList.remove("hidden");
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function smooth(t) {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
  }

  function foodTexture(kind) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    if (kind === "bread") {
      const base = g.createRadialGradient(128, 118, 20, 128, 128, 150);
      base.addColorStop(0, "#f6d7a0");
      base.addColorStop(0.55, "#e2a85a");
      base.addColorStop(1, "#a85a28");
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "#8d4a1e";
      g.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.moveTo(30 + i * 8, 40 + (i % 3) * 18);
        g.bezierCurveTo(80, 70 + i * 16, 150, 40 + i * 12, 220, 90 + i * 14);
        g.stroke();
      }
      for (let i = 0; i < 80; i++) {
        const x = (i * 47) % 256;
        const y = (i * 29) % 256;
        g.fillStyle = i % 4 === 0 ? "rgba(255,248,230,0.45)" : "rgba(120,62,24,0.28)";
        g.beginPath();
        g.ellipse(x, y, 2 + (i % 4), 1.4 + (i % 3), i, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === "crumb") {
      g.fillStyle = "#f3e0b8";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = i % 3 === 0 ? "#e7c98a" : "#fff8ea";
        g.beginPath();
        g.ellipse((i * 53) % 256, (i * 37) % 256, 6 + (i % 5), 4 + (i % 4), 0.4, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === "drops") {
      g.clearRect(0, 0, 256, 256);
      for (let i = 0; i < 46; i++) {
        const x = (i * 61) % 256;
        const y = (i * 43) % 256;
        g.fillStyle = `rgba(255,255,255,${0.15 + (i % 5) * 0.08})`;
        g.beginPath();
        g.ellipse(x, y, 3 + (i % 4), 5 + (i % 6), 0.2, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === "surface") {
      const wash = g.createLinearGradient(0, 0, 256, 256);
      wash.addColorStop(0, "#f4fcff");
      wash.addColorStop(0.45, "#8fd4ef");
      wash.addColorStop(1, "#1f6f9a");
      g.fillStyle = wash;
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.beginPath();
      g.ellipse(90, 78, 36, 18, -0.4, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function bend(name, x, y, z) {
    const bone = bones[name];
    if (!bone) return;
    e.set(x, y, z);
    q.setFromEuler(e);
    bone.quaternion.multiply(q);
  }

  function flatHand(name) {
    const bone = bones[name];
    if (!bone?.parent) return;
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(handParentQ);
    handX.set(1, 0, 0);
    handY.set(0, 0.22, 1).normalize();
    handZ.crossVectors(handX, handY).normalize();
    handY.crossVectors(handZ, handX).normalize();
    handBasis.makeBasis(handX, handY, handZ);
    q.setFromRotationMatrix(handBasis);
    bone.quaternion.copy(handParentQ).invert().multiply(q);
  }

  function applyPose(now) {
    if (!bones.Hips) return;
    if (!pose && riding) {
      lockBones(skateLockNames);
      const go = Math.min(1, skateSpeed / 7);
      const wave = Math.sin(now * (2.2 + go * 4.5));
      const pump = Math.sin(now * (5.5 + go * 3.5));
      const rate = 1.45 + go * 0.85;
      const breath = Math.sin(now * rate);
      const inhale = breath * 0.5 + 0.5;
      const calm = hopPhase === "none" ? 1 : 0.2;
      const depth = (0.055 + go * 0.018) * calm;
      const crouch = hopPhase === "crouch" ? smooth(Math.min(1, hopT / 0.16)) : hopPhase === "land" ? 1 - smooth(Math.min(1, hopT / 0.28)) : 0;
      const rising = hopPhase === "air" && hopV > 0.3;
      const falling = hopPhase === "air" && hopV <= 0.3;
      const push = rising ? Math.min(1, hopV / 4.2) : 0;
      const tuck = falling ? Math.min(1, -hopV / 4.5) : 0;
      const absorb = Math.max(0, -susp) * 7;
      bend("Hips", 0.08 + crouch * 0.28 - push * 0.16 + tuck * 0.06, 0.42, wave * 0.04 * go);
      bend("Spine", 0.1 + go * 0.04 - inhale * depth + crouch * 0.14 - push * 0.2, -0.2, wave * 0.05 * go);
      bend("Spine1", -inhale * depth * 1.15 + crouch * 0.06, 0, 0);
      bend("Spine2", -inhale * depth * 0.7, 0, 0);
      bend("LeftShoulder", inhale * 0.07 * calm, 0, -0.03);
      bend("RightShoulder", inhale * 0.07 * calm, 0, 0.03);
      bend("LeftUpLeg", 0.9 + crouch * 0.42 + absorb * 0.08 + tuck * 0.28 - push * 0.34, -0.35, 0.04);
      bend("RightUpLeg", 0.05 + pump * 0.05 * go + crouch * 0.72 + tuck * 0.32 - push * 0.08, 0.55, -0.04);
      bend("LeftLeg", -0.85 - pump * 0.07 * go - crouch * 0.5 - absorb * 0.12 + push * 0.42 - tuck * 0.15, 0, 0);
      bend("RightLeg", -0.55 - crouch * 0.58 - absorb * 0.1 + push * 0.28 - tuck * 0.12, 0, 0);
      bend("LeftFoot", -0.4 + push * 0.18 - crouch * 0.12, 0, 0);
      bend("RightFoot", -0.24 + push * 0.12 - crouch * 0.1, 0, 0);
      bend("LeftArm", -0.42 + wave * 0.1 * go - push * 0.45 + tuck * 0.2 + crouch * 0.12, 0.22, 0.16 + crouch * 0.2);
      bend("RightArm", -0.16 - wave * 0.12 * go - push * 0.5 + tuck * 0.16 + crouch * 0.1, -0.06, -0.3 - crouch * 0.16);
      bend("LeftForeArm", 0, 0, 0.42 + tuck * 0.2);
      bend("RightForeArm", 0, 0, -0.48 - tuck * 0.18);
      bend("Head", 0.05 - inhale * 0.035 * calm + crouch * 0.08 - push * 0.06, -0.14, -wave * 0.03 * go);
      bones.Hips.position.y -= 0.05 + absorb * 0.045 + crouch * 0.07 - push * 0.03;
      bones.Hips.position.y += inhale * 0.016 * calm;
      return;
    }
    if (pose === "carIn") {
      lockBones(skateLockNames);
      const step = smooth(Math.min(1, poseT / 0.5));
      const sit = smooth(Math.min(1, Math.max(0, (poseT - 0.4) / 0.75)));
      const reach = smooth(Math.min(1, Math.max(0, (poseT - 1.25) / 0.25)));
      const back = smooth(Math.min(1, Math.max(0, (poseT - 2.05) / 0.28)));
      const hand = reach * (1 - back);
      const twist = poseT > 1.4 && poseT < 2.15 ? Math.sin((poseT - 1.4) * 11) : 0;
      bend("LeftUpLeg", mix(0.2, 1.5, sit), mix(0, 0.18, sit), 0.06 * sit);
      bend("RightUpLeg", mix(0.85 * step, 1.5, sit), mix(0, -0.14, sit), -0.06 * sit);
      bend("LeftLeg", mix(0, -1.7, sit), 0, 0);
      bend("RightLeg", mix(-0.55 * step, -1.62, sit), 0, 0);
      bend("LeftFoot", mix(0, 0.62, sit), 0, 0);
      bend("RightFoot", mix(0.15 * step, 0.55, sit), 0, 0);
      bend("Spine", mix(0.35 * step, 0.14, sit), 0, 0);
      bend("Head", mix(0.15 * step, 0.06, sit), 0, 0);
      bend("LeftArm", mix(-0.25, -1.02, sit), mix(0.05, 0.42, sit), mix(0.12, 0.95, sit));
      bend("LeftForeArm", 0, 0.1 * sit, mix(0.15, 0.9, sit));
      bend("RightArm", mix(mix(-0.3, -1.02, sit), -1.25, hand), mix(0, mix(-0.08, -0.55, hand), sit), mix(-0.2, mix(-1.05, -1.25, hand), sit));
      bend("RightForeArm", twist * hand, mix(0, -0.15, hand), mix(mix(-0.2, -0.85, sit), -0.3, hand));
      bones.Hips.position.y -= mix(0.04 * step, 0.5, sit);
      return;
    }
    if (!pose && driving) {
      lockBones(skateLockNames);
      bend("LeftUpLeg", 1.5, 0.18, 0.06);
      bend("RightUpLeg", 1.5, -0.14, -0.06);
      bend("LeftLeg", -1.7, 0, 0);
      bend("RightLeg", -1.62, 0, 0);
      bend("LeftFoot", 0.62, 0, 0);
      bend("RightFoot", 0.55, 0, 0);
      bend("LeftArm", -1.02, 0.42, 0.95);
      bend("RightArm", -1.02, -0.08, -1.05);
      bend("LeftForeArm", 0, 0.1, 0.9);
      bend("RightForeArm", 0, -0.08, -0.85);
      bend("Spine", 0.14, 0, 0);
      bend("Head", 0.06, 0, 0);
      bones.Hips.position.y -= 0.5;
      return;
    }
    if (!pose) return;
    const s = Math.sin(now * 2.1);
    const s2 = Math.sin(now * 3.2);
    if (pose === "sit") {
      bend("LeftUpLeg", 1.55, 0.08, 0.12);
      bend("RightUpLeg", 1.55, -0.08, -0.12);
      bend("LeftLeg", -1.45, 0, 0);
      bend("RightLeg", -1.45, 0, 0);
      bend("LeftArm", -0.35, 0.08, 0.25);
      bend("RightArm", -0.35, -0.08, -0.25);
      bend("Spine", -0.12, 0, 0);
      bones.Hips.position.y -= 0.52;
    } else if (pose === "snack" || pose === "eat" || pose === "drink") {
      lockPhoneArms();
      const drinking = pose === "drink" || (pose === "snack" && glassCup.visible);
      const lift = pose === "snack" ? 0 : smooth(Math.min(1, poseT / (drinking ? 0.85 : 0.7)));
      const chew = pose === "eat" && poseT > 0.75 ? Math.max(0, Math.sin((poseT - 0.75) * 4.2)) : 0;
      const tip = drinking ? smooth(Math.min(1, Math.max(0, (poseT - 0.9) / 1.05))) : 0;
      bend("RightArm", mix(-0.55, -1.15, lift), mix(-0.25, -0.15, lift), mix(-0.85, -1.6, lift));
      bend("RightForeArm", mix(0, -0.05, lift), mix(0.08, 0.1, lift), mix(-0.95, drinking ? -2.05 : -1.9, Math.max(lift, tip)) - chew * 0.05);
      if (drinking) {
        bend("Head", mix(0.18, 0.36, lift) + mix(0, -0.5, tip), mix(-0.06, -0.1, lift), 0);
        bend("Spine", mix(0, 0.1, lift) + mix(0, -0.14, tip), 0, 0);
      } else {
        bend("Head", mix(0.2, 0.48, lift) + chew * 0.12, mix(-0.06, -0.16, lift), 0);
        bend("Spine", mix(0, 0.14, lift), mix(0, 0.05, lift), 0);
      }
      orientGrip(!drinking);
      gripSnack(drinking ? mix(0.95, 1.2, lift) : mix(0.8, 1.05, pose === "snack" ? 1 : lift));
      if (drinking) {
        snack.position.set(0, 0.04, -0.028);
        snack.rotation.set(0, 0, -Math.PI / 2);
        glassCup.rotation.set(mix(0.04, -1.05, tip), 0, 0);
        const level = mix(1, 0.28, tip);
        water.scale.y = level;
        water.position.y = -0.012 - tip * 0.018;
        waterTop.position.y = water.position.y + 0.031 * level;
      } else {
        snack.position.set(0, 0.064 + chew * 0.006, -0.02);
        snack.rotation.set(Math.PI / 2, 0.15, 0);
        loaf.scale.setScalar(1 - Math.min(0.16, Math.max(0, poseT - 0.8) * 0.07));
      }
    } else if (pose === "sleep") {
      if (hero) {
        if (hero.userData.standY == null) hero.userData.standY = hero.position.y;
        hero.rotation.x = -Math.PI / 2;
        hero.rotation.z = Math.PI;
        hero.position.y = hero.userData.standY + 0.34;
      }
      bend("LeftUpLeg", 0.08, 0.02, 0);
      bend("RightUpLeg", 0.08, -0.02, 0);
      bend("LeftLeg", -0.12, 0, 0);
      bend("RightLeg", -0.12, 0, 0);
      bend("LeftArm", 0.2, 0, -0.55);
      bend("RightArm", 0.25, 0, 0.7);
      bend("Head", 0.15, 0, 0);
    } else if (pose === "think") {
      const t = smooth(Math.min(1, poseT / 0.8));
      bend("RightArm", mix(-0.25, -1.2, t), mix(0, 0.38, t), mix(0.1, -0.02, t));
      bend("RightForeArm", 0, 0.12, mix(-0.15, -1.5, t));
      bend("Head", mix(0, 0.2, t), mix(0, 0.14, t), 0);
    } else if (pose === "smoke") {
      const t = smooth(Math.min(1, poseT / 0.7));
      bend("RightArm", mix(-0.2, -1.05, t), 0.2, -0.15);
      bend("RightForeArm", 0, 0.2, mix(-0.2, -1.45, t));
      bend("Head", 0.12 + t * 0.12, -0.22, 0);
    } else if (pose === "stretch") {
      const t = smooth(Math.min(1, poseT / 1.15));
      bend("LeftArm", mix(-0.15, -2.55, t), 0, mix(0, -0.28, t));
      bend("RightArm", mix(-0.15, -2.55, t), 0, mix(0, 0.28, t));
      bend("Spine", mix(0, -0.2, t), 0, 0);
      bend("Head", mix(0, -0.28, t), 0, 0);
    } else if (pose === "phone") {
      lockPhoneArms();
      bend("RightArm", -1.9, 0.15, -2.5);
      bend("RightForeArm", -0.6, 0, 0.6);
      bend("LeftArm", -1.9, -0.15, 2.5);
      bend("LeftForeArm", -0.6, 0, -0.6);
      bend("RightHand", -0.2, 0, 0);
      bend("LeftHand", -0.2, 0, 0);
      bend("RightHand", 0, Math.PI, 0);
      bend("LeftHand", 0, Math.PI, 0);
      bend("Head", 0.5, 0, 0);
      bend("Spine", 0.2, 0, 0);
      bend("RightHandIndex1", -0.5, 0, 0);
      bend("RightHandMiddle1", -0.55, 0, 0);
      bend("RightHandRing1", -0.5, 0, 0);
      bend("RightHandPinky1", -0.4, 0, 0);
      bend("LeftHandIndex1", -0.5, 0, 0);
      bend("LeftHandMiddle1", -0.55, 0, 0);
      bend("LeftHandRing1", -0.5, 0, 0);
      bend("LeftHandPinky1", -0.4, 0, 0);
    } else if (pose === "cam") {
      bend("RightArm", -1.22, 0.22, -0.22);
      bend("RightForeArm", 0, 0.08, -0.78);
      bend("LeftArm", -1.22, -0.22, 0.22);
      bend("LeftForeArm", 0, -0.08, 0.78);
      bend("Head", 0.06, 0, 0);
    } else if (pose === "selfie") {
      bend("RightArm", -1.28, 0.48, -0.52);
      bend("RightForeArm", 0, 0.32, -1.12);
      bend("LeftArm", -0.18, 0, 0.12);
      bend("Head", 0.04, -0.32, 0.05);
    } else if (pose === "skateOn") {
      lockBones(skateLockNames);
      const t = smooth(Math.min(1, poseT / 0.9));
      const hop = Math.sin(Math.min(1, poseT / 0.9) * Math.PI);
      bend("Hips", mix(0, 0.08, t), mix(0, 0.42, t), 0);
      bend("Spine", mix(0, 0.12, t), mix(0, -0.2, t), 0);
      bend("LeftUpLeg", mix(0.16, 0.9, t), mix(0, -0.35, t), 0.04 * t);
      bend("RightUpLeg", mix(0.16, 0.05, t), mix(0, 0.55, t), -0.04 * t);
      bend("LeftLeg", mix(-0.12, -0.85, t), 0, 0);
      bend("RightLeg", mix(-0.12, -0.55, t), 0, 0);
      bend("LeftFoot", mix(0, -0.4, t), 0, 0);
      bend("RightFoot", mix(0, -0.24, t), 0, 0);
      bend("LeftArm", mix(-0.15, -0.42, t), mix(0, 0.22, t), mix(0.08, 0.16, t));
      bend("RightArm", mix(-0.15, -0.16, t), mix(0, -0.06, t), mix(-0.08, -0.3, t));
      bend("LeftForeArm", 0, 0, mix(0.1, 0.42, t));
      bend("RightForeArm", 0, 0, mix(-0.1, -0.48, t));
      bend("Head", 0.04 * t, mix(0, -0.14, t), 0);
      bones.Hips.position.y -= mix(0, 0.05, t) - hop * 0.07;
    } else if (pose === "skateOff") {
      const t = Math.min(1, poseT / 1.3);
      const pull = t < 0.48 ? smooth(t / 0.48) : 1;
      const toss = t < 0.48 ? 0 : smooth((t - 0.48) / 0.52);
      bend("RightArm", mix(-0.35, -1.4, pull) + toss * 1.15, 0.15, -0.1);
      bend("RightForeArm", 0, 0.08, mix(-0.25, -1.25, pull) + toss * 0.9);
      bend("Head", 0.08 * pull, 0, 0);
      bend("LeftUpLeg", 0.28, 0, 0);
      bend("RightUpLeg", 0.28, 0, 0);
      bend("LeftLeg", -0.35, 0, 0);
      bend("RightLeg", -0.35, 0, 0);
    } else if (pose === "shower") {
      bend("LeftArm", -2.2, 0, -0.35);
      bend("RightArm", -0.4, 0, 0.8);
      bend("Head", 0.4, 0, 0);
    } else if (pose === "dance1") {
      bend("Spine", 0, 0, s * 0.16);
      bend("Hips", 0, 0, s * 0.1);
      bend("LeftArm", -0.45 + s * 0.3, 0, -0.5);
      bend("RightArm", -0.45 - s * 0.3, 0, 0.5);
      bend("LeftForeArm", 0, 0, 0.55);
      bend("RightForeArm", 0, 0, -0.55);
    } else if (pose === "dance2") {
      const b = Math.abs(s);
      bones.Hips.position.y += b * 0.05;
      bend("LeftUpLeg", b * 0.28, 0, 0);
      bend("RightUpLeg", b * 0.28, 0, 0);
      bend("LeftArm", -0.35 - b * 0.45, 0, -0.35);
      bend("RightArm", -0.35 - b * 0.45, 0, 0.35);
    } else if (pose === "dance3") {
      const c = (Math.sin(now * 5) + 1) * 0.5;
      bend("LeftArm", -0.95, 0.4, -0.1);
      bend("RightArm", -0.95, -0.4, 0.1);
      bend("LeftForeArm", 0, 0, 1.15 - c * 0.45);
      bend("RightForeArm", 0, 0, -1.15 + c * 0.45);
    } else if (pose === "dance4") {
      bend("Spine", 0, s * 0.5, 0);
      bend("Hips", 0, -s * 0.22, 0);
      bend("LeftArm", -0.5, 0, -0.65);
      bend("RightArm", -0.5, 0, 0.65);
    } else if (pose === "dance5") {
      bend("LeftUpLeg", Math.max(0, s) * 0.55, 0, 0.08);
      bend("RightUpLeg", Math.max(0, -s) * 0.55, 0, -0.08);
      bend("LeftArm", -0.4, 0, -0.35 - s * 0.25);
      bend("RightArm", -0.4, 0, 0.35 + s * 0.25);
    } else if (pose === "dance6") {
      const a = Math.sin(now * 1.5);
      bend("Spine", 0, a * 0.75, 0);
      bend("Hips", 0, -a * 0.35, 0);
      bend("LeftArm", -1.15, 0, -0.35);
      bend("RightArm", -1.15, 0, 0.35);
      bend("Head", 0, a * 0.2, 0);
    } else if (pose === "mine") {
      const period = 1.15;
      const u = (now % period) / period;
      let wind = 0;
      if (u < 0.58) wind = smooth(u / 0.58);
      else if (u < 0.78) wind = 1 - smooth((u - 0.58) / 0.2);
      else wind = 0.08 * (1 - smooth((u - 0.78) / 0.22));
      bend("RightArm", mix(-0.45, -2.25, wind), mix(0.12, 0.62, wind), mix(0.15, 0.95, wind));
      bend("RightForeArm", 0, 0.05, mix(-0.2, -1.25, wind));
      bend("Spine", mix(0.48, -0.12, wind), mix(0.28, 0.04, wind), 0);
      bend("Head", mix(0.62, 0.12, wind), 0.04, 0);
      bend("LeftArm", -0.22, 0, -0.48);
      bend("LeftUpLeg", 0.1, 0, 0.05);
      bend("RightUpLeg", 0.16, 0, -0.04);
      pickaxe.rotation.z = mix(-1.35, -0.55, wind);
    } else if (pose === "fish") {
      const cast = smooth(Math.min(1, poseT / 1.15));
      const wait = poseT > 1.15 && poseT < 5.1;
      const lift = smooth(Math.min(1, Math.max(0, (poseT - 5.1) / 0.9)));
      const bob = wait ? Math.sin(now * 1.6) * 0.08 : 0;
      const back = cast < 1 ? 1 - cast : 0;
      bend("RightArm", mix(-0.4, -2.05, back) * (1 - lift) + lift * -1.15, 0.15, mix(0.2, 0.7, back));
      bend("RightForeArm", 0, 0.05, mix(-0.35, -0.9, back) - bob);
      bend("Spine", mix(0.08, -0.12, back) + lift * 0.05, 0.12, 0);
      bend("Head", 0.28 - lift * 0.1, 0.05, 0);
      bend("LeftArm", -0.35, 0.1, -0.2);
      rod.rotation.z = mix(-0.9, -0.35, back) + bob;
      fishLine.scale.y = mix(1, 0.35, lift);
      caughtFish.visible = lift > 0.15;
      caughtFish.position.y = mix(-0.68, -0.22, lift);
    } else if (pose === "dance7") {
      bend("RightArm", -2.15, 0.12, 0.12);
      bend("RightForeArm", 0, 0, -0.35 + Math.sin(now * 7) * 0.5);
      bend("LeftArm", -0.28, 0, -0.22);
      bend("Head", 0.05, Math.sin(now * 2) * 0.12, 0);
    }
  }

  function fmt(n) {
    const s = String(n);
    return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`;
  }

  function renderPhone() {
    const clock = document.getElementById("phone-clock");
    const now = new Date();
    clock.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    phoneBody.innerHTML = "";
    if (!phone) return;
    if (!phone.lang || !phone.pin) {
      const h = document.createElement("h3");
      h.textContent = phone.pending ? t("pinAgain") : t("language");
      phoneBody.appendChild(h);
      if (!phone.lang) {
        const grid = document.createElement("div");
        grid.className = "phone-list";
        for (const lang of LANGS) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = lang.label;
          btn.addEventListener("click", () => {
            phone.lang = lang.id;
            setLanguage(lang.id);
            savePhone();
            renderPhone();
          });
          grid.appendChild(btn);
        }
        phoneBody.appendChild(grid);
        return;
      }
      const input = document.createElement("input");
      input.inputMode = "numeric";
      input.maxLength = 4;
      input.placeholder = "PIN";
      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = "solid";
      ok.textContent = L("Confirm", "Conferma");
      ok.addEventListener("click", () => {
        const pin = input.value.replace(/\D/g, "").slice(0, 4);
        if (pin.length < 4) return;
        if (!phone.pending) {
          phone.pending = pin;
          savePhone();
          renderPhone();
          return;
        }
        if (phone.pending !== pin) {
          phone.pending = null;
          toast(t("pinMismatch"));
          renderPhone();
          return;
        }
        phone.pin = pin;
        phone.pending = null;
        savePhone();
        screen = "home";
        renderPhone();
      });
      phoneBody.append(input, ok);
      return;
    }
    if (screen === "home") {
      const apps = [
        ["calls", "☎", L("Phone", "Telefono"), "#34c759"],
        ["messages", "✉", L("Messages", "Messaggi"), "#34c759"],
        ["camera", "◉", L("Camera", "Fotocamera"), "#1c1c1e"],
        ["photos", "▣", L("Photos", "Foto"), "#ff9f0a"],
        ["contacts", "☺", L("Contacts", "Rubrica"), "#8e8e93"],
        ["services", "+", L("Services", "Servizi"), "#ff3b30"],
        ["zsocial", "Z", "ZSocial", "#111111"],
      ];
      const grid = document.createElement("div");
      grid.className = "apps";
      for (const [id, ico, label, color] of apps) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.innerHTML = `<span class="app-ico" style="background:${color};color:#fff">${ico}</span>${label}`;
        btn.addEventListener("click", () => {
          if (id === "camera") camMode = "photo";
          screen = id;
          renderPhone();
        });
        grid.appendChild(btn);
      }
      const dock = document.createElement("div");
      dock.className = "dock";
      for (const [id, ico, color] of [
        ["calls", "☎", "#34c759"],
        ["camera", "◉", "#1c1c1e"],
        ["messages", "✉", "#34c759"],
        ["photos", "▣", "#ff9f0a"],
      ]) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.innerHTML = `<span class="app-ico" style="background:${color};color:#fff">${ico}</span>`;
        btn.addEventListener("click", () => {
          if (id === "camera") camMode = "photo";
          screen = id;
          renderPhone();
        });
        dock.appendChild(btn);
      }
      phoneBody.append(grid, dock);
      return;
    }
    const back = () => {
      screen = "home";
      renderPhone();
    };
    const title = document.createElement("h3");
    phoneBody.appendChild(title);
    if (screen === "calls") {
      title.textContent = L("Calls", "Chiamate");
      const dial = document.createElement("input");
      dial.inputMode = "numeric";
      dial.value = "";
      const keys = document.createElement("div");
      keys.className = "keys";
      for (const k of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"]) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = k;
        b.addEventListener("click", () => {
          dial.value += k;
        });
        keys.appendChild(b);
      }
      const call = document.createElement("button");
      call.type = "button";
      call.className = "call-go";
      call.textContent = L("Call", "Chiama");
      call.addEventListener("click", () => {
        const n = dial.value.replace(/\D/g, "");
        phone.calls.unshift({ n, at: Date.now() });
        phone.calls = phone.calls.slice(0, 8);
        savePhone();
        toast(n === phone.number ? L("That is your number", "È il tuo numero") : L("No answer", "Nessuna risposta"));
      });
      phoneBody.append(dial, keys, call);
    } else if (screen === "contacts") {
      title.textContent = L("Contacts", "Rubrica");
      const me = document.createElement("p");
      me.textContent = `${t("you")} · ${fmt(phone.number)}`;
      phoneBody.appendChild(me);
      const share = document.createElement("button");
      share.type = "button";
      share.className = "solid";
      share.textContent = t("airdrop");
      share.addEventListener("click", shareContact);
      phoneBody.appendChild(share);
      const list = document.createElement("div");
      list.className = "phone-list";
      for (const c of phone.contacts) {
        const row = document.createElement("button");
        row.type = "button";
        row.textContent = `${c.name} · ${fmt(c.number)}`;
        list.appendChild(row);
      }
      phoneBody.appendChild(list);
    } else if (screen === "messages") {
      title.textContent = L("Messages", "Messaggi");
      const who = document.createElement("select");
      const self = document.createElement("option");
      self.value = phone.number;
      self.textContent = t("you");
      who.appendChild(self);
      for (const c of phone.contacts) {
        const opt = document.createElement("option");
        opt.value = c.number;
        opt.textContent = c.name;
        who.appendChild(opt);
      }
      const thread = document.createElement("div");
      const draw = () => {
        thread.innerHTML = "";
        for (const line of phone.threads[who.value] || []) {
          const p = document.createElement("p");
          p.className = "bubble-out";
          p.textContent = line;
          thread.appendChild(p);
        }
      };
      who.addEventListener("change", draw);
      const input = document.createElement("input");
      input.maxLength = 140;
      const send = document.createElement("button");
      send.type = "button";
      send.className = "solid";
      send.textContent = L("Send", "Invia");
      send.addEventListener("click", () => {
        const text = input.value.trim();
        if (!text) return;
        phone.threads[who.value] = phone.threads[who.value] || [];
        phone.threads[who.value].push(text);
        input.value = "";
        savePhone();
        draw();
      });
      draw();
      phoneBody.append(who, thread, input, send);
    } else if (screen === "photos") {
      title.textContent = L("Photos", "Foto");
      const row = document.createElement("div");
      row.className = "modes";
      for (const [kind, label] of [
        ["photo", L("Photo", "Foto")],
        ["selfie", "Selfie"],
        ["video", L("Video", "Video")],
      ]) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.addEventListener("click", () => {
          camMode = kind;
          screen = "camera";
          renderPhone();
        });
        row.appendChild(b);
      }
      const gal = document.createElement("div");
      gal.className = "phone-list";
      for (const item of phone.gallery) {
        const img = document.createElement("img");
        img.src = item.frames[0];
        img.className = "shot";
        gal.appendChild(img);
      }
      phoneBody.append(row, gal);
    } else if (screen === "camera") {
      title.textContent = camMode === "selfie" ? "Selfie" : camMode === "video" ? L("Video", "Video") : L("Photo", "Foto");
      const finder = document.createElement("div");
      finder.className = "finder";
      const img = document.createElement("img");
      img.id = "finder-preview";
      img.alt = "";
      finder.appendChild(img);
      const shutter = document.createElement("button");
      shutter.type = "button";
      shutter.className = rec ? "shutter rec" : "shutter";
      shutter.textContent = camMode === "video" && rec ? L("Stop", "Stop") : "";
      shutter.addEventListener("click", () => takeShot());
      phoneBody.append(finder, shutter);
      grab(camMode === "selfie").then((frame) => {
        const live = document.getElementById("finder-preview");
        if (live && screen === "camera" && !rec) live.src = frame;
      });
    } else if (screen === "services") {
      title.textContent = L("Services", "Servizi");
      for (const name of [L("Police", "Polizia"), L("Ambulance", "Ambulanza")]) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = `${name} · ${t("servicesSoon")}`;
        b.disabled = true;
        phoneBody.appendChild(b);
      }
    } else if (screen === "zsocial") {
      title.textContent = "ZSocial";
      const tabs = document.createElement("div");
      tabs.className = "pad-row";
      const feedBtn = document.createElement("button");
      feedBtn.type = "button";
      feedBtn.textContent = L("Feed", "Bacheca");
      const profBtn = document.createElement("button");
      profBtn.type = "button";
      profBtn.textContent = L("Profile", "Profilo");
      const pubBtn = document.createElement("button");
      pubBtn.type = "button";
      pubBtn.textContent = L("Publish", "Pubblica");
      tabs.append(feedBtn, profBtn, pubBtn);
      const view = document.createElement("div");
      const showFeed = () => {
        view.innerHTML = "";
        view.className = "feed";
        if (!phone.posts.length) {
          const p = document.createElement("p");
          p.textContent = t("noPosts");
          view.appendChild(p);
          return;
        }
        phone.posts.forEach((post, index) => {
          const card = document.createElement("article");
          const img = document.createElement("img");
          img.src = post.frames[0];
          img.dataset.post = String(index);
          img.className = "shot";
          const cap = document.createElement("p");
          cap.textContent = post.text;
          const like = document.createElement("button");
          like.type = "button";
          like.textContent = post.liked ? `♥ ${post.likes}` : `♡ ${post.likes}`;
          like.addEventListener("click", () => {
            post.liked = !post.liked;
            post.likes += post.liked ? 1 : -1;
            savePhone();
            showFeed();
          });
          const save = document.createElement("button");
          save.type = "button";
          save.textContent = post.saved ? L("Saved", "Salvato") : L("Save", "Salva");
          save.addEventListener("click", () => {
            post.saved = !post.saved;
            savePhone();
            showFeed();
          });
          const comments = document.createElement("div");
          for (const c of post.comments) {
            const p = document.createElement("p");
            p.textContent = c;
            comments.appendChild(p);
          }
          const input = document.createElement("input");
          input.placeholder = L("Comment", "Commento");
          input.addEventListener("keydown", (ev) => {
            if (ev.key !== "Enter") return;
            const text = input.value.trim();
            if (!text) return;
            post.comments.push(text);
            savePhone();
            showFeed();
          });
          card.append(img, cap, like, save, comments, input);
          card.dataset.index = String(index);
          view.appendChild(card);
        });
      };
      const showProfile = () => {
        view.className = "";
        view.innerHTML = "";
        const name = document.createElement("h3");
        name.textContent = t("you");
        view.appendChild(name);
        if (phone.profile) {
          const img = document.createElement("img");
          img.src = phone.profile;
          img.className = "shot";
          view.appendChild(img);
        }
        const pick = document.createElement("div");
        pick.className = "phone-list";
        for (const item of phone.gallery) {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = L("Use this picture", "Usa questa foto");
          b.addEventListener("click", () => {
            phone.profile = item.frames[0];
            savePhone();
            showProfile();
          });
          const img = document.createElement("img");
          img.src = item.frames[0];
          img.className = "shot";
          pick.append(img, b);
        }
        view.appendChild(pick);
      };
      const showPub = () => {
        view.className = "phone-list";
        view.innerHTML = "";
        if (!phone.gallery.length) {
          const p = document.createElement("p");
          p.textContent = t("noPosts");
          view.appendChild(p);
          return;
        }
        for (const item of phone.gallery) {
          const img = document.createElement("img");
          img.src = item.frames[0];
          img.className = "shot";
          const input = document.createElement("textarea");
          input.maxLength = 140;
          input.placeholder = L("Description", "Descrizione");
          const b = document.createElement("button");
          b.type = "button";
          b.className = "solid";
          b.textContent = L("Publish", "Pubblica");
          b.addEventListener("click", () => {
            phone.posts.unshift({
              frames: item.frames,
              text: input.value.trim(),
              likes: 0,
              liked: false,
              saved: false,
              comments: [],
            });
            savePhone();
            showFeed();
          });
          view.append(img, input, b);
        }
      };
      feedBtn.addEventListener("click", showFeed);
      profBtn.addEventListener("click", showProfile);
      pubBtn.addEventListener("click", showPub);
      phoneBody.append(tabs, view);
      showFeed();
    }
    if (screen !== "calls" && screen !== "camera") {
      const home = document.createElement("button");
      home.type = "button";
      home.className = "solid";
      home.textContent = L("Back", "Indietro");
      home.addEventListener("click", back);
      phoneBody.appendChild(home);
    }
  }

  function openPhone() {
    if (!phone) return;
    phoneOpen = true;
    phoneRoot.classList.remove("hidden");
    pose = "phone";
    poseT = 0;
    screen = phone.pin ? "home" : "setup";
    renderPhone();
    holdPhone();
  }

  function closePhone() {
    phoneOpen = false;
    phoneRoot.classList.add("hidden");
    if (pose === "phone" || pose === "cam" || pose === "selfie") pose = null;
    if (hero) {
      hero.rotation.x = 0;
      hero.rotation.z = 0;
    }
    if (rec && !rec.saved) finishRec();
  }

  function nearestNpc() {
    const p = player.group.position;
    let best = null;
    let bestD = 2.3;
    npcs.forEach((npc, index) => {
      const d = Math.hypot(npc.pivot.position.x - p.x, npc.pivot.position.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = { npc, index };
      }
    });
    return best;
  }

  function shareContact() {
    if (!phone) return;
    const near = nearestNpc();
    if (!near) {
      toast(L("Step closer to someone", "Avvicinati a qualcuno"));
      return;
    }
    offer = { index: near.index, until: performance.now() + 8000 };
    npcBubble.innerHTML = "";
    const label = document.createElement("span");
    label.textContent = `${t("you")} · ${fmt(phone.number)}`;
    const yes = document.createElement("button");
    yes.type = "button";
    yes.textContent = t("accept");
    yes.addEventListener("click", () => {
      const number = String(330000000 + near.index);
      if (!phone.contacts.some((c) => c.number === number)) {
        phone.contacts.push({ name: `${L("Passerby", "Passante")} ${near.index + 1}`, number });
        savePhone();
      }
      offer = null;
      npcBubble.classList.add("hidden");
      toast(L("Contact saved", "Contatto salvato"));
      if (phoneOpen && screen === "contacts") renderPhone();
    });
    const no = document.createElement("button");
    no.type = "button";
    no.textContent = t("decline");
    no.addEventListener("click", () => {
      offer = null;
      npcBubble.classList.add("hidden");
      toast(L("Declined", "Rifiutato"));
    });
    npcBubble.append(label, yes, no);
  }

  function shrink(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const w = 180;
        const h = Math.max(1, Math.round((w * img.height) / img.width));
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.55));
      };
      img.src = dataUrl;
    });
  }

  const shotW = 320;
  const shotH = 240;
  const shotRT = new THREE.WebGLRenderTarget(shotW, shotH);
  const shotBuf = new Uint8Array(shotW * shotH * 4);
  const shotCanvas = document.createElement("canvas");
  shotCanvas.width = shotW;
  shotCanvas.height = shotH;
  const shotCtx = shotCanvas.getContext("2d", { willReadFrequently: true });

  async function grab(selfie) {
    const savedPos = camera.position.clone();
    const savedQ = camera.quaternion.clone();
    if (selfie) {
      const yaw = player.group.rotation.y;
      const p = player.group.position;
      camera.position.set(p.x + Math.sin(yaw) * 0.95, p.y + 1.55, p.z + Math.cos(yaw) * 0.95);
      camera.lookAt(p.x, p.y + 1.5, p.z);
    }
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(shotRT);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(shotRT, 0, 0, shotW, shotH, shotBuf);
    renderer.setRenderTarget(prev);
    camera.position.copy(savedPos);
    camera.quaternion.copy(savedQ);
    const img = shotCtx.createImageData(shotW, shotH);
    const row = shotW * 4;
    for (let y = 0; y < shotH; y++) {
      const src = (shotH - 1 - y) * row;
      img.data.set(shotBuf.subarray(src, src + row), y * row);
    }
    shotCtx.putImageData(img, 0, 0);
    return shotCanvas.toDataURL("image/jpeg", 0.62);
  }

  function saveShot(kind, frames) {
    if (!frames.length) return;
    phone.gallery.unshift({ kind, frames });
    phone.gallery = phone.gallery.slice(0, 8);
    savePhone();
  }

  async function takeShot() {
    if (camMode === "video") {
      if (rec && !rec.saved) finishRec();
      else {
        rec = { frames: [], selfie: camMode === "selfie", wait: 0, busy: false, saved: false, stopRequested: false };
        renderPhone();
      }
      return;
    }
    const frame = await grab(camMode === "selfie");
    saveShot(camMode === "selfie" ? "selfie" : "photo", [frame]);
    const img = document.getElementById("finder-preview");
    if (img) img.src = frame;
  }

  function finishRec() {
    if (!rec || rec.saved) return;
    rec.saved = true;
    const frames = rec.frames.slice();
    rec = null;
    saveShot("video", frames);
    if (phoneOpen && screen === "camera") renderPhone();
  }

  document.getElementById("acts-open").addEventListener("click", () => {
    paintActs();
    acts.classList.remove("hidden");
  });
  actBtn.addEventListener("click", () => actBtn._run && actBtn._run());
  function standUp() {
    if (pose === "mine" || pose === "eat" || pose === "drink" || pose === "skateOn" || pose === "skateOff" || pose === "carIn") return;
    pose = null;
    seat = null;
    if (!hero) return;
    hero.rotation.x = 0;
    hero.rotation.z = 0;
    if (hero.userData.standY != null) hero.position.y = hero.userData.standY;
  }
  stopBtn.addEventListener("click", () => {
    if (pose === "phone" || pose === "cam" || pose === "selfie") return;
    standUp();
  });
  document.getElementById("chat-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    const line = document.createElement("div");
    line.className = "chat-line";
    line.textContent = text;
    bubble.appendChild(line);
    chats.push({ el: line, born: performance.now() });
    input.value = "";
    project(player.group, 0, 2.15, 0, bubble);
  });
  document.getElementById("phone-toggle").addEventListener("click", () => {
    if (phoneOpen) closePhone();
    else openPhone();
  });
  const dim = document.getElementById("phone-dim");
  let dimX = 0;
  let dimY = 0;
  let dimMoved = false;
  dim.addEventListener("pointerdown", (ev) => {
    dimX = ev.clientX;
    dimY = ev.clientY;
    dimMoved = false;
    dim.setPointerCapture(ev.pointerId);
  });
  dim.addEventListener("pointermove", (ev) => {
    if (!dim.hasPointerCapture(ev.pointerId)) return;
    const dx = ev.clientX - dimX;
    const dy = ev.clientY - dimY;
    if (Math.hypot(dx, dy) > 4) dimMoved = true;
    look(dx, dy);
    dimX = ev.clientX;
    dimY = ev.clientY;
  });
  dim.addEventListener("pointerup", () => {
    if (!dimMoved) closePhone();
  });
  document.getElementById("phone-back").addEventListener("click", () => {
    if (!phone || !phone.pin || screen === "home" || screen === "setup") closePhone();
    else {
      screen = "home";
      renderPhone();
    }
  });

  let downX = 0;
  let downY = 0;
  renderer.domElement.addEventListener("pointerdown", (ev) => {
    downX = ev.clientX;
    downY = ev.clientY;
  });
  renderer.domElement.addEventListener("pointerup", (ev) => {
    if (!placeMode) return;
    if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 8) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pads, false)[0];
    if (!hit) return;
    const plot = plots.find((p) => p.id === hit.object.userData.plot);
    placeOn(plot);
  });

  paintActs();
  if (phone) phoneToggle.classList.remove("hidden");
  const retitle = () => {
    document.getElementById("chat-input").placeholder = t("chatPh");
    document.getElementById("acts-open").textContent = t("actions");
    phoneToggle.textContent = t("takePhone");
  };
  retitle();
  onLang(retitle);

  const phoneLockNames = [];
  const skateLockNames = [];
  const armRest = {};

  function lockBones(names) {
    for (const name of names) {
      const bone = bones[name];
      const rest = armRest[name];
      if (bone && rest) bone.quaternion.copy(rest);
    }
  }

  function lockPhoneArms() {
    lockBones(phoneLockNames);
  }

  function orientGrip(eat) {
    const bone = bones.RightHand;
    if (!bone?.parent || !bones.Head) return;
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(handParentQ);
    bone.updateWorldMatrix(false, false);
    bones.Head.updateWorldMatrix(true, false);
    gripFrom.setFromMatrixPosition(bone.matrixWorld);
    gripTo.setFromMatrixPosition(bones.Head.matrixWorld);
    gripTo.y -= 0.07;
    handZ.subVectors(gripFrom, gripTo);
    if (eat) {
      if (handZ.lengthSq() < 1e-6) handZ.set(0, 0, 1);
      handZ.normalize();
      handY.set(0, 1, 0);
      handX.crossVectors(handY, handZ);
      if (handX.lengthSq() < 1e-4) handX.set(1, 0, 0);
      handX.normalize();
      handY.crossVectors(handZ, handX).normalize();
    } else {
      handZ.y = 0;
      if (handZ.lengthSq() < 1e-4) handZ.set(-1, 0, 0);
      handZ.normalize();
      handX.set(0, 1, 0);
      handY.crossVectors(handZ, handX).normalize();
      handZ.crossVectors(handX, handY).normalize();
    }
    handBasis.makeBasis(handX, handY, handZ);
    q.setFromRotationMatrix(handBasis);
    bone.quaternion.copy(handParentQ).invert().multiply(q);
  }

  function gripSnack(curl) {
    const joints = [
      ["Index", 0.92],
      ["Middle", 1],
      ["Ring", 0.95],
      ["Pinky", 0.78],
    ];
    for (const [name, w] of joints) {
      bend(`RightHand${name}1`, -curl * w, 0, 0);
      bend(`RightHand${name}2`, -curl * w * 0.82, 0, 0);
      bend(`RightHand${name}3`, -curl * w * 0.5, 0, 0);
    }
    bend("RightHandThumb1", 0.8, -0.6, 0.9);
    bend("RightHandThumb2", 0.45, 0.12, 0);
    bend("RightHandThumb3", 0.3, 0, 0);
  }

  function pointGun(dir, upHint) {
    const parent = gun.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    parent.getWorldQuaternion(gunParentQ);
    gunZ.copy(dir);
    if (gunZ.lengthSq() < 1e-6) gunZ.copy(gunDown);
    gunZ.normalize();
    gunY.copy(upHint && upHint.lengthSq() > 1e-6 ? upHint : gunAhead.set(0, 1, 0)).normalize();
    if (Math.abs(gunZ.dot(gunY)) > 0.96) gunY.set(1, 0, 0);
    gunX.crossVectors(gunY, gunZ);
    if (gunX.lengthSq() < 1e-6) gunX.set(1, 0, 0);
    gunX.normalize();
    gunY.crossVectors(gunZ, gunX).normalize();
    gunBasis.makeBasis(gunX, gunY, gunZ);
    gunWorldQ.setFromRotationMatrix(gunBasis);
    gun.quaternion.copy(gunParentQ).invert().multiply(gunWorldQ);
  }

  return {
    bind(root, idleClip) {
      hero = root;
      bones = {};
      root.traverse((obj) => {
        if (obj.isBone) bones[obj.name] = obj;
      });
      phoneLockNames.length = 0;
      skateLockNames.length = 0;
      for (const name of Object.keys(bones)) {
        if (/Shoulder|Arm|Hand|Head|Neck|Spine/.test(name)) phoneLockNames.push(name);
        if (/Shoulder|Arm|Hand|Head|Neck|Spine|UpLeg|Leg|Foot|Hips/.test(name)) skateLockNames.push(name);
      }
      if (idleClip) {
        const savedQ = {};
        const savedP = {};
        for (const name of Object.keys(bones)) {
          savedQ[name] = bones[name].quaternion.clone();
          savedP[name] = bones[name].position.clone();
        }
        const probe = new THREE.AnimationMixer(root);
        probe.clipAction(idleClip).play();
        probe.setTime(0.4);
        for (const name of skateLockNames) {
          if (bones[name]) armRest[name] = bones[name].quaternion.clone();
        }
        probe.stopAllAction();
        for (const name of Object.keys(savedQ)) {
          bones[name].quaternion.copy(savedQ[name]);
          bones[name].position.copy(savedP[name]);
        }
        probe.uncacheRoot(root);
      }
      if (bones.RightHand) {
        bones.RightHand.add(cig);
        cig.position.set(0, 0.14, 0);
        cig.rotation.z = Math.PI / 2;
        bones.RightHand.add(phoneProp);
        bones.RightHand.add(snack);
        bones.RightHand.add(pickaxe);
        bones.RightHand.add(rod);
        bones.RightHand.add(gun);
        if (bones.Head) bones.Head.add(helmet);
        pickaxe.position.set(0.02, 0.16, 0.04);
        pickaxe.rotation.set(0.4, 0.2, -0.9);
        rod.position.set(0.02, 0.12, 0.02);
        rod.rotation.set(0.35, 0.2, -0.8);
      }
    },
    say(text) {
      toast(text);
    },
    showGun(on) {
      gun.visible = !!on && !riding;
      if (!on) gunAim = false;
    },
    aimGun(on) {
      gunAim = !!on && gun.visible;
    },
    muzzle(pos, dir) {
      if (!gun.visible) return false;
      muzzleTip.updateWorldMatrix(true, false);
      muzzleTip.getWorldPosition(pos);
      muzzleTip.getWorldDirection(dir);
      if (dir.lengthSq() < 0.5) return false;
      return true;
    },
    bendAim(wantDir, dt) {
      if (driving || pose === "carIn") {
        gun.visible = false;
        return;
      }
      const going = gunAim && bones.RightArm && bones.RightHand ? 1 : 0;
      const step = 1 - Math.exp(-9 * Math.max(dt || 0, 0));
      aimBlend += (going - aimBlend) * step;
      const carry = gun.visible && gun.parent;
      if (aimBlend < 0.02 || !bones.RightArm || !bones.RightHand) {
        gun.position.copy(gunRestPos);
        if (carry && bones.RightArm) {
          if (armRest.RightArm) bones.RightArm.quaternion.copy(armRest.RightArm);
          if (bones.RightForeArm && armRest.RightForeArm) bones.RightForeArm.quaternion.copy(armRest.RightForeArm);
          e.set(0.2, 0.2, -0.1);
          q.setFromEuler(e);
          bones.RightArm.quaternion.multiply(q);
          gunAhead.set(0, 0, 1);
          if (hero?.parent) gunAhead.applyQuaternion(hero.parent.quaternion);
          pointGun(gunDown, gunAhead);
        } else gun.quaternion.copy(gunRest);
        if (aimBlend < 0.02) aimBlend = 0;
        return;
      }
      const w = aimBlend;
      let armPitch = 0;
      if (wantDir) {
        gunAhead.set(0, 0, 1);
        if (hero?.parent) gunAhead.applyQuaternion(hero.parent.quaternion);
        const flat = Math.hypot(wantDir.x, wantDir.z);
        armPitch = THREE.MathUtils.clamp(Math.atan2(wantDir.y, Math.max(flat, 0.25)) * 2.8, -0.65, 0.6);
      }
      if (armRest.RightArm && bones.RightForeArm && armRest.RightForeArm) {
        handParentQ.copy(armRest.RightArm);
        e.set(0.2, 0.2, -0.1);
        q.setFromEuler(e);
        handParentQ.multiply(q);
        gunWorldQ.copy(armRest.RightArm);
        e.set(0, -0.4, -1.8);
        q.setFromEuler(e);
        gunWorldQ.multiply(q);
        e.set(0, armPitch, 0);
        q.setFromEuler(e);
        gunWorldQ.multiply(q);
        bones.RightArm.quaternion.copy(handParentQ).slerp(gunWorldQ, w);
        handParentQ.copy(armRest.RightForeArm);
        gunWorldQ.copy(armRest.RightForeArm);
        e.set(0, 0, 0.05);
        q.setFromEuler(e);
        gunWorldQ.multiply(q);
        bones.RightForeArm.quaternion.copy(handParentQ).slerp(gunWorldQ, w);
        if (armRest.RightHand && bones.RightHand) {
          q.copy(bones.RightHand.quaternion);
          bones.RightHand.quaternion.copy(q).slerp(armRest.RightHand, w);
        }
      } else {
        e.set(0, -0.4 * w, -1.8 * w);
        q.setFromEuler(e);
        bones.RightArm.quaternion.multiply(q);
        e.set(0, armPitch * w, 0);
        q.setFromEuler(e);
        bones.RightArm.quaternion.multiply(q);
        if (bones.RightForeArm) {
          e.set(0, 0, 0.05 * w);
          q.setFromEuler(e);
          bones.RightForeArm.quaternion.multiply(q);
        }
      }
      for (const name of ["RightHandIndex1", "RightHandMiddle1", "RightHandRing1", "RightHandPinky1"]) {
        const bone = bones[name];
        if (!bone) continue;
        e.set(0.85 * w, 0, 0);
        aimDelta.setFromEuler(e);
        bone.quaternion.multiply(aimDelta);
      }
      gun.position.copy(gunRestPos).lerp(gunAimPos, w);
      if (carry && wantDir) pointGun(wantDir, gunAhead.set(0, 1, 0));
      else gun.quaternion.copy(gunRest).slerp(gunAimRot, w);
    },
    holdSnack(kind) {
      if (pose === "eat" || pose === "drink") return;
      snack.visible = kind === "pane" || kind === "acqua";
      loaf.visible = kind === "pane";
      glassCup.visible = kind === "acqua";
      glassCup.rotation.set(0.04, 0, 0);
      water.scale.y = 1;
      water.position.y = -0.012;
      waterTop.position.y = 0.019;
      loaf.scale.setScalar(1);
      pose = snack.visible ? "snack" : pose === "snack" ? null : pose;
      poseT = 0;
    },
    bite(kind, done) {
      if (kind !== "pane" && kind !== "acqua") return;
      snack.visible = true;
      loaf.visible = kind === "pane";
      glassCup.visible = kind === "acqua";
      loaf.scale.setScalar(1);
      glassCup.rotation.set(0.04, 0, 0);
      water.scale.y = 1;
      water.position.y = -0.012;
      waterTop.position.y = 0.019;
      pose = kind === "acqua" ? "drink" : "eat";
      poseT = 0;
      biteDone = done;
    },
    riding() {
      return riding;
    },
    trySkateJump,
    skateStep,
    skateAir() {
      return hopPhase === "air";
    },
    isFurn(id) {
      return FURN_IDS.has(id);
    },
    indoors() {
      return shellOf(player.group.position.x, player.group.position.z);
    },
    keepOut(x, z) {
      const lists = [[estate.houses, HOUSES], [estate.garages, GARAGES]];
      for (const [entries, specs] of lists) {
        for (const entry of entries) {
          if (!entry.plot) continue;
          const plot = plots.find((p) => p.id === entry.plot);
          const spec = specs.find((s) => s.id === entry.type);
          if (!plot || !spec) continue;
          const hw = spec.w * 0.5 + 0.2;
          const hd = spec.d * 0.5 + 0.2;
          const dx = x - plot.x;
          const dz = z - plot.z;
          if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
          const pad = 0.45;
          if (hw - Math.abs(dx) <= hd - Math.abs(dz)) {
            return { x: plot.x + Math.sign(dx || 1) * (hw + pad), z };
          }
          return { x, z: plot.z + Math.sign(dz || 1) * (hd + pad) };
        }
      }
      return null;
    },
    decorView() {
      if (!decorHome) return null;
      const y = groundAt(decorHome.plot.x, decorHome.plot.z);
      return { x: decorHome.plot.x, z: decorHome.plot.z, y };
    },
    placeHeld,
    dropFurn,
    holdingFurn() {
      return !!furnDrag;
    },
    toggleSkate,
    driving() {
      return driving;
    },
    tryDrive,
    drive,
    blocksMove() {
      return !!decorHome || locks() || !acts.classList.contains("hidden") || !civic.classList.contains("hidden") || !bankEl.classList.contains("hidden") || !shopEl.classList.contains("hidden") || (importEl && !importEl.classList.contains("hidden")) || (marketEl && !marketEl.classList.contains("hidden")) || (pescaEl && !pescaEl.classList.contains("hidden"));
    },
    update(dt, now) {
      const hour = new Date().getHours() + new Date().getMinutes() / 60;
      const elev = Math.sin(((hour - 6) / 24) * Math.PI * 2);
      const night = 1 - THREE.MathUtils.smoothstep(elev, -0.12, 0.28);
      const beam = 1.5 + night * 36;
      for (const spot of headBeams) spot.intensity = beam;
      headMat.emissiveIntensity = 0.35 + night * 2.4;
      if (driving) {
        carSaveAt += dt;
        if (carSaveAt > 2) {
          carSaveAt = 0;
          saveCar();
        }
      }
      const span = 20;
      const hot = [0xff3b30, 0xff9f0a, 0x30d158];
      const dim = [0x3a1618, 0x3a2a12, 0x14301c];
      for (const sig of signals) {
        const local = (now + sig.offset) % span;
        const phase = local < 8 ? 2 : local < 10 ? 1 : 0;
        sig.bulbs.forEach((bulb, i) => {
          const lit = i === phase;
          bulb.material.color.setHex(lit ? hot[i] : dim[i]);
          bulb.material.emissive.setHex(lit ? hot[i] : 0x000000);
          bulb.material.emissiveIntensity = lit ? 4.2 : 0;
        });
      }
      const stinkAfter = 30 * 60;
      const stinkAt = 15;
      hygiene = Math.max(0, hygiene - dt * ((100 - stinkAt) / stinkAfter));
      cleanSave += dt;
      if (cleanSave > 2) {
        cleanSave = 0;
        localStorage.setItem(CLEAN_KEY, String(Math.round(hygiene)));
      }
      if (hygiene >= stinkAt && smellWait !== "0") {
        smellWait = "0";
        localStorage.setItem(SMELL_WAIT_KEY, "0");
      }
      const dirty = hygiene < stinkAt && (smellWait === "0" || Date.now() >= Number(smellWait));
      document.body.classList.remove("stinky");
      flies.visible = dirty;
      mist.visible = false;
      wisps.forEach((wisp, i) => {
        wisp.visible = dirty;
        if (!dirty) return;
        const rise = (now * 0.32 + i * 0.17) % 1;
        const a = now * 1.4 + i * 1.3;
        wisp.position.set(Math.sin(a) * 0.16, 0.28 + rise * 0.85, Math.cos(a * 0.7) * 0.12);
        wisp.material.opacity = (1 - rise) * 0.5;
        const s = 0.1 + (i % 3) * 0.025;
        wisp.scale.set(s, s, 1);
      });
      flies.children.forEach((fly, i) => {
        const spin = fly.userData;
        const a = now * spin.speed + spin.a;
        const r = 0.14 + (i % 4) * 0.04;
        fly.position.set(
          Math.cos(a) * r + Math.sin(a * 2.2) * 0.035,
          spin.bob + Math.sin(a * 1.7 + i) * 0.14,
          Math.sin(a * 0.85) * r,
        );
        fly.rotation.y = -a;
        const flap = Math.sin(now * 46 + spin.a) * 0.85;
        spin.wingL.rotation.x = 0.45 + flap;
        spin.wingR.rotation.x = -0.45 - flap;
      });
      if (pendingKey) grantKey(false);
      for (const shell of roofs) {
        shell.mesh.visible = !(decorHome && shell.plot === decorHome.plot.id);
      }
      for (const door of doors) {
        const dist = Math.hypot(player.group.position.x - door.at.x, player.group.position.z - door.at.z);
        if (door.garage) {
          const y = door.ajar ? door.openY : door.closedY;
          door.panel.position.y = THREE.MathUtils.damp(door.panel.position.y, y, 4, dt);
          if (door.block) door.block.shut = !door.ajar;
          continue;
        }
        const leaves = door.leaves || [{ pivot: door.pivot, base: door.base, open: door.open }];
        for (const leaf of leaves) {
          let target = leaf.base;
          if (door.plot) {
            if (door.ajar) target = leaf.base + leaf.open;
          } else if (dist < 3.2) target = leaf.base + leaf.open;
          leaf.pivot.rotation.y = THREE.MathUtils.damp(leaf.pivot.rotation.y, target, 5.5, dt);
        }
        if (door.block) door.block.shut = !door.ajar;
      }
      const keyDoor = hasItem && hasItem("chiave") ? nearestOwnedDoor() : null;
      if (keyBtn) {
        keyBtn.classList.toggle("hidden", !keyDoor);
        const keyLabel = keyBtn.querySelector("[data-i18n]");
        if (keyLabel && keyDoor) keyLabel.textContent = keyDoor.ajar ? t("keyShut") : t("keyOpen");
      }
      if (seat && (pose === "sit" || pose === "sleep" || pose === "shower" || pose === "mine" || pose === "fish")) {
        player.group.position.x = seat.x;
        player.group.position.z = seat.z;
        if (typeof seat.y === "number") player.group.position.y = seat.y;
        if (typeof seat.yaw === "number") player.group.rotation.y = seat.yaw;
      }
      if (hero && pose !== "sleep") {
        hero.rotation.x = 0;
        hero.rotation.z = 0;
        if (hero.userData.standY != null) hero.position.y = hero.userData.standY;
      }
      cig.visible = pose === "smoke";
      pickaxe.visible = pose === "mine";
      rod.visible = pose === "fish";
      if (pose !== "fish") caughtFish.visible = false;
      holdPhone();
      phoneProp.visible = pose === "phone" || pose === "cam" || pose === "selfie";
      if (pose === "selfie") {
        phoneProp.position.set(0.02, 0.18, 0.05);
        phoneProp.rotation.set(-0.45, 0.85, 1.15);
      } else if (pose === "cam") {
        phoneProp.position.set(-0.02, 0.16, 0.04);
        phoneProp.rotation.set(-1.35, 0, 0);
      } else if (pose === "phone") {
        phoneProp.position.set(-0.035, 0.05, 0.025);
        phoneProp.rotation.set(1.011, 0.217, -0.711);
      }
      if (pose === "eat" || pose === "drink") {
        poseT += dt;
        if (poseT >= (pose === "drink" ? 2.7 : 2.45)) {
          pose = null;
          snack.visible = false;
          snack.rotation.set(0, 0, 0);
          loaf.scale.setScalar(1);
          const done = biteDone;
          biteDone = null;
          if (done) done();
        }
      }
      for (const vein of veins) {
        if (!vein.alive && now >= vein.back) rollVein(vein);
        if (vein.alive) vein.group.rotation.y += dt * 0.15;
      }
      if (pose === "mine") {
        poseT += dt;
        if (mineNode) mineNode.group.rotation.y += dt * 0.4;
        if (poseT >= mineDur && mineNode) {
          const vein = mineNode;
          const ok = addToBag && addToBag(vein.ore, t(`item.${vein.ore}`), vein.mult);
          mineNode = null;
          pose = null;
          seat = null;
          if (ok) {
            vein.alive = false;
            vein.group.visible = false;
            vein.back = now + 14 + vein.mult * 3;
            toast(`${t(`item.${vein.ore}`)} ×${vein.mult}`);
          } else toast(t("bagFull"));
        }
      }
      if (pose === "fish") {
        poseT += dt;
        if (poseT >= 6.4 && fishCatch) {
          const fish = fishCatch;
          fishCatch = null;
          const ok = addToBag && addToBag(fish.id, t(`item.${fish.id}`), 1);
          pose = null;
          seat = null;
          if (ok) toast(t(`item.${fish.id}`));
          else toast(t("bagFull"));
        }
      }
      if (pose === "shower") {
        poseT += dt;
        if (poseT >= 5.6) {
          hygiene = 100;
          smellWait = "0";
          localStorage.setItem(CLEAN_KEY, "100");
          localStorage.setItem(SMELL_WAIT_KEY, "0");
          pose = null;
          seat = null;
          toast(t("fresh"));
        }
      } else if (pose && pose !== "mine" && pose !== "eat" && pose !== "drink" && pose !== "fish" && pose !== "skateOn" && pose !== "skateOff") poseT += dt;
      if (pose === "skateOn") {
        poseT += dt;
        helmet.scale.setScalar(0.15 + smooth(Math.min(1, poseT / 0.7)) * 0.85);
        if (poseT >= 1.05) {
          pose = null;
          riding = true;
          helmet.scale.setScalar(1);
        }
      }
      if (pose === "skateOff") {
        poseT += dt;
        if (!helmetThrown && poseT >= 0.7) {
          helmetThrown = true;
          helmet.visible = false;
          const drop = helmet.clone();
          drop.visible = true;
          drop.scale.setScalar(1);
          const yaw = player.group.rotation.y;
          drop.position.copy(player.group.position);
          drop.position.x += Math.sin(yaw) * 0.55;
          drop.position.y += 1.55;
          drop.position.z += Math.cos(yaw) * 0.55;
          scene.add(drop);
          groundHelmets.push({ mesh: drop, age: 0, vy: 1.6 });
        }
        if (poseT >= 1.3) {
          pose = null;
          board.visible = false;
          helmet.visible = false;
        }
      }
      board.visible = riding || pose === "skateOn" || pose === "skateOff";
      helmet.visible = riding || pose === "skateOn" || (pose === "skateOff" && !helmetThrown);
      updateSkateMotion(dt, now);
      for (let i = groundHelmets.length - 1; i >= 0; i--) {
        const piece = groundHelmets[i];
        piece.age += dt;
        const floor = groundAt(piece.mesh.position.x, piece.mesh.position.z) + 0.06;
        if (piece.mesh.position.y > floor) {
          piece.vy -= dt * 9;
          piece.mesh.position.y += piece.vy * dt;
          piece.mesh.rotation.x += dt * 3.2;
          piece.mesh.rotation.z += dt * 1.6;
        } else piece.mesh.position.y = floor;
        if (piece.age > 5.6) {
          piece.mesh.removeFromParent();
          groundHelmets.splice(i, 1);
        }
      }
      if (pose === "carIn") {
        const glide = smooth(Math.min(1, Math.max(0, (poseT - 0.35) / 0.8)));
        doorWorld.copy(doorLocal).applyAxisAngle(gunY.set(0, 1, 0), car.rotation.y);
        seatWorld.copy(seatLocal).applyAxisAngle(gunY.set(0, 1, 0), car.rotation.y);
        player.group.position.set(
          car.position.x + doorWorld.x + (seatWorld.x - doorWorld.x) * glide,
          car.position.y + SEAT_LIFT * glide,
          car.position.z + doorWorld.z + (seatWorld.z - doorWorld.z) * glide,
        );
        const faceIn = car.rotation.y + Math.PI / 2;
        let turn = car.rotation.y - faceIn;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        player.group.rotation.y = faceIn + turn * glide;
        const twist = poseT > 1.35 && poseT < 2.2 ? Math.sin((poseT - 1.35) * 11) : 0;
        keyPivot.rotation.z = twist * 0.85;
        if (poseT >= 2.45) {
          pose = null;
          driving = true;
          carSpeed = 0;
          carSteer = 0;
          keyPivot.rotation.z = 0;
          placeDriver();
        }
      }
      applyPose(now);
      if (pose === "smoke" && !smokePuff) {
        smokePuff = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 6, 6),
          mat(0xdfe6ea, { transparent: true, opacity: 0.45 }),
        );
        smokePuff.position.copy(player.group.position);
        smokePuff.position.y += 1.45;
        smokePuff.life = 0;
        scene.add(smokePuff);
      }
      if (smokePuff) {
        smokePuff.life += dt;
        smokePuff.position.y += dt * 0.25;
        smokePuff.material.opacity = Math.max(0, 0.45 - smokePuff.life);
        if (smokePuff.life > 1.1) {
          smokePuff.removeFromParent();
          smokePuff = null;
        }
      }
      const p = player.group.position;
      let spot = null;
      let best = 99;
      if (!locks()) {
        let veinBest = 2.15;
        let veinHit = null;
        for (const vein of veins) {
          if (!vein.alive) continue;
          const d = Math.hypot(p.x - vein.x, p.z - vein.z);
          if (d < veinBest) {
            veinBest = d;
            veinHit = vein;
          }
        }
        if (veinHit) {
          spot = {
            label: () => t("mine"),
            run: () => beginMine(veinHit),
          };
          best = veinBest;
        }
        for (const shore of shores) {
          const d = Math.hypot(p.x - shore.x, p.z - shore.z);
          if (d < shore.r && d < best) {
            best = d;
            spot = { label: () => t("fish"), run: () => beginFish(shore) };
          }
        }
        for (const s of spots) {
          const d = Math.hypot(p.x - s.x, p.z - s.z);
          if (d < s.r && d < best) {
            best = d;
            spot = s;
          }
        }
      }
      const here = placeMode ? null : homeHere();
      if (here) {
        const hot = nearestSquare(here);
        for (const home of homes) {
          for (const pad of home.pads) {
            const show = home === here && !!decorHome;
            pad.visible = show;
            if (!show) continue;
            const cell = pad.userData.cell;
            pad.material = hot && cell.c === hot.c && cell.r === hot.r ? padHot : padMat;
          }
        }
        if (lifting) {
          const pos = hot ? cellPos(here, hot.c, hot.r) : null;
          if (pos) lifting.piece.mesh.position.set(pos.x, groundAt(pos.x, pos.z), pos.z);
        }
      } else {
        for (const home of homes) for (const pad of home.pads) pad.visible = false;
      }
      const plot = placeMode ? nearestPlot() : null;
      const nearFurn = here && !decorHome ? nearestPiece(here) : null;
      const usable = nearFurn && (nearFurn.id === "doccia" || nearFurn.id === "lavandino" || nearFurn.id === "bidet" || nearFurn.id === "water" || nearFurn.id === "letto" || nearFurn.id === "lettino" || nearFurn.id === "sedia" || nearFurn.id === "sediaScr" || nearFurn.id === "divano");
      if (decorBtn) decorBtn.classList.toggle("hidden", !here || !!decorHome || locks());
      if (here && decorHome) {
        for (const pad of here.pads) pad.visible = true;
      }
      const heldNow = getHeld ? getHeld() : null;
      const heldFurn = here && !decorHome && heldNow && FURN_IDS.has(heldNow.id);
      const atCar = Math.hypot(p.x - car.position.x, p.z - car.position.z) < 3.3;
      const garageHit = carOwned ? ownedGarageNear(car.position.x, car.position.z, 7) : null;
      if (driving && garageHit) {
        actBtn.textContent = t("parkCar");
        actBtn.classList.remove("hidden");
        actBtn._run = () => {
          if (!estate.garages.some((g) => g.plot)) {
            toast(t("needGarage"));
            return;
          }
          if (!garageHit.door.ajar) {
            toast(t("openGarage"));
            return;
          }
          parkCar(garageHit);
        };
      } else if (driving) {
        actBtn.textContent = t("exitCar");
        actBtn.classList.remove("hidden");
        actBtn._run = () => tryDrive();
      } else if (atCar && !riding && !pose && !placeMode && !locks()) {
        actBtn.textContent = t("drive");
        actBtn.classList.remove("hidden");
        actBtn._run = () => tryDrive();
      } else if (usable && !locks()) {
        const wash = nearFurn.id === "doccia" || nearFurn.id === "lavandino" || nearFurn.id === "bidet" || nearFurn.id === "water";
        actBtn.textContent = wash ? t("shower") : nearFurn.id.startsWith("letto") ? t("sleep") : t("sit");
        actBtn.classList.remove("hidden");
        actBtn._run = () => usePiece(nearFurn);
      } else if (heldFurn && !locks()) {
        actBtn.textContent = t("placeFurn");
        actBtn.classList.remove("hidden");
        actBtn._run = () => placeHeld(heldNow.id);
      } else if (plot) {
        actBtn.textContent = `${plot.street === "e" ? L("East street", "Via est") : L("West street", "Via ovest")} · ${plot.side === "n" ? t("northSide") : t("southSide")}`;
        actBtn.classList.remove("hidden");
        actBtn._run = () => placeOn(plot);
      } else if (spot) {
        actBtn.textContent = spot.label();
        actBtn.classList.remove("hidden");
        actBtn._run = spot.run;
      } else {
        actBtn.classList.add("hidden");
        actBtn._run = null;
      }
      stopBtn.classList.toggle("hidden", !locks() || pose === "mine" || pose === "eat" || pose === "drink" || pose === "skateOn" || pose === "skateOff" || pose === "carIn");
      stopBtn.textContent = t("stopAct");
      const life = 9000;
      for (let i = chats.length - 1; i >= 0; i--) {
        const age = performance.now() - chats[i].born;
        if (age > life) {
          chats[i].el.remove();
          chats.splice(i, 1);
          continue;
        }
        const fade = age < 5200 ? 1 : 1 - (age - 5200) / (life - 5200);
        chats[i].el.style.opacity = String(Math.max(0, fade));
      }
      if (chats.length) project(player.group, 0, 2.15, 0, bubble);
      else bubble.classList.add("hidden");
      if (offer && performance.now() < offer.until && npcs[offer.index]) {
        project(npcs[offer.index].pivot, 0, 2.05, 0, npcBubble);
      } else if (offer && performance.now() >= offer.until) {
        offer = null;
        npcBubble.classList.add("hidden");
      }
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) document.getElementById("toast").classList.add("hidden");
      }
      for (const pad of pads) {
        const free = !taken(pad.userData.plot);
        pad.material.emissiveIntensity = free && placeMode ? 0.35 + Math.sin(now * 4) * 0.2 : 0.05;
        pad.visible = free;
      }
      if (rec && !rec.saved) {
        rec.wait -= dt;
        if (rec.wait <= 0 && !rec.busy && rec.frames.length < 4) {
          rec.busy = true;
          rec.wait = 0.9;
          grab(rec.selfie).then((frame) => {
            if (!rec || rec.saved) return;
            rec.busy = false;
            rec.frames.push(frame);
            const img = document.getElementById("finder-preview");
            if (img) img.src = frame;
            if (rec.stopRequested || rec.frames.length >= 4) finishRec();
          });
        }
      }
      if (phoneOpen && screen === "zsocial") {
        const frame = Math.floor(now * 2);
        if (frame !== feedFrame) {
          feedFrame = frame;
          for (const img of phoneBody.querySelectorAll(".feed img")) {
            const post = phone.posts[Number(img.dataset.post)];
            if (post && post.frames.length > 1) img.src = post.frames[frame % post.frames.length];
          }
        }
      }
    },
  };
}
