import { renderHook, act } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useSearchPlaceholder } from "../../../src/components/search/use-search-placeholder";
import type { SearchItem } from "../../../src/components/search/catalog/model";
const items: SearchItem[] = ["Contraste", "Flou gaussien"].map((label, index) => ({
  id: `effect:${index ? "blur" : "contrast"}`,
  label,
  category: "effects",
  terms: label,
  target: { kind: "effect", effect: "blur" },
}));
afterEach(() => {
  vi.useRealTimers();
});
function fixture(reduced = false) {
  vi.useFakeTimers();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  const input = document.createElement("input"),
    ref = { current: input },
    renders = vi.fn();
  const view = renderHook(
    ({ prefix = "Rechercher", reducedMotion = reduced }) => {
      renders();
      useSearchPlaceholder(ref, items, prefix, reducedMotion);
    },
    { initialProps: { prefix: "Rechercher", reducedMotion: reduced } },
  );
  return { input, renders, ...view };
}
test("types actual translated catalog labels without React commits and stops while typing or hidden", () => {
  const d = fixture();
  const renders = d.renders.mock.calls.length;
  act(() => vi.advanceTimersByTime(700));
  expect(d.input.placeholder).toBe("Rechercher Contraste…");
  expect(d.renders).toHaveBeenCalledTimes(renders);
  d.input.value = "blur";
  d.input.dispatchEvent(new Event("input"));
  expect(vi.getTimerCount()).toBe(0);
  d.input.value = "";
  d.input.dispatchEvent(new Event("input"));
  expect(vi.getTimerCount()).toBe(1);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(vi.getTimerCount()).toBe(0);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(vi.getTimerCount()).toBe(1);
  d.unmount();
  expect(vi.getTimerCount()).toBe(0);
  d.input.dispatchEvent(new Event("input"));
  document.dispatchEvent(new Event("visibilitychange"));
  expect(vi.getTimerCount()).toBe(0);
});
test("rotates hints, follows locale/reduced-motion updates and cleans every timer", () => {
  const d = fixture();
  act(() => vi.advanceTimersByTime(3400));
  expect(d.input.placeholder).toContain("Flou");
  d.rerender({ prefix: "Search", reducedMotion: true });
  expect(d.input.placeholder).toBe("Search Contraste…");
  expect(vi.getTimerCount()).toBe(0);
  d.unmount();
});
test("uses a static translated prefix if no catalog hints exist", () => {
  vi.useFakeTimers();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  const input = document.createElement("input");
  const d = renderHook(() => useSearchPlaceholder({ current: input }, [], "Find", true));
  expect(input.placeholder).toBe("Find…");
  expect(vi.getTimerCount()).toBe(0);
  d.unmount();
});
test("query-owner renders reuse hint selection without rescanning the catalog or resetting its clock", () => {
  const d = fixture(),
    find = vi.spyOn(items, "find");
  act(() => vi.advanceTimersByTime(130));
  const placeholder = d.input.placeholder;
  d.rerender({ prefix: "Rechercher", reducedMotion: false });
  expect(find).not.toHaveBeenCalled();
  expect(d.input.placeholder).toBe(placeholder);
  expect(vi.getTimerCount()).toBe(1);
  d.unmount();
});
