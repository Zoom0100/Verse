import { TILE } from "./maps.js";

export const C = {
  sky: "#7eb6d4",
  grass: "#3f8f5a",
  grass2: "#357a4c",
  path: "#8b9499",
  path2: "#a8b0b5",
  water: "#2b6284",
  water2: "#3a7ea8",
  stone: "#6d7680",
  brick: "#7a5a4a",
  roof: "#355f72",
  wood: "#6b4e34",
  wood2: "#8a6844",
  floor: "#c9b48a",
  floor2: "#b39c72",
  wall: "#d5dde3",
  door: "#4a3426",
  glass: "#9fd0e8",
  leaf: "#2f7a48",
  trunk: "#5a3d28",
  shirt: "#2f9e8a",
  pants: "#2c3a48",
  skin: "#e0b892",
  hair: "#2a2420",
  npc: "#c45c48",
  ink: "#1a2430",
  lamp: "#e8c56a",
  void: "#0b1016",
};

export function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}

function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, 1, 1);
}

export function drawTile(ctx, id, x, y, time = 0) {
  switch (id) {
    case 1:
      rect(ctx, x, y, TILE, TILE, ((x + y) / TILE) & 1 ? C.grass2 : C.grass);
      px(ctx, x + 4, y + 5, C.leaf);
      px(ctx, x + 11, y + 10, C.leaf);
      break;
    case 2:
      rect(ctx, x, y, TILE, TILE, C.path);
      rect(ctx, x, y, TILE, 1, C.path2);
      break;
    case 3:
      rect(ctx, x, y, TILE, TILE, C.water);
      rect(ctx, x + ((time * 0.002) | 0) % 4, y + 5, 6, 1, C.water2);
      break;
    case 4:
      rect(ctx, x, y, TILE, TILE, "#3e4650");
      break;
    case 5:
    case 6:
      rect(ctx, x, y, TILE, TILE, "#3a4550");
      rect(ctx, x + 2, y + 2, 12, 12, "#2c3640");
      break;
    case 7:
      rect(ctx, x, y, TILE, TILE, ((x / TILE) | 0) % 2 === ((y / TILE) | 0) % 2 ? C.floor : C.floor2);
      break;
    case 8:
      rect(ctx, x, y, TILE, TILE, C.wall);
      rect(ctx, x, y + TILE - 3, TILE, 3, "#b7c2cb");
      break;
    case 9:
      drawTile(ctx, 7, x, y, time);
      rect(ctx, x + 2, y + 2, 12, 12, "#3d6b78");
      rect(ctx, x + 4, y + 4, 8, 8, C.shirt);
      break;
    case 10:
      drawTile(ctx, 7, x, y, time);
      rect(ctx, x + 1, y + 3, 14, 11, C.wood);
      rect(ctx, x + 2, y + 4, 12, 8, "#f2f7fa");
      rect(ctx, x + 2, y + 4, 5, 8, "#7aa7c4");
      break;
    case 11:
      drawTile(ctx, 7, x, y, time);
      rect(ctx, x + 2, y + 5, 12, 8, C.wood2);
      rect(ctx, x + 3, y + 3, 4, 3, C.lamp);
      rect(ctx, x + 9, y + 3, 3, 4, C.water2);
      break;
    case 12:
      drawTile(ctx, 7, x, y, time);
      rect(ctx, x + 1, y + 4, 14, 10, C.stone);
      break;
    case 13:
      drawTile(ctx, 7, x, y, time);
      rect(ctx, x + 1, y + 10, 14, 5, C.door);
      break;
    default:
      rect(ctx, x, y, TILE, TILE, C.void);
  }
}

/** Building faces rise above the footprint so the camera reads as third person. */
export function drawFacade(ctx, id, x, y) {
  if (id === 4) {
    rect(ctx, x, y - 8, TILE, 10, C.stone);
    rect(ctx, x, y - 8, TILE, 3, "#8b939c");
    rect(ctx, x, y, TILE, 2, "#2a3138");
    return;
  }
  if (id === 5 || id === 6) {
    rect(ctx, x, y - 26, TILE, 28, C.brick);
    rect(ctx, x - 1, y - 30, TILE + 2, 6, C.roof);
    rect(ctx, x, y - 24, TILE, 3, "#8eb4c6");
    if (id === 6) {
      rect(ctx, x + 4, y - 16, 8, 18, C.door);
      rect(ctx, x + 10, y - 8, 2, 2, C.lamp);
    } else {
      rect(ctx, x + 2, y - 16, 5, 6, C.glass);
      rect(ctx, x + 9, y - 16, 5, 6, C.glass);
    }
    rect(ctx, x, y, TILE, 2, "#2a3138");
    return;
  }
  if (id === 8) {
    rect(ctx, x, y - 18, TILE, 20, C.wall);
    rect(ctx, x, y - 18, TILE, 4, "#eef3f6");
    rect(ctx, x, y, TILE, 2, "#9aa7b2");
  }
}

