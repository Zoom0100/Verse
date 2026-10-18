import * as THREE from "three";

const SUITS = ["dino", "bear", "balloon"];
const texCache = new Map();

function canvasTex(key, w, h, draw, repeat) {
  if (texCache.has(key)) return texCache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  texCache.set(key, tex);
  return tex;
}

function paintScales(g, w, h, belly) {
  const base = g.createLinearGradient(0, 0, 0, h);
  if (belly) {
    base.addColorStop(0, "#f4e7c4");
    base.addColorStop(1, "#d7b56a");
  } else {
    base.addColorStop(0, "#1a6a40");
    base.addColorStop(0.45, "#2f8f56");
    base.addColorStop(1, "#134a30");
  }
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const cols = 14;
  const rows = 18;
  const cw = w / cols;
  const rh = h / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ox = (row % 2) * cw * 0.5;
      const x = col * cw + ox + cw * 0.5;
      const y = row * rh + rh * 0.55;
      g.fillStyle = belly ? (col % 2 ? "#f8edd0" : "#e4c98a") : col % 3 === 0 ? "#3caa68" : "#17643c";
      g.beginPath();
      g.ellipse(x, y, cw * 0.48, rh * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = belly ? "rgba(140,96,40,0.35)" : "rgba(8,40,24,0.55)";
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = belly ? "rgba(255,255,255,0.28)" : "rgba(190,255,210,0.18)";
      g.beginPath();
      g.ellipse(x - cw * 0.12, y - rh * 0.1, cw * 0.16, rh * 0.12, -0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function paintFur(g, w, h, light) {
  const base = g.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, light ? "#e7d3b0" : "#5a3822");
  base.addColorStop(0.5, light ? "#f3e2c4" : "#7a4e30");
  base.addColorStop(1, light ? "#c9a67a" : "#3a2416");
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2400; i++) {
    const x = (i * 47) % w;
    const y = (i * 91) % h;
    const tone = i % 5;
    g.strokeStyle = light
      ? tone === 0 ? "#fff6e4" : tone === 1 ? "#d8b48a" : "#f0d8b4"
      : tone === 0 ? "#2a180e" : tone === 1 ? "#a56b3e" : "#6b4228";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + ((i % 7) - 3), y - 6 - (i % 5));
    g.stroke();
  }
}

function paintLatex(g, w, h, color, shine) {
  const wash = g.createRadialGradient(w * 0.38, h * 0.32, 10, w * 0.5, h * 0.5, w * 0.72);
  wash.addColorStop(0, shine);
  wash.addColorStop(0.35, color);
  wash.addColorStop(1, "#6a1020");
  g.fillStyle = wash;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(255,220,140,0.85)";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(0, h * 0.5);
  g.lineTo(w, h * 0.5);
  g.stroke();
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 10;
  g.beginPath();
  g.ellipse(w * 0.36, h * 0.28, w * 0.16, h * 0.08, -0.5, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 80; i++) {
    g.fillStyle = "rgba(255,255,255,0.14)";
    g.beginPath();
    g.ellipse((i * 73) % w, (i * 41) % h, 2, 1.2, i, 0, Math.PI * 2);
    g.fill();
  }
}

