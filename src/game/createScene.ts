import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CourseData } from '../../shared/course';
import { createRoad } from './createRoad';
import { createTruck } from './createTruck';
import { createCargo } from './createCargo';
import { createCargoLayout, remainingCargo } from './cargo';
import { introCameraProgress } from './introCamera';
import { VEHICLE } from './constants';
import { slideCargo, CARGO_PHYSICS } from './slideCargo';
import {
  updateCargoFalls,
  CARGO_GROUND_Y,
  cargoDropLocations,
} from './fallCargo';
import {
  locate,
  createLapTrack,
  startLap,
  updateLap,
  type LapState,
} from './lap';
import {
  initialTruckState,
  updateGame,
  hitsWall,
  type DriveInput,
  type WallSegment,
} from './updateGame';
import { isFiniteTruckState, sanitizeDriveInput } from './safety';
export type DrivingStatus = {
  introducing: boolean;
  position: { x: number; z: number };
  wrongWay: boolean;
  droppedCargo: { id: number; x: number; z: number }[];
  speed: number;
  distance: number;
  collided: boolean;
  active: boolean;
  /** 走り出してからの時間（秒）。ゴールで止まる（#19） */
  time: number;
  finished: boolean;
  countdown?: number | null;
  /** 荷台に残っている荷物と、積んだ数（#15〜#17） */
  cargoRemaining: number;
  cargoTotal: number;
};

