import type { SamModel, SamProcessor, Tensor } from "@huggingface/transformers";
const MODEL = "Xenova/slimsam-77-uniform";
const REVISION = "5850ab45f587c112167512ffef949107115e26a0";
interface Inputs {
  pixel_values: Tensor;
  original_sizes: [number, number][];
  reshaped_input_sizes: [number, number][];
}
interface Loaded {
  model: SamModel;
  processor: SamProcessor;
  RawImage: typeof import("@huggingface/transformers").RawImage;
}
let loading: Promise<Loaded> | undefined;
let cached:
  | {
      url: string;
      inputs: Inputs;
      embeddings: Awaited<ReturnType<SamModel["get_image_embeddings"]>>;
    }
  | undefined;
export function prepareSam(): Promise<Loaded> {
  loading ??= (async () => {
    const {
      SamModel: Model,
      AutoProcessor,
      RawImage,
      env,
    } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    const processor = (await AutoProcessor.from_pretrained(MODEL, {
      revision: REVISION,
    })) as SamProcessor;
    let model: SamModel;
    try {
      model = (await Model.from_pretrained(MODEL, {
        revision: REVISION,
        device: "gpu" in navigator ? "webgpu" : "wasm",
        dtype: "fp32",
      })) as SamModel;
    } catch (error) {
      if (!("gpu" in navigator)) throw error;
      model = (await Model.from_pretrained(MODEL, {
        revision: REVISION,
        device: "wasm",
        dtype: "fp32",
      })) as SamModel;
    }
    return { model, processor, RawImage };
  })().catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
export function bestMask(masks: Tensor, scores: Tensor, width: number, height: number) {
  const values = Array.from(scores.data, Number);
  if (!values.length || masks.data.length < width * height * values.length)
    throw new Error("Le modèle n’a retourné aucun masque valide.");
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  const output = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    output[offset] = 255;
    output[offset + 1] = 255;
    output[offset + 2] = 255;
    output[offset + 3] = Number(masks.data[best * width * height + i]) ? 255 : 0;
  }
  return output;
}
export async function segmentObject(url: string, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error("Position de sélection invalide.");
  const { model, processor, RawImage } = await prepareSam();
  if (cached?.url !== url) {
    const image = await RawImage.read(url);
    const inputs = (await processor(image)) as Inputs;
    const embeddings = await model.get_image_embeddings({ pixel_values: inputs.pixel_values });
    cached = { url, inputs, embeddings };
  }
  const { inputs, embeddings } = cached;
  const input_points = processor.reshape_input_points(
    [[[x, y]]],
    inputs.original_sizes,
    inputs.reshaped_input_sizes,
  ) as Tensor;
  const result = await model({ ...embeddings, input_points });
  const masks = (await processor.post_process_masks(
    result.pred_masks,
    inputs.original_sizes,
    inputs.reshaped_input_sizes,
  )) as Tensor[];
  const [height, width] = inputs.original_sizes[0]!;
  if (!masks[0]) throw new Error("Le modèle n’a retourné aucun masque.");
  return { data: bestMask(masks[0], result.iou_scores, width, height), width, height };
}
