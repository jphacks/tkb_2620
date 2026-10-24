import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CourseData } from '../../shared/course';
import { createRoad } from './createRoad';

export function createScene(container: HTMLDivElement, course: CourseData) {
  const { group } = createRoad(course);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#edf1e9');
  scene.add(group, new THREE.HemisphereLight(0xffffff, 0x65735c, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(20, 40, 20);
  scene.add(light);
  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z, 1);
  const camera = new THREE.PerspectiveCamera(45, 1, radius / 1000, radius * 30);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-label', 'コースの3Dプレビュー');
  container.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = radius * 0.2;
  controls.maxDistance = radius * 8;
  const render = () => renderer.render(scene, camera);
  function resetView() {
    const fit = radius * Math.max(1, 1 / camera.aspect);
    camera.position
      .copy(center)
      .add(new THREE.Vector3(fit * 0.7, fit * 1.1, fit * 0.9));
    controls.target.copy(center);
    controls.update();
    render();
  }
  function resize() {
    const width = Math.max(container.clientWidth, 1),
      height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    resetView();
  }
  controls.addEventListener('change', render);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  return {
    resetView,
    dispose() {
      observer.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
