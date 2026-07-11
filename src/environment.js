// ============================================================================
//  CATCH ME FIRST — environment.js
//  Loads a GLB apartment/room as the world map, auto-fit to a sane scale with
//  its floor at y=0 and centered. Returns bounds so navigation can clamp to it.
// ============================================================================

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

export async function loadEnvironment(url, scene, { targetSpan = 12, scale = 0, yaw = 0 } = {}) {
  const loader = new GLTFLoader();
  try {
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    loader.setDRACOLoader(draco);
  } catch {}

  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  root.rotation.y = yaw;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m) { m.side = THREE.FrontSide; if (m.map) m.map.anisotropy = 8; } });
    }
  });

  // fit: scale so the larger horizontal dimension ≈ targetSpan metres
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const horiz = Math.max(size.x, size.z) || 1;
  const s = scale > 0 ? scale : targetSpan / horiz;
  root.scale.setScalar(s);

  // center horizontally
  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  const ctr = new THREE.Vector3(); box2.getCenter(ctr);
  root.position.x -= ctr.x;
  root.position.z -= ctr.z;
  root.position.y -= box2.min.y;                 // rough: bbox bottom → 0

  // Detect the MAIN walkable floor (the bbox bottom is often a foundation/step/
  // balcony below it). Sample downward rays across the interior, take the median
  // top surface = the floor people stand on, and drop THAT to y=0.
  root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const floors = [];
  const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
  for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) {
    ray.set(new THREE.Vector3(b.min.x + sx * (i / 6), b.max.y + 2, b.min.z + sz * (j / 6)), down);
    const hit = ray.intersectObject(root, true);
    if (hit.length) floors.push(hit[0].point.y);      // first hit going down = top/floor surface
  }
  if (floors.length) {
    floors.sort((a, b) => a - b);
    const mainFloor = floors[Math.floor(floors.length / 2)];   // median → the common floor
    root.position.y -= mainFloor;                                // main floor → y=0
  }

  scene.add(root);
  const finalBox = new THREE.Box3().setFromObject(root);
  const finalSize = finalBox.getSize(new THREE.Vector3());

  return {
    root,
    scale: s,
    box: finalBox,
    size: finalSize,
    // walkable half-extents (a little inset from the walls)
    bounds: {
      minX: finalBox.min.x + 0.6, maxX: finalBox.max.x - 0.6,
      minZ: finalBox.min.z + 0.6, maxZ: finalBox.max.z - 0.6,
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); });
    },
  };
}
