import { expect, test, vi } from "vitest";
import { modelProgressSink } from "../../../../src/services/selection/model/progress";
test("bounds download progress messages to the latest known file and flushes terminal bytes", () => {
  let time = 0;
  const send = vi.fn(),
    sink = modelProgressSink(send, () => time);
  sink.note({ file: "vision_encoder.onnx", status: "progress", loaded: 10, total: 100 });
  expect(send).toHaveBeenCalledOnce();
  for (let loaded = 11; loaded < 75; loaded++)
    sink.note({ file: "vision_encoder.onnx", status: "progress", loaded, total: 100 });
  expect(send).toHaveBeenCalledOnce();
  time = 80;
  sink.note({ file: "vision_encoder.onnx", status: "progress", loaded: 80, total: 100 });
  expect(send).toHaveBeenCalledTimes(2);
  sink.note({ file: "unknown", status: "done" });
  expect(send).toHaveBeenCalledTimes(2);
  sink.note({ file: "vision_encoder.onnx", status: "done" });
  expect(send).toHaveBeenLastCalledWith({ file: "onnx/vision_encoder.onnx", status: "done" });
  sink.flush();
  expect(send).toHaveBeenCalledTimes(3);
  const native = modelProgressSink(send);
  native.note({ file: "config.json", status: "done" });
  expect(send).toHaveBeenCalledTimes(4);
});
