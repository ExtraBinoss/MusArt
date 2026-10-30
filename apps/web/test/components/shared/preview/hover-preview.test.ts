import { afterEach, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { bindHoverPreview } from "../../../../src/components/shared/preview/hover-preview";
afterEach(() => vi.useRealTimers());
it("pauses during scroll and resolves a new virtual card under the stationary mouse after quiet time", () => {
  vi.useFakeTimers();
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      ({
        matches: query.includes("hover"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const surface = document.createElement("div");
  surface.innerHTML = "<button data-card>First</button><button data-card>Second</button>";
  document.body.append(surface);
  const [first, second] = [...surface.children] as HTMLElement[];
  let hit: Element | null = first!;
  const original = document.elementFromPoint;
  document.elementFromPoint = vi.fn(() => hit);
  const change = vi.fn(),
    intent = bindHoverPreview(surface, { selector: "[data-card]", onChange: change });
  try {
    fireEvent.pointerMove(first!, { pointerType: "mouse", clientX: 20, clientY: 30 });
    expect(change).toHaveBeenLastCalledWith(first);
    hit = second!;
    fireEvent.scroll(surface);
    expect(change).toHaveBeenLastCalledWith(null);
    fireEvent.scroll(surface);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(119);
    expect(change).toHaveBeenLastCalledWith(null);
    vi.advanceTimersByTime(1);
    expect(change).toHaveBeenLastCalledWith(second);
    fireEvent.scroll(surface);
    intent.dispose();
    vi.advanceTimersByTime(200);
    expect(change).toHaveBeenLastCalledWith(null);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    intent.dispose();
    surface.remove();
    document.elementFromPoint = original;
  }
});
