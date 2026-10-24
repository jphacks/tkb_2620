/**
 * Memory Score（思い出度、Issue #30〜#32）。画面・通信に依存しない。
 *
 * エビングハウスの忘却曲線（Ebbinghaus, 1885）で、本人が実験結果に当てはめた式を使う。
 *   b = 100k / ((log10 t)^c + k)   t：最後に遊んでからの分、k = 1.84、c = 1.25
 * 20分で約57・1時間で約47・1日で約30・31日で約21（実験値は 58・44・34・21）。
 * 遊ぶと100に戻る（#30）。DBには保存せず、最後に遊んだ時刻から必要なときに計算する。
 */
export const EBBINGHAUS_K = 1.84;
export const EBBINGHAUS_C = 1.25;

/** エビングハウスの実験の最後の測定点。これだけ遊ばれないと「忘れられた」とみなす（#32） */
export const FORGOTTEN_AFTER_DAYS = 31;

const MINUTE = 60_000;

/** 最後に遊んでからの分数 → 思い出度（0〜100） */
export function retention(minutes: number): number {
  // 1分以内は覚えたばかり。log10 が0以下になる範囲も100にする
  if (!Number.isFinite(minutes) || minutes <= 1) return 100;
  const forgotten = Math.log10(minutes) ** EBBINGHAUS_C;
  return (100 * EBBINGHAUS_K) / (forgotten + EBBINGHAUS_K);
}

/** コースの思い出度。一度も遊ばれていなければ作った時刻から数える */
export function memoryScore(
  course: { lastPlayedAt: string | null; createdAt: string },
  now: number = Date.now(),
): number {
  const at = Date.parse(course.lastPlayedAt ?? course.createdAt);
  if (!Number.isFinite(at)) return 0;
  return retention((now - at) / MINUTE);
}

/** 「忘れられた」とみなす思い出度（31日後の値、約21） */
export const FORGOTTEN_SCORE = retention(FORGOTTEN_AFTER_DAYS * 24 * 60);

/**
 * 思い出度 → 色あせの度合い（0：遊んだばかり 〜 1：忘れられる直前）。一覧のカードを薄くするのに使う（#30）。
 * 遊んだ直後（100）を0、忘れられたとみなす値（約21）を1にする。
 */
export function memoryFade(score: number): number {
  if (!Number.isFinite(score)) return 1;
  const fade = (100 - score) / (100 - FORGOTTEN_SCORE);
  return Math.min(1, Math.max(0, fade));
}

/** 思い出度の高い順（＝最近遊ばれた順）に並べた新しい配列 */
export function sortByMemory<
  T extends { lastPlayedAt: string | null; createdAt: string },
>(courses: readonly T[], now: number = Date.now()): T[] {
  return courses
    .map((course) => ({ course, score: memoryScore(course, now) }))
    .sort((a, b) => b.score - a.score)
    .map(({ course }) => course);
}

/** 「3分前」「2日前」のような表示 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, (now - Date.parse(iso)) / MINUTE);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${Math.floor(minutes)}分前`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}時間前`;
  return `${Math.floor(minutes / 60 / 24)}日前`;
}