/** Third-person actor: tall, feet on the tile, seen from behind by default. */
export function drawHero(ctx, sx, sy, face = 0, bob = 0, run = false) {
  const foot = sy + TILE;
  const y = foot + bob;
  const step = run ? 3 : 2;
  const swing = Math.round(bob);

  ctx.fillStyle = "rgba(10,16,22,0.35)";
  ctx.beginPath();
  ctx.ellipse(sx + 8, foot - 1, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  rect(ctx, sx + 4, y - 16, 4, 10, C.pants);
  rect(ctx, sx + 9, y - 16, 4, 10, C.pants);
  rect(ctx, sx + 3, y - 7 + swing, 4, 3, "#1c242e");
  rect(ctx, sx + 10, y - 7 - swing, 4, 3, "#1c242e");

  rect(ctx, sx + 3, y - 30, 11, 16, C.shirt);
  rect(ctx, sx + 1 - (face === 3 ? step : 0), y - 28, 3, 12, C.shirt);
  rect(ctx, sx + 13 + (face === 1 ? step : 0), y - 28, 3, 12, C.shirt);
  rect(ctx, sx + 1, y - 18, 3, 4, C.skin);
  rect(ctx, sx + 13, y - 18, 3, 4, C.skin);

  rect(ctx, sx + 4, y - 40, 9, 11, C.skin);
  rect(ctx, sx + 3, y - 42, 11, 5, C.hair);
  rect(ctx, sx + 3, y - 38, 2, 6, C.hair);
  rect(ctx, sx + 12, y - 38, 2, 6, C.hair);

  if (face === 0) {
    rect(ctx, sx + 4, y - 40, 9, 8, C.hair);
  } else if (face === 2) {
    px(ctx, sx + 6, y - 36, C.ink);
    px(ctx, sx + 10, y - 36, C.ink);
    rect(ctx, sx + 7, y - 33, 3, 1, "#c4897a");
  } else if (face === 1) {
    rect(ctx, sx + 8, y - 40, 5, 8, C.hair);
    px(ctx, sx + 11, y - 36, C.ink);
  } else {
    rect(ctx, sx + 4, y - 40, 5, 8, C.hair);
    px(ctx, sx + 5, y - 36, C.ink);
  }
}

export function drawNpc(ctx, sx, sy, bob = 0) {
  const foot = sy + TILE;
  const y = foot + bob;
  ctx.fillStyle = "rgba(10,16,22,0.35)";
  ctx.beginPath();
  ctx.ellipse(sx + 8, foot - 1, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  rect(ctx, sx + 4, y - 16, 8, 12, C.pants);
  rect(ctx, sx + 3, y - 30, 11, 16, C.npc);
  rect(ctx, sx + 4, y - 40, 9, 11, C.skin);
  rect(ctx, sx + 3, y - 42, 11, 6, "#3a2a22");
  px(ctx, sx + 6, y - 36, C.ink);
  px(ctx, sx + 10, y - 36, C.ink);
}

export function drawTree(ctx, x, y) {
  rect(ctx, x + 6, y - 4, 4, 18, C.trunk);
  rect(ctx, x + 1, y - 28, 14, 16, C.leaf);
  rect(ctx, x + 3, y - 34, 10, 8, C.grass);
  rect(ctx, x + 5, y - 38, 6, 6, C.leaf);
}

export function drawLamp(ctx, x, y, on) {
  rect(ctx, x + 7, y - 18, 2, 32, "#4e5660");
  rect(ctx, x + 3, y - 26, 10, 8, on ? C.lamp : C.stone);
  if (on) {
    ctx.fillStyle = "rgba(232,197,106,0.18)";
    ctx.beginPath();
    ctx.arc(x + 8, y - 22, 16, 0, Math.PI * 2);
    ctx.fill();
  }
}
