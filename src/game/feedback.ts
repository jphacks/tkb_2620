let sharedContext: AudioContext | null = null;
export const soundSettings = { enabled: true };
/** Overall loudness. Raised 1.5x from 0.18 (game) and 0.45 (stamp); peaks stay well below 1. */
export const GAME_VOLUME = 0.18 * 1.5;
export const STAMP_VOLUME = 0.45 * 1.5;

/** Keep the unlocked context across the transition to the delivery slip. */
export function playStampSound() {
  if (
    !soundSettings.enabled ||
    sharedContext?.state !== 'running' ||
    document.hidden
  )
    return;
  const context = sharedContext;
  const buffer = context.createBuffer(
    1,
    context.sampleRate * 0.14,
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++)
    data[i] =
      (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * 0.022));
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 850;
  const gain = context.createGain();
  gain.gain.value = STAMP_VOLUME;
  noise.connect(filter).connect(gain).connect(context.destination);
  noise.onended = () => {
    noise.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  noise.start();
}

/** One-shot events are derived from transitions, never from the render count. */
export function feedbackEvents(
  previous: { cargoRemaining: number; finished: boolean } | null,
  next: { cargoRemaining: number; finished: boolean },
) {
  return {
    dropped: previous !== null && next.cargoRemaining < previous.cargoRemaining,
    delivered: next.finished && !previous?.finished,
  };
}

/**
 * 「出発する」など、画面を押したその場で呼ぶ。
 * ブラウザは人が操作したあとでないと音を出させないため、走り出す前に音の準備をしておく。
 */
export function prepareAudio() {
  if (!soundSettings.enabled) return;
  try {
    sharedContext ??= new AudioContext();
    void sharedContext.resume().catch(() => undefined);
  } catch {
    // Unsupported audio must never prevent playing the game.
  }
}

/** Synthesized locally: no sound files or network requests are needed. */
export function createGameAudio() {
  const context = (sharedContext ??= new AudioContext());
  const master = context.createGain();
  master.gain.value = GAME_VOLUME;
  master.connect(context.destination);
  const engine = context.createOscillator();
  engine.type = 'triangle';
  const engineGain = context.createGain();
  engineGain.gain.value = 0;
  engine.connect(engineGain).connect(master);
  engine.start();
  let enabled = true;
  function tone(frequency: number, delay: number, duration: number) {
    if (!enabled || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(0.55, start + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(envelope).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }
  return {
    unlock: () => context.resume().catch(() => undefined),
    setEnabled(value: boolean) {
      enabled = value;
      soundSettings.enabled = value;
      master.gain.setTargetAtTime(
        value ? GAME_VOLUME : 0,
        context.currentTime,
        0.03,
      );
    },
    update(speed: number, running: boolean) {
      engine.frequency.setTargetAtTime(
        45 + Math.min(40, Math.abs(speed)) * 3,
        context.currentTime,
        0.08,
      );
      engineGain.gain.setTargetAtTime(
        running ? 0.15 + Math.min(40, Math.abs(speed)) / 160 : 0,
        context.currentTime,
        0.06,
      );
    },
    countdown: (go: boolean) => tone(go ? 1046.5 : 700, 0, go ? 0.55 : 0.12),
    drop: () => {
      tone(150, 0, 0.16);
      tone(80, 0.06, 0.22);
    },
    finish: () => {
      [523.25, 659.25, 783.99, 1046.5].forEach((note, i) =>
        tone(note, i * 0.12, 0.3),
      );
    },
    dispose() {
      engine.stop();
      engine.disconnect();
      engineGain.disconnect();
      master.disconnect();
      // Context remains unlocked for the result stamp; all scene nodes disconnect.
    },
  };
}