function paintFace(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#fff8ee";
  g.beginPath();
  g.ellipse(w * 0.32, h * 0.42, 28, 34, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(w * 0.68, h * 0.42, 28, 34, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#1b2430";
  g.beginPath();
  g.ellipse(w * 0.34, h * 0.44, 12, 16, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(w * 0.7, h * 0.44, 12, 16, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(w * 0.37, h * 0.4, 4, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(w * 0.73, h * 0.4, 4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#5a1830";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(w * 0.5, h * 0.62, 36, 0.15, Math.PI - 0.15);
  g.stroke();
  g.fillStyle = "rgba(255,120,150,0.45)";
  g.beginPath();
  g.ellipse(w * 0.18, h * 0.58, 16, 10, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(w * 0.82, h * 0.58, 16, 10, 0, 0, Math.PI * 2);
  g.fill();
}

function paintEye(g, w, h, iris) {
  g.fillStyle = "#f4f1ea";
  g.fillRect(0, 0, w, h);
  g.fillStyle = iris;
  g.beginPath();
  g.arc(w / 2, h / 2, w * 0.28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#140c08";
  g.beginPath();
  g.arc(w / 2, h / 2, w * 0.12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(w * 0.58, h * 0.4, w * 0.05, 0, Math.PI * 2);
  g.fill();
}

function paintPads(g, w, h) {
  g.fillStyle = "#c9956a";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#2a1812";
  g.beginPath();
  g.ellipse(w * 0.5, h * 0.62, w * 0.22, h * 0.16, 0, 0, Math.PI * 2);
  g.fill();
  for (const x of [0.28, 0.5, 0.72]) {
    g.beginPath();
    g.ellipse(w * x, h * 0.28, w * 0.07, h * 0.08, 0, 0, Math.PI * 2);
    g.fill();
  }
}

const scaleMap = () => canvasTex("scales", 512, 512, (g, w, h) => paintScales(g, w, h, false));
const bellyMap = () => canvasTex("belly", 512, 512, (g, w, h) => paintScales(g, w, h, true));
const furMap = () => canvasTex("fur", 512, 512, (g, w, h) => paintFur(g, w, h, false));
const creamMap = () => canvasTex("cream", 512, 512, (g, w, h) => paintFur(g, w, h, true));
const latexMap = () => canvasTex("latex", 512, 512, (g, w, h) => paintLatex(g, w, h, "#e4254a", "#ffd0dc"));
const latexGold = () => canvasTex("latexGold", 512, 256, (g, w, h) => paintLatex(g, w, h, "#f0c14a", "#fff1c2"));
const faceMap = () => canvasTex("face", 256, 256, paintFace);
const eyeMap = () => canvasTex("eye", 128, 128, (g, w, h) => paintEye(g, w, h, "#e0a020"));
const bearEye = () => canvasTex("bearEye", 128, 128, (g, w, h) => paintEye(g, w, h, "#6a3a18"));
const padMap = () => canvasTex("pads", 256, 256, paintPads);

function std(map, color, rough, extra = {}) {
  return new THREE.MeshStandardMaterial({ map, color, roughness: rough, ...extra });
}

function mark(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.suit = true;
  return mesh;
}

function limb(bone, radius, len, material) {
  const mesh = mark(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.92, len, 14), material));
  mesh.position.y = len * 0.42;
  return { bone, mesh };
}

function at(bone, mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mark(mesh);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return { bone, mesh };
}

function dinoParts() {
  const hide = std(scaleMap(), 0xffffff, 0.48, { bumpMap: scaleMap(), bumpScale: 0.012 });
  const belly = std(bellyMap(), 0xffffff, 0.62);
  const horn = std(null, 0xe6d7a4, 0.42);
  const tooth = std(null, 0xfff8ee, 0.35);
  const eye = std(eyeMap(), 0xffffff, 0.28);
  const parts = [];
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 22, 16), hide);
  skull.scale.set(1.05, 0.95, 1.15);
  parts.push(at("Head", skull, 0, 0.1, 0.02));
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 14), hide);
  snout.scale.set(0.85, 0.72, 1.55);
  parts.push(at("Head", snout, 0, 0.055, 0.14));
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), belly);
  jaw.scale.set(0.9, 0.55, 1.35);
  parts.push(at("Head", jaw, 0, 0.02, 0.12));
  for (let i = 0; i < 5; i++) {
    const t = mark(new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.028, 5), tooth));
    t.rotation.x = Math.PI / 2;
    parts.push(at("Head", t, -0.028 + i * 0.014, 0.045, 0.16 + (i % 2) * 0.01));
  }
  parts.push(at("Head", new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), eye), -0.045, 0.11, 0.08));
  parts.push(at("Head", new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), eye), 0.045, 0.11, 0.08));
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 8), horn);
  parts.push(at("Head", crest, 0, 0.2, -0.02));
  parts.push(at("Neck", new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 12), hide), 0, 0.04, 0.02));
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), hide);
  chest.scale.set(1.15, 0.9, 0.85);
  parts.push(at("Spine2", chest, 0, 0.02, 0.02));
  const tum = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), belly);
  tum.scale.set(1.05, 0.85, 0.8);
  parts.push(at("Spine", tum, 0, 0.02, 0.04));
  parts.push(at("Hips", new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), hide), 0, 0.02, 0));
  let tz = -0.08;
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.07 - i * 0.01, 12, 10), hide);
    seg.scale.set(1, 0.8, 1.3);
    parts.push(at("Hips", seg, 0, 0.04, tz));
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 5), horn);
    parts.push(at("Hips", spike, 0, 0.1, tz));
    tz -= 0.09;
  }
  for (const bone of ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm"]) {
    parts.push(limb(bone, 0.045, bone.includes("Fore") ? 0.18 : 0.2, hide));
  }
  for (const bone of ["LeftHand", "RightHand"]) {
    const side = bone.startsWith("Left") ? -1 : 1;
    parts.push(at(bone, new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), hide), 0, 0.04, 0));
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.04, 5), horn);
      parts.push(at(bone, claw, side * (-0.015 + i * 0.015), 0.07, 0.02, -0.8, 0, 0));
    }
  }
  for (const bone of ["LeftUpLeg", "RightUpLeg"]) parts.push(limb(bone, 0.07, 0.32, hide));
  for (const bone of ["LeftLeg", "RightLeg"]) parts.push(limb(bone, 0.055, 0.3, hide));
  for (const bone of ["LeftFoot", "RightFoot"]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), hide);
    foot.scale.set(1.1, 0.45, 1.6);
    parts.push(at(bone, foot, 0, 0.02, 0.04));
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.045, 5), horn);
      parts.push(at(bone, claw, -0.02 + i * 0.02, 0.015, 0.09, Math.PI / 2, 0, 0));
    }
  }
  return parts;
}

