import * as THREE from 'three';
import { CARGO, bedToTruck, type CargoItem } from './cargo';

/**
 * 段ボールの見た目（Issue #15）。トラックの group の子として荷台に載せる。
 * 位置は cargo.ts の荷台ローカル座標から毎フレーム合わせる（sync）。
 */
export function createCargo(items: readonly CargoItem[], size = CARGO.size) {
  const group = new THREE.Group();
  group.name = 'cargo';
  const body = new THREE.MeshStandardMaterial({
    color: '#c99a5b',
    roughness: 0.85,
  });
  const tape = new THREE.MeshStandardMaterial({
    color: '#e8d6a8',
    roughness: 0.6,
  });
  const boxGeometry = new THREE.BoxGeometry(size, size, size);
  // Packing tape across the top and down the front and back.
  const tapeGeometry = new THREE.BoxGeometry(
    size * 0.22,
    size * 1.01,
    size * 1.01,
  );
  const meshes = items.map((item) => {
    const box = new THREE.Group();
    box.name = `cargo-${item.id}`;
    box.add(
      new THREE.Mesh(boxGeometry, body),
      new THREE.Mesh(tapeGeometry, tape),
    );
    group.add(box);
    return box;
  });
  function sync(current: readonly CargoItem[]) {
    current.forEach((item, i) => {
      const box = meshes[i];
      if (!box) return;
      // Falling and lost boxes are handled in #17; until then only boxes on the bed show.
      box.visible = item.status === 'resting' || item.status === 'sliding';
      const p = bedToTruck(item.position);
      box.position.set(p.x, p.y + size / 2, p.z);
    });
  }
  sync(items);
  return { group, sync };
}
