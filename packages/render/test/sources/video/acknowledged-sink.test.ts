import { expect, test, vi } from "vitest";
import type { VideoSampleSink } from "mediabunny";
import { acknowledgeVideoSink } from "../../../src/sources/video/acknowledged-sink";
import { deferred } from "./fixtures";
function decoder() {
  const value = { decoder: { state: "configured" }, close: vi.fn() };
  value.close.mockImplementation(() => {
    value.decoder.state = "closed";
  });
  return value;
}
test("uses only an instance-local pinned hook and acknowledges the actual native close exactly once", async () => {
  const control = decoder(),
    sink = { _createDecoder: vi.fn(async () => control) };
  const nativeClose = control.close;
  const tracked = acknowledgeVideoSink(sink as unknown as VideoSampleSink);
  expect(await sink._createDecoder()).toBe(control);
  await tracked.close();
  await tracked.close();
  expect(control.decoder.state).toBe("closed");
  expect(nativeClose).toHaveBeenCalledTimes(1);
  control.close();
  expect(nativeClose).toHaveBeenCalledTimes(1);
  expect(control.decoder.state).toBe("closed");
  await expect(sink._createDecoder()).rejects.toMatchObject({ code: "closed" });
});
test("waits for an opening decoder then closes it rather than releasing its budget before acknowledgement", async () => {
  const opening = deferred<ReturnType<typeof decoder>>(),
    sink = { _createDecoder: () => opening.promise };
  const tracked = acknowledgeVideoSink(sink as unknown as VideoSampleSink),
    created = sink._createDecoder();
  let done = false;
  const close = tracked.close().then(() => {
    done = true;
  });
  await Promise.resolve();
  expect(done).toBe(false);
  const control = decoder();
  opening.resolve(control);
  await expect(created).rejects.toMatchObject({ code: "closed" });
  await close;
  expect(control.decoder.state).toBe("closed");
});
test("fails closed for incompatible hooks or non-native cleanup shapes", async () => {
  expect(() => acknowledgeVideoSink({} as VideoSampleSink)).toThrow("1.62.1");
  const close = vi.fn(),
    sink = { _createDecoder: async () => ({ close }) },
    tracked = acknowledgeVideoSink(sink as unknown as VideoSampleSink);
  await expect(sink._createDecoder()).rejects.toMatchObject({ code: "unsupported" });
  expect(close).toHaveBeenCalledOnce();
  await tracked.close();
});
