import { beforeEach, expect, it, vi } from "vitest";
import type { StreamTargetChunk } from "mediabunny";
import { createMotionOutputTarget } from "../../../src/export/motion/target";
const state = vi.hoisted(() => ({ streams: [] as WritableStream<StreamTargetChunk>[] }));
vi.mock("mediabunny", () => ({
  StreamTarget: class {
    constructor(stream: WritableStream<StreamTargetChunk>) {
      state.streams.push(stream);
    }
  },
}));
beforeEach(() => {
  state.streams.length = 0;
});
const chunk = (position: number, values: number[]): StreamTargetChunk => ({
  type: "write",
  position,
  data: new Uint8Array(values),
});
const bytes = (blob: Blob) =>
  new Promise<number[]>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve([...new Uint8Array(reader.result as ArrayBuffer)]);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

it("writes by absolute byte position, preserves holes/rewrites and finalizes a bounded Blob", async () => {
  const output = createMotionOutputTarget({ maxBytes: 100 });
  const writer = state.streams[0]!.getWriter();
  await writer.write(chunk(2, [1, 2, 3]));
  await writer.write(chunk(3, [9]));
  expect(output.bytes()).toBe(5);
  expect(() => output.blob("video/mp4")).toThrow(/complete/);
  await writer.close();
  const blob = output.blob("video/mp4")!;
  expect(blob.type).toBe("video/mp4");
  expect(await bytes(blob)).toEqual([0, 0, 1, 9, 3]);
  await output.dispose();
});
it("checks quota before allocation or external writes and aborts a caller's writer on failure", async () => {
  const write = vi.fn(),
    abort = vi.fn(),
    close = vi.fn();
  const external = new WritableStream<StreamTargetChunk>({ write, abort, close });
  const output = createMotionOutputTarget({ output: external, maxBytes: 4 });
  const writer = state.streams[0]!.getWriter();
  await expect(writer.write(chunk(0, [1, 2, 3, 4, 5]))).rejects.toMatchObject({
    code: "outputLimit",
  });
  expect(write).not.toHaveBeenCalled();
  const reason = new Error("quota");
  await output.abort(reason);
  await output.dispose(reason);
  expect(abort).toHaveBeenCalledOnce();
  expect(abort).toHaveBeenCalledWith(reason);
  expect(close).not.toHaveBeenCalled();
  expect(external.locked).toBe(false);
});
it("propagates writable backpressure, closes successful streams and never manufactures an in-memory Blob", async () => {
  let resolve!: () => void;
  const gate = new Promise<void>((done) => {
    resolve = done;
  });
  const close = vi.fn();
  const external = new WritableStream<StreamTargetChunk>({ write: () => gate, close });
  const output = createMotionOutputTarget({ output: external });
  const writer = state.streams[0]!.getWriter();
  let done = false;
  const pending = writer.write(chunk(0, [1])).then(() => {
    done = true;
  });
  await Promise.resolve();
  expect(done).toBe(false);
  resolve();
  await pending;
  await writer.close();
  expect(close).toHaveBeenCalledOnce();
  expect(output.blob("video/webm")).toBeNull();
  expect(external.locked).toBe(false);
  await output.dispose();
});
