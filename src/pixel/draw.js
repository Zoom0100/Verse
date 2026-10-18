import { C } from "./palette.js";
import { TILE } from "./maps.js";

export function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, 1, 1);
}

export function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}

function drawGrass(ctx, x, y, variant) {
  rect(ctx, x, y, TILE, TILE, variant ? C.grassDark : C.grass);
  px(ctx, x + 3, y + 4, C.leaf);
  px(ctx, x + 11, y + 9, C.leaf);
  px(ctx, x + 7, y + 12, C.grassDark);
}

function drawPath(ctx, x, y) {
  rect(ctx, x, y, TILE, TILE, C.path);
  rect(ctx, x, y, TILE, 1, C.pathLight);
  px(ctx, x + 5, y + 8, C.stoneDark);
  px(ctx, x + 12, y + 4, C.stone);
}

function drawWater(ctx, x, y, t) {
  rect(ctx, x, y, TILE, TILE, C.waterDeep);
  const o = ((t * 0.002) | 0) % 4;
  rect(ctx, x + o, y + 4, 6, 1, C.water);
  rect(ctx, x + 6 - o, y + 10, 5, 1, C.glass);
}

function drawStone(ctx, x, y) {
  rect(ctx, x, y, TILE, TILE, C.stone);
  rect(ctx, x, y, TILE, 2, C.stoneDark);
  rect(ctx, x + 1, y + 4, 6, 3, C.pathLight);
}

function drawBuilding(ctx, x, y, kind) {
  rect(ctx, x, y, TILE, TILE, C.brick);
  rect(ctx, x, y, TILE, 3, C.roof);
  if (kind === "door") {
    rect(ctx, x + 4, y + 6, 8, 10, C.door);
    px(ctx, x + 10, y + 11, C.lamp);
  } else {
    rect(ctx, x + 3, y + 6, 4, 4, C.glass);
    rect(ctx, x + 9, y + 6, 4, 4, C.glass);
  }
}

function drawFloor(ctx, x, y) {
  rect(ctx, x, y, TILE, TILE, C.floor);
  if (((x / TILE) | 0) % 2 === ((y / TILE) | 0) % 2) {
    rect(ctx, x, y, TILE, TILE, C.floorDark);
  }
}

function drawWall(ctx, x, y) {
  rect(ctx, x, y, TILE, TILE, C.wall);
  rect(ctx, x, y + TILE - 3, TILE, 3, C.wallShade);
}

function drawRug(ctx, x, y) {
  drawFloor(ctx, x, y);
  rect(ctx, x + 2, y + 2, 12, 12, "#3d6b78");
  rect(ctx, x + 4, y + 4, 8, 8, "#2f9e8a");
}

function drawBed(ctx, x, y) {
  drawFloor(ctx, x, y);
  rect(ctx, x + 1, y + 3, 14, 11, C.wood);
  rect(ctx, x + 2, y + 4, 12, 8, C.white);
  rect(ctx, x + 2, y + 4, 5, 8, "#7aa7c4");
}

function drawTable(ctx, x, y) {
  drawFloor(ctx, x, y);
  rect(ctx, x + 2, y + 5, 12, 8, C.woodLight);
  rect(ctx, x + 3, y + 3, 4, 3, C.accent);
  rect(ctx, x + 9, y + 3, 3, 4, C.water);
}

function drawCounter(ctx, x, y) {
  drawFloor(ctx, x, y);
  rect(ctx, x + 1, y + 4, 14, 10, C.stone);
  rect(ctx, x + 2, y + 2, 5, 3, C.brick);
}

function drawMat(ctx, x, y) {
  drawFloor(ctx, x, y);
  rect(ctx, x + 1, y + 10, 14, 5, C.door);
}

export function drawTile(ctx, id, x, y, time, meta = "") {
  switch (id) {
    case 1:
      drawGrass(ctx, x, y, ((x + y) / TILE) & 1);
      break;
    case 2:
      drawPath(ctx, x, y);
      break;
    case 3:
      drawWater(ctx, x, y, time);
      break;
    case 4:
      drawStone(ctx, x, y);
      break;
    case 5:
      drawBuilding(ctx, x, y, meta);
      break;
    case 6:
      drawBuilding(ctx, x, y, "door");
      break;
    case 7:
      drawFloor(ctx, x, y);
      break;
    case 8:
      drawWall(ctx, x, y);
      break;
    case 9:
      drawRug(ctx, x, y);
      break;
    case 10:
      drawBed(ctx, x, y);
      break;
    case 11:
      drawTable(ctx, x, y);
      break;
    case 12:
      drawCounter(ctx, x, y);
      break;
    case 13:
      drawMat(ctx, x, y);
      break;
    default:
      rect(ctx, x, y, TILE, TILE, C.void);
  }
}

export function drawTree(ctx, x, y) {
  rect(ctx, x + 7, y + 10, 2, 6, C.trunk);
  rect(ctx, x + 3, y + 2, 10, 9, C.leaf);
  rect(ctx, x + 5, y + 1, 6, 2, C.grass);
}

export function drawActor(ctx, sx, sy, face = 1, bob = 0, run = false) {
  const y = sy + bob;
  ctx.fillStyle = C.shadow;
  ctx.beginPath();
  ctx.ellipse(sx + 8, sy + 15, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  rect(ctx, sx + 5, y + 4, 6, 7, C.shirt);
  rect(ctx, sx + 5, y + 11, 3, 5, C.pants);
  rect(ctx, sx + 8, y + 11, 3, 5, C.pants);
  rect(ctx, sx + 5, y + 1, 6, 4, C.skin);
  rect(ctx, sx + 4, y, 8, 2, C.hair);
  if (face > 0) px(ctx, sx + 9, y + 2, C.ink);
  else px(ctx, sx + 5, y + 2, C.ink);
  if (run) {
    rect(ctx, sx + (face > 0 ? 11 : 2), y + 6, 2, 4, C.skin);
  }
}

export function drawNpc(ctx, sx, sy, bob = 0) {
  const y = sy + bob;
  ctx.fillStyle = C.shadow;
  ctx.beginPath();
  ctx.ellipse(sx + 8, sy + 15, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  rect(ctx, sx + 5, y + 4, 6, 7, C.npc);
  rect(ctx, sx + 5, y + 11, 6, 5, C.pants);
  rect(ctx, sx + 5, y + 1, 6, 4, C.skin);
  rect(ctx, sx + 4, y, 8, 2, "#3a2a22");
  px(ctx, sx + 7, y + 2, C.ink);
  px(ctx, sx + 9, y + 2, C.ink);
}

export function drawLamp(ctx, x, y, on) {
  rect(ctx, x + 7, y + 6, 2, 10, C.stoneDark);
  rect(ctx, x + 4, y + 2, 8, 5, on ? C.lamp : C.stone);
  if (on) {
    ctx.fillStyle = "rgba(232, 197, 106, 0.18)";
    ctx.beginPath();
    ctx.arc(x + 8, y + 4, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawSign(ctx, x, y, labelColor = C.accent) {
  rect(ctx, x + 7, y + 8, 2, 8, C.wood);
  rect(ctx, x + 2, y + 2, 12, 7, C.woodLight);
  rect(ctx, x + 4, y + 4, 8, 3, labelColor);
}
