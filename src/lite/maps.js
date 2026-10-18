export const TILE = 16;

const plazaLegend = {
  ".": 1,
  "=": 2,
  "~": 3,
  "#": 4,
  H: 5,
  S: 5,
  M: 5,
  B: 5,
  D: 6,
  N: 1,
  P: 5,
};

const houseLegend = {
  ".": 8,
  " ": 7,
  "+": 9,
  E: 13,
  b: 10,
  t: 11,
  c: 12,
  D: 6,
};

const PLAZA = [
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
].map((row) => row.replaceAll(",", "."));

const HOUSE = [
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
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] || ".";
      tiles[y * w + x] = legend[ch] ?? 1;
      if ("HMSBPDNbtEcE".includes(ch) && ch !== " " && ch !== ".") {
        markers.push({ x, y, kind: ch === "E" ? "E" : ch });
      }
    }
  }
  return { w, h, tiles, markers };
}

export const MAPS = {
  plaza: {
    id: "plaza",
    name: "Piazza",
    ...parseMap(PLAZA, plazaLegend),
    spawn: { x: 20, y: 14 },
    solids: new Set([0, 3, 4, 5, 8]),
  },
  house: {
    id: "house",
    name: "Casa",
    ...parseMap(HOUSE, houseLegend),
    spawn: { x: 7.5, y: 8.2 },
    solids: new Set([0, 8]),
  },
};

export function tileAt(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return 0;
  return map.tiles[ty * map.w + tx];
}

export function blocked(map, x, y, r = 0.28) {
  for (const [px, py] of [
    [x - r, y - r],
    [x + r, y - r],
    [x - r, y + r],
    [x + r, y + r],
  ]) {
    if (map.solids.has(tileAt(map, Math.floor(px), Math.floor(py)))) return true;
  }
  return false;
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

export function findMarker(map, kind) {
  return map.markers.find((m) => m.kind === kind);
}
