export const MODEL_ID = "Xenova/slimsam-77-uniform";
export const MODEL_REVISION = "5850ab45f587c112167512ffef949107115e26a0";
export const MODEL_CACHE = "transformers-cache";
export const MODEL_LOCK = "musart.slimsam.model-cache";
/** Exact pinned Hub blob lengths; not an estimate of physical browser storage. */
export const MODEL_FILES: Readonly<Record<string, number>> = Object.freeze({
  "config.json": 379,
  "preprocessor_config.json": 466,
  "onnx/vision_encoder.onnx": 23276014,
  "onnx/prompt_encoder_mask_decoder.onnx": 16557892,
});
export const MODEL_BYTES = Object.values(MODEL_FILES).reduce((sum, bytes) => sum + bytes, 0);
export function modelFile(file: string): string | undefined {
  return Object.keys(MODEL_FILES).find((name) => name === file || name.endsWith(`/${file}`));
}
export function modelCachePath(url: string): { file: string; current: boolean } | null {
  try {
    const parsed = new URL(url),
      prefix = `/${MODEL_ID}/resolve/`;
    if (parsed.origin !== "https://huggingface.co" || !parsed.pathname.startsWith(prefix))
      return null;
    const [revision, ...parts] = parsed.pathname.slice(prefix.length).split("/");
    const file = parts.join("/");
    return file ? { file, current: revision === MODEL_REVISION } : null;
  } catch {
    return null;
  }
}
