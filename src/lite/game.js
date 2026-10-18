import { MAPS, TILE, blocked, nearMarker, findMarker } from "./maps.js";
import { C, drawTile, drawFacade, drawHero, drawNpc, drawTree, drawLamp, rect } from "./draw.js";

const SAVE_KEY = "zv-lite-save";
const OWNER_TG_ID = "8144744644";
const OWNER_TG_NAME = "zoom0100";

const BUILDING = { H: "Casa", M: "Mercato", S: "Negozio", P: "Telefono", B: "Banca" };

export function createGame(canvas, ui) {
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;

  let map = MAPS.plaza;
  const player = { x: map.spawn.x, y: map.spawn.y, face: 0, bob: 0, moving: false, running: false };
  const vitals = { life: 1, hunger: 0.84, thirst: 0.78 };
  let zcoin = 40;
  let bread = 2;
  let water = 2;
  let toastTimer = 0;
  let bannerTimer = 0;
  let interact = null;
  let phoneOpen = false;
  let menuOpen = false;
  let viewW = 390;
  let viewH = 700;
  let camX = 0;
  let camY = 0;
  let camReady = false;
  let maintOwner = false;
  let maintOn = false;

  const keys = Object.create(null);
  const stick = { x: 0, y: 0, active: false };
  const npcs = [{ x: 19.5, y: 13.5, line: "Benvenuto in Zoom Verse Lite." }];

  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (raw) {
      if (raw.map && MAPS[raw.map]) map = MAPS[raw.map];
      if (Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
        player.x = raw.x;
        player.y = raw.y;
      }
      if (raw.vitals) Object.assign(vitals, raw.vitals);
      if (Number.isFinite(raw.zcoin)) zcoin = raw.zcoin;
      if (Number.isFinite(raw.bread)) bread = raw.bread;
      if (Number.isFinite(raw.water)) water = raw.water;
    }
  } catch {
    /* fresh */
  }

  function tgUid() {
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    return u?.id != null ? String(u.id) : "";
  }
  function tgUsername() {
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    return u?.username ? String(u.username).replace(/^@/, "").toLowerCase() : "";
  }
  function isOwner() {
    return tgUid() === OWNER_TG_ID || tgUsername() === OWNER_TG_NAME;
  }

  function save() {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ map: map.id, x: player.x, y: player.y, vitals, zcoin, bread, water }),
    );
  }

  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add("show");
    toastTimer = 2.2;
  }

  function showPlace(name) {
    ui.banner.textContent = name;
    ui.banner.classList.add("show");
    bannerTimer = 2.2;
  }

  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = Math.max(2, Math.floor(window.innerWidth * dpr));
    viewH = Math.max(2, Math.floor(window.innerHeight * dpr));
    canvas.width = viewW;
    canvas.height = viewH;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    canvas.style.left = "0";
    canvas.style.top = "0";
    ctx.imageSmoothingEnabled = false;
  }

  function frameZoom() {
    const long = Math.max(viewW, viewH);
    return long / (11 * TILE);
  }

  function setMap(next, spawn) {
    map = next;
    player.x = spawn?.x ?? next.spawn.x;
    player.y = spawn?.y ?? next.spawn.y;
    camReady = false;
    showPlace(next.name);
    save();
  }

  function refreshHud() {
    ui.life.style.transform = `scaleX(${Math.max(0, Math.min(1, vitals.life))})`;
    ui.hunger.style.transform = `scaleX(${Math.max(0, Math.min(1, vitals.hunger))})`;
    ui.thirst.style.transform = `scaleX(${Math.max(0, Math.min(1, vitals.thirst))})`;
    ui.zcoin.textContent = String(Math.floor(zcoin));
  }

  function updateInteract() {
    if (map.id === "plaza") {
      const door = nearMarker(map, player.x, player.y, ["D"], 1.05);
      if (door) {
        const nearby = map.markers.find(
          (m) => "HMSBP".includes(m.kind) && Math.abs(m.x - door.x) <= 2 && Math.abs(m.y - door.y) <= 2,
        );
        const kind = nearby?.kind || "H";
        interact = {
          label: kind === "H" ? "Entra in casa" : `Entra · ${BUILDING[kind] || "Dentro"}`,
          run() {
            if (kind === "H") {
              setMap(MAPS.house);
              toast("Casa tua · letto, tavolo, uscita");
            } else if (kind === "M" || kind === "S") openMarket();
            else if (kind === "P" || kind === "B") openPhone(kind === "B" ? "wallet" : "home");
            else toast("Chiuso per ora");
          },
        };
        return;
      }
      const npc = npcs.find((n) => Math.hypot(n.x - player.x, n.y - player.y) < 1.1);
      if (npc) {
        interact = { label: "Parla", run: () => toast(npc.line) };
        return;
      }
    }

    if (map.id === "house") {
      if (nearMarker(map, player.x, player.y, ["b"], 1.1)) {
        interact = {
          label: "Dormi",
          run() {
            vitals.life = 1;
            vitals.hunger = Math.max(0.15, vitals.hunger - 0.08);
            vitals.thirst = Math.max(0.15, vitals.thirst - 0.08);
            refreshHud();
            save();
            toast("Hai riposato");
          },
        };
        return;
      }
      if (nearMarker(map, player.x, player.y, ["t"], 1.1)) {
        interact = {
          label: bread > 0 || water > 0 ? "Mangia / Bevi" : "Tavolo vuoto",
          run() {
            if (bread <= 0 && water <= 0) return toast("Compra al mercato");
            if (bread > 0) {
              bread -= 1;
              vitals.hunger = Math.min(1, vitals.hunger + 0.45);
            }
            if (water > 0) {
              water -= 1;
              vitals.thirst = Math.min(1, vitals.thirst + 0.5);
            }
            vitals.life = Math.min(1, vitals.life + 0.1);
            refreshHud();
            save();
            toast(`Pane ${bread} · Acqua ${water}`);
          },
        };
        return;
      }
      if (nearMarker(map, player.x, player.y, ["E", "D"], 1.2)) {
        interact = {
          label: "Esci in piazza",
          run() {
            const d =
              MAPS.plaza.markers.find(
                (m) => m.kind === "D" && MAPS.plaza.markers.some((o) => o.kind === "H" && o.x === m.x && Math.abs(o.y - m.y) <= 2),
              ) || findMarker(MAPS.plaza, "D");
            setMap(MAPS.plaza, { x: (d?.x ?? 10) + 0.5, y: (d?.y ?? 12) + 1.4 });
          },
        };
        return;
      }
    }
    interact = null;
  }

  function openMarket() {
    phoneOpen = true;
    ui.phone.classList.remove("hidden");
    ui.phoneBody.innerHTML = `
      <h2>Mercato</h2>
      <p>ZCOIN: <strong>${Math.floor(zcoin)}</strong></p>
      <p>Pane ${bread} · Acqua ${water}</p>
      <button type="button" data-buy="bread">Pane · 8 ZCOIN</button>
      <button type="button" data-buy="water">Acqua · 5 ZCOIN</button>
      <button type="button" data-close-phone>Chiudi</button>`;
  }

  function openPhone(tab = "home") {
    phoneOpen = true;
    ui.phone.classList.remove("hidden");
    if (tab === "wallet") {
      ui.phoneBody.innerHTML = `
        <h2>Portafoglio</h2>
        <p>Hai <strong>${Math.floor(zcoin)} ZCOIN</strong>.</p>
        <button type="button" data-close-phone>Chiudi</button>`;
      return;
    }
    if (tab === "status") {
      ui.phoneBody.innerHTML = `
        <h2>Stato</h2>
        <p>Vita ${(vitals.life * 100) | 0}% · Fame ${(vitals.hunger * 100) | 0}% · Sete ${(vitals.thirst * 100) | 0}%</p>
        <p>Mappa: ${map.name}</p>
        <button type="button" data-close-phone>Chiudi</button>`;
      return;
    }
    ui.phoneBody.innerHTML = `
      <h2>Telefono</h2>
      <p>Zoom Verse Lite · fluido sul telefono.</p>
      <button type="button" data-open="wallet">Portafoglio</button>
      <button type="button" data-open="market">Mercato</button>
      <button type="button" data-open="status">Stato</button>
      <button type="button" data-close-phone>Chiudi</button>`;
  }

  function closePhone() {
    phoneOpen = false;
    ui.phone.classList.add("hidden");
  }

  function doInteract() {
    if (phoneOpen || menuOpen || !interact) return;
    interact.run();
    updateInteract();
    ui.actBtn.classList.toggle("hidden", !interact);
    if (interact) ui.actBtn.textContent = interact.label;
  }

  function movePlayer(dt) {
    if (phoneOpen || menuOpen || maintOn && !maintOwner) return;
    let mx = 0;
    let my = 0;
    if (keys.w || keys.arrowup) my -= 1;
    if (keys.s || keys.arrowdown) my += 1;
    if (keys.a || keys.arrowleft) mx -= 1;
    if (keys.d || keys.arrowright) mx += 1;
    if (stick.active) {
      mx += stick.x;
      my += stick.y;
    }
    const len = Math.hypot(mx, my);
    player.moving = len > 0.08;
    if (!player.moving) {
      player.bob = 0;
      return;
    }
    mx /= len;
    my /= len;
    if (Math.abs(mx) > Math.abs(my)) player.face = mx > 0 ? 1 : 3;
    else player.face = my > 0 ? 2 : 0;
    const speed = (player.running || keys.shift ? 4.8 : 2.7) * dt;
    const nx = player.x + mx * speed;
    const ny = player.y + my * speed;
    if (!blocked(map, nx, player.y)) player.x = nx;
    if (!blocked(map, player.x, ny)) player.y = ny;
    player.bob = Math.sin(performance.now() * 0.02) * (player.running ? 1.3 : 0.85);
  }

  function tickVitals(dt) {
    vitals.hunger = Math.max(0, vitals.hunger - dt * 0.004);
    vitals.thirst = Math.max(0, vitals.thirst - dt * 0.005);
    if (vitals.hunger <= 0.05 || vitals.thirst <= 0.05) vitals.life = Math.max(0.05, vitals.life - dt * 0.01);
    else if (vitals.life < 1) vitals.life = Math.min(1, vitals.life + dt * 0.002);
  }

  function drawWorld(time, dt) {
    const zoom = frameZoom();
    const worldW = viewW / zoom;
    const worldH = viewH / zoom;
    const ahead = [
      { x: 0, y: -TILE * 1.5 },
      { x: TILE * 1.5, y: 0 },
      { x: 0, y: TILE * 1.5 },
      { x: -TILE * 1.5, y: 0 },
    ][player.face] || { x: 0, y: -TILE };
    const feetX = player.x * TILE + TILE * 0.5;
    const feetY = player.y * TILE + TILE;
    let targetX = feetX + ahead.x * 0.4 - worldW * 0.5;
    let targetY = feetY + ahead.y * 0.4 - worldH * 0.66;
    const mapW = map.w * TILE;
    const mapH = map.h * TILE;
    if (mapW <= worldW) targetX = (mapW - worldW) / 2;
    else targetX = Math.max(0, Math.min(mapW - worldW, targetX));
    if (mapH <= worldH) targetY = (mapH - worldH) / 2;
    else targetY = Math.max(0, Math.min(mapH - worldH, targetY));
    if (!camReady) {
      camX = targetX;
      camY = targetY;
      camReady = true;
    } else {
      const k = Math.min(1, dt * 7);
      camX += (targetX - camX) * k;
      camY += (targetY - camY) * k;
    }

    ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
    rect(ctx, 0, 0, worldW, worldH, map.id === "house" ? "#2a3340" : C.sky);

    const x0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const y0 = Math.max(0, Math.floor(camY / TILE) - 2);
    const x1 = Math.min(map.w - 1, Math.ceil((camX + worldW) / TILE) + 1);
    const y1 = Math.min(map.h - 1, Math.ceil((camY + worldH) / TILE) + 1);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        drawTile(ctx, map.tiles[ty * map.w + tx], tx * TILE - camX, ty * TILE - camY, time);
      }
    }

    const stack = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const id = map.tiles[ty * map.w + tx];
        if (id === 4 || id === 5 || id === 6 || id === 8) {
          stack.push({ z: (ty + 1) * TILE, kind: "facade", id, x: tx * TILE, y: ty * TILE });
        }
      }
    }
    if (map.id === "plaza") {
      stack.push({ z: 7 * TILE, kind: "tree", x: 8 * TILE, y: 6 * TILE });
      stack.push({ z: 9 * TILE, kind: "tree", x: 28 * TILE, y: 8 * TILE });
      stack.push({ z: 8 * TILE, kind: "lamp", x: 14 * TILE, y: 7 * TILE });
      stack.push({ z: 16 * TILE, kind: "lamp", x: 24 * TILE, y: 15 * TILE });
      for (const n of npcs) {
        stack.push({ z: n.y * TILE + TILE, kind: "npc", x: n.x * TILE, y: n.y * TILE, bob: Math.sin(time * 0.004) });
      }
    }
    stack.push({
      z: player.y * TILE + TILE,
      kind: "hero",
      x: player.x * TILE,
      y: player.y * TILE,
    });
    stack.sort((a, b) => a.z - b.z);

    for (const item of stack) {
      const sx = item.x - camX;
      const sy = item.y - camY;
      if (item.kind === "facade") drawFacade(ctx, item.id, sx, sy);
      else if (item.kind === "tree") drawTree(ctx, sx, sy);
      else if (item.kind === "lamp") drawLamp(ctx, sx, sy, true);
      else if (item.kind === "npc") drawNpc(ctx, sx, sy, item.bob);
      else {
        drawHero(ctx, sx, sy, player.face, player.bob, player.running && player.moving);
      }
    }

    if (vitals.hunger < 0.12 || vitals.thirst < 0.12) {
      ctx.fillStyle = "rgba(40,40,40,0.2)";
      ctx.fillRect(0, 0, worldW, worldH);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  let last = performance.now();
  let saveAcc = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!(maintOn && !maintOwner)) {
      movePlayer(dt);
      tickVitals(dt);
      updateInteract();
    }

    ui.actBtn.classList.toggle("hidden", !interact || phoneOpen || (maintOn && !maintOwner));
    if (interact) ui.actBtn.textContent = interact.label;

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.classList.remove("show");
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) ui.banner.classList.remove("show");
    }

    refreshHud();
    if (!(maintOn && !maintOwner)) drawWorld(now, dt);

    saveAcc += dt;
    if (saveAcc > 4) {
      saveAcc = 0;
      save();
    }

    const clock = new Date();
    ui.phoneClock.textContent = `${String(clock.getHours()).padStart(2, "0")}:${String(clock.getMinutes()).padStart(2, "0")}`;
    requestAnimationFrame(frame);
  }

  async function syncMaint() {
    maintOwner = isOwner();
    try {
      const q = new URLSearchParams({ uid: tgUid(), username: tgUsername(), t: String(Date.now()) });
      const res = await fetch(`/api/maint?${q}`, { cache: "no-store" });
      if (!res.ok) throw new Error("maint");
      const data = await res.json();
      maintOn = !!data.on;
      maintOwner = isOwner();
      ui.maint.classList.toggle("hidden", !(maintOn && !maintOwner));
      ui.maintText.textContent = data.text || "Zoom Verse is in maintenance.";
      ui.maintNote.classList.toggle("hidden", !(maintOn && maintOwner));
      ui.maintNote.textContent = "Manutenzione attiva · tu resti dentro";
    } catch {
      maintOwner = isOwner();
    }
  }

  function bind() {
    window.addEventListener("resize", fit);
    window.addEventListener("keydown", (e) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === "Shift") player.running = true;
      if (e.key === "e" || e.key === "E" || e.key === "Enter") doInteract();
      if (e.key === "Escape") {
        closePhone();
        menuOpen = false;
        ui.menu.classList.add("hidden");
      }
    });
    window.addEventListener("keyup", (e) => {
      keys[e.key.toLowerCase()] = false;
      if (e.key === "Shift") player.running = false;
    });

    ui.actBtn.addEventListener("click", doInteract);
    ui.runBtn.addEventListener("click", () => {
      player.running = !player.running;
      ui.runBtn.classList.toggle("on", player.running);
    });
    ui.menuBtn.addEventListener("click", () => {
      menuOpen = !menuOpen;
      ui.menu.classList.toggle("hidden", !menuOpen);
    });
    ui.phoneToggle.addEventListener("click", () => openPhone());
    ui.phoneBack.addEventListener("click", closePhone);

    ui.phoneBody.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.hasAttribute("data-close-phone")) return closePhone();
      const open = btn.getAttribute("data-open");
      if (open === "wallet") openPhone("wallet");
      if (open === "market") openMarket();
      if (open === "status") openPhone("status");
      const buy = btn.getAttribute("data-buy");
      if (buy === "bread") {
        if (zcoin < 8) return toast("ZCOIN insufficienti");
        zcoin -= 8;
        bread += 1;
        refreshHud();
        save();
        toast("Pane comprato");
        openMarket();
      }
      if (buy === "water") {
        if (zcoin < 5) return toast("ZCOIN insufficienti");
        zcoin -= 5;
        water += 1;
        refreshHud();
        save();
        toast("Acqua comprata");
        openMarket();
      }
    });

    ui.menu.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const open = btn.getAttribute("data-open");
      menuOpen = false;
      ui.menu.classList.add("hidden");
      if (open === "phone") openPhone();
      if (open === "market") openMarket();
      if (open === "3d") window.location.href = "/index-3d.html";
      if (open === "help") toast("WASD / stick · E agisci · Corri");
    });

    const stickEl = ui.stick;
    const knob = ui.knob;
    const setStick = (clientX, clientY) => {
      const box = stickEl.getBoundingClientRect();
      let dx = clientX - (box.left + box.width / 2);
      let dy = clientY - (box.top + box.height / 2);
      const max = box.width * 0.34;
      const len = Math.hypot(dx, dy) || 1;
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      stick.x = dx / max;
      stick.y = dy / max;
      stick.active = Math.hypot(stick.x, stick.y) > 0.12;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const clearStick = () => {
      stick.x = 0;
      stick.y = 0;
      stick.active = false;
      knob.style.transform = "translate(0,0)";
    };
    stickEl.addEventListener("pointerdown", (e) => {
      stickEl.setPointerCapture(e.pointerId);
      setStick(e.clientX, e.clientY);
    });
    stickEl.addEventListener("pointermove", (e) => {
      if (!stickEl.hasPointerCapture(e.pointerId)) return;
      setStick(e.clientX, e.clientY);
    });
    stickEl.addEventListener("pointerup", clearStick);
    stickEl.addEventListener("pointercancel", clearStick);
  }

  fit();
  bind();
  refreshHud();
  showPlace(map.name);
  toast("Terza persona · schermo intero");
  syncMaint();
  setInterval(syncMaint, 15000);
  requestAnimationFrame(frame);

  return {
    ready() {
      ui.boot.classList.add("out");
    },
  };
}
