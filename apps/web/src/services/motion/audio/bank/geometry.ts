import { SFX_BANK, SFX_RECIPE_VERSION } from "../sfx";
import type { BankShape, BankShapeData } from "./model";

/** Validated, precomputed source envelopes; no audio processing or pixel sampling happens here. */
export function bankShapes(raw: unknown): BankShapeData {
  const data = raw as BankShapeData;
  if (
    !data ||
    data.version !== 1 ||
    data.recipeVersion !== SFX_RECIPE_VERSION ||
    data.sampleRate !== 48000 ||
    data.bins !== 96 ||
    !Array.isArray(data.shapes) ||
    data.shapes.length !== SFX_BANK.length
  )
    throw Error("Sound-bank waveforms do not match their original recipes.");
  for (let index = 0; index < SFX_BANK.length; index++) {
    const preset = SFX_BANK[index]!,
      shape = data.shapes[index];
    if (
      !shape ||
      shape.id !== preset.id ||
      shape.frames !== Math.round(preset.duration * 48000) ||
      !/^sha256:[a-f0-9]{64}$/.test(shape.revision) ||
      decodePeaks(shape).length !== data.bins
    )
      throw Error("Sound-bank waveform metadata is invalid.");
  }
  for (const shape of data.shapes) Object.freeze(shape);
  Object.freeze(data.shapes);
  Object.freeze(data);
  return data;
}
export function decodePeaks(shape: BankShape): readonly number[] {
  const bytes = atob(shape.peaks);
  if (bytes.length !== 192) throw Error("Sound-bank source envelope is incomplete.");
  const values = Array.from(
    { length: 96 },
    (_, index) => (bytes.charCodeAt(index * 2) | (bytes.charCodeAt(index * 2 + 1) << 8)) / 32768,
  );
  return Object.freeze(values);
}

/** A filled mountain rises from the baseline. The same path paints first-frame and worker atlases. */
export function mountainPath(peaks: readonly number[], width: number, height: number): Path2D {
  const path = new Path2D(),
    maximum = Math.max(...peaks, 0.001),
    bottom = height - 0.5;
  path.moveTo(0, bottom);
  const y = (index: number) =>
    bottom - Math.max(0.5, ((peaks[index] ?? 0) / maximum) * (height - 1.5));
  path.lineTo(0, y(0));
  for (let index = 1; index < peaks.length; index++) {
    const previous = ((index - 1) / (peaks.length - 1)) * width,
      current = (index / (peaks.length - 1)) * width;
    path.quadraticCurveTo(
      previous,
      y(index - 1),
      (previous + current) / 2,
      (y(index - 1) + y(index)) / 2,
    );
  }
  path.lineTo(width, y(peaks.length - 1));
  path.lineTo(width, bottom);
  path.closePath();
  return path;
}
export function closeAtlas(
  atlas: { neutral: ImageBitmap; active: ImageBitmap } | null | undefined,
) {
  atlas?.neutral.close();
  atlas?.active.close();
}
