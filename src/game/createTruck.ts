import * as THREE from 'three';
import { VEHICLE } from './constants';

/** Local +Z is forward; a simple flatbed with no cargo. */
export function createTruck() {
  const group = new THREE.Group();
  group.name = 'truck';
  const wheels: THREE.Mesh[] = [];
  function box(
    name: string,
    size: number[],
    position: number[],
    color: string,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...(size as [number, number, number])),
      new THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
    );
    mesh.name = name;
    mesh.position.set(...(position as [number, number, number]));
    group.add(mesh);
    return mesh;
  }
  box('chassis', [1.05, 0.18, 2.3], [0, 0.32, 0], '#20352c');
  box('cab', [1.1, 0.8, 0.8], [0, 0.85, 0.7], '#efa747');
  box('windshield', [0.9, 0.34, 0.025], [0, 1, 1.111], '#29535c');
  box('rear-window', [0.7, 0.27, 0.025], [0, 1.02, 0.289], '#29535c');
  box('flatbed', [VEHICLE.width, 0.12, 1.5], [0, 0.49, -0.4], '#c8b799');
  for (const x of [-0.57, 0.57])
    box('side-rail', [0.06, 0.18, 1.5], [x, 0.61, -0.4], '#f1e5ca');
  box('tail-rail', [1.2, 0.18, 0.06], [0, 0.61, -1.12], '#f1e5ca');
  for (const x of [-0.38, 0.38]) {
    box('headlight', [0.2, 0.12, 0.03], [x, 0.64, 1.12], '#fff3bc');
    box('tail-light', [0.18, 0.08, 0.03], [x, 0.35, -1.17], '#cb403a');
  }
  for (const x of [-0.52, 0.52])
    for (const z of [-0.75, 0.76]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.16, 16),
        new THREE.MeshStandardMaterial({ color: '#26302c' }),
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.25, z);
      wheels.push(wheel);
      group.add(wheel);
    }
  return { group, wheels };
}
