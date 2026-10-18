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
      rect(ctx, x, y, TILE, TILE, C.stone);
      rect(ctx, x, y, TILE, 2, "#4e5660");
      break;
    case 5:
      rect(ctx, x, y, TILE, TILE, C.brick);
      rect(ctx, x, y, TILE, 3, C.roof);
      rect(ctx, x + 3, y + 6, 4, 4, C.glass);
      rect(ctx, x + 9, y + 6, 4, 4, C.glass);
      break;
    case 6:
      rect(ctx, x, y, TILE, TILE, C.brick);
      rect(ctx, x, y, TILE, 3, C.roof);
      rect(ctx, x + 4, y + 5, 8, 11, C.door);
      px(ctx, x + 10, y + 11, C.lamp);
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

/** Soft stylized actor — seen from facing direction (2.5D lite). */
export function drawHero(ctx, sx, sy, face = 0, bob = 0, run = false) {
  const y = sy + bob;
  ctx.fillStyle = "rgba(10,16,22,0.28)";
  ctx.beginPath();
  ctx.ellipse(sx + 8, sy + 15, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs
  rect(ctx, sx + 5, y + 11, 3, 5, C.pants);
  rect(ctx, sx + 8, y + 11, 3, 5, C.pants);
  // body
  rect(ctx, sx + 4, y + 4, 8, 8, C.shirt);
  // head
  rect(ctx, sx + 5, y + 1, 6, 4, C.skin);
  rect(ctx, sx + 4, y, 8, 2, C.hair);

  if (face === 0) {
    // back — default third-person feel
    rect(ctx, sx + 5, y + 1, 6, 2, C.hair);
  } else if (face === 2) {
    // front
    px(ctx, sx + 6, y + 2, C.ink);
    px(ctx, sx + 9, y + 2, C.ink);
  } else if (face === 1) {
    // right
    px(ctx, sx + 9, y + 2, C.ink);
    if (run) rect(ctx, sx + 11, y + 6, 2, 4, C.skin);
  } else {
    // left
    px(ctx, sx + 5, y + 2, C.ink);
    if (run) rect(ctx, sx + 2, y + 6, 2, 4, C.skin);
  }
}

export function drawNpc(ctx, sx, sy, bob = 0) {
  const y = sy + bob;
  ctx.fillStyle = "rgba(10,16,22,0.28)";
  ctx.beginPath();
  ctx.ellipse(sx + 8, sy + 15, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  rect(ctx, sx + 5, y + 11, 6, 5, C.pants);
  rect(ctx, sx + 4, y + 4, 8, 8, C.npc);
  rect(ctx, sx + 5, y + 1, 6, 4, C.skin);
  rect(ctx, sx + 4, y, 8, 2, "#3a2a22");
  px(ctx, sx + 6, y + 2, C.ink);
  px(ctx, sx + 9, y + 2, C.ink);
}

export function drawTree(ctx, x, y) {
  rect(ctx, x + 7, y + 10, 2, 6, C.trunk);
  rect(ctx, x + 3, y + 2, 10, 9, C.leaf);
  rect(ctx, x + 5, y + 1, 6, 2, C.grass);
}

export function drawLamp(ctx, x, y, on) {
  rect(ctx, x + 7, y + 6, 2, 10, "#4e5660");
  rect(ctx, x + 4, y + 2, 8, 5, on ? C.lamp : C.stone);
}
