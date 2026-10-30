export type SfxCategory = "whoosh" | "impact" | "pop" | "riser" | "tone";
export const SFX_RECIPE_VERSION = 1;
export interface SfxDefinition {
  readonly id: string;
  readonly category: SfxCategory;
  readonly name: string;
  readonly duration: number;
  readonly frequency: number;
  readonly seed: number;
}
/** Original MusArt synthesis recipes, MIT licensed. No third-party recordings or voice generation. */
export const SFX_BANK: readonly SfxDefinition[] = Object.freeze([
  {
    id: "silk-whoosh",
    category: "whoosh",
    name: "Silk whoosh",
    duration: 0.55,
    frequency: 1800,
    seed: 123,
  },
  {
    id: "swift-whoosh",
    category: "whoosh",
    name: "Swift whoosh",
    duration: 0.28,
    frequency: 3400,
    seed: 421,
  },
  {
    id: "air-sweep",
    category: "whoosh",
    name: "Air sweep",
    duration: 0.85,
    frequency: 1100,
    seed: 612,
  },
  {
    id: "soft-impact",
    category: "impact",
    name: "Soft impact",
    duration: 0.7,
    frequency: 85,
    seed: 79,
  },
  {
    id: "deep-impact",
    category: "impact",
    name: "Deep impact",
    duration: 1.2,
    frequency: 54,
    seed: 592,
  },
  {
    id: "sharp-impact",
    category: "impact",
    name: "Sharp impact",
    duration: 0.32,
    frequency: 150,
    seed: 815,
  },
  {
    id: "bubble-pop",
    category: "pop",
    name: "Bubble pop",
    duration: 0.16,
    frequency: 720,
    seed: 231,
  },
  {
    id: "soft-plop",
    category: "pop",
    name: "Soft plop",
    duration: 0.24,
    frequency: 360,
    seed: 872,
  },
  {
    id: "little-click",
    category: "pop",
    name: "Little click",
    duration: 0.08,
    frequency: 1400,
    seed: 121,
  },
  {
    id: "gentle-riser",
    category: "riser",
    name: "Gentle riser",
    duration: 1.5,
    frequency: 220,
    seed: 911,
  },
  {
    id: "bright-riser",
    category: "riser",
    name: "Bright riser",
    duration: 1.8,
    frequency: 440,
    seed: 932,
  },
  {
    id: "glass-chime",
    category: "tone",
    name: "Glass chime",
    duration: 1.1,
    frequency: 880,
    seed: 63,
  },
  {
    id: "warm-chime",
    category: "tone",
    name: "Warm chime",
    duration: 1.4,
    frequency: 523.251,
    seed: 323,
  },
  {
    id: "success-ping",
    category: "tone",
    name: "Success ping",
    duration: 0.7,
    frequency: 1046.502,
    seed: 632,
  },
  {
    id: "low-pulse",
    category: "tone",
    name: "Low pulse",
    duration: 0.6,
    frequency: 130.813,
    seed: 413,
  },
]);

/** Fixed sample clock and seeded noise make each preset reproducible in headless callers. */
export function synthesizeSfx(id: string, sampleRate = 48000): Float32Array<ArrayBuffer> {
  const preset = SFX_BANK.find((item) => item.id === id);
  if (!preset || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000)
    throw new RangeError("Unknown sound preset or unsupported sample rate.");
  const samples = new Float32Array(Math.round(preset.duration * sampleRate));
  let state = preset.seed,
    filtered = 0,
    phase = 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2147483648 - 1;
  };
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate,
      progress = i / Math.max(1, samples.length - 1);
    const edge = Math.min(1, t / 0.006, (preset.duration - t) / 0.012);
    const noise = random();
    let value: number;
    if (preset.category === "whoosh") {
      const cutoff = preset.frequency * (0.2 + Math.sin(Math.PI * progress));
      filtered += (noise - filtered) * (1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate));
      value = filtered * Math.sin(Math.PI * progress) ** 2 * 0.8;
    } else if (preset.category === "impact") {
      phase += (2 * Math.PI * preset.frequency * (1 + 3 * Math.exp(-t * 35))) / sampleRate;
      value = Math.sin(phase) * Math.exp(-t * 8) * 0.65 + noise * Math.exp(-t * 45) * 0.18;
    } else if (preset.category === "pop") {
      phase += (2 * Math.PI * preset.frequency * (0.35 + Math.exp(-t * 22))) / sampleRate;
      value = Math.sin(phase) * Math.exp(-t * 24) * 0.65;
    } else if (preset.category === "riser") {
      phase += (2 * Math.PI * preset.frequency * 2 ** (progress * 2.5)) / sampleRate;
      value = (Math.sin(phase) * 0.32 + noise * 0.12) * progress ** 1.8;
    } else {
      phase += (2 * Math.PI * preset.frequency) / sampleRate;
      value = (Math.sin(phase) + 0.24 * Math.sin(phase * 2.002)) * Math.exp(-t * 5) * 0.45;
    }
    samples[i] = Math.max(-1, Math.min(1, value * Math.max(0, edge)));
  }
  samples[0] = 0;
  samples[samples.length - 1] = 0;
  return samples;
}

/** PCM16 WAV is a real portable original, not an engine-specific generated-sound recipe. */
export function encodeSfxWav(samples: Float32Array, sampleRate = 48000): ArrayBuffer {
  if (
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 96000 ||
    samples.length > sampleRate * 3
  )
    throw new RangeError("Sound exceeds the WAV synthesis budget.");
  const bytes = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, i) => {
    if (!Number.isFinite(value)) throw new RangeError("Sound contains invalid PCM.");
    const clipped = Math.max(-1, Math.min(1, value));
    view.setInt16(44 + i * 2, Math.round(clipped * (clipped < 0 ? 32768 : 32767)), true);
  });
  return bytes;
}

export function sfxWav(samples: Float32Array, sampleRate = 48000): Blob {
  return new Blob([encodeSfxWav(samples, sampleRate)], { type: "audio/wav" });
}
