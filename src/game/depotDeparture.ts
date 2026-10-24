import * as THREE from 'three';

const smooth = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
export const DEPARTURE_SECONDS = 6;
/** Local x points to the driver's right; z points forward along the start. */
export function departurePose(seconds: number) {
  const t = Math.max(0, seconds - 2);
  if (t <= 1) return { x: 10 - 4 * smooth(t), z: -6, angle: -Math.PI / 2 };
  const turn = (smooth((t - 1) / 3) * Math.PI) / 2;
  return {
    x: 6 - 6 * Math.sin(turn),
    z: -6 * Math.cos(turn),
    angle: -Math.PI / 2 + turn,
  };
}
export function createDepot() {
  const group = new THREE.Group();
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
    );
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  box(8, -0.04, -3, 17, 0.05, 14, '#929b94');
  // Garage opens toward the road (-local X), with a roof and an unobstructed bay.
  box(12, 1.05, -6, 0.18, 2.1, 2.6, '#dae0d5');
  box(10, 1.05, -7.3, 4, 2.1, 0.18, '#dae0d5');
  box(10, 1.05, -4.7, 4, 2.1, 0.18, '#dae0d5');
  box(10, 2.2, -6, 4.3, 0.2, 2.9, '#294b3c');
  box(10, 0.01, -6, 4, 0.06, 2.6, '#535c58');
  box(10, 2, 0.5, 6, 4, 5, '#f0e8d6');
  box(10, 4.1, 0.5, 6.5, 0.3, 5.5, '#294b3c');
  for (const z of [-0.7, 1.6]) box(6.95, 2.2, z, 0.08, 1.3, 1.5, '#698f97');
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#294b3c';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#fff3d2';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Bodrive', 256, 84);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.5, 1.4),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  sign.rotation.y = -Math.PI / 2;
  sign.scale.x = -1;
  sign.position.set(6.9, 3.2, 0.5);
  group.add(sign);
  return { group, texture };
}
