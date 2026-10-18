function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function layout(w, h) {
  const horizon = h * (h > w ? 0.42 : 0.48);
  return { w, h, horizon, floor: h - horizon };
}

export function project(L, x, depth) {
  const d = Math.min(1, Math.max(0.08, depth));
  const y = L.horizon + Math.pow(d, 0.85) * L.floor * 0.86;
  const margin = L.w * (0.06 + (1 - d) * 0.08);
  const sx = margin + x * (L.w - margin * 2);
  const size = L.h * (0.11 + d * 0.13);
  return { x: sx, y, size, depth: d };
}

function wallAndFloor(ctx, L) {
  const { w, h, horizon } = L;
  const wall = ctx.createLinearGradient(0, 0, 0, horizon);
  wall.addColorStop(0, "#fbf6f0");
  wall.addColorStop(1, "#f0ddcc");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, horizon);

  const floor = ctx.createLinearGradient(0, horizon, 0, h);
  floor.addColorStop(0, "#e4c29a");
  floor.addColorStop(1, "#c48a56");
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, w, h - horizon);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizon, w, h - horizon);
  ctx.clip();
  ctx.strokeStyle = "rgba(110, 64, 32, 0.1)";
  ctx.lineWidth = Math.max(1, w * 0.003);
  const vpX = w * 0.5;
  const vpY = horizon - h * 0.2;
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(vpX + i * w * 0.04, vpY);
    ctx.lineTo(vpX + i * w * 0.22, h + 40);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "#f7f1ea";
  ctx.fillRect(0, horizon - h * 0.014, w, h * 0.02);
}

function windowView(ctx, L, time) {
  const { w, h, horizon } = L;
  const x = w * 0.07;
  const y = h * 0.06;
  const ww = Math.min(w * 0.34, horizon * 0.72);
  const wh = horizon * 0.58;
  ctx.save();
  ctx.shadowColor = "rgba(90, 50, 30, 0.16)";
  ctx.shadowBlur = 28;
  ctx.fillStyle = "#fbf7f2";
  roundRect(ctx, x - ww * 0.04, y - wh * 0.04, ww * 1.08, wh * 1.08, ww * 0.08);
  ctx.fill();
  ctx.restore();

  const sky = ctx.createLinearGradient(x, y, x, y + wh);
  sky.addColorStop(0, "#7ebfe6");
  sky.addColorStop(1, "#e9f7ff");
  roundRect(ctx, x, y, ww, wh, 12);
  ctx.fillStyle = sky;
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = Math.max(4, ww * 0.025);
  ctx.beginPath();
  ctx.moveTo(x + ww / 2, y + 10);
  ctx.lineTo(x + ww / 2, y + wh - 10);
  ctx.moveTo(x + 10, y + wh * 0.48);
  ctx.lineTo(x + ww - 10, y + wh * 0.48);
  ctx.stroke();

  const sway = Math.sin(time * 0.7) * ww * 0.03;
  ctx.fillStyle = "rgba(255, 250, 244, 0.42)";
  ctx.beginPath();
  ctx.moveTo(x + ww * 0.62, y + 4);
  ctx.quadraticCurveTo(x + ww + sway, y + wh * 0.45, x + ww * 0.7, y + wh - 4);
  ctx.lineTo(x + ww - 4, y + wh - 4);
  ctx.lineTo(x + ww - 4, y + 4);
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = "rgba(255, 220, 170, 0.45)";
  ctx.beginPath();
  ctx.moveTo(x + ww * 0.15, y + wh);
  ctx.lineTo(x + ww * 0.85, y + wh);
  ctx.lineTo(w * 0.58, h * 0.92);
  ctx.lineTo(w * 0.12, h * 0.92);
  ctx.fill();
  ctx.restore();
}

