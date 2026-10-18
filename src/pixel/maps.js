/**
 * Tile ids:
 * 0 void/out  1 grass  2 path  3 water  4 stone
 * 5 building  6 door   7 floor 8 wall   9 rug
 * 10 bed  11 table  12 counter  13 mat (exit)
 */

export const TILE = 16;

const plazaLegend = {
  ".": 1,
  ",": 1,
  "=": 2,
  "~": 3,
  "#": 4,
  "B": 5,
  "D": 6,
  "M": 5,
  "S": 5,
  "P": 5,
  "H": 5,
  "N": 1,
};

const houseLegend = {
  ".": 8,
  " ": 7,
  "+": 9,
  "E": 13,
  "b": 10,
  "t": 11,
  "c": 12,
  "D": 6,
};

const PLAZA_RAW = [
  "########################################",
  "#..............~~~~..............BBBBB#",
  "#..............~~~~..............B   B#",
  "#......,,,.....~~~~.....PPP......B B B#",
  "#......,,,.....~~~~.....PDP......BBDBB#",
  "#......,,,..............PPP...........#",
  "#.....................................#",
  "#====.====.====.====.====.====.=======#",
  "#.....................................#",
  "#........HHHHH...........SSSSS........#",
  "#........H   H...........S   S........#",
  "#........H   H...........S   S........#",
  "#........HHHDHHH.........SSSDSSS.......#",
  "#.....................................#",
  "#................N....................#",
  "#.....................................#",
  "#====.====.====.====.====.====.=======#",
  "#.....................................#",
  "#.............########................#",
  "#.............########................#",
  "########################################",
];

const HOUSE_RAW = [
  "................",
  ".              .",
  ".  b        t  .",
  ".              .",
  ".      ++      .",
  ".              .",
  ".  c           .",
  ".              .",
  ".              .",
  ".      EE      .",
  "......DD........",
];

function parseMap(rows, legend) {
  const h = rows.length;
  const w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  const markers = [];
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x] || ".";
      tiles[y * w + x] = legend[ch] ?? 1;
      if ("MDSHPN".includes(ch) && ch !== " ") {
        markers.push({ x, y, kind: ch });
      }
      if (ch === "b" || ch === "t" || ch === "c" || ch === "E" || ch === "D") {
        markers.push({ x, y, kind: ch });
      }
    }
  }
  return { w, h, tiles, markers };
}

export const MAPS = {
  plaza: {
    id: "plaza",
    name: "Piazza",
    ...parseMap(PLAZA_RAW, plazaLegend),
    spawn: { x: 20, y: 14 },
    solids: new Set([0, 3, 4, 5, 8]),
  },
  house: {
    id: "house",
    name: "Casa",
    ...parseMap(HOUSE_RAW, houseLegend),
    spawn: { x: 7.5, y: 8.2 },
    solids: new Set([0, 8]),
  },
};

export function tileAt(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return 0;
  return map.tiles[ty * map.w + tx];
}

export function blocked(map, x, y, r = 0.28) {
  const points = [
    [x - r, y - r],
    [x + r, y - r],
    [x - r, y + r],
    [x + r, y + r],
  ];
  for (const [px, py] of points) {
    const t = tileAt(map, Math.floor(px), Math.floor(py));
    if (map.solids.has(t)) return true;
  }
  return false;
}

export function findMarker(map, kind) {
  return map.markers.find((m) => m.kind === kind);
}

export function nearMarker(map, x, y, kinds, dist = 1.15) {
  let best = null;
  let bestD = dist;
  for (const m of map.markers) {
    if (!kinds.includes(m.kind)) continue;
    const d = Math.hypot(m.x + 0.5 - x, m.y + 0.5 - y);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}
