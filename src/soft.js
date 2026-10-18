import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const cache = new Map();

export function softGeo(w, h, d, radius = 0.06) {
  const rw = Math.abs(w);
  const rh = Math.abs(h);
  const rd = Math.abs(d);
  const min = Math.min(rw, rh, rd);
  const r = Math.min(Math.abs(radius), min * 0.45);
  if (!(r > 0.0015) || min < 0.012) {
    const key = `b${rw.toFixed(3)}|${rh.toFixed(3)}|${rd.toFixed(3)}`;
    let geo = cache.get(key);
    if (!geo) {
      geo = new THREE.BoxGeometry(rw, rh, rd);
      cache.set(key, geo);
    }
    return geo;
  }
  const key = `s${rw.toFixed(3)}|${rh.toFixed(3)}|${rd.toFixed(3)}|${r.toFixed(3)}`;
  let geo = cache.get(key);
  if (!geo) {
    geo = new RoundedBoxGeometry(rw, rh, rd, 1, r);
    cache.set(key, geo);
  }
  return geo;
}
