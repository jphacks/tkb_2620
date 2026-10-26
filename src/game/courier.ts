import * as THREE from 'three';

/**
 * お家に着いたときの配達員の演出。運転席から降りてきて、荷台の横でカメラのほうを向く。
 * - 荷物が残っていれば（配送完了）：両手を挙げて2回跳び、ばんざいのまま喜ぶ（happy）
 * - 荷物を全部落としていれば（配達失敗）：肩を落とし、最後はひざをついてうなだれる（sad、orz）
 *
 * 座標はトラックのローカル座標（+Zが前、−Xが運転席のある右側。createTruck.ts）。
 * 角度はどれも前に倒す向きが正（頭・胴は前かがみ、腕・脚は先が後ろへ振れる）。
 */
export const COURIER_SECONDS = 2.2;

const SIZE = {
  thigh: 0.3,
  shin: 0.28,
  torso: 0.36,
  arm: 0.3,
  head: 0.12,
};
const STAND = SIZE.thigh + SIZE.shin;
const KNEEL = SIZE.thigh + 0.06;

export type CourierMood = 'happy' | 'sad';

export type CourierPose = {
  x: number;
  /** 跳んだ高さ（地面からの浮き） */
  y: number;
  z: number;
  /** 向き（0で前、−π/2で右、πで後ろ＝カメラのほう） */
  yaw: number;
  hip: number;
  torso: number;
  head: number;
  armLeft: number;
  armRight: number;
  thighLeft: number;
  thighRight: number;
  shinLeft: number;
  shinRight: number;
};

