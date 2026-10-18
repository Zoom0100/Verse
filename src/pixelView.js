import * as THREE from "three";

/** Same 3D scene, drawn into a small buffer and shown with hard pixels. */
export function createPixelView(renderer) {
  const target = new THREE.WebGLRenderTarget(320, 180, {
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    depthBuffer: true,
    generateMipmaps: false,
  });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  target.texture.generateMipmaps = false;

  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({
      map: target.texture,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    }),
  );
  quad.frustumCulled = false;
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function fit(width, height) {
    const long = Math.max(width, height, 1);
    const scale = 480 / long;
    target.setSize(Math.max(2, Math.round(width * scale)), Math.max(2, Math.round(height * scale)));
  }

  function render(sourceScene, sourceCamera) {
    renderer.setRenderTarget(target);
    renderer.render(sourceScene, sourceCamera);
    renderer.setRenderTarget(null);
    renderer.render(scene, cam);
  }

  return { fit, render };
}

/**
 * Keep the city built, but only draw the block around the player.
 * Big surfaces (ground, sky) stay on. Characters passed as roots stay on.
 */
export function createChunkCull(scene) {
  const list = [];
  const tmp = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const reach = 78;

  function refresh(roots) {
    const skip = new Set();
    for (const root of roots) {
      root?.traverse?.((obj) => skip.add(obj));
    }
    list.length = 0;
    scene.updateMatrixWorld(true);
    scene.traverse((obj) => {
      if (!obj.isMesh || skip.has(obj) || !obj.geometry) return;
      if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
      const sc = obj.getWorldScale(scale);
      const span = obj.geometry.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
      if (span > 40) return;
      list.push(obj);
    });
  }

  function update(px, pz) {
    const limit = reach * reach;
    for (const obj of list) {
      obj.getWorldPosition(tmp);
      const far = (tmp.x - px) * (tmp.x - px) + (tmp.z - pz) * (tmp.z - pz) > limit;
      if (far) {
        if (obj.visible) {
          obj.visible = false;
          obj.userData.zvCulled = 1;
        }
      } else if (obj.userData.zvCulled) {
        obj.visible = true;
        obj.userData.zvCulled = 0;
      }
    }
  }

  return { refresh, update };
}
