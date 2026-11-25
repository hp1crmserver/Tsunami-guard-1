import type { SeverityLevel } from '../types/tsunami';

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx) {
    sharedCtx = new Ctx();
  }
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  dualFreq?: number
) {
  const now = ctx.currentTime + startOffset;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.01, volume * 0.32), now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  gain.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  osc1.type = type;
  osc1.frequency.setValueAtTime(freq, now);
  osc1.connect(gain);
  osc1.start(now);
  osc1.stop(now + duration + 0.02);

  if (dualFreq) {
    const osc2 = ctx.createOscillator();
    osc2.type = type;
    osc2.frequency.setValueAtTime(dualFreq, now);
    osc2.connect(gain);
    osc2.start(now);
    osc2.stop(now + duration + 0.02);
  }
}

export function playSeverityAlertSound(severity: SeverityLevel, volume = 0.7): boolean {
  const ctx = getAudioContext();
  if (!ctx) return false;

  const v = Math.min(1, Math.max(0.05, volume));

  if (severity === 'warning') {
    // Standard maritime / EAS dual-tone emergency alert cadence (853Hz + 960Hz)
    playTone(ctx, 853, 0, 0.35, v, 'triangle', 960);
    playTone(ctx, 853, 0.45, 0.35, v, 'triangle', 960);
    playTone(ctx, 853, 0.9, 0.55, v, 'triangle', 960);
    return true;
  }

  if (severity === 'watch') {
    // Ascending 3-note maritime attention signal
    playTone(ctx, 659.25, 0, 0.22, v, 'triangle');
    playTone(ctx, 880, 0.26, 0.24, v, 'triangle');
    playTone(ctx, 1046.5, 0.54, 0.38, v, 'triangle');
    return true;
  }

  if (severity === 'advisory') {
    // Double coastal advisory chime
    playTone(ctx, 587.33, 0, 0.22, v, 'sine');
    playTone(ctx, 783.99, 0.24, 0.32, v, 'sine');
    return true;
  }

  // Information bulletin: calibrated telemetry ping
  playTone(ctx, 523.25, 0, 0.28, v * 0.7, 'sine');
  return true;
}
