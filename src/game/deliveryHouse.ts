import * as THREE from 'three';
import type { CourseData } from '../../shared/course';
import { deliveryDestination } from './deliveryDestination';

export function createDeliveryHouse(course: CourseData) {
  const goal = deliveryDestination(course.points);
  const group = new THREE.Group();
  group.name = 'delivery-destination';
  group.position.set(goal.x, 0, goal.z);
  group.rotation.y = Math.atan2(goal.dx, goal.dz);
  const house = new THREE.Group();
  house.position.x = -(course.roadWidth / 2 + 3.5);
  group.add(house);
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: string,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
    );
    mesh.position.set(x, y, z);
    house.add(mesh);
  }
  box(4, 3, 4, 0, 1.5, 0, '#fff0d2');
  const shape = new THREE.Shape();
  shape.moveTo(-2.4, 0);
  shape.lineTo(0, 1.8);
  shape.lineTo(2.4, 0);
  shape.closePath();
  const roof = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 4.8, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: '#c74736', roughness: 0.8 }),
  );
  roof.position.set(0, 3, -2.4);
  house.add(roof);
  // Door and windows face the road (+local X).
  box(0.08, 1.9, 0.9, 2.04, 0.95, 0, '#80573d');
  for (const z of [-1.25, 1.25]) box(0.1, 0.9, 0.75, 2.06, 1.9, z, '#8ab7bd');
  box(0.7, 0.2, 1.2, 2.25, 0.1, 0, '#c4b6a0');
  box(0.5, 0.5, 0.6, 2.6, 0.25, 1.25, '#c99a5b');
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(course.roadWidth, 0.35),
    new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }),
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.027;
  group.add(line);
  return group;
}
