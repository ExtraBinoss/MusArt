import { expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMobileLayout } from "../../../../src/components/workspace/mobile/use-mobile";
test("responds only to breakpoint changes and removes its media subscription", () => {
  let matches = false;
  const listeners = new Set<() => void>();
  vi.spyOn(window, "matchMedia").mockImplementation(
    () =>
      ({
        get matches() {
          return matches;
        },
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      }) as unknown as MediaQueryList,
  );
  const view = renderHook(useMobileLayout);
  expect(view.result.current).toBe(false);
  act(() => {
    matches = true;
    for (const fn of Array.from(listeners)) fn();
  });
  expect(view.result.current).toBe(true);
  view.unmount();
  expect(listeners.size).toBe(0);
});
