import * as THREE from "three";

const WORLD_R = 206;

export function createWorld({ scene, renderer, player, sky, sunLight, hemiLight, fillLight, streetLights = [], lampGlow = null, addCircle, lakes, swayTrees, rippleMaterial, quarry, importAt, marketAt, pescaAt, atelierAt }) {
  const benches = [];
  const skyU = sky.material.uniforms;
  const fogColor = new THREE.Color();
  const nightSky = new THREE.Color(0x05070d);
  const hemiSky = new THREE.Color();
  const hemiGround = new THREE.Color();
  const sunColor = new THREE.Color();
  const cloudTint = new THREE.Color();
  const dawnTint = new THREE.Color(0xf0c2a4);
  const duskTint = new THREE.Color(0xf2b08a);
  const weather = {
    kind: "clear",
    wind: 0.28,
    cover: 0.18,
    rain: 0,
    tint: 0.2,
    until: Number.POSITIVE_INFINITY,
    goalWind: 0.28,
    goalCover: 0.18,
    goalRain: 0,
    dim: 1,
  };
  let flash = 0;
  let worldLampOrder = null;
  const flashEl = document.getElementById("flash");
  const mapEl = document.getElementById("minimap");
  const mapCtx = mapEl.getContext("2d");
  let mapBig = false;

  mapEl.addEventListener("click", () => {
    mapBig = !mapBig;
    mapEl.classList.toggle("big", mapBig);
  });

  function rollWeather(now) {
    const next = {
      clear: [["clear", 0.55], ["cloudy", 0.38], ["drizzle", 0.07]],
      cloudy: [["clear", 0.36], ["cloudy", 0.4], ["drizzle", 0.18], ["rain", 0.06]],
      drizzle: [["cloudy", 0.46], ["drizzle", 0.22], ["rain", 0.28], ["clear", 0.04]],
      rain: [["drizzle", 0.42], ["rain", 0.3], ["cloudy", 0.24], ["storm", 0.04]],
      storm: [["rain", 0.78], ["cloudy", 0.22]],
    };
    const row = next[weather.kind] || next.clear;
    let pick = Math.random();
    let kind = row[row.length - 1][0];
    for (const [name, chance] of row) {
      pick -= chance;
      if (pick <= 0) {
        kind = name;
        break;
      }
    }
    weather.kind = kind;
    const table = {
      clear: [0.26, 0.16, 0, 320, 200],
      cloudy: [0.36, 0.58, 0, 240, 140],
      drizzle: [0.4, 0.7, 0.26, 140, 80],
      rain: [0.5, 0.82, 0.66, 110, 70],
      storm: [0.72, 0.92, 0.9, 45, 30],
    };
    const spec = table[kind];
    weather.goalWind = spec[0];
    weather.goalCover = spec[1];
    weather.goalRain = spec[2];
    weather.until = now + spec[3] + Math.random() * spec[4];
  }

  const cloudMat = new THREE.SpriteMaterial({
    map: cloudTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.92,
  });
  const clouds = [];
  const cloudSpots = [];
  sky.renderOrder = -1;
  sky.material.fog = false;
  cloudMat.fog = false;
  cloudSpots.push([-10, 14.2, 52], [16, 15.4, 64], [-24, 13.6, 58], [6, 16.2, 78]);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.15;
    const dist = 36 + (i % 4) * 14;
    cloudSpots.push([Math.cos(a) * dist, 12 + (i % 3) * 1.8, Math.sin(a) * dist]);
  }
  for (const [x, y, z] of cloudSpots) {
    const sprite = new THREE.Sprite(cloudMat);
    sprite.renderOrder = 2;
    const s = 28 + Math.random() * 16;
    sprite.scale.set(s, s * 0.42, 1);
    sprite.position.set(x, y, z);
    sprite.userData.base = y;
    sprite.userData.speed = 0.45 + Math.random() * 0.55;
    scene.add(sprite);
    clouds.push(sprite);
  }

  const rainCount = 650;
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) resetDrop(rainPos, i, true);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(
    rainGeo,
    new THREE.PointsMaterial({ color: 0xd7e6f4, size: 0.07, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  scene.add(rain);

  if (sky) {
    sky.renderOrder = -1;
    sky.material.depthWrite = false;
    sky.material.fog = false;
    sky.material.transparent = true;
  }

  const starFields = [];
  function starShell(count, radius, size, color, minElev, maxElev) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const elev = minElev + (maxElev - minElev) * Math.sqrt(Math.random());
      const r = radius * (0.94 + Math.random() * 0.1);
      const c = Math.cos(elev);
      pos[i * 3] = Math.cos(a) * c * r;
      pos[i * 3 + 1] = Math.sin(elev) * r;
      pos[i * 3 + 2] = Math.sin(a) * c * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color,
        size,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        fog: false,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
      }),
    );
    points.renderOrder = 4;
    scene.add(points);
    starFields.push(points);
  }
  starShell(1400, 300, 1.6, 0xfff6e4, 0.26, 1.45);
  starShell(420, 290, 2.3, 0xfff1d2, 0.4, 1.5);
  starShell(80, 280, 3, 0xffffff, 0.55, 1.5);
  const bandCount = 520;
  const bandPos = new Float32Array(bandCount * 3);
  for (let i = 0; i < bandCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const elev = 0.72 + Math.sin(a) * 0.32 + (Math.random() - 0.5) * 0.08;
    const r = 300 + (Math.random() - 0.5) * 16;
    const c = Math.cos(elev);
    bandPos[i * 3] = Math.cos(a) * c * r;
    bandPos[i * 3 + 1] = Math.sin(elev) * r;
    bandPos[i * 3 + 2] = Math.sin(a) * c * r;
  }
  const bandGeo = new THREE.BufferGeometry();
  bandGeo.setAttribute("position", new THREE.BufferAttribute(bandPos, 3));
  const band = new THREE.Points(
    bandGeo,
    new THREE.PointsMaterial({
      color: 0xfff8ea,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    }),
  );
  band.renderOrder = 4;
  scene.add(band);
  starFields.push(band);
  const milkyCount = 280;
  const milkyPos = new Float32Array(milkyCount * 3);
  for (let i = 0; i < milkyCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const elev = 0.78 + Math.sin(a * 2) * 0.32 + (Math.random() - 0.5) * 0.08;
    const r = 310;
    const c = Math.cos(elev);
    milkyPos[i * 3] = Math.cos(a) * c * r;
    milkyPos[i * 3 + 1] = Math.sin(elev) * r;
    milkyPos[i * 3 + 2] = Math.sin(a) * c * r;
  }
  const milkyGeo = new THREE.BufferGeometry();
  milkyGeo.setAttribute("position", new THREE.BufferAttribute(milkyPos, 3));
  const milky = new THREE.Points(
    milkyGeo,
    new THREE.PointsMaterial({
      color: 0xc9d4ea,
      size: 1.3,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    }),
  );
  milky.renderOrder = 4;
  scene.add(milky);
  starFields.push(milky);

  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: discTexture("sun"),
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }));
  sunDisc.scale.set(42, 42, 1);
  sunDisc.renderOrder = 1;
  scene.add(sunDisc);
  const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: discTexture("moon"),
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }));
  moonDisc.scale.set(28, 28, 1);
  moonDisc.renderOrder = 1;
  scene.add(moonDisc);
  const moonLight = new THREE.DirectionalLight(0xc5d4ea, 0);
  scene.add(moonLight);

  addFence();

  function addFence() {
    const R = 212;
    const wood = new THREE.MeshStandardMaterial({ color: 0x8d6844, roughness: 0.8 });
    const postGeo = new THREE.BoxGeometry(0.16, 1.35, 0.16);
    const n = 72;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;
      const a2 = ((i + 0.5) / n) * Math.PI * 2;
      const rx = Math.cos(a2) * R;
      const rz = Math.sin(a2) * R;
      {
        const post = new THREE.Mesh(postGeo, wood);
        post.position.set(x, 0.68, z);
        post.castShadow = true;
        scene.add(post);
      }
      const chord = 2 * R * Math.sin(Math.PI / n);
      for (const y of [0.72, 1.12]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, chord), wood);
        rail.position.set(rx, y, rz);
        rail.lookAt(x, y, z);
        scene.add(rail);
      }
    }
  }

  const pondBedTex = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    const wash = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    wash.addColorStop(0, "#083248");
    wash.addColorStop(0.62, "#0e4e68");
    wash.addColorStop(1, "#1a6a5c");
    g.fillStyle = wash;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const x = (i * 47) % 256;
      const y = (i * 83) % 256;
      g.fillStyle = i % 3 === 0 ? "rgba(186, 214, 196, 0.28)" : "rgba(8, 28, 38, 0.45)";
      g.beginPath();
      g.ellipse(x, y, 4 + (i % 5), 3 + (i % 3), i, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const bankTex = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    g.fillStyle = "#6ea84a";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 240; i++) {
      const x = (i * 37) % 256;
      const y = (i * 91) % 256;
      g.fillStyle = i % 2 ? "#8fce62" : "#3f7a32";
      g.fillRect(x, y, 2, 8 + (i % 6));
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = i % 2 ? "#f2d15a" : "#f4f7f2";
      g.beginPath();
      g.arc((i * 53) % 256, (i * 29) % 256, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  })();
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x041422, roughness: 1, metalness: 0 });
  const bankMat = new THREE.MeshStandardMaterial({ map: bankTex, roughness: 0.86 });
  const rockMats = [0x8d877c, 0xb7aa98, 0x6e7a68, 0x5e675f].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.84, metalness: 0.04 }),
  );
  const lilyMat = new THREE.MeshStandardMaterial({ color: 0x2f8a3e, roughness: 0.62 });
  const lilyDark = new THREE.MeshStandardMaterial({ color: 0x1d6a32, roughness: 0.7 });
  const bloomMats = [0xf4a3c2, 0xfff4ea, 0xf2d15a, 0xc9b6f2].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.45 }),
  );
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3e8a3a, roughness: 0.7 });
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x6a8f3a, roughness: 0.72 });
  const reedTip = new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.8 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4630, roughness: 0.86 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8a40, roughness: 0.78 });
  const rockGeo = new THREE.DodecahedronGeometry(0.28, 0);
  const pebbleGeo = new THREE.DodecahedronGeometry(0.1, 0);

  function addPark(lake) {
    const bed = new THREE.Mesh(new THREE.CircleGeometry(lake.r - 0.15, 64), bedMat);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(lake.x, 0.02, lake.z);
    bed.receiveShadow = true;
    scene.add(bed);
    const waterMat = rippleMaterial
      ? rippleMaterial(0x07283a, lake.r, 0.28, true)
      : new THREE.MeshStandardMaterial({ color: 0x07283a, roughness: 0.2 });
    waterMat.transparent = false;
    waterMat.opacity = 1;
    waterMat.transmission = 0;
    waterMat.depthWrite = true;
    const water = new THREE.Mesh(new THREE.CircleGeometry(lake.r, 96), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(lake.x, 0.12, lake.z);
    water.renderOrder = 2;
    scene.add(water);
    const bank = new THREE.Mesh(new THREE.RingGeometry(lake.r + 0.35, lake.r + 3.6, 72), bankMat);
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(lake.x, 0.03, lake.z);
    bank.receiveShadow = true;
    scene.add(bank);
    const stones = Math.round(lake.r * 5.2);
    for (let i = 0; i < stones; i++) {
      const a = (i / stones) * Math.PI * 2;
      const wobble = ((i * 17) % 7) * 0.04;
      const rad = lake.r + 0.15 + ((i * 3) % 5) * 0.11;
      const rock = new THREE.Mesh(i % 4 === 0 ? pebbleGeo : rockGeo, rockMats[i % rockMats.length]);
      const s = 0.7 + ((i * 5) % 6) * 0.16;
      rock.scale.set(s * 1.15, s * 0.72, s);
      rock.position.set(lake.x + Math.cos(a) * rad, 0.08 + s * 0.08, lake.z + Math.sin(a) * rad);
      rock.rotation.set(wobble, a, wobble * 0.6);
      rock.castShadow = i % 3 === 0;
      rock.receiveShadow = true;
      scene.add(rock);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const rad = lake.r * (0.28 + (i % 3) * 0.16);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.34 + (i % 3) * 0.08, 10), i % 2 ? lilyMat : lilyDark);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(lake.x + Math.cos(a) * rad, 0.085, lake.z + Math.sin(a) * rad);
      scene.add(pad);
      if (i % 2 === 0) {
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bloomMats[i % bloomMats.length]);
        bloom.position.set(pad.position.x, 0.12, pad.position.z);
        scene.add(bloom);
      }
    }
    for (let i = 0; i < 10; i++) {
      const a = 0.4 + (i / 10) * 1.5;
      const clump = new THREE.Group();
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.7 + b * 0.12, 4), reedMat);
        blade.position.set((b - 1) * 0.06, 0.36, 0);
        blade.rotation.z = (b - 1) * 0.12;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), reedTip);
        tip.position.y = 0.38 + b * 0.06;
        blade.add(tip);
        clump.add(blade);
      }
      const rad = lake.r - 0.35;
      clump.position.set(lake.x + Math.cos(a) * rad, 0.02, lake.z + Math.sin(a) * rad);
      scene.add(clump);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.2;
      const rad = lake.r + 1.35 + (i % 3) * 0.55;
      const flower = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.26, 5), stemMat);
      stem.position.y = 0.13;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), bloomMats[i % bloomMats.length]);
      head.position.y = 0.3;
      flower.add(stem, head);
      flower.position.set(lake.x + Math.cos(a) * rad, 0.02, lake.z + Math.sin(a) * rad);
      scene.add(flower);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.9;
      const rad = lake.r + 4.7;
      const x = lake.x + Math.cos(a) * rad;
      const z = lake.z + Math.sin(a) * rad;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.5, 6), trunkMat);
      trunk.position.y = 0.75;
      trunk.castShadow = true;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), leafMat);
      crown.position.y = 2.05;
      crown.castShadow = true;
      const crown2 = crown.clone();
      crown2.position.set(0.45, 1.7, 0.2);
      crown2.scale.setScalar(0.72);
      tree.add(trunk, crown, crown2);
      tree.position.set(x, 0, z);
      scene.add(tree);
      swayTrees.push(tree);
      addCircle(x, z, 0.4);
    }
    addCircle(lake.x, lake.z, lake.r * 0.92);

    const fishMat = [0xf2a03a, 0xd7dde6, 0xe8d07a].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 }),
    );
    lake.fish = [];
    for (let i = 0; i < 6; i++) {
      const fish = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), fishMat[i % 3]);
      body.scale.set(1.7, 0.62, 0.5);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 4), fishMat[i % 3]);
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -0.16;
      fish.add(body, tail);
      fish.userData = { a: Math.random() * Math.PI * 2, rad: lake.r * (0.35 + Math.random() * 0.4), speed: 0.35 + Math.random() * 0.35, tail };
      scene.add(fish);
      lake.fish.push(fish);
    }

    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const bx = lake.x + Math.cos(a) * (lake.r + 2.4);
      const bz = lake.z + Math.sin(a) * (lake.r + 2.4);
      addBench(bx, bz, lake.x - bx, lake.z - bz);
    }
  }

  for (const lake of lakes) addPark(lake);
  addScenery();

  function addScenery() {
    const bark = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.86 });
    const birchBark = new THREE.MeshStandardMaterial({ color: 0xe7e2d6, roughness: 0.7 });
    const birchMark = new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.8 });
    const oakLeaf = new THREE.MeshStandardMaterial({ color: 0x3f7a34, roughness: 0.82 });
    const pineLeaf = new THREE.MeshStandardMaterial({ color: 0x1f5a38, roughness: 0.8 });
    const birchLeaf = new THREE.MeshStandardMaterial({ color: 0x8fbf62, roughness: 0.78 });
    const palmLeaf = new THREE.MeshStandardMaterial({ color: 0x2f8a45, roughness: 0.7 });
    const willowLeaf = new THREE.MeshStandardMaterial({ color: 0x6a9a48, roughness: 0.8 });
    const wheatMat = new THREE.MeshStandardMaterial({ color: 0xd4ae4a, roughness: 0.78 });
    function grow(kind, x, z, scale) {
      const tree = new THREE.Group();
      if (kind === "pine") {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.3, 6), bark);
        trunk.position.y = 0.65;
        tree.add(trunk);
        [1.15, 1.7, 2.15].forEach((y, i) => {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.72 - i * 0.16, 0.85, 7), pineLeaf);
          cone.position.y = y;
          tree.add(cone);
        });
      } else if (kind === "birch") {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.1, 7), birchBark);
        trunk.position.y = 1.05;
        tree.add(trunk);
        for (let i = 0; i < 4; i++) {
          const mark = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.12), birchMark);
          mark.position.set(0.09, 0.5 + i * 0.38, 0);
          tree.add(mark);
        }
        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.72, 8, 6), birchLeaf);
        crown.scale.set(1, 1.25, 1);
        crown.position.y = 2.35;
        tree.add(crown);
      } else if (kind === "palm") {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 2.4, 6), bark);
        trunk.position.y = 1.2;
        trunk.rotation.z = 0.12;
        tree.add(trunk);
        for (let i = 0; i < 6; i++) {
          const frond = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.15, 4), palmLeaf);
          frond.position.y = 2.35;
          frond.rotation.z = 1.15;
          frond.rotation.y = (i / 6) * Math.PI * 2;
          tree.add(frond);
        }
      } else if (kind === "willow") {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.5, 6), bark);
        trunk.position.y = 0.75;
        tree.add(trunk);
        for (let i = 0; i < 5; i++) {
          const fall = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.35, 5), willowLeaf);
          const a = (i / 5) * Math.PI * 2;
          fall.position.set(Math.cos(a) * 0.28, 1.35, Math.sin(a) * 0.28);
          fall.rotation.z = Math.cos(a) * 0.45;
          fall.rotation.x = Math.sin(a) * 0.45;
          tree.add(fall);
        }
      } else {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.35, 6), bark);
        trunk.position.y = 0.68;
        tree.add(trunk);
        [[0, 2.05, 0, 0.95], [0.48, 1.75, 0.2, 0.62], [-0.4, 1.85, -0.15, 0.55]].forEach(([px, py, pz, s]) => {
          const crown = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), oakLeaf);
          crown.position.set(px, py, pz);
          tree.add(crown);
        });
      }
      tree.position.set(x, 0, z);
      tree.scale.setScalar(scale);
      scene.add(tree);
      swayTrees.push(tree);
    }
    [
      ["oak", -50, 18, 1.35],
      ["oak", 14, 30, 1.15],
      ["oak", 54, 26, 1.45],
      ["oak", 46, -30, 1.2],
      ["pine", 22, 80, 1.5],
      ["pine", 50, 78, 1.7],
      ["pine", 44, 92, 1.35],
      ["pine", -8, 78, 1.4],
      ["birch", -66, 24, 1.15],
      ["birch", 8, 44, 1.05],
      ["birch", -28, -18, 1.2],
      ["palm", 76, 18, 1.15],
      ["palm", 66, -24, 1.05],
      ["palm", -82, 14, 1.2],
      ["willow", -46, 38, 1.25],
      ["willow", 54, -40, 1.15],
    ].forEach(([kind, x, z, scale]) => grow(kind, x, z, scale));

    function wheat(x, z, w, d) {
      const count = 420;
      const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.03, 0.52, 4), wheatMat, count);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        dummy.position.set(x + (Math.random() - 0.5) * w, 0.26, z + (Math.random() - 0.5) * d);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.setScalar(0.65 + Math.random() * 0.7);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    }
    wheat(16, -34, 14, 8);
    wheat(-24, 42, 16, 9);

    function mix(a, b) {
      const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return n - Math.floor(n);
    }
    function facade(kind, seed) {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 192;
      const litCanvas = document.createElement("canvas");
      litCanvas.width = 96;
      litCanvas.height = 192;
      const g = canvas.getContext("2d");
      const lg = litCanvas.getContext("2d");
      const wall = kind === "glass" ? "#8ea4b6" : kind === "brick" ? "#c4785a" : kind === "pale" ? "#f3efe4" : kind === "stone" ? "#e4d5c2" : "#c9c3b6";
      const frame = kind === "glass" ? "#1d2832" : kind === "brick" ? "#6a3a32" : "#5e5348";
      const pane = kind === "glass" ? "#9ec4da" : kind === "brick" ? "#d8c4a4" : "#6f8c9c";
      g.fillStyle = wall;
      g.fillRect(0, 0, 96, 192);
      lg.fillStyle = "#000";
      lg.fillRect(0, 0, 96, 192);
      const cols = kind === "slab" ? 8 : 5;
      const rows = kind === "slab" ? 10 : 16;
      const cw = 84 / cols;
      const ch = 176 / rows;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = 6 + col * cw + 1.5;
          const y = 8 + row * ch + 1.5;
          const ww = cw - 3;
          const wh = ch - 4;
          g.fillStyle = frame;
          g.fillRect(x - 1, y - 1, ww + 2, wh + 2);
          const on = mix(row + seed, col + seed * 3) > (kind === "glass" ? 0.42 : 0.7);
          g.fillStyle = on ? "#f6d7a4" : pane;
          g.fillRect(x, y, ww, wh);
          if (on) {
            lg.fillStyle = "#ffd7a2";
            lg.fillRect(x, y, ww, wh);
          }
        }
      }
      const map = new THREE.CanvasTexture(canvas);
      const emissiveMap = new THREE.CanvasTexture(litCanvas);
      map.colorSpace = THREE.SRGBColorSpace;
      emissiveMap.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      const face = new THREE.MeshStandardMaterial({
        map,
        emissive: 0xffe2b8,
        emissiveMap,
        emissiveIntensity: kind === "glass" ? 0.55 : 0.42,
        roughness: kind === "glass" ? 0.28 : 0.78,
        metalness: kind === "glass" ? 0.22 : 0.02,
      });
      const roof = new THREE.MeshStandardMaterial({
        color: kind === "brick" ? 0x8a4038 : kind === "stone" || kind === "pale" ? 0x8d7460 : 0x2c3640,
        roughness: 0.7,
        metalness: kind === "glass" ? 0.2 : 0,
      });
      return [face, face, roof, roof, face, face];
    }
    const skins = {
      glass: facade("glass", 2),
      stone: facade("stone", 5),
      slab: facade("slab", 9),
      brick: facade("brick", 4),
      pale: facade("pale", 7),
    };
    const steel = new THREE.MeshStandardMaterial({ color: 0xd5dbe2, roughness: 0.35, metalness: 0.45 });
    function block(mats, w, h, d, x, y, z, parent) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    }
    function tower(x, z, h, w, kind) {
      const group = new THREE.Group();
      const mats = skins[kind];
      const d = kind === "slab" ? w * 0.48 : w * 0.7;
      if (kind === "glass") {
        block(mats, w, h * 0.7, d, 0, h * 0.35, 0, group);
        block(mats, w * 0.72, h * 0.22, d * 0.72, 0, h * 0.81, 0, group);
        block(mats, w * 0.42, h * 0.1, d * 0.42, 0, h * 0.95, 0, group);
        const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, h * 0.07, 6), steel);
        needle.position.y = h + h * 0.02;
        group.add(needle);
      } else if (kind === "slab") {
        block(mats, w, h, d, 0, h * 0.5, 0, group);
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.7, d + 0.5), mats[2]);
        band.position.y = h * 0.72;
        group.add(band);
      } else if (kind === "brick") {
        block(mats, w, h * 0.78, d, 0, h * 0.39, 0, group);
        block(mats, w * 0.62, h * 0.28, d * 0.7, w * 0.12, h * 0.86, 0, group);
      } else {
        block(mats, w * 1.08, h * 0.22, d * 1.08, 0, h * 0.11, 0, group);
        block(mats, w, h * 0.7, d, 0, h * 0.57, 0, group);
        const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 1.1, 0.55, d + 0.8), mats[2]);
        lip.position.y = h * 0.92;
        group.add(lip);
      }
      group.position.set(x, 0.05, z);
      group.rotation.y = Math.atan2(x, z);
      scene.add(group);
    }
    const kinds = ["glass", "stone", "brick", "pale", "slab"];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + 0.15;
      const kind = kinds[i % kinds.length];
      const outer = i % 2 === 0;
      const r = outer ? 248 : 228;
      const h = kind === "glass" ? 52 + (i % 4) * 9 : kind === "slab" ? 24 + (i % 3) * 5 : 30 + (i % 4) * 6;
      const w = kind === "slab" ? 20 + (i % 2) * 4 : kind === "glass" ? 10 + (i % 3) * 2 : 14 + (i % 3) * 2;
      tower(Math.cos(a) * r, Math.sin(a) * r, h, w, kind);
    }
  }

  function addBench(x, z, lookX, lookZ) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a38, roughness: 0.72 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3e40, roughness: 0.4, metalness: 0.45 });
    const bench = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.045, 0.1), wood);
      slat.position.set(0, 0.46, -0.16 + i * 0.11);
      bench.add(slat);
    }
    for (let i = 0; i < 3; i++) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.045, 0.08), wood);
      back.position.set(0, 0.72 + i * 0.1, 0.2);
      back.rotation.x = -0.18;
      bench.add(back);
    }
    for (const sx of [-0.58, 0.58]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.46), metal);
      leg.position.set(sx, 0.23, 0);
      bench.add(leg);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.38, 0.045), metal);
      post.position.set(sx, 0.58, 0.08);
      bench.add(post);
    }
    const link = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.2, 0.045), wood);
    link.position.set(0, 0.58, 0.06);
    bench.add(link);
    const len = Math.hypot(lookX, lookZ) || 1;
    const fx = lookX / len;
    const fz = lookZ / len;
    bench.position.set(x, 0, z);
    bench.rotation.y = Math.atan2(-fx, -fz);
    scene.add(bench);
    addCircle(x, z, 0.5);
    benches.push({ x: x - fx * 0.05, z: z - fz * 0.05, yaw: Math.atan2(fx, fz) });
  }
  for (const [cx, cz] of [[108, 38], [-108, -36]]) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const bx = cx + Math.cos(a) * 6.2;
      const bz = cz + Math.sin(a) * 6.2;
      addBench(bx, bz, cx - bx, cz - bz);
    }
  }

  function drawMap() {
    const size = mapBig ? 520 : 236;
    if (mapEl.width !== size) {
      mapEl.width = size;
      mapEl.height = size;
    }
    const g = mapCtx;
    const R = mapBig ? 190 : 40;
    const s = size / (R * 2);
    const originX = mapBig ? 0 : player.group.position.x;
    const originZ = mapBig ? 0 : player.group.position.z;
    const X = (x) => size / 2 + (x - originX) * s;
    const Y = (z) => size / 2 + (z - originZ) * s;
    g.clearRect(0, 0, size, size);
    g.save();
    if (!mapBig) {
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
      g.clip();
    }
    const grass = g.createRadialGradient(size * 0.38, size * 0.32, size * 0.04, size / 2, size / 2, size * 0.7);
    grass.addColorStop(0, "#efe2b4");
    grass.addColorStop(0.4, "#b7d48a");
    grass.addColorStop(0.78, "#6f9a52");
    grass.addColorStop(1, "#3e6238");
    g.fillStyle = grass;
    g.fillRect(0, 0, size, size);
    g.fillStyle = "rgba(90, 130, 62, 0.22)";
    g.beginPath();
    g.arc(X(-58), Y(46), 16 * s, 0, Math.PI * 2);
    g.arc(X(62), Y(-50), 14 * s, 0, Math.PI * 2);
    g.fill();

    const ribbon = (x1, z1, x2, z2, width, fill) => {
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * width * s * 0.5;
      const ny = (dx / len) * width * s * 0.5;
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(X(x1) + nx, Y(z1) + ny);
      g.lineTo(X(x2) + nx, Y(z2) + ny);
      g.lineTo(X(x2) - nx, Y(z2) - ny);
      g.lineTo(X(x1) - nx, Y(z1) - ny);
      g.closePath();
      g.fill();
    };
    const avenue = (x1, z1, x2, z2) => {
      ribbon(x1, z1, x2, z2, 6.4, "#d9d0c2");
      ribbon(x1, z1, x2, z2, 4.2, "#4a5258");
      ribbon(x1, z1, x2, z2, 0.35, "#e2d48a");
    };
    g.strokeStyle = "#c8c2b4";
    g.lineWidth = 6.4 * s;
    g.beginPath();
    g.arc(X(0), Y(0), 21.5 * s, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#efe8da";
    g.lineWidth = 4.4 * s;
    g.beginPath();
    g.arc(X(0), Y(0), 21.5 * s, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#e7efe0";
    g.beginPath();
    g.arc(X(0), Y(0), 15.2 * s, 0, Math.PI * 2);
    g.fill();
    avenue(0, 16, 0, 62);
    avenue(0, -16, 0, -36);
    avenue(16, 0, 76, 0);
    avenue(-16, 0, -76, 0);
    avenue(-40, 6, -40, 74);
    avenue(-40, -6, -40, -50);
    avenue(-64, 70, 48, 70);
    avenue(-148, 70, -64, 70);
    avenue(-72, -46, 0, -46);
    avenue(-148, -46, -72, -46);
    avenue(74, 0, 155, 0);
    avenue(-155, 0, -74, 0);
    avenue(128, -100, 128, 78);
    avenue(-128, -100, -128, 108);
    avenue(-148, -100, 148, -100);
    avenue(-148, 108, -30, 108);
    g.fillStyle = "#e7e1d4";
    g.beginPath();
    g.arc(X(108), Y(38), 11 * s, 0, Math.PI * 2);
    g.arc(X(-108), Y(-36), 11 * s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#9aa4b0";
    g.beginPath();
    ribbon(18, 74.3, 18, 110, 3.4, "#8d6844");
    g.beginPath();
    g.arc(X(18), Y(116), 9 * s, 0, Math.PI * 2);
    g.fill();

    for (const lake of lakes) {
      g.fillStyle = "#d9c7a2";
      g.beginPath();
      g.arc(X(lake.x), Y(lake.z), (lake.r + 1.1) * s, 0, Math.PI * 2);
      g.fill();
      const water = g.createRadialGradient(X(lake.x), Y(lake.z), lake.r * s * 0.15, X(lake.x), Y(lake.z), lake.r * s);
      water.addColorStop(0, "#8fd4ee");
      water.addColorStop(0.55, "#3f93c4");
      water.addColorStop(1, "#1d6f9a");
      g.fillStyle = water;
      g.beginPath();
      g.arc(X(lake.x), Y(lake.z), lake.r * s, 0, Math.PI * 2);
      g.fill();
    }

    const footprint = (x, z, w, d, wall, roof) => {
      const px = X(x);
      const py = Y(z);
      g.fillStyle = "rgba(40, 36, 28, 0.28)";
      g.fillRect(px + 2, py + 2.4, w * s, d * s);
      g.fillStyle = wall;
      g.fillRect(px, py, w * s, d * s);
      g.fillStyle = roof;
      g.fillRect(px + 1.2, py + 1.2, w * s - 2.4, d * s * 0.46);
      g.strokeStyle = "rgba(255,255,255,0.55)";
      g.lineWidth = 1;
      g.strokeRect(px + 0.6, py + 0.6, w * s - 1.2, d * s - 1.2);
    };
    if (quarry) {
      g.fillStyle = "#8d735c";
      g.beginPath();
      g.arc(X(quarry.x), Y(quarry.z), (quarry.rim || 13) * s, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#5c4a3c";
      g.beginPath();
      g.arc(X(quarry.x), Y(quarry.z), (quarry.floor || 4) * s, 0, Math.PI * 2);
      g.fill();
    }
    if (importAt) footprint(importAt.x - 4.6, importAt.z - 3.6, 9.2, 7.2, "#f6f1e6", "#b86a3d");
    if (marketAt) footprint(marketAt.x - 4.1, marketAt.z - 3.2, 8.2, 6.4, "#f4f7f2", "#1f8a4c");
    if (pescaAt) footprint(pescaAt.x - 4.1, pescaAt.z - 3.2, 8.2, 6.4, "#e7f3f8", "#1d6f9a");
    if (atelierAt) footprint(atelierAt.x - 4.1, atelierAt.z - 3.2, 8.2, 6.4, "#f6e4ec", "#6e2438");
    footprint(-5.6, 50.9, 11.2, 14.2, "#f6f1e8", "#c45a3a");
    footprint(-40.5, 13.5, 13, 9.4, "#f3eee6", "#b55238");
    footprint(27.5, -22.9, 13, 9.4, "#eef3f6", "#4d6474");
    g.fillStyle = "#9fd0e4";
    g.beginPath();
    g.arc(X(0), Y(0), 4.4 * s, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#f4efe6";
    g.lineWidth = 1.4 * s;
    g.stroke();

    const p = player.group.position;
    g.save();
    g.translate(X(p.x), Y(p.z));
    g.rotate(player.group.rotation.y + Math.PI);
    g.fillStyle = "#1c1c1c";
    g.beginPath();
    g.moveTo(0, 9);
    g.lineTo(-6.2, -7);
    g.lineTo(6.2, -7);
    g.closePath();
    g.fill();
    g.fillStyle = "#ffe27a";
    g.beginPath();
    g.moveTo(0, 7);
    g.lineTo(-4.4, -5.2);
    g.lineTo(4.4, -5.2);
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = "#2a241c";
    g.font = `700 ${Math.max(11, size * 0.055)}px Georgia, serif`;
    g.textAlign = "center";
    g.fillText("N", size / 2, 18);
    const shade = g.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.52);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(28, 18, 8, 0.38)");
    g.fillStyle = shade;
    g.fillRect(0, 0, size, size);
    g.restore();
  }

  function clockAt(date) {
    const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const elev = Math.sin(((h - 6) / 24) * Math.PI * 2);
    const az = ((h - 12) / 24) * Math.PI * 2;
    return { h, elev, az };
  }

  function rumble() {
    try {
      const ctx = rumble.audio || (rumble.audio = new AudioContext());
      const o = ctx.createOscillator();
      const gain = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.value = 48;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
      o.connect(gain);
      gain.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.72);
    } catch {
      /* autoplay can block the first crack */
    }
  }

  return {
    benches,
    sun: skyU.sunPosition,
    update(dt, now) {
      if (!Number.isFinite(weather.until)) weather.until = now + 260 + Math.random() * 160;
      if (now > weather.until) rollWeather(now);
      const blend = 1 - Math.exp(-dt * 0.35);
      weather.wind += (weather.goalWind - weather.wind) * blend;
      weather.cover += (weather.goalCover - weather.cover) * blend;
      weather.rain += (weather.goalRain - weather.rain) * blend;
      const dimTarget = weather.kind === "storm" ? 0.62 : weather.kind === "rain" ? 0.8 : weather.kind === "drizzle" ? 0.9 : 1;
      weather.dim += (dimTarget - weather.dim) * blend;
      const { h, elev, az } = clockAt(new Date());
      const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.28);
      const night = 1 - day;
      const el = THREE.MathUtils.clamp(elev, -1, 1);
      const phi = Math.PI / 2 - el;
      const ux = Math.sin(phi) * Math.sin(az);
      const uy = Math.cos(phi);
      const uz = Math.sin(phi) * Math.cos(az);
      const sun = skyU.sunPosition.value;
      sun.set(ux, uy, uz).multiplyScalar(1200000);
      sky.visible = day > 0.05;
      skyU.turbidity.value = 1.1 + weather.cover * 1.4 + night * 0.15;
      skyU.rayleigh.value = 0.02 + day * 1.08 - weather.cover * 0.1;
      skyU.mieCoefficient.value = 0.001 + weather.cover * 0.004 + (h > 16 && h < 20 ? 0.006 : 0);

      renderer.toneMappingExposure = THREE.MathUtils.lerp(0.26, 1.08, day) * weather.dim + flash * 0.4;
      scene.environmentIntensity = THREE.MathUtils.lerp(0.08, 1.2, day);
      sunLight.intensity = THREE.MathUtils.lerp(0, 2.15, day) * weather.dim + flash * 2.2;
      sunLight.position.set(ux, uy, uz).multiplyScalar(80);
      sunLight.target.position.set(player.group.position.x, 0, player.group.position.z);
      sunColor.set(day > 0.55 ? 0xfff1d6 : 0xffb07a);
      sunLight.color.copy(sunColor);
      moonLight.position.set(-ux, -uy, -uz).multiplyScalar(80);
      moonLight.intensity = THREE.MathUtils.lerp(0.16, 0, day) * (weather.kind === "storm" ? 0.45 : 1);
      if (fillLight) fillLight.intensity = THREE.MathUtils.lerp(0.03, 0.34, day);
      hemiLight.intensity = THREE.MathUtils.lerp(0.05, 0.8, day);
      hemiSky.set(night > 0.55 ? 0x162033 : 0xcfe8ff);
      hemiGround.set(night > 0.55 ? 0x14110e : 0x3d4a32);
      hemiLight.color.copy(hemiSky);
      hemiLight.groundColor.copy(hemiGround);
      const lamp = night * (weather.kind === "storm" ? 0.85 : 1);
      const px = player.group.position.x;
      const pz = player.group.position.z;
      if (!worldLampOrder || worldLampOrder.length !== streetLights.length) {
        worldLampOrder = streetLights.map((_, i) => i);
      }
      worldLampOrder.sort((a, b) => {
        const A = streetLights[a];
        const B = streetLights[b];
        const da = (A.userData.lx - px) ** 2 + (A.userData.lz - pz) ** 2;
        const db = (B.userData.lx - px) ** 2 + (B.userData.lz - pz) ** 2;
        return da - db;
      });
      for (let i = 0; i < worldLampOrder.length; i++) {
        const bulb = streetLights[worldLampOrder[i]];
        const on = i < 8 && lamp > 0.02;
        bulb.visible = on;
        if (on) bulb.intensity = 220 * lamp;
      }
      if (lampGlow) lampGlow.emissiveIntensity = 0.5 + lamp * 4.8;
      fogColor.set(night > 0.55 ? 0x03050a : weather.cover > 0.6 ? 0xb7c6d4 : 0xc5d7ea);
      if (day > 0.15 && day < 0.72 && h < 10) fogColor.lerp(dawnTint, 0.45);
      if (day > 0.15 && day < 0.72 && h > 16) fogColor.lerp(duskTint, 0.45);
      scene.fog.color.copy(fogColor);
      scene.fog.density = THREE.MathUtils.lerp(0.00115, 0.0021, day);
      scene.background.copy(night > 0.45 ? nightSky : fogColor);
      const starFade = 1 - THREE.MathUtils.smoothstep(elev, -0.28, 0.06);
      starFields.forEach((field, i) => {
        field.material.opacity = starFade * (i === starFields.length - 1 ? 0.55 : 0.95);
      });
      sunDisc.position.set(ux, uy, uz).multiplyScalar(230);
      moonDisc.position.set(-ux, -uy, -uz).multiplyScalar(230);
      sunDisc.material.opacity = THREE.MathUtils.smoothstep(uy, -0.04, 0.1);
      moonDisc.material.opacity = THREE.MathUtils.smoothstep(-uy, -0.02, 0.16) * (night > 0.35 ? 1 : 0.35);

      cloudTint.set(night > 0.55 ? 0x10141c : elev < 0.22 && (h < 9 || h > 16) ? 0xffe0c4 : 0xfff7ef);
      cloudMat.color.lerp(cloudTint, blend);
      const cloudOp = (night > 0.62 ? 0.035 : night > 0.35 ? 0.1 : 0.8) * (0.72 + weather.cover * 0.22);
      cloudMat.opacity = night > 0.55 ? cloudOp : cloudMat.opacity + (cloudOp - cloudMat.opacity) * blend;
      for (const cloud of clouds) {
        cloud.position.x += cloud.userData.speed * (0.7 + weather.wind) * dt;
        cloud.position.y = cloud.userData.base;
        if (cloud.position.x > 160) cloud.position.x -= 320;
      }
      for (const tree of swayTrees) {
        tree.rotation.z = Math.sin(now * (0.6 + weather.wind) + tree.position.x * 0.15) * 0.02 * weather.wind;
      }

      rain.visible = weather.rain > 0.05;
      rain.material.opacity = 0.2 + weather.rain * 0.45;
      if (rain.visible) {
        const fall = (weather.kind === "drizzle" ? 7 : 16) * dt;
        const px = player.group.position.x;
        const pz = player.group.position.z;
        for (let i = 0; i < rainCount; i++) {
          rainPos[i * 3] += weather.wind * dt * 3;
          rainPos[i * 3 + 1] -= fall * (weather.kind === "storm" ? 1.35 : 1);
          if (rainPos[i * 3 + 1] < 0) resetDrop(rainPos, i, false);
        }
        rain.position.set(px, 0, pz);
        rainGeo.attributes.position.needsUpdate = true;
      }

      if (weather.kind === "storm" && Math.random() < dt * 0.05) {
        flash = 1;
        rumble();
      }
      flash = Math.max(0, flash - dt * 2.1);
      if (flashEl) flashEl.style.opacity = flash > 0.05 ? String(Math.min(0.75, flash)) : "0";

      for (const lake of lakes) {
        for (const fish of lake.fish) {
          fish.userData.a += dt * fish.userData.speed;
          const a = fish.userData.a;
          fish.position.set(lake.x + Math.cos(a) * fish.userData.rad, 0.16, lake.z + Math.sin(a) * fish.userData.rad);
          fish.rotation.y = -a + Math.PI / 2;
          fish.userData.tail.rotation.y = Math.sin(now * 8 + a) * 0.45;
        }
      }
      drawMap();
    },
  };
}

function resetDrop(arr, i, wide) {
  arr[i * 3] = (Math.random() - 0.5) * (wide ? 28 : 22);
  arr[i * 3 + 1] = Math.random() * 14;
  arr[i * 3 + 2] = (Math.random() - 0.5) * (wide ? 28 : 22);
}

function discTexture(kind) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (kind === "sun") {
    const glow = g.createRadialGradient(128, 128, 20, 128, 128, 126);
    glow.addColorStop(0, "rgba(255,252,230,1)");
    glow.addColorStop(0.18, "rgba(255,214,90,1)");
    glow.addColorStop(0.34, "rgba(255,150,40,0.85)");
    glow.addColorStop(0.55, "rgba(255,110,30,0.28)");
    glow.addColorStop(1, "rgba(255,90,20,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#fff6d0";
    g.beginPath();
    g.arc(128, 128, 46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,170,40,0.35)";
    for (const [x, y, r] of [[112, 118, 7], [140, 132, 5], [124, 146, 4]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    const body = g.createRadialGradient(108, 112, 8, 128, 128, 78);
    body.addColorStop(0, "#f7f4ee");
    body.addColorStop(0.55, "#e4e0d6");
    body.addColorStop(1, "#c8c6bc");
    g.fillStyle = body;
    g.beginPath();
    g.arc(128, 128, 74, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(150,148,140,0.55)";
    for (const [x, y, r] of [[96, 108, 16], [150, 124, 11], [118, 156, 13], [146, 92, 7], [84, 146, 6], [168, 150, 5]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "rgba(90,92,98,0.35)";
    g.beginPath();
    g.ellipse(132, 118, 28, 18, 0.4, 0, Math.PI * 2);
    g.fill();
    const shade = g.createRadialGradient(96, 100, 10, 128, 128, 74);
    shade.addColorStop(0, "rgba(255,255,255,0.28)");
    shade.addColorStop(1, "rgba(40,44,52,0.18)");
    g.fillStyle = shade;
    g.beginPath();
    g.arc(128, 128, 74, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  const blobs = [
    [48, 74, 40],
    [96, 62, 52],
    [150, 70, 46],
    [198, 78, 34],
    [78, 50, 28],
    [132, 46, 30],
    [170, 54, 26],
  ];
  for (const [x, y, r] of blobs) {
    const grad = g.createRadialGradient(x, y + 6, r * 0.15, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.96)");
    grad.addColorStop(0.45, "rgba(236,240,246,0.72)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