export function createScene(
  container: HTMLDivElement,
  course: CourseData,
  onStatus: (status: DrivingStatus) => void = () => {},
  /** スマホからの入力（#14）。届いていなければ null */
  getRemoteInput: () => DriveInput | null = () => null,
  /** true の間はトラックを止め、タイムも進めない（スマホの通信切断など、#22） */
  isPaused: () => boolean = () => false,
) {
  const { group, edges } = createRoad(course);
  const walls: WallSegment[] = [];
  for (let i = 0; i < edges.length; i++)
    for (const side of [0, 1])
      walls.push({ a: edges[i][side], b: edges[(i + 1) % edges.length][side] });
  let state = initialTruckState(course);
  // 周回とゴールの判定（#19）
  const lapTrack = createLapTrack(course.points, course.roadWidth);
  let lap: LapState,
    raceTime = 0,
    started = false;
  let physicsTime = 0;
  /** トラックの中心と先端（ゴールは先端がSTARTラインを越えたとき） */
  function truckPoints() {
    const half = VEHICLE.length / 2;
    return {
      center: { x: state.x, z: state.z },
      front: {
        x: state.x + Math.sin(state.yaw) * half,
        z: state.z + Math.cos(state.yaw) * half,
      },
    };
  }
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
  // 荷物はトラックの子：荷台ローカル座標で管理し、トラックと一緒に動く（#15）
  let cargo = createCargoLayout();
  const cargoView = createCargo(cargo);
  truck.group.add(cargoView.group);
  const bounds = new THREE.Box3().setFromObject(group),
    center = bounds.getCenter(new THREE.Vector3()),
    size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z, 1);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 15, radius * 15),
    new THREE.MeshStandardMaterial({ color: '#bccfa5', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, CARGO_GROUND_Y, center.z);
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, radius * 30);
  // Photo courses are much larger than the sample; keep road and ground apart at a distance.
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: true,
  });
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
  const introFrom = new THREE.Vector3();
  let introducing = false,
    introElapsed = 0;
  function skipIntro() {
    introducing = false;
    clearInput();
    if (following) follow(0, true);
  }
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
    if (introducing) return;
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
    introducing = false;
    following = value;
    controls.enabled = !value;
    clearInput();
    if (value) follow(0, true);
    else overview();
  }
  let startCountdown: number | null = null;
  function resetTruck() {
    introducing = false;
    startCountdown = null;
    state = initialTruckState(course);
    // STARTに戻したら積み直す
    physicsTime = 0;
    cargo = createCargoLayout();
    cargoView.sync(cargo);
    const { center, front } = truckPoints();
    lap = startLap(lapTrack, center, front);
    raceTime = 0;
    started = false;
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
    else if (introducing) {
      overview();
      introFrom.copy(camera.position);
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  resetTruck();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    introducing = true;
    overview();
    introFrom.copy(camera.position);
    lookAt.copy(center);
    camera.lookAt(lookAt);
  }
  let previous = performance.now(),
    lastStatus = 0,
    reportedFinished = false,
    collisionUntil = 0,
    frame = 0;
  function tick(now: number) {
    if (disposed) return;
    const elapsed = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    // スマホの入力はPCの画面にフォーカスがなくても効く。値は念のため範囲内に丸める（#22）
    const received = getRemoteInput();
    const remote = received ? sanitizeDriveInput(received) : null;
    // スマホの切断による一時停止（#22）はスタート前だけ。レース中（動き出してからゴールまで）は
    // 止めずに、届いていない操作を0（離した状態）として惰性で走らせる（止めるとカクッと見えるため）
    const paused = isPaused() && !started;
    if (paused && state.speed > 0) {
      state = { ...state, speed: 0 };
      clearInput();
    }
    if (
      !introducing &&
      !started &&
      startCountdown === null &&
      !paused &&
      (active || remote) &&
      !document.hidden
    )
      startCountdown = 0;
    if (startCountdown !== null && !introducing && !paused && !document.hidden)
      startCountdown += elapsed;
    const countdown =
      startCountdown === null || startCountdown >= 3.7
        ? null
        : Math.max(0, 3 - Math.floor(startCountdown));
    const waitingForGo = startCountdown === null || startCountdown < 3;
    // ゴールしたら「もう一度」まで止める
    // スタート前は、キーボードの操作か、スマホ2台がそろうまで動かさない
    if (
      !introducing &&
      !paused &&
      !document.hidden &&
      !lap.finished &&
      !waitingForGo &&
      (active || remote || started)
    ) {
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
      physicsTime += elapsed;
      while (physicsTime + 1e-10 >= CARGO_PHYSICS.step) {
        physicsTime -= CARGO_PHYSICS.step;
        const before = state;
        const segment = locate(lapTrack, state, lap.segment).segment;
        const a = lapTrack.points[segment],
          b = lapTrack.points[(segment + 1) % lapTrack.points.length];
        const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const forward = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
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
          CARGO_PHYSICS.step,
          walls,
          forward,
        );
        cargo = slideCargo(cargo, {
          speed: (before.speed + state.speed) / 2,
          acceleration: (state.speed - before.speed) / CARGO_PHYSICS.step,
          yawRate: (state.yaw - before.yaw) / CARGO_PHYSICS.step,
        });
        cargo = updateCargoFalls(cargo, state);
      }
      // それでも状態が壊れていたらSTARTからやり直す（#22）
      if (!isFiniteTruckState(state)) resetTruck();
      if (state.collided) collisionUntil = now + 650;
      // タイマーは動き出した瞬間から。画面が隠れている間は進まない
      if (state.speed > 0) started = true;
      if (started) raceTime += elapsed;
      const { center, front } = truckPoints();
      lap = updateLap(lapTrack, lap, center, front);
      if (lap.finished) {
        state = { ...state, speed: 0 };
        clearInput();
      }
    } else physicsTime = 0;
    cargoView.sync(cargo);
    syncTruck();
    if (introducing) {
      // Hidden tabs do not consume the opening shot or start driving off-screen.
      if (!document.hidden) introElapsed += elapsed;
      const { weight, done } = introCameraProgress(introElapsed);
      const forward = new THREE.Vector3(
        Math.sin(state.yaw),
        0,
        Math.cos(state.yaw),
      );
      const destination = new THREE.Vector3(
        state.x,
        3.2,
        state.z,
      ).addScaledVector(forward, -5);
      const target = new THREE.Vector3(state.x, 0.8, state.z).addScaledVector(
        forward,
        2.5,
      );
      camera.position.lerpVectors(introFrom, destination, weight);
      lookAt.lerpVectors(center, target, weight);
      camera.lookAt(lookAt);
      if (done) {
        introducing = false;
        clearInput();
      }
    } else if (following) follow(elapsed);
    renderer.render(scene, camera);
    // ゴールした瞬間はすぐ知らせる。それ以外は0.1秒ごと
    if (now - lastStatus > 100 || lap.finished !== reportedFinished) {
      reportedFinished = lap.finished;
      onStatus({
        introducing,
        countdown,
        position: { x: state.x, z: state.z },
        wrongWay: state.wrongWay ?? false,
        droppedCargo: cargoDropLocations(cargo),
        cargoRemaining: remainingCargo(cargo),
        cargoTotal: cargo.length,
        speed: state.speed,
        distance: state.distance,
        collided: now < collisionUntil,
        active:
          !introducing &&
          !paused &&
          (active || remote !== null || (started && !lap.finished)),
        time: raceTime,
        finished: lap.finished,
      });
      lastStatus = now;
    }
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return {
    setFollowing,
    skipIntro,
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
