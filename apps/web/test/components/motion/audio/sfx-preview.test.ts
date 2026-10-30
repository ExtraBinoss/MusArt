import { afterEach, expect, it, vi } from "vitest";
import {
  createSfxPreview,
  type SfxPreviewState,
} from "../../../../src/components/motion/audio/sfx-preview";
afterEach(() => vi.useRealTimers());
function setup() {
  vi.useFakeTimers();
  const notify = vi.fn<(s: SfxPreviewState) => void>(),
    port = {
      previewPreset: vi.fn(async () => {}),
      stopPreview: vi.fn(),
      preparation: { sfxWaveform: vi.fn(async () => new Float32Array([0, 0.5, 0])) },
    };
  return { port, notify, preview: createSfxPreview(port, notify) };
}
it("debounces hover, renders genuine worker peaks and stops immediately on leave", async () => {
  const d = setup();
  d.preview.hover("soft-plop");
  await vi.advanceTimersByTimeAsync(149);
  expect(d.port.previewPreset).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(d.port.previewPreset).toHaveBeenCalledWith("soft-plop", false);
  expect(d.notify).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: "soft-plop", status: "ready", peaks: expect.any(Float32Array) }),
  );
  d.preview.leave("soft-plop");
  expect(d.notify).toHaveBeenLastCalledWith({ id: null, status: "idle" });
  expect(vi.getTimerCount()).toBe(0);
});
it("keeps explicit Play synchronous to the browser gesture and replaces pending hovers", async () => {
  const d = setup();
  d.preview.hover("soft-plop");
  d.preview.play("glass-chime");
  expect(d.port.previewPreset).toHaveBeenCalledWith("glass-chime", true);
  await vi.advanceTimersByTimeAsync(200);
  expect(d.port.previewPreset).toHaveBeenCalledOnce();
  d.preview.stop();
});
it("discards retired results, blocked audio is actionable, and close cancels pending work", async () => {
  const d = setup();
  let release!: (v: Float32Array<ArrayBuffer>) => void;
  d.port.preparation.sfxWaveform.mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  d.port.previewPreset.mockRejectedValueOnce(new DOMException("Press Play", "NotAllowedError"));
  d.preview.play("soft-plop");
  await vi.advanceTimersByTimeAsync(0);
  expect(d.notify).toHaveBeenLastCalledWith(expect.objectContaining({ status: "blocked" }));
  d.preview.stop();
  const calls = d.notify.mock.calls.length;
  release(new Float32Array([1]));
  await vi.advanceTimersByTimeAsync(0);
  expect(d.notify).toHaveBeenCalledTimes(calls);
  d.preview.hover("glass-chime");
  d.preview.stop(false);
  await vi.advanceTimersByTimeAsync(200);
  expect(d.port.previewPreset).toHaveBeenCalledOnce();
});

it("preserves a genuine waveform failure and stops audio instead of overwriting it with ready", async () => {
  const d = setup();
  d.port.preparation.sfxWaveform.mockRejectedValueOnce(Error("Waveform preparation failed"));
  d.preview.play("soft-plop");
  await vi.advanceTimersByTimeAsync(0);
  expect(d.notify).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: "error", error: "Waveform preparation failed" }),
  );
  expect(d.port.stopPreview).toHaveBeenCalled();
  d.preview.stop();
});
