import { expect, test, vi } from "vitest";
import { waitForPresentation } from "../../../src/state/session/wait-for-presentation";
import type { UiPresentationPort } from "../../../src/state/session/ui-presentation";
function fixture() {
  let busy = true;
  const listeners = new Set<() => void>();
  const remove = vi.fn();
  const port: UiPresentationPort = {
    busy: () => busy,
    hold: () => () => {},
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        remove();
      };
    },
  };
  return {
    port,
    listeners,
    remove,
    idle() {
      busy = false;
      listeners.forEach((fn) => fn());
    },
  };
}
test("waits only for real presentation ownership, then releases its subscription", async () => {
  const f = fixture();
  const ready = vi.fn();
  const promise = waitForPresentation(f.port, new AbortController().signal).then(ready);
  await Promise.resolve();
  expect(ready).not.toHaveBeenCalled();
  f.idle();
  await promise;
  expect(ready).toHaveBeenCalledOnce();
  expect(f.listeners.size).toBe(0);
  expect(f.remove).toHaveBeenCalledOnce();
  await waitForPresentation(f.port, new AbortController().signal);
  await waitForPresentation(undefined, new AbortController().signal);
  expect(f.remove).toHaveBeenCalledOnce();
});
test("cancellation clears pending subscriptions and rejects instead of rendering after dismissal", async () => {
  const f = fixture(),
    abort = new AbortController();
  const promise = waitForPresentation(f.port, abort.signal);
  abort.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  expect(f.listeners.size).toBe(0);
  f.idle();
  await expect(waitForPresentation(f.port, abort.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
});
