import { drawRoom, layout } from "./draw.js";
import "./style.css";

const canvas = document.getElementById("room");
const ctx = canvas.getContext("2d");
const hint = document.getElementById("hint");

const player = { x: 0.3, depth: 0.86, tx: 0.3, td: 0.86, moving: false, phase: 0 };
const friend = { x: 0.78, depth: 0.48, tx: 0.78, td: 0.48, moving: false, phase: 1.4, lid: "#f3c1d8", straw: "#fff", line: "" };

let view = { w: 1, h: 1, horizon: 1, floor: 1 };

function fit() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  view = layout(window.innerWidth * dpr, window.innerHeight * dpr);
  canvas.width = view.w;
  canvas.height = view.h;
}

function toFloor(clientX, clientY) {
  const x = clientX / window.innerWidth;
  const y = clientY / window.innerHeight;
  const horizon = view.horizon / view.h;
  if (y < horizon + 0.04) return null;
  const depth = Math.min(0.94, Math.max(0.12, (y - horizon) / (1 - horizon)));
  return { x: Math.min(0.92, Math.max(0.08, x)), depth };
}

function poke(clientX, clientY) {
  const spot = toFloor(clientX, clientY);
  if (!spot) return;
  player.tx = spot.x;
  player.td = spot.depth;
  hint.classList.add("hide");
}

canvas.addEventListener("pointerdown", (e) => poke(e.clientX, e.clientY));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  const step = 0.55 * dt;
  const dx = player.tx - player.x;
  const dd = player.td - player.depth;
  const dist = Math.hypot(dx, dd);
  player.moving = dist > 0.008;
  if (player.moving) {
    const k = Math.min(1, step / dist);
    player.x += dx * k;
    player.depth += dd * k;
  }
  const near = Math.hypot(player.x - friend.x, player.depth - friend.depth) < 0.18;
  friend.line = near ? "Ehi, benvenuto in casa." : "";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawRoom(ctx, view, now / 1000, [friend, player]);
  requestAnimationFrame(frame);
}

fit();
window.addEventListener("resize", fit);
requestAnimationFrame(frame);
