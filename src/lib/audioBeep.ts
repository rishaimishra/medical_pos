/**
 * Synthesizes crisp POS cashier audio feedback using Web Audio API.
 * Operates 100% locally with zero external audio assets or network requests.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * High-pitched pleasant chime for successful barcode scan.
 */
export function playScanSuccessBeep(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08); // E6

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch {
    // Ignore audio error silently if browser blocks autoplay
  }
}

/**
 * Double low-frequency warning beep for barcode not found or stock capped.
 */
export function playScanErrorBeep(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(220, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.1);

    // Tone 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(180, now + 0.12);
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.22);
  } catch {
    // Ignore
  }
}

/**
 * MODULE 2.5.2: Synthesizes a mechanical cash register drawer latch & bell sound.
 */
export function playCashDrawerSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Bell ring (Ka-ching tone)
    const bell = ctx.createOscillator();
    const bellGain = ctx.createGain();
    bell.type = "sine";
    bell.frequency.setValueAtTime(1760, now); // A6
    bell.frequency.exponentialRampToValueAtTime(2637, now + 0.05); // E7
    bellGain.gain.setValueAtTime(0.2, now);
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    bell.connect(bellGain);
    bellGain.connect(ctx.destination);
    bell.start(now);
    bell.stop(now + 0.35);

    // 2. Mechanical drawer slide click
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = "triangle";
    click.frequency.setValueAtTime(300, now + 0.04);
    click.frequency.exponentialRampToValueAtTime(80, now + 0.15);
    clickGain.gain.setValueAtTime(0.25, now + 0.04);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    click.connect(clickGain);
    clickGain.connect(ctx.destination);
    click.start(now + 0.04);
    click.stop(now + 0.15);
  } catch {
    // Ignore
  }
}
