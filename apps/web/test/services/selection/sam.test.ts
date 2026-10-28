import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Tensor } from "@huggingface/transformers";
const fake = vi.hoisted(() => ({
  model: Object.assign(vi.fn(), { get_image_embeddings: vi.fn() }),
  processor: Object.assign(vi.fn(), { reshape_input_points: vi.fn(), post_process_masks: vi.fn() }),
  modelLoader: vi.fn(),
  processorLoader: vi.fn(),
  read: vi.fn(),
  env: { allowLocalModels: true },
}));
vi.mock("@huggingface/transformers", () => ({
  SamModel: { from_pretrained: fake.modelLoader },
  AutoProcessor: { from_pretrained: fake.processorLoader },
  RawImage: { read: fake.read },
  env: fake.env,
}));
function tensor(data: number[]): Tensor {
  return { data: new Float32Array(data) } as unknown as Tensor;
}
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  fake.modelLoader.mockResolvedValue(fake.model);
  fake.processorLoader.mockResolvedValue(fake.processor);
  fake.read.mockResolvedValue({});
  fake.processor.mockResolvedValue({
    pixel_values: tensor([1]),
    original_sizes: [[2, 3]],
    reshaped_input_sizes: [[256, 256]],
  });
  fake.model.get_image_embeddings.mockResolvedValue({ image_embeddings: tensor([1]) });
  fake.processor.reshape_input_points.mockReturnValue(tensor([1, 1]));
  fake.model.mockResolvedValue({ pred_masks: tensor([1]), iou_scores: tensor([0.1, 0.9]) });
  fake.processor.post_process_masks.mockResolvedValue([
    tensor([0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0]),
  ]);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("local SAM loading and inference", () => {
  it("forwards real file progress without exposing unrelated model lifecycle events", async () => {
    const { prepareSam } = await import("../../../src/services/selection/sam");
    const progress = vi.fn();
    await prepareSam(progress);
    const callback = fake.modelLoader.mock.calls[0]![1].progress_callback;
    callback({ status: "download", file: "config.json", name: "model" });
    callback({
      status: "progress",
      file: "vision_encoder.onnx",
      name: "model",
      progress: 10,
      loaded: 100,
      total: 1000,
    });
    callback({ status: "done", file: "vision_encoder.onnx", name: "model" });
    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ status: "done" }));
  });
  it("lazily shares a single WASM model preparation and keeps downloaded model execution local", async () => {
    const { prepareSam } = await import("../../../src/services/selection/sam");
    expect(fake.modelLoader).not.toHaveBeenCalled();
    const first = prepareSam(),
      second = prepareSam();
    expect(first).toBe(second);
    await first;
    expect(fake.processorLoader).toHaveBeenCalledWith("Xenova/slimsam-77-uniform", {
      revision: "5850ab45f587c112167512ffef949107115e26a0",
    });
    expect(fake.modelLoader).toHaveBeenCalledWith("Xenova/slimsam-77-uniform", {
      revision: "5850ab45f587c112167512ffef949107115e26a0",
      device: "wasm",
      dtype: "fp32",
    });
    expect(fake.env.allowLocalModels).toBe(false);
  });
  it("uses WebGPU when available and retries WASM after GPU initialization failure", async () => {
    vi.stubGlobal("navigator", { gpu: {} });
    fake.modelLoader
      .mockRejectedValueOnce(new Error("Adapter unavailable"))
      .mockResolvedValue(fake.model);
    const { prepareSam } = await import("../../../src/services/selection/sam");
    await prepareSam();
    expect(fake.modelLoader.mock.calls.map((call) => call[1]?.device)).toEqual(["webgpu", "wasm"]);
  });
  it("clears failed model promises so preparation can be retried", async () => {
    fake.modelLoader
      .mockRejectedValueOnce(new Error("Download failed"))
      .mockResolvedValue(fake.model);
    const { prepareSam } = await import("../../../src/services/selection/sam");
    await expect(prepareSam()).rejects.toThrow("Download failed");
    await expect(prepareSam()).resolves.toHaveProperty("model");
    expect(fake.modelLoader).toHaveBeenCalledTimes(2);
  });
  it("encodes each active source once, rescales points and selects the highest-IoU mask", async () => {
    const { segmentObject } = await import("../../../src/services/selection/sam");
    const result = await segmentObject("source-A", 1, 1);
    expect(result).toMatchObject({ width: 3, height: 2 });
    expect(Array.from(result.data.filter((_, index) => index % 4 === 3))).toEqual([
      255, 0, 255, 0, 255, 0,
    ]);
    expect(fake.processor.reshape_input_points).toHaveBeenCalledWith(
      [[[1, 1]]],
      [[2, 3]],
      [[256, 256]],
    );
    expect(fake.model).toHaveBeenCalledWith(
      expect.objectContaining({
        image_embeddings: expect.anything(),
        input_points: expect.anything(),
      }),
    );
    await segmentObject("source-A", 2, 1);
    expect(fake.read).toHaveBeenCalledTimes(1);
    expect(fake.model.get_image_embeddings).toHaveBeenCalledTimes(1);
    await segmentObject("source-B", 1, 1);
    expect(fake.read).toHaveBeenCalledTimes(2);
    expect(fake.model.get_image_embeddings).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid points before downloading models and missing output masks explicitly", async () => {
    const { segmentObject } = await import("../../../src/services/selection/sam");
    await expect(segmentObject("a", NaN, 1)).rejects.toThrow("Position");
    await expect(segmentObject("a", 1, Infinity)).rejects.toThrow("Position");
    expect(fake.modelLoader).not.toHaveBeenCalled();
    fake.processor.post_process_masks.mockResolvedValue([]);
    await expect(segmentObject("a", 1, 1)).rejects.toThrow("aucun masque");
  });
});
describe("SAM mask selection", () => {
  it("keeps the first mask on equal scores and converts boolean mask values into alpha", async () => {
    const { bestMask } = await import("../../../src/services/selection/sam");
    const result = bestMask(tensor([1, 0, 0, 1, 0, 1]), tensor([0.9, 0.2, 0.9]), 2, 1);
    expect(Array.from(result)).toEqual([255, 255, 255, 255, 255, 255, 255, 0]);
  });
  it("rejects empty scores and truncated prediction buffers", async () => {
    const { bestMask } = await import("../../../src/services/selection/sam");
    expect(() => bestMask(tensor([]), tensor([]), 1, 1)).toThrow("valide");
    expect(() => bestMask(tensor([1]), tensor([0.1, 0.9]), 1, 1)).toThrow("valide");
  });
});
