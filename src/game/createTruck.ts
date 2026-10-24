import * as THREE from 'three';
import { TRUCK_SCALE } from './constants';

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
  box('flatbed', [1.2, 0.12, 1.5], [0, 0.49, -0.4], '#c8b799');
  for (const x of [-0.57, 0.57])
    box('side-rail', [0.06, 0.18, 1.5], [x, 0.61, -0.4], '#f1e5ca');
  box('tail-rail', [1.2, 0.18, 0.06], [0, 0.61, -1.12], '#f1e5ca');
  for (const x of [-0.38, 0.38]) {
    box('headlight', [0.2, 0.12, 0.03], [x, 0.64, 1.12], '#fff3bc');
    box('tail-light', [0.18, 0.08, 0.03], [x, 0.35, -1.17], '#cb403a');
  }
  const indicatorMaterial = new THREE.MeshStandardMaterial({
    color: '#9b6519',
    emissive: '#ff9d00',
    emissiveIntensity: 0,
  });
  // Local -X is the driver's right (+Z forward).
  for (const [x, y, z, w, h, d] of [
    [-0.48, 0.64, 1.135, 0.13, 0.12, 0.04],
    [-0.48, 0.36, -1.19, 0.14, 0.1, 0.04],
    [-0.565, 0.73, 0.73, 0.04, 0.1, 0.16],
  ]) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      indicatorMaterial,
    );
    lamp.position.set(x, y, z);
    group.add(lamp);
    const leftLamp = new THREE.Mesh(
      lamp.geometry,
      new THREE.MeshStandardMaterial({ color: '#9b6519', roughness: 0.65 }),
    );
    leftLamp.position.set(-x, y, z);
    group.add(leftLamp);
  }
  const glow = new THREE.PointLight('#ffad24', 0, 2.5);
  glow.position.set(-0.6, 0.7, 1);
  group.add(glow);
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
  for (const part of group.children) {
    part.position.multiplyScalar(TRUCK_SCALE);
    part.scale.multiplyScalar(TRUCK_SCALE);
  }
  return {
    group,
    wheels,
    setRightIndicator(on: boolean) {
      indicatorMaterial.color.set(on ? '#ffb52c' : '#9b6519');
      indicatorMaterial.emissiveIntensity = on ? 2 : 0;
      glow.intensity = on ? 1 : 0;
    },
  };
}
