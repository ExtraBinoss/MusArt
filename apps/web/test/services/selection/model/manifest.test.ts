import { expect, test } from "vitest";
import {
  MODEL_BYTES,
  MODEL_FILES,
  MODEL_ID,
  MODEL_REVISION,
  modelCachePath,
  modelFile,
} from "../../../../src/services/selection/model/manifest";
test("pins exact model blob lengths and recognizes only its own Hub namespace", () => {
  expect(MODEL_BYTES).toBe(39834751);
  expect(Object.isFrozen(MODEL_FILES)).toBe(true);
  expect(modelFile("vision_encoder.onnx")).toBe("onnx/vision_encoder.onnx");
  expect(modelFile("config.json")).toBe("config.json");
  expect(modelFile("arbitrary.bin")).toBeUndefined();
  const base = `https://huggingface.co/${MODEL_ID}/resolve/`;
  expect(modelCachePath(`${base}${MODEL_REVISION}/onnx/vision_encoder.onnx`)).toEqual({
    file: "onnx/vision_encoder.onnx",
    current: true,
  });
  expect(modelCachePath(`${base}old/config.json`)).toEqual({ file: "config.json", current: false });
  for (const bad of [
    "bad",
    `${base}${MODEL_REVISION}/`,
    base.replace("huggingface.co", "example.com"),
    "https://huggingface.co/another/model/resolve/main/config.json",
  ])
    expect(modelCachePath(bad)).toBeNull();
});
