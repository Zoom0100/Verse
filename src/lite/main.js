import { createGame } from "./game.js";
import "./style.css";

const ui = {
  boot: document.getElementById("boot"),
  toast: document.getElementById("toast"),
  banner: document.getElementById("place-banner"),
  life: document.getElementById("vital-life"),
  hunger: document.getElementById("vital-hunger"),
  thirst: document.getElementById("vital-thirst"),
  zcoin: document.getElementById("zc-amount"),
  actBtn: document.getElementById("act-btn"),
  runBtn: document.getElementById("run-btn"),
  menuBtn: document.getElementById("menu-btn"),
  menu: document.getElementById("menu"),
  phoneToggle: document.getElementById("phone-toggle"),
  phone: document.getElementById("phone"),
  phoneBody: document.getElementById("phone-body"),
  phoneBack: document.getElementById("phone-back"),
  phoneClock: document.getElementById("phone-clock"),
  stick: document.getElementById("stick"),
  knob: document.getElementById("stick-knob"),
  maint: document.getElementById("maintenance"),
  maintText: document.getElementById("maintenance-text"),
  maintNote: document.getElementById("maint-note"),
};

const canvas = document.getElementById("game");
const game = createGame(canvas, ui);

const tg = window.Telegram?.WebApp;
if (tg) {
  try {
    tg.ready();
    tg.expand();
  } catch {
    /* older */
  }
}

requestAnimationFrame(() => {
  setTimeout(() => game.ready(), 420);
});
