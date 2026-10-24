import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CourseData } from '../../shared/course';
import { createRoad } from './createRoad';
import { createTruck } from './createTruck';
import {
  initialTruckState,
  updateGame,
  hitsWall,
  type DriveInput,
  type WallSegment,
} from './updateGame';
export type DrivingStatus = {
  speed: number;
  distance: number;
  collided: boolean;
  active: boolean;
};

export function createScene(
  container: HTMLDivElement,
  course: CourseData,
  onStatus: (status: DrivingStatus) => void = () => {},
  /** スマホからの入力（#14）。届いていなければ null */
  getRemoteInput: () => DriveInput | null = () => null,
) {
  const { group, edges } = createRoad(course);
  const walls: WallSegment[] = [];
  for (let i = 0; i < edges.length; i++)
    for (const side of [0, 1])
      walls.push({ a: edges[i][side], b: edges[(i + 1) % edges.length][side] });
  let state = initialTruckState(course);
  if (hitsWall(state, walls))
    throw new Error('START周辺にトラックを配置する幅がありません。');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dce8e4');
  scene.add(group, new THREE.HemisphereLight(0xffffff, 0x647356, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(20, 40, 20);
  scene.add(light);
  const truck = createTruck();
  scene.add(truck.group);
  const bounds = new THREE.Box3().setFromObject(group),
    center = bounds.getCenter(new THREE.Vector3()),
    size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z, 1);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 15, radius * 15),
    new THREE.MeshStandardMaterial({ color: '#bccfa5', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -0.06, center.z);
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, radius * 30);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-label', 'トラック走行画面');
  container.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  const keys = new Set<string>();
  let following = true,
    active = false,
    disposed = false;
  const lookAt = new THREE.Vector3();
  function clearInput() {
    keys.clear();
    active = false;
  }
  const driveKeys = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'Space',
    'KeyR',
  ]);
  function keydown(event: KeyboardEvent) {
    if (
      !driveKeys.has(event.code) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    active = true;
    if (event.code === 'KeyR') {
      if (!event.repeat) resetTruck();
      return;
    }
    keys.add(event.code);
  }
  function keyup(event: KeyboardEvent) {
    keys.delete(event.code);
    if (driveKeys.has(event.code)) event.preventDefault();
  }
  function visibility() {
    if (document.hidden) clearInput();
  }
  container.addEventListener('keydown', keydown);
  container.addEventListener('keyup', keyup);
  container.addEventListener('blur', clearInput);
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', visibility);
  function syncTruck() {
    truck.group.position.set(state.x, 0, state.z);
    truck.group.rotation.y = state.yaw;
  }
  function follow(dt: number, snap = false) {
    const forward = new THREE.Vector3(
      Math.sin(state.yaw),
      0,
      Math.cos(state.yaw),
    );
    const desired = new THREE.Vector3(state.x, 3.2, state.z).addScaledVector(
      forward,
      -5,
    );
    const target = new THREE.Vector3(state.x, 0.8, state.z).addScaledVector(
      forward,
      2.5,
    );
    const weight = snap ? 1 : 1 - Math.exp(-6 * dt);
    camera.position.lerp(desired, weight);
    lookAt.lerp(target, weight);
    camera.lookAt(lookAt);
  }
  function overview() {
    const fit = radius * Math.max(1, 1 / camera.aspect);
    camera.position
      .copy(center)
      .add(new THREE.Vector3(fit * 0.7, fit * 1.1, fit * 0.9));
    controls.target.copy(center);
    controls.update();
  }
  function setFollowing(value: boolean) {
    following = value;
    controls.enabled = !value;
    clearInput();
    if (value) follow(0, true);
    else overview();
  }
  function resetTruck() {
    state = initialTruckState(course);
    clearInput();
    syncTruck();
    if (following) follow(0, true);
  }
  function resize() {
    const w = Math.max(container.clientWidth, 1),
      h = Math.max(container.clientHeight, 1);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!following) overview();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  resetTruck();
  let previous = performance.now(),
    lastStatus = 0,
    collisionUntil = 0,
    frame = 0;
  function tick(now: number) {
    if (disposed) return;
    const elapsed = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    // スマホの入力はPCの画面にフォーカスがなくても効く
    const remote = getRemoteInput();
    if (!document.hidden && (active || remote)) {
      const keyboard: DriveInput = active
        ? {
            throttle: Number(keys.has('ArrowUp') || keys.has('KeyW')),
            brake: Number(
              keys.has('ArrowDown') || keys.has('KeyS') || keys.has('Space'),
            ),
            steering:
              Number(keys.has('ArrowLeft') || keys.has('KeyA')) -
              Number(keys.has('ArrowRight') || keys.has('KeyD')),
          }
        : { throttle: 0, brake: 0, steering: 0 };
      state = updateGame(
        state,
        {
          throttle: Math.max(keyboard.throttle, remote?.throttle ?? 0),
          brake: Math.max(keyboard.brake, remote?.brake ?? 0),
          steering: Math.max(
            -1,
            Math.min(1, keyboard.steering + (remote?.steering ?? 0)),
          ),
        },
        elapsed,
        walls,
      );
      if (state.collided) collisionUntil = now + 650;
    }
    syncTruck();
    if (following) follow(elapsed);
    renderer.render(scene, camera);
    if (now - lastStatus > 100) {
      onStatus({
        speed: state.speed,
        distance: state.distance,
        collided: now < collisionUntil,
        active: active || remote !== null,
      });
      lastStatus = now;
    }
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return {
    setFollowing,
    resetTruck,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      clearInput();
      observer.disconnect();
      controls.dispose();
      container.removeEventListener('keydown', keydown);
      container.removeEventListener('keyup', keyup);
      container.removeEventListener('blur', clearInput);
      window.removeEventListener('blur', clearInput);
      document.removeEventListener('visibilitychange', visibility);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
