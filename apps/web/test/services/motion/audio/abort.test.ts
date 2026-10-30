import { expect, it, vi } from "vitest";
import { abortableAudio } from "../../../../src/services/motion/audio/abort";
it("retires a blocked native resume immediately and removes its abort listener", async () => {
  const controller = new AbortController(),
    remove = vi.spyOn(controller.signal, "removeEventListener"),
    task = abortableAudio(new Promise<void>(() => {}), controller.signal);
  controller.abort();
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});
it("returns native results/errors and leaves no listener on settlement", async () => {
  const controller = new AbortController(),
    remove = vi.spyOn(controller.signal, "removeEventListener");
  await expect(abortableAudio(Promise.resolve(3), controller.signal)).resolves.toBe(3);
  await expect(
    abortableAudio(Promise.reject(Error("native failure")), controller.signal),
  ).rejects.toThrow("native failure");
  expect(remove).toHaveBeenCalledTimes(2);
});
