import { afterEach, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { animate } from "motion/mini";
import { useRowPosition } from "../../../../src/components/layers/rows/use-row-position";
vi.mock("motion/mini", () => ({ animate: vi.fn(() => ({ stop: vi.fn() })) }));
const originalAnimation = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
afterEach(() => {
  if (originalAnimation) Object.defineProperty(Element.prototype, "animate", originalAnimation);
  else Reflect.deleteProperty(Element.prototype, "animate");
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("scrolling, reduced motion, unchanged positions and recycled owners never start animation", () => {
  const node = { current: document.createElement("div") };
  const view = renderHook(
    ({ owner, top, moving, reduced }) => useRowPosition(node, owner, top, moving, reduced),
    {
      initialProps: { owner: "a", top: 0, moving: false, reduced: false },
    },
  );
  view.rerender({ owner: "a", top: 36, moving: false, reduced: false });
  view.rerender({ owner: "a", top: 72, moving: true, reduced: true });
  view.rerender({ owner: "b", top: 108, moving: true, reduced: false });
  view.rerender({ owner: "b", top: 108, moving: true, reduced: false });
  view.rerender({ owner: "b", top: 144, moving: true, reduced: false });
  expect(animate).not.toHaveBeenCalled();
  view.unmount();
  renderHook(() => useRowPosition({ current: null }, "none", 0, true, false));
});
test("drag interruption carries its actual offset, cancellation and unmount release the animation", () => {
  vi.stubGlobal(
    "DOMMatrixReadOnly",
    class {
      m42 = 7;
    },
  );
  const node = { current: document.createElement("div") };
  document.body.append(node.current);
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: vi.fn() });
  const view = renderHook(({ top, moving }) => useRowPosition(node, "a", top, moving, false), {
    initialProps: { top: 0, moving: true },
  });
  view.rerender({ top: 36, moving: true });
  expect(animate).toHaveBeenLastCalledWith(
    node.current,
    { transform: ["translateY(-36px)", "translateY(0px)"] },
    expect.any(Object),
  );
  node.current.style.transform = "matrix(1, 0, 0, 1, 0, 7)";
  view.rerender({ top: 72, moving: true });
  expect(animate).toHaveBeenLastCalledWith(
    node.current,
    { transform: ["translateY(-29px)", "translateY(0px)"] },
    expect.any(Object),
  );
  view.rerender({ top: 0, moving: false });
  expect(node.current.style.transform).toBe("");
  view.rerender({ top: 36, moving: true });
  view.unmount();
  for (const call of vi.mocked(animate).mock.results)
    expect(call.value.stop).toHaveBeenCalledOnce();
  node.current.remove();
});
