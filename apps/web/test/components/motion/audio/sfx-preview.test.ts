import { afterEach, expect, it, vi } from "vitest";
import {
  createSfxPreview,
  type SfxPreviewState,
} from "../../../../src/components/motion/audio/sfx-preview";
import shapes from "../../../../src/services/motion/audio/bank/shapes.json";
import type { BankPort, BankShapeData } from "../../../../src/services/motion/audio/bank/model";
afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers();
  const port = {
      open: vi.fn(),
      close: vi.fn(),
      preview: vi.fn(async () => {}),
      stop: vi.fn(),
      clock: vi.fn(),
      atlas: vi.fn(),
    } as unknown as BankPort,
    preview = createSfxPreview(port, shapes as BankShapeData),
    notify = vi.fn<(state: SfxPreviewState) => void>();
  preview.subscribe(notify);
  const owner = preview.open();
  return { port, preview, owner, notify };
}
it("uses a short intent gate, keeps Play synchronous, and retires the exact playback token on leave", async () => {
  const d = fixture();
  d.preview.hover(d.owner, "soft-plop");
  await vi.advanceTimersByTimeAsync(34);
  expect(d.port.preview).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(d.port.preview).toHaveBeenCalledWith(
    d.owner,
    expect.objectContaining({ kind: "bank-playback" }),
    "soft-plop",
    false,
  );
  expect(d.notify).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: "soft-plop", status: "ready" }),
  );
  const state = d.preview.read()!;
  d.preview.leave(d.owner, "soft-plop");
  expect(d.port.stop).toHaveBeenCalledWith(d.owner, state.playback);
  d.preview.play(d.owner, "glass-chime");
  expect(d.port.preview).toHaveBeenLastCalledWith(d.owner, expect.any(Object), "glass-chime", true);
  d.preview.close(d.owner);
  expect(vi.getTimerCount()).toBe(0);
});
it("suppresses accidental sounds during catalog scrolling but accepts explicit focus/Play", async () => {
  const d = fixture();
  d.preview.hover(d.owner, "soft-plop");
  d.preview.scroll(d.owner);
  d.preview.hover(d.owner, "glass-chime");
  await vi.advanceTimersByTimeAsync(90);
  expect(d.port.preview).not.toHaveBeenCalled();
  d.preview.hover(d.owner, "glass-chime", true);
  await vi.advanceTimersByTimeAsync(35);
  expect(d.port.preview).toHaveBeenCalledOnce();
  d.preview.close(d.owner);
});
it("old bank cleanup and late preparations cannot stop or paint a newer owner", async () => {
  const d = fixture();
  let finish!: () => void;
  vi.mocked(d.port.preview).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  d.preview.play(d.owner, "soft-plop");
  d.preview.close(d.owner);
  const owner = d.preview.open();
  d.preview.play(owner, "glass-chime");
  const calls = vi.mocked(d.port.stop).mock.calls.length;
  d.preview.stop(d.owner);
  d.preview.close(d.owner);
  expect(d.port.stop).toHaveBeenCalledTimes(calls);
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(d.preview.read()).toMatchObject({ owner, id: "glass-chime", status: "ready" });
  d.preview.close(owner);
});
it("reports blocked native audio without a false ready state and cancels intent-only preparation", async () => {
  const d = fixture();
  vi.mocked(d.port.preview).mockRejectedValueOnce(
    new DOMException("Press Play", "NotAllowedError"),
  );
  d.preview.play(d.owner, "soft-plop");
  await vi.advanceTimersByTimeAsync(0);
  expect(d.preview.read()).toMatchObject({ status: "blocked" });
  d.preview.close(d.owner);
  const intent = d.preview.warm();
  d.preview.closeIntent();
  expect(d.port.close).toHaveBeenLastCalledWith(intent);
  expect(vi.getTimerCount()).toBe(0);
});
