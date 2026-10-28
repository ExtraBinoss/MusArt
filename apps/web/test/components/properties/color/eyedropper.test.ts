import { afterEach, expect, it, vi } from "vitest";
import {
  pickScreenColor,
  supportsEyeDropper,
} from "../../../../src/components/properties/color/eyedropper";
afterEach(() => vi.unstubAllGlobals());
it("requires both a secure context and native support; opening forwards the explicit abort signal", async () => {
  vi.stubGlobal("isSecureContext", false);
  vi.stubGlobal("EyeDropper", undefined);
  expect(supportsEyeDropper()).toBe(false);
  await expect(pickScreenColor(new AbortController().signal)).rejects.toThrow("unavailable");
  const open = vi.fn().mockResolvedValue({ sRGBHex: "#123456" });
  vi.stubGlobal(
    "EyeDropper",
    class {
      open = open;
    },
  );
  expect(supportsEyeDropper()).toBe(false);
  vi.stubGlobal("isSecureContext", true);
  expect(supportsEyeDropper()).toBe(true);
  expect(open).not.toHaveBeenCalled();
  const controller = new AbortController();
  expect(await pickScreenColor(controller.signal)).toEqual({ sRGBHex: "#123456" });
  expect(open).toHaveBeenCalledExactlyOnceWith({ signal: controller.signal });
});
