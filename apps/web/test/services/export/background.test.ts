import { expect, test, vi } from "vitest";
import { backgroundExportGate } from "../../../src/services/export/background";

test("background GPU frames wait for a native gesture to finish, and cancellation releases the wait", async () => {
  vi.useFakeTimers();
  const controller = new AbortController(),
    gate = backgroundExportGate(controller.signal);
  try {
    window.dispatchEvent(new Event("pointerdown"));
    let completed = false;
    const waiting = gate.beforeFrame().then(() => {
      completed = true;
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(completed).toBe(false);
    window.dispatchEvent(new Event("pointerup"));
    await waiting;
    expect(completed).toBe(true);
    window.dispatchEvent(new Event("pointerdown"));
    const cancelled = gate.beforeFrame();
    const failure = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await failure;
  } finally {
    gate.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  }
});
