import * as THREE from 'three';
import type { CourseData } from '../../shared/course';
import { CHECKPOINTS, checkpointPositions } from './checkpoints';
import { createLapTrack } from './lap';

/** 看板の文字。配送センターの伝票と同じ、生成りの紙に濃い緑の文字と赤いはんこ色 */
function signTexture(label: string, note: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fffdf6';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#27382f';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 498, 242);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#27382f';
    ctx.font = 'bold 84px sans-serif';
    ctx.fillText(label, 256, 120);
    ctx.fillStyle = '#c8372d';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText(note, 256, 200);
  }
  return new THREE.CanvasTexture(canvas);
}

/** お家までの道のりの 1/4・1/2・3/4 に、道の外（お家と同じ側）に立てる看板。
 * heightAt は中心線に沿った位置での道路の高さ（坂、elevation.ts）。柱は地面（groundY）から立てる。
 */
export function createCheckpointSigns(
  course: CourseData,
  heightAt: (position: number) => number = () => 0,
  groundY = 0,
) {
  const track = createLapTrack(course.points, course.roadWidth);
  const group = new THREE.Group();
  group.name = 'checkpoint-signs';
  const textures: THREE.CanvasTexture[] = [];
  const wood = new THREE.MeshStandardMaterial({
    color: '#27382f',
    roughness: 0.8,
  });
  checkpointPositions(track.length).forEach((position, i) => {
    let segment = track.cumulative.findIndex((c) => c > position) - 1;
    if (segment < 0) segment = track.points.length - 1;
    const a = track.points[segment],
      b = track.points[(segment + 1) % track.points.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const t = (position - track.cumulative[segment]) / length;
    const dx = (b.x - a.x) / length,
      dz = (b.z - a.z) / length;
    const road = heightAt(position);
    const sign = new THREE.Group();
    sign.name = `checkpoint-${i + 1}`;
    sign.position.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
    sign.rotation.y = Math.atan2(dx, dz);
    // お家（deliveryHouse.ts）と同じ側、壁の少し外
    const side = new THREE.Group();
    side.position.x = -(course.roadWidth / 2 + course.roadWidth * 0.12 + 1.2);
    // 近づいてくるトラックから読みやすいよう、少しだけ道のほうへ向ける
    side.rotation.y = -0.3;
    sign.add(side);
    const top = road + 3.4;
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, top - groundY, 0.18),
      wood,
    );
    post.position.y = (top + groundY) / 2;
    side.add(post);
    const { label, note } = CHECKPOINTS[i];
    const texture = signTexture(label, note);
    textures.push(texture);
    const face = new THREE.MeshBasicMaterial({ map: texture });
    // 箱の −Z の面（近づいてくるトラックのほう）にだけ文字を貼る
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.12), [
      wood,
      wood,
      wood,
      wood,
      wood,
      face,
    ]);
    board.position.set(0, road + 2.6, -0.1);
    side.add(board);
    group.add(sign);
  });
  return { group, textures };
}
