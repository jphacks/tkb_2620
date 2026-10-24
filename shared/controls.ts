/** 通信で受け取った操作値を安全な範囲に丸める。数でなければ 0（#14）。 */
export function sanitizeUnit(value: unknown, min = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(min, value))
    : 0;
}
