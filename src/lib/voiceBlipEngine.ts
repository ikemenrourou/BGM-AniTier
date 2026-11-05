import type { BlueArchiveEmoteId, VoiceBlipPresetId } from './studioDirector';

let sharedAudioCtx: AudioContext | null = null;
let previewTimers: ReturnType<typeof setTimeout>[] = [];

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Plays a single soft, cute "Animalese / Blue Archive / RPG" syllable blip for a character's typewriter tick.
 */
export function playCuteVoiceBlip(params: {
  preset: VoiceBlipPresetId;
  pitch?: number;
  char?: string;
  charIndex?: number;
  muted?: boolean;
  volume?: number;
}): void {
  const {
    preset = 'mochi_loli',
    pitch = 1.15,
    char = 'あ',
    charIndex = 0,
    muted = false,
    volume = 0.28,
  } = params;

  if (muted || volume <= 0) return;
  // Skip whitespace and silent punctuation
  if (/[\s，,。、；;：:“”""''（）()【】\[\]…—\-~～]/.test(char)) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Deterministic pseudo-vowel variation from character code so speech has melodic contour
  const code = char.charCodeAt(0) || 65;
  const vowelStep = ((code * 17 + charIndex * 13) % 7) - 3; // -3 .. +3
  const softVoice = preset === 'whale_murmur' || preset === 'neutral_soft';
  const semitoneJitter = Math.pow(2, (vowelStep * (softVoice ? 0.45 : 1.15)) / 12);

  // Base frequency by preset (tuned to warm, soft anime girl / chibi ranges)
  let baseFreq = 440;
  let duration = 0.058;
  let scoopRatio = 1.12;
  let mainWave: OscillatorType = 'sine';
  let subWave: OscillatorType = 'triangle';
  let subHarmonicMult = 2.0;
  let subGainRatio = 0.18;
  let filterCutoff = 1650;

  switch (preset) {
    case 'neutral_soft':
      baseFreq = 300;
      duration = 0.055;
      scoopRatio = 1.025;
      mainWave = 'sine';
      subWave = 'sine';
      subHarmonicMult = 2;
      subGainRatio = 0.06;
      filterCutoff = 1050;
      break;
    case 'whale_murmur':
      baseFreq = 340;
      duration = 0.078;
      scoopRatio = 1.07;
      mainWave = 'sine';
      subWave = 'sine';
      subHarmonicMult = 2;
      subGainRatio = 0.09;
      filterCutoff = 980;
      break;
    case 'mochi_loli':
      baseFreq = 510;
      duration = 0.062;
      scoopRatio = 1.16; // bubbly upward scoop ("噗噜")
      mainWave = 'sine';
      subWave = 'triangle';
      subHarmonicMult = 1.5;
      subGainRatio = 0.22;
      filterCutoff = 1550;
      break;
    case 'mesugaki_pop':
      baseFreq = 545;
      duration = 0.052;
      scoopRatio = 1.2; // cheeky bouncy pop
      mainWave = 'triangle';
      subWave = 'sine';
      subHarmonicMult = 2.0;
      subGainRatio = 0.25;
      filterCutoff = 1950;
      break;
    case 'atri_crystal':
      baseFreq = 495;
      duration = 0.06;
      scoopRatio = 1.09;
      mainWave = 'sine';
      subWave = 'sine';
      subHarmonicMult = 2.5; // delicate crystal bell overtone
      subGainRatio = 0.2;
      filterCutoff = 2200;
      break;
    case 'neko_soft':
      baseFreq = 475;
      duration = 0.068;
      scoopRatio = 1.18; // soft meow-like glide
      mainWave = 'sine';
      subWave = 'triangle';
      subHarmonicMult = 1.98;
      subGainRatio = 0.16;
      filterCutoff = 1480;
      break;
    case 'creator_clean':
      baseFreq = 350;
      duration = 0.05;
      scoopRatio = 1.07;
      mainWave = 'sine';
      subWave = 'triangle';
      subHarmonicMult = 1.5;
      subGainRatio = 0.15;
      filterCutoff = 1350;
      break;
    case 'retro_rpg':
    default:
      baseFreq = 430;
      duration = 0.046;
      scoopRatio = 1.05;
      mainWave = 'triangle';
      subWave = 'sine';
      subHarmonicMult = 2.0;
      subGainRatio = 0.12;
      filterCutoff = 1600;
      break;
  }

  // Punctuation inflection
  if (char === '?' || char === '？') {
    scoopRatio = 1.32;
    duration = 0.075;
  } else if (char === '!' || char === '！') {
    scoopRatio = 1.22;
    baseFreq *= 1.08;
  }

  const safePitch = Number.isFinite(pitch) ? Math.max(0.5, Math.min(2, pitch)) : 1;
  const f0 = Math.min(1100, Math.max(180, baseFreq * safePitch * semitoneJitter));

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();

  osc1.type = mainWave;
  osc2.type = subWave;

  // Rounded vowel-like pitch envelope (starts slightly below f0, scoops softly up)
  osc1.frequency.setValueAtTime(f0 * 0.92, now);
  osc1.frequency.exponentialRampToValueAtTime(f0 * scoopRatio, now + duration * 0.72);
  osc1.frequency.exponentialRampToValueAtTime(f0 * 0.98, now + duration);

  osc2.frequency.setValueAtTime(f0 * subHarmonicMult * 0.94, now);
  osc2.frequency.exponentialRampToValueAtTime(
    f0 * subHarmonicMult * scoopRatio,
    now + duration * 0.72,
  );

  // Warm formant lowpass filter so it always sounds soft & rounded ("糯")
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterCutoff * Math.max(0.85, Math.min(1.25, safePitch)), now);
  filter.Q.setValueAtTime(softVoice ? 0.5 : 1.8, now);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(subGainRatio, now);

  // Soft pillowy ADSR envelope (no clicky transients)
  const peakGain = Math.min(0.45, Math.max(0.02, volume * (softVoice ? 0.25 : 0.32)));
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.linearRampToValueAtTime(peakGain, now + (softVoice ? 0.016 : 0.01));
  gainNode.gain.exponentialRampToValueAtTime(peakGain * 0.65, now + duration * 0.65);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc1.connect(filter);
  osc2.connect(subGain);
  subGain.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + duration + 0.005);
  osc2.stop(now + duration + 0.005);
  osc2.onended = () => {
    osc1.disconnect(); osc2.disconnect(); subGain.disconnect(); filter.disconnect(); gainNode.disconnect();
  };
}