const clamp = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => {
  const u = clamp(t);
  return u * u * (3 - 2 * u);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** 演出が始まってからの秒数での姿勢。COURIER_SECONDS を過ぎたら最後の姿勢のまま */
export function courierPose(
  seconds: number,
  mood: CourierMood = 'sad',
): CourierPose {
  const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return mood === 'happy' ? happyPose(t) : sadPose(t);
}

/** 0〜0.9秒：運転席から降りて、荷台の横へ歩きながらカメラのほうを向く（喜ぶ・落ち込む共通） */
function walkOut(t: number) {
  // 0〜0.45秒：運転席のドアから右へ降りる。0.45〜0.9秒：荷台の横へ歩きながら、カメラのほうを向く
  const out = ease(t / 0.45);
  const walk = ease((t - 0.45) / 0.45);
  const x = mix(-0.62, -1.25, out);
  const z = mix(0.7, -0.3, walk);
  const yaw = mix(-Math.PI / 2, -Math.PI, walk);
  const stride =
    t < 0.9 ? Math.sin(t * 16) * 0.45 * (1 - ease((t - 0.8) / 0.1)) : 0;
  return { x, z, yaw, stride };
}

function sadPose(t: number): CourierPose {
  const { x, z, yaw, stride } = walkOut(t);
  // 0.9〜1.3秒：肩を落とし、うつむく
  const slump = ease((t - 0.9) / 0.4);
  // 1.3〜1.9秒：ひざをつき、手を地面につく
  const drop = ease((t - 1.3) / 0.6);
  // そのあとは小さく肩を震わせる
  const sob = t > 1.9 ? Math.sin((t - 1.9) * 18) * 0.04 : 0;
  const torso = mix(0.25 * slump, 1.4, drop) + sob;
  // 腕は、ふだんはだらりと下げ、ひざをついたら地面へまっすぐ伸ばす（胴の傾きを打ち消す）
  const arm = mix(0.05, -torso - 0.15, drop);
  return {
    x,
    y: 0,
    z,
    yaw,
    hip: mix(STAND, KNEEL, drop),
    torso,
    head: mix(0.55 * slump, 0.35, drop),
    armLeft: arm + stride * (1 - drop),
    armRight: arm - stride * (1 - drop),
    thighLeft: -stride * (1 - drop),
    thighRight: stride * (1 - drop),
    shinLeft: mix(Math.max(0, stride) * 0.5, Math.PI / 2, drop),
    shinRight: mix(Math.max(0, -stride) * 0.5, Math.PI / 2, drop),
  };
}

/** 跳ぶ1回分の長さ。0.95秒から2回跳ぶ */
const HOP = 0.55;
const HOP_START = 0.95;

function happyPose(t: number): CourierPose {
  const { x, z, yaw, stride } = walkOut(t);
  // 0.9〜1.15秒：両手を挙げる
  const raise = ease((t - 0.9) / 0.25);
  // 跳ぶ：かがむ（0〜0.2）→ 浮く（0.2〜0.8）→ 着地でかがむ（0.8〜1）
  const hop = (t - HOP_START) / HOP;
  const p = hop - Math.floor(hop);
  const hopping = hop >= 0 && hop < 2;
  const air = hopping && p > 0.2 && p < 0.8;
  const y = air ? 0.28 * Math.sin((Math.PI * (p - 0.2)) / 0.6) : 0;
  const crouch =
    hopping && !air
      ? Math.sin(Math.PI * (p < 0.2 ? p / 0.2 : (p - 0.8) / 0.2))
      : 0;
  // 跳び終わったら、ばんざいのまま体を小さく揺らす
  const sway = t > HOP_START + HOP * 2 ? Math.sin((t - HOP_START) * 8) : 0;
  const arm =
    mix(0.05, -2.9, raise) +
    (hopping ? 0.25 * Math.sin(hop * Math.PI * 2) : 0.12 * sway);
  const bend = 0.6 * crouch;
  return {
    x,
    y,
    z,
    yaw,
    hip: STAND - 0.08 * crouch,
    torso: -0.1 * raise + 0.15 * crouch + 0.04 * sway,
    head: -0.25 * raise,
    armLeft: arm + stride * (1 - raise),
    armRight: arm - stride * (1 - raise),
    thighLeft: -stride - bend * 0.5,
    thighRight: stride - bend * 0.5,
    shinLeft: Math.max(0, stride) * 0.5 + bend,
    shinRight: Math.max(0, -stride) * 0.5 + bend,
  };
}

/** 帽子とシャツは配送センターと同じ濃い緑。手足は単純な箱 */
export function createCourier() {
  const group = new THREE.Group();
  group.name = 'courier';
  group.visible = false;
  const material = (color: string) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const uniform = material('#294b3c'),
    pants = material('#3a4a56'),
    skin = material('#e8b896'),
    cap = material('#294b3c'),
    brim = material('#f2a65a');
  const box = (w: number, h: number, d: number, m: THREE.Material) =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  /** 関節（Group）の下に、長さ length の部品を下向きにつける */
  function limb(length: number, width: number, m: THREE.Material) {
    const joint = new THREE.Group();
    const part = box(width, length, width, m);
    part.position.y = -length / 2;
    joint.add(part);
    return joint;
  }
  const hips = new THREE.Group();
  group.add(hips);
  const torso = new THREE.Group();
  const body = box(0.34, SIZE.torso, 0.2, uniform);
  body.position.y = SIZE.torso / 2;
  torso.add(body);
  hips.add(torso);
  const head = new THREE.Group();
  head.position.y = SIZE.torso + 0.02;
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(SIZE.head, 16, 12),
    skin,
  );
  face.position.y = SIZE.head;
  head.add(face);
  const hat = box(0.25, 0.08, 0.25, cap);
  hat.position.y = SIZE.head * 1.75;
  head.add(hat);
  const visor = box(0.22, 0.025, 0.12, brim);
  visor.position.set(0, SIZE.head * 1.5, 0.15);
  head.add(visor);
  torso.add(head);
  const arms = [-1, 1].map((side) => {
    const arm = limb(SIZE.arm, 0.09, uniform);
    arm.position.set(side * 0.215, SIZE.torso - 0.04, 0);
    const hand = box(0.08, 0.08, 0.08, skin);
    hand.position.y = -SIZE.arm;
    arm.add(hand);
    torso.add(arm);
    return arm;
  });
  const legs = [-1, 1].map((side) => {
    const thigh = limb(SIZE.thigh, 0.12, pants);
    thigh.position.x = side * 0.09;
    const shin = limb(SIZE.shin, 0.11, pants);
    shin.position.y = -SIZE.thigh;
    thigh.add(shin);
    hips.add(thigh);
    return { thigh, shin };
  });
  return {
    group,
    show(visible: boolean) {
      group.visible = visible;
    },
    apply(pose: CourierPose) {
      group.position.set(pose.x, pose.y, pose.z);
      group.rotation.y = pose.yaw;
      hips.position.y = pose.hip;
      torso.rotation.x = pose.torso;
      head.rotation.x = pose.head;
      // 左右は配達員から見た向き（−Xが右手）
      arms[0].rotation.x = pose.armRight;
      arms[1].rotation.x = pose.armLeft;
      legs[0].thigh.rotation.x = pose.thighRight;
      legs[1].thigh.rotation.x = pose.thighLeft;
      legs[0].shin.rotation.x = pose.shinRight;
      legs[1].shin.rotation.x = pose.shinLeft;
    },
  };
}