function bearParts() {
  const fur = std(furMap(), 0xffffff, 0.92);
  const cream = std(creamMap(), 0xffffff, 0.9);
  const leather = std(null, 0x1a100c, 0.4);
  const eye = std(bearEye(), 0xffffff, 0.35);
  const pad = std(padMap(), 0xffffff, 0.7);
  const parts = [];
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 22, 16), fur);
  skull.scale.set(1.05, 1, 0.95);
  parts.push(at("Head", skull, 0, 0.1, 0.02));
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), cream);
  muzzle.scale.set(1, 0.75, 1.1);
  parts.push(at("Head", muzzle, 0, 0.05, 0.1));
  parts.push(at("Head", new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), leather), 0, 0.055, 0.15));
  parts.push(at("Head", new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), fur), -0.07, 0.2, 0));
  parts.push(at("Head", new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), fur), 0.07, 0.2, 0));
  parts.push(at("Head", new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), cream), -0.07, 0.19, 0.02));
  parts.push(at("Head", new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), cream), 0.07, 0.19, 0.02));
  parts.push(at("Head", new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), eye), -0.04, 0.1, 0.09));
  parts.push(at("Head", new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), eye), 0.04, 0.1, 0.09));
  parts.push(at("Neck", new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), fur), 0, 0.02, 0.02));
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), fur);
  chest.scale.set(1.2, 1.05, 0.9);
  parts.push(at("Spine2", chest, 0, 0.02, 0.02));
  const tum = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 14), cream);
  tum.scale.set(0.9, 0.85, 0.55);
  parts.push(at("Spine", tum, 0, 0.0, 0.08));
  parts.push(at("Hips", new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), fur), 0, 0.02, 0));
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), fur);
  parts.push(at("Hips", tail, 0, 0.06, -0.12));
  for (const bone of ["LeftArm", "RightArm"]) parts.push(limb(bone, 0.07, 0.22, fur));
  for (const bone of ["LeftForeArm", "RightForeArm"]) parts.push(limb(bone, 0.06, 0.2, fur));
  for (const bone of ["LeftHand", "RightHand"]) {
    parts.push(at(bone, new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), fur), 0, 0.04, 0.01));
    const paw = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), pad);
    parts.push(at(bone, paw, 0, 0.05, 0.04, 0, 0, 0));
  }
  for (const bone of ["LeftUpLeg", "RightUpLeg"]) parts.push(limb(bone, 0.09, 0.34, fur));
  for (const bone of ["LeftLeg", "RightLeg"]) parts.push(limb(bone, 0.07, 0.3, fur));
  for (const bone of ["LeftFoot", "RightFoot"]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), fur);
    foot.scale.set(1, 0.45, 1.4);
    parts.push(at(bone, foot, 0, 0.02, 0.03));
  }
  return parts;
}

