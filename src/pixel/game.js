import { MAPS, TILE, blocked, nearMarker, findMarker } from "./maps.js";
import { C } from "./palette.js";
import { drawTile, drawTree, drawActor, drawNpc, drawLamp, drawSign, rect } from "./draw.js";

const SAVE_KEY = "zv-pixel-save";
const VIEW_W = 320;
const VIEW_H = 180;

const BUILDING_LABEL = {
  H: "Casa",
  M: "Mercato",
  S: "Negozio",
  P: "Telefono",
  B: "Banca",
};

export function createGame(canvas, ui) {
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;

  let map = MAPS.plaza;
  const player = {
    x: map.spawn.x,
    y: map.spawn.y,
    face: 1,
    bob: 0,
    moving: false,
    running: false,
  };

  const vitals = { life: 1, hunger: 0.82, thirst: 0.76 };
  let zcoin = 40;
  let bread = 2;
  let water = 2;
  let toastTimer = 0;
  let bannerTimer = 0;
  let interact = null;
  let phoneOpen = false;
  let menuOpen = false;
  let dayNight = 0.35;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  const keys = Object.create(null);
  const stick = { x: 0, y: 0, active: false };

  const npcs = [{ x: 19.5, y: 13.5, line: "Benvenuto in Zoom Verse." }];

  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (raw) {
      if (raw.map && MAPS[raw.map]) {
        map = MAPS[raw.map];
      }
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

  function save() {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        map: map.id,
        x: player.x,
        y: player.y,
        vitals,
        zcoin,
        bread,
        water,
      }),
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
    bannerTimer = 2.4;
  }

  function fit() {
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    scale = Math.max(1, Math.floor(Math.min(ww / VIEW_W, wh / VIEW_H)));
    const cw = VIEW_W * scale;
    const ch = VIEW_H * scale;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    offsetX = Math.floor((ww - cw) / 2);
    offsetY = Math.floor((wh - ch) / 2);
    canvas.style.left = `${offsetX}px`;
    canvas.style.top = `${offsetY}px`;
    ctx.imageSmoothingEnabled = false;
  }

  function setMap(next, spawn) {
    map = next;
    player.x = spawn?.x ?? next.spawn.x;
    player.y = spawn?.y ?? next.spawn.y;
    showPlace(next.name);
    save();
  }

  function refreshVitalsUi() {
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
          label: kind === "H" ? "Entra in casa" : `Entra · ${BUILDING_LABEL[kind] || "Dentro"}`,
          run() {
            if (kind === "H") {
              setMap(MAPS.house);
              toast("Casa tua. Letto, tavolo, uscita.");
            } else if (kind === "M" || kind === "P") {
              if (kind === "P") openPhone();
              else {
                toast("Mercato: pane 8 · acqua 5 ZCOIN");
                openMarket();
              }
            } else if (kind === "S") {
              toast("Negozio in arrivo. Per ora compra dal mercato.");
              openMarket();
            } else if (kind === "B") {
              toast("Banca: i tuoi ZCOIN restano nel telefono.");
              openPhone("wallet");
            } else {
              toast("Chiuso per ora.");
            }
          },
        };
        return;
      }
      const npc = npcs.find((n) => Math.hypot(n.x - player.x, n.y - player.y) < 1.1);
      if (npc) {
        interact = {
          label: "Parla",
          run() {
            toast(npc.line);
          },
        };
        return;
      }
    }

    if (map.id === "house") {
      const bed = nearMarker(map, player.x, player.y, ["b"], 1.1);
      if (bed) {
        interact = {
          label: "Dormi",
          run() {
            vitals.life = 1;
            vitals.hunger = Math.max(0.15, vitals.hunger - 0.08);
            vitals.thirst = Math.max(0.15, vitals.thirst - 0.08);
            refreshVitalsUi();
            save();
            toast("Hai riposato. Vita piena.");
          },
        };
        return;
      }
      const table = nearMarker(map, player.x, player.y, ["t"], 1.1);
      if (table) {
        interact = {
          label: bread > 0 || water > 0 ? "Mangia / Bevi" : "Tavolo vuoto",
          run() {
            if (bread <= 0 && water <= 0) {
              toast("Niente in casa. Compra al mercato.");
              return;
            }
            if (bread > 0) {
              bread -= 1;
              vitals.hunger = Math.min(1, vitals.hunger + 0.45);
            }
            if (water > 0) {
              water -= 1;
              vitals.thirst = Math.min(1, vitals.thirst + 0.5);
            }
            vitals.life = Math.min(1, vitals.life + 0.1);
            refreshVitalsUi();
            save();
            toast(`Pane ${bread} · Acqua ${water}`);
          },
        };
        return;
      }
      const exit = nearMarker(map, player.x, player.y, ["E", "D"], 1.2);
      if (exit) {
        interact = {
          label: "Esci in piazza",
          run() {
            const door = findMarker(MAPS.plaza, "D");
            const homeDoor = MAPS.plaza.markers.find((m) => m.kind === "D" && MAPS.plaza.markers.some((o) => o.kind === "H" && o.x === m.x && o.y === m.y - 1));
            const d = homeDoor || door;
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
      <p>ZCOIN in tasca: <strong>${Math.floor(zcoin)}</strong></p>
      <p>Pane in casa: ${bread} · Acqua: ${water}</p>
      <button type="button" data-buy="bread">Pane · 8 ZCOIN</button>
      <button type="button" data-buy="water">Acqua · 5 ZCOIN</button>
      <button type="button" data-close-phone>Chiudi</button>
    `;
  }

  function openPhone(tab = "home") {
    phoneOpen = true;
    ui.phone.classList.remove("hidden");
    if (tab === "wallet") {
      ui.phoneBody.innerHTML = `
        <h2>Portafoglio</h2>
        <p>Hai <strong>${Math.floor(zcoin)} ZCOIN</strong>.</p>
        <p>Nel prototipo pixel il GRAM resta l’idea di Zoom: qui puoi solo vedere il saldo.</p>
        <button type="button" data-close-phone>Chiudi</button>
      `;
      return;
    }
    ui.phoneBody.innerHTML = `
      <h2>Telefono</h2>
      <p>La tua vita in Zoom, versione pixel.</p>
      <button type="button" data-open="wallet">Portafoglio</button>
      <button type="button" data-open="market">Mercato</button>
      <button type="button" data-open="status">Stato</button>
      <button type="button" data-close-phone>Chiudi</button>
    `;
  }

  function openStatus() {
    ui.phoneBody.innerHTML = `
      <h2>Stato</h2>
      <p>Vita ${(vitals.life * 100) | 0}% · Fame ${(vitals.hunger * 100) | 0}% · Sete ${(vitals.thirst * 100) | 0}%</p>
      <p>Pane ${bread} · Acqua ${water}</p>
      <p>Mappa: ${map.name}</p>
      <button type="button" data-close-phone>Chiudi</button>
    `;
  }

  function closePhone() {
    phoneOpen = false;
    ui.phone.classList.add("hidden");
  }

  function doInteract() {
    if (phoneOpen || menuOpen) return;
    if (!interact) return;
    interact.run();
    updateInteract();
    ui.actBtn.classList.toggle("hidden", !interact);
    if (interact) ui.actBtn.textContent = interact.label;
  }

  function movePlayer(dt) {
    if (phoneOpen || menuOpen) return;
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
    if (mx !== 0) player.face = mx > 0 ? 1 : -1;
    const speed = (player.running || keys.shift ? 4.6 : 2.55) * dt;
    const nx = player.x + mx * speed;
    const ny = player.y + my * speed;
    if (!blocked(map, nx, player.y)) player.x = nx;
    if (!blocked(map, player.x, ny)) player.y = ny;
    player.bob = Math.sin(performance.now() * 0.02) * (player.running ? 1.4 : 0.9);
  }

  function tickVitals(dt) {
    vitals.hunger = Math.max(0, vitals.hunger - dt * 0.0045);
    vitals.thirst = Math.max(0, vitals.thirst - dt * 0.0055);
    if (vitals.hunger <= 0.05 || vitals.thirst <= 0.05) {
      vitals.life = Math.max(0.05, vitals.life - dt * 0.01);
    } else if (vitals.life < 1) {
      vitals.life = Math.min(1, vitals.life + dt * 0.002);
    }
    dayNight = (dayNight + dt * 0.01) % 1;
  }

  function drawWorld(time) {
    const camX = player.x * TILE - VIEW_W / 2 + 8;
    const camY = player.y * TILE - VIEW_H / 2 + 8;
    const maxCamX = map.w * TILE - VIEW_W;
    const maxCamY = map.h * TILE - VIEW_H;
    const cx = Math.max(0, Math.min(maxCamX, camX));
    const cy = Math.max(0, Math.min(maxCamY, camY));

    rect(ctx, 0, 0, VIEW_W, VIEW_H, map.id === "house" ? "#2a3340" : C.sky);

    const x0 = Math.max(0, Math.floor(cx / TILE) - 1);
    const y0 = Math.max(0, Math.floor(cy / TILE) - 1);
    const x1 = Math.min(map.w - 1, Math.ceil((cx + VIEW_W) / TILE) + 1);
    const y1 = Math.min(map.h - 1, Math.ceil((cy + VIEW_H) / TILE) + 1);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const id = map.tiles[ty * map.w + tx];
        drawTile(ctx, id, Math.floor(tx * TILE - cx), Math.floor(ty * TILE - cy), time);
      }
    }

    if (map.id === "plaza") {
      for (const m of map.markers) {
        if (m.kind === "N") continue;
        if ("HMSBP".includes(m.kind)) {
          const sx = Math.floor(m.x * TILE - cx);
          const sy = Math.floor(m.y * TILE - cy);
          if (m.kind === "H" || m.kind === "S" || m.kind === "M") {
            /* building tiles already drawn */
          }
        }
      }
      drawTree(ctx, Math.floor(8 * TILE - cx), Math.floor(6 * TILE - cy));
      drawTree(ctx, Math.floor(28 * TILE - cx), Math.floor(8 * TILE - cy));
      drawLamp(ctx, Math.floor(14 * TILE - cx), Math.floor(7 * TILE - cy), dayNight > 0.55);
      drawLamp(ctx, Math.floor(24 * TILE - cx), Math.floor(15 * TILE - cy), dayNight > 0.55);
      drawSign(ctx, Math.floor(19 * TILE - cx), Math.floor(11 * TILE - cy));

      for (const n of npcs) {
        drawNpc(ctx, Math.floor(n.x * TILE - cx), Math.floor(n.y * TILE - cy), Math.sin(time * 0.004));
      }
    }

    drawActor(
      ctx,
      Math.floor(player.x * TILE - cx),
      Math.floor(player.y * TILE - cy),
      player.face,
      player.bob,
      player.running && player.moving,
    );

    if (map.id === "plaza" && dayNight > 0.55) {
      ctx.fillStyle = `rgba(8, 14, 22, ${0.18 + (dayNight - 0.55) * 0.5})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (vitals.hunger < 0.12 || vitals.thirst < 0.12) {
      ctx.fillStyle = "rgba(40, 40, 40, 0.22)";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  let last = performance.now();
  let saveAcc = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    movePlayer(dt);
    tickVitals(dt);
    updateInteract();

    ui.actBtn.classList.toggle("hidden", !interact || phoneOpen);
    if (interact) ui.actBtn.textContent = interact.label;

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.classList.remove("show");
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) ui.banner.classList.remove("show");
    }

    refreshVitalsUi();
    drawWorld(now);

    saveAcc += dt;
    if (saveAcc > 4) {
      saveAcc = 0;
      save();
    }

    const clock = new Date();
    ui.phoneClock.textContent = `${String(clock.getHours()).padStart(2, "0")}:${String(clock.getMinutes()).padStart(2, "0")}`;

    requestAnimationFrame(frame);
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
      if (btn.hasAttribute("data-close-phone")) {
        closePhone();
        return;
      }
      const open = btn.getAttribute("data-open");
      if (open === "wallet") openPhone("wallet");
      if (open === "market") openMarket();
      if (open === "status") openStatus();
      const buy = btn.getAttribute("data-buy");
      if (buy === "bread") {
        if (zcoin < 8) return toast("ZCOIN insufficienti");
        zcoin -= 8;
        bread += 1;
        refreshVitalsUi();
        save();
        toast("Pane comprato");
        openMarket();
      }
      if (buy === "water") {
        if (zcoin < 5) return toast("ZCOIN insufficienti");
        zcoin -= 5;
        water += 1;
        refreshVitalsUi();
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
      if (open === "3d") {
        window.location.href = "/index-3d.html";
      }
      if (open === "help") {
        toast("WASD / stick per muoverti · E per agire · Corre per correre");
      }
    });

    const stickEl = ui.stick;
    const knob = ui.knob;
    const setStick = (clientX, clientY) => {
      const rect = stickEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const max = rect.width * 0.34;
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
  refreshVitalsUi();
  showPlace(map.name);
  toast("Prototipo pixel · stessa vita Zoom, più leggera");
  requestAnimationFrame(frame);

  return {
    ready() {
      ui.boot.classList.add("out");
    },
  };
}