function plant(ctx, x, y, h) {
  const s = h / 140;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(70, 36, 16, 0.15)";
  ctx.beginPath();
  ctx.ellipse(0, 8 * s, 36 * s, 10 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  const pot = ctx.createLinearGradient(-20 * s, 0, 20 * s, 0);
  pot.addColorStop(0, "#f6efe6");
  pot.addColorStop(1, "#e4d2c0");
  ctx.fillStyle = pot;
  roundRect(ctx, -22 * s, -36 * s, 44 * s, 40 * s, 12 * s);
  ctx.fill();
  ctx.fillStyle = "#efe2d4";
  ctx.fillRect(-26 * s, -40 * s, 52 * s, 12 * s);
  const leaves = [
    [-0.9, "#1f7a46"],
    [-0.4, "#2f9a5c"],
    [0.05, "#17663b"],
    [0.45, "#3cb371"],
    [0.9, "#1f7a46"],
    [-1.3, "#248a50"],
  ];
  for (const [a, color] of leaves) {
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -78 * s, 16 * s, 42 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(-4 * s, -78 * s, 4 * s, 24 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function sofa(ctx, x, y, w) {
  const h = w * 0.48;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(80, 36, 20, 0.16)";
  ctx.beginPath();
  ctx.ellipse(0, h * 0.08, w * 0.46, h * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  const cloth = ctx.createLinearGradient(0, -h, 0, h * 0.1);
  cloth.addColorStop(0, "#f09984");
  cloth.addColorStop(1, "#d46a56");
  ctx.fillStyle = cloth;
  roundRect(ctx, -w / 2, -h * 0.55, w, h * 0.62, w * 0.08);
  ctx.fill();
  ctx.fillStyle = "#e18470";
  roundRect(ctx, -w * 0.46, -h * 0.95, w * 0.92, h * 0.48, w * 0.07);
  ctx.fill();
  ctx.fillStyle = "#c85a48";
  roundRect(ctx, -w * 0.5, -h * 0.62, w * 0.12, h * 0.55, w * 0.04);
  ctx.fill();
  roundRect(ctx, w * 0.38, -h * 0.62, w * 0.12, h * 0.55, w * 0.04);
  ctx.fill();
  ctx.fillStyle = "#f8ddd4";
  ctx.beginPath();
  ctx.ellipse(-w * 0.16, -h * 0.22, w * 0.13, h * 0.16, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.16, -h * 0.2, w * 0.13, h * 0.15, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function rug(ctx, x, y, rx, ry) {
  const g = ctx.createRadialGradient(x, y, rx * 0.1, x, y, rx);
  g.addColorStop(0, "#2f9a62");
  g.addColorStop(1, "#1c6b42");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = Math.max(3, rx * 0.03);
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.78, ry * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function table(ctx, x, y, w) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(70, 36, 18, 0.18)";
  ctx.beginPath();
  ctx.ellipse(0, w * 0.08, w * 0.48, w * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7a5136";
  roundRect(ctx, -w * 0.06, -w * 0.16, w * 0.12, w * 0.22, 4);
  ctx.fill();
  const top = ctx.createLinearGradient(0, -w * 0.28, 0, -w * 0.05);
  top.addColorStop(0, "#f3d7b6");
  top.addColorStop(1, "#e0b07a");
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.ellipse(0, -w * 0.16, w * 0.5, w * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f7f1ea";
  roundRect(ctx, -w * 0.16, -w * 0.22, w * 0.22, w * 0.08, 3);
  ctx.fill();
  ctx.restore();
}

function lamp(ctx, x, y, h, time) {
  const pulse = 0.75 + Math.sin(time * 1.5) * 0.08;
  ctx.save();
  ctx.translate(x, y);
  const glow = ctx.createRadialGradient(0, -h * 0.7, 10, 0, -h * 0.4, h);
  glow.addColorStop(0, `rgba(255, 206, 140, ${0.7 * pulse})`);
  glow.addColorStop(1, "rgba(255, 206, 140, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, -h * 0.55, h * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5a5148";
  ctx.lineWidth = Math.max(4, h * 0.035);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -h * 0.72);
  ctx.stroke();
  ctx.fillStyle = "#f8e7cf";
  ctx.beginPath();
  ctx.moveTo(-h * 0.16, -h * 0.7);
  ctx.lineTo(h * 0.16, -h * 0.7);
  ctx.lineTo(h * 0.1, -h * 0.98);
  ctx.lineTo(-h * 0.1, -h * 0.98);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawSlurp(ctx, x, y, size, time, opt = {}) {
  const s = size;
  const hop = Math.abs(Math.sin(time * (opt.moving ? 8 : 2.1) + (opt.phase || 0))) * s * (opt.moving ? 0.06 : 0.02);
  ctx.save();
  ctx.translate(x, y - hop);
  ctx.fillStyle = "rgba(50, 28, 14, 0.2)";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.04, s * 0.32, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  const top = s * 0.4;
  const bot = s * 0.29;
  const cupTop = -s * 0.92;
  ctx.beginPath();
  ctx.moveTo(-top, cupTop);
  ctx.bezierCurveTo(-top * 1.06, cupTop * 0.42, -bot * 1.2, -s * 0.08, -bot, 0);
  ctx.quadraticCurveTo(0, s * 0.1, bot, 0);
  ctx.bezierCurveTo(bot * 1.2, -s * 0.08, top * 1.06, cupTop * 0.42, top, cupTop);
  ctx.quadraticCurveTo(0, cupTop - s * 0.06, -top, cupTop);
  ctx.closePath();
  const glass = ctx.createLinearGradient(-top, cupTop, top, 0);
  glass.addColorStop(0, "#f3ffe8");
  glass.addColorStop(0.22, "#8cf07a");
  glass.addColorStop(0.62, "#2fbe62");
  glass.addColorStop(1, "#0f7a40");
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.lineWidth = Math.max(2, s * 0.035);
  ctx.strokeStyle = "#0d5a32";
  ctx.stroke();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.33)";
  roundRect(ctx, -top * 0.78, cupTop + s * 0.12, s * 0.14, s * 0.5, s * 0.07);
  ctx.fill();
  ctx.restore();

  const eyeY = -s * 0.48;
  for (const side of [-1, 1]) {
    const ex = side * s * 0.13;
    ctx.fillStyle = "#143226";
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, s * 0.055, s * 0.066, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(ex - s * 0.016, eyeY - s * 0.02, s * 0.018, s * 0.022, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#145c36";
  ctx.lineWidth = Math.max(2, s * 0.028);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 0.07, eyeY + s * 0.09);
  ctx.quadraticCurveTo(0, eyeY + s * 0.15, s * 0.07, eyeY + s * 0.09);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 145, 156, 0.4)";
  ctx.beginPath();
  ctx.ellipse(-s * 0.2, eyeY + s * 0.07, s * 0.045, s * 0.028, 0, 0, Math.PI * 2);
  ctx.ellipse(s * 0.2, eyeY + s * 0.07, s * 0.045, s * 0.028, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = opt.lid || "#f7f4ef";
  ctx.beginPath();
  ctx.ellipse(0, cupTop, top * 1.08, s * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(40, 60, 48, 0.28)";
  ctx.lineWidth = Math.max(1.5, s * 0.02);
  ctx.stroke();

  ctx.strokeStyle = opt.straw || "#fffaf4";
  ctx.lineWidth = Math.max(4, s * 0.055);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s * 0.05, cupTop + s * 0.02);
  ctx.quadraticCurveTo(s * 0.18, cupTop - s * 0.12, s * 0.12, cupTop - s * 0.28);
  ctx.stroke();
  ctx.restore();
}

function bubble(ctx, x, y, text, size) {
  ctx.save();
  const font = Math.max(16, size * 0.22);
  ctx.font = `700 ${font}px Outfit, system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  const w = tw + font;
  const h = font * 1.9;
  ctx.fillStyle = "rgba(255, 250, 244, 0.95)";
  roundRect(ctx, x - w / 2, y - h, w, h, h / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - font * 0.3, y);
  ctx.lineTo(x + font * 0.3, y);
  ctx.lineTo(x, y + font * 0.35);
  ctx.fill();
  ctx.fillStyle = "#243028";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y - h / 2);
  ctx.restore();
}

export function drawRoom(ctx, L, time, actors) {
  const { w, h, horizon } = L;
  wallAndFloor(ctx, L);
  windowView(ctx, L, time);

  const sofaW = Math.min(w * 0.5, horizon * 1.15);
  const sofaY = horizon + h * 0.01;

  plant(ctx, w * 0.3, horizon + h * 0.02, horizon * 0.48);
  sofa(ctx, w * 0.68, sofaY, sofaW);
  lamp(ctx, w * 0.9, horizon + h * 0.03, horizon * 0.7, time);

  rug(ctx, w * 0.46, horizon + (h - horizon) * 0.42, w * 0.28, (h - horizon) * 0.16);
  table(ctx, w * 0.44, horizon + (h - horizon) * 0.4, Math.min(w, h) * 0.18);

  const drawn = actors
    .map((actor) => ({ actor, at: project(L, actor.x, actor.depth) }))
    .sort((a, b) => a.at.depth - b.at.depth);
  for (const { actor, at } of drawn) {
    drawSlurp(ctx, at.x, at.y, at.size, time, actor);
    if (actor.line) bubble(ctx, at.x, at.y - at.size * 1.15, actor.line, at.size);
  }

  const shade = ctx.createRadialGradient(w / 2, h * 0.4, w * 0.2, w / 2, h * 0.5, w * 0.72);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(48, 26, 14, 0.16)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
}