function balloonParts() {
  const latex = new THREE.MeshPhysicalMaterial({
    map: latexMap(),
    color: 0xffffff,
    roughness: 0.18,
    metalness: 0.04,
    clearcoat: 0.85,
    clearcoatRoughness: 0.18,
  });
  const gold = new THREE.MeshPhysicalMaterial({
    map: latexGold(),
    color: 0xffffff,
    roughness: 0.22,
    metalness: 0.12,
    clearcoat: 0.7,
    clearcoatRoughness: 0.2,
  });
  const faceMat = new THREE.MeshStandardMaterial({ map: faceMap(), transparent: true, roughness: 0.35, depthWrite: false });
  const parts = [];
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 28, 20), latex);
  parts.push(at("Head", head, 0, 0.12, 0.02));
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), faceMat);
  parts.push(at("Head", face, 0, 0.12, 0.155));
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), gold);
  parts.push(at("Head", knot, 0, 0.26, -0.02));
  parts.push(at("Neck", new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 12), latex), 0, 0.03, 0));
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 28, 20), latex);
  body.scale.set(1.15, 1.2, 0.95);
  parts.push(at("Spine2", body, 0, -0.02, 0.02));
  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 8, 24), gold);
  seam.rotation.x = Math.PI / 2;
  parts.push(at("Spine1", seam, 0, 0.05, 0.02));
  const hip = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), latex);
  parts.push(at("Hips", hip, 0, 0.04, 0));
  for (const bone of ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm"]) {
    parts.push(limb(bone, bone.includes("Fore") ? 0.055 : 0.065, bone.includes("Fore") ? 0.16 : 0.18, latex));
  }
  for (const bone of ["LeftHand", "RightHand"]) {
    parts.push(at(bone, new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 12), latex), 0, 0.04, 0));
  }
  for (const bone of ["LeftUpLeg", "RightUpLeg"]) parts.push(limb(bone, 0.08, 0.28, latex));
  for (const bone of ["LeftLeg", "RightLeg"]) parts.push(limb(bone, 0.065, 0.26, latex));
  for (const bone of ["LeftFoot", "RightFoot"]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), latex);
    foot.scale.set(1.1, 0.7, 1.4);
    parts.push(at(bone, foot, 0, 0.02, 0.03));
  }
  return parts;
}

function createSuit(kind) {
  if (kind === "bear") return bearParts();
  if (kind === "balloon") return balloonParts();
  return dinoParts();
}

const STAND = {
  Head: { p: [0, 1.5, 0], r: [0.08, 0, 0] },
  Neck: { p: [0, 1.36, 0], r: [0, 0, 0] },
  Spine2: { p: [0, 1.2, 0], r: [0, 0, 0] },
  Spine1: { p: [0, 1.08, 0], r: [0, 0, 0] },
  Spine: { p: [0, 0.98, 0], r: [0, 0, 0] },
  Hips: { p: [0, 0.9, 0], r: [0, 0, 0] },
  LeftArm: { p: [-0.22, 1.32, 0], r: [0.25, 0, 1.15] },
  RightArm: { p: [0.22, 1.32, 0], r: [0.25, 0, -1.15] },
  LeftForeArm: { p: [-0.4, 1.05, 0.05], r: [0.15, 0, 1.2] },
  RightForeArm: { p: [0.4, 1.05, 0.05], r: [0.15, 0, -1.2] },
  LeftHand: { p: [-0.5, 0.82, 0.08], r: [0.5, 0, 0.3] },
  RightHand: { p: [0.5, 0.82, 0.08], r: [0.5, 0, -0.3] },
  LeftUpLeg: { p: [-0.1, 0.86, 0], r: [0.12, 0, 0.06] },
  RightUpLeg: { p: [0.1, 0.86, 0], r: [0.12, 0, -0.06] },
  LeftLeg: { p: [-0.12, 0.48, 0.03], r: [-0.08, 0, 0] },
  RightLeg: { p: [0.12, 0.48, 0.03], r: [-0.08, 0, 0] },
  LeftFoot: { p: [-0.12, 0.08, 0.05], r: [0, 0, 0] },
  RightFoot: { p: [0.12, 0.08, 0.05], r: [0, 0, 0] },
};

export function displaySuit(kind) {
  const group = new THREE.Group();
  for (const item of createSuit(kind)) {
    const pivot = new THREE.Group();
    const spec = STAND[item.bone] || { p: [0, 1, 0], r: [0, 0, 0] };
    pivot.position.set(spec.p[0], spec.p[1], spec.p[2]);
    pivot.rotation.set(spec.r[0], spec.r[1], spec.r[2]);
    pivot.add(item.mesh);
    group.add(pivot);
  }
  return group;
}

export function mannequin(kind) {
  const group = displaySuit(kind);
  group.scale.setScalar(0.82);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.46, 0.1, 20),
    new THREE.MeshStandardMaterial({ color: 0x2a211c, roughness: 0.45, metalness: 0.35 }),
  );
  base.position.y = 0.05;
  base.castShadow = true;
  group.add(base);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.012, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xe2c27a, roughness: 0.3, metalness: 0.7 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  group.add(ring);
  return group;
}

export function mountSuit(hero, kind) {
  const bones = {};
  hero.traverse((obj) => {
    if (obj.isBone) bones[obj.name] = obj;
  });
  const meshes = [];
  for (const item of createSuit(kind)) {
    const bone = bones[item.bone];
    if (!bone) continue;
    bone.add(item.mesh);
    meshes.push(item.mesh);
  }
  return () => {
    for (const mesh of meshes) mesh.removeFromParent();
  };
}

export function suitIds() {
  return SUITS;
}
