import { afterEach, expect, test, vi } from "vitest";
import type { Page } from "@playwright/test";
import { installReadbackProbe } from "./readback-probe";
afterEach(() => {
  delete window.__musartVideoReadbacks;
  vi.unstubAllGlobals();
});
async function install() {
  let initialize!: () => void;
  const page = {
    addInitScript: async (fn: () => void) => {
      initialize = fn;
    },
  } as unknown as Page;
  vi.stubGlobal(
    "CanvasRenderingContext2D",
    class {
      getImageData() {
        return null;
      }
    },
  );
  await installReadbackProbe(page);
  initialize();
  return window.__musartVideoReadbacks!;
}
test("counts actual VideoFrame pixel copies on native and wrapped instances, never allocationSize", async () => {
  let copies = 0;
  class NativeFrame {
    copyTo(_destination: Uint8Array) {
      copies++;
      return Promise.resolve([]);
    }
    allocationSize() {
      return 4;
    }
  }
  class WrappedFrame extends NativeFrame {}
  vi.stubGlobal("VideoFrame", WrappedFrame);
  const probe = await install();
  const native = new NativeFrame(),
    wrapped = new WrappedFrame();
  native.allocationSize();
  wrapped.allocationSize();
  expect(probe.videoFrame).toBe(0);
  expect(probe.videoFrameHook).toBe(true);
  await native.copyTo(new Uint8Array(4));
  await wrapped.copyTo(new Uint8Array(4));
  expect(copies).toBe(2);
  expect(probe.videoFrame).toBe(2);
});
test("reports an absent native frame API honestly", async () => {
  vi.stubGlobal("VideoFrame", undefined);
  const probe = await install();
  expect(probe.videoFrameHook).toBe(false);
  expect(probe.videoFrame).toBe(0);
});