/**
 * Plays a short demo phrase of the selected voice blip preset so the user can audition it in settings.
 */
export function previewVoiceBlipPhrase(preset: VoiceBlipPresetId, pitch = 1.15): void {
  previewTimers.forEach(clearTimeout);
  previewTimers = [];
  const sampleChars = ['噗', '噜', '～', '今', '天', '排', '榜', '超', '开', '心', '呀', '！'];
  sampleChars.forEach((ch, idx) => {
    previewTimers.push(setTimeout(() => {
      playCuteVoiceBlip({
        preset,
        pitch,
        char: ch,
        charIndex: idx,
        volume: 0.36,
      });
    }, idx * 80));
  });
}

/**
 * Plays a cute Blue Archive-style emote pop sound when a new comic symbol (💦 / 💢 / ✨ / ❤️) appears.
 */
export function playEmotePopSound(emote: BlueArchiveEmoteId, muted = false): void {
  if (muted || emote === 'none') return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  if (emote === 'sparkles' || emote === 'hearts' || emote === 'exclamation') {
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.09); // A5
  } else if (emote === 'sweat_drops' || emote === 'sleep_zzz') {
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.11);
  } else {
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.08);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.13);
}

/**
 * Plays a tactile stamp/chime when the work lands in its Tier Row and reveals its score on the Top-Right Meta Card.
 * Differentiates between high scores (>=8.5), normal scores (6..8), and low scores (<6).
 */
export function playScoreRevealChime(score: number, muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (score >= 8.5) {
    // High score (9-10 / S): celebratory bright ascending arpeggio
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.042;
      osc.type = i === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.075, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    });
    return;
  }

  if (score < 6) {
    // Low score (<=5 / C-D): playful comedic descending motif with slight pitch droop
    const notes = [349.23, 293.66, 233.08];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.065;
      const dur = i === notes.length - 1 ? 0.24 : 0.16;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      if (i === notes.length - 1) {
        osc.frequency.exponentialRampToValueAtTime(freq * 0.88, start + dur);
      }

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
    return;
  }

  // Normal / mid score (6-8 / A-B): warm two-note confirmation chime
  const notes = [440, 587.33];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + i * 0.05;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.058, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.22);
  });
}

