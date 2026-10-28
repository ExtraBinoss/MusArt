import { act, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useRef, useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useExpansion } from "../../../../src/components/layers/tree/use-expansion";

const animation = vi.hoisted(() => ({ animate: vi.fn() }));
vi.mock("motion", () => ({ animate: animation.animate }));
const nativeAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
const scope = {};
beforeEach(() => {
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: vi.fn() });
  animation.animate.mockReset().mockImplementation(() => ({ stop: vi.fn() }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return new DOMRect(
      0,
      parseFloat(this.style.top) || 0,
      200,
      parseFloat(this.style.height) || 36,
    );
  });
});
afterEach(() => {
  if (nativeAnimate) Object.defineProperty(Element.prototype, "animate", nativeAnimate);
  else Reflect.deleteProperty(Element.prototype, "animate");
});
function Host({ disabled = false, document = scope }: { disabled?: boolean; document?: object }) {
  const [expanded, setExpanded] = useState(true),
    viewport = useRef<HTMLDivElement>(null);
  const root = { key: "root", kind: "layer" },
    child = { key: "child", kind: "layer" };
  const entries = expanded ? [root, child] : [root];
  const expansion = useExpansion(
    entries.map((entry, at) => ({ entry, at })),
    entries,
    entries.length * 36,
    document,
    viewport,
    disabled,
  );
  return (
    <div ref={viewport}>
      <button
        onClick={() => {
          expansion.begin("root");
          setExpanded((value) => !value);
        }}
      >
        Toggle
      </button>
      <button onClick={expansion.cancel}>Scroll or drag</button>
      <div className="layer-tree-window" style={{ height: entries.length * 36 }}>
        {expansion.items.map(({ entry, at }) => (
          <div
            key={entry.key}
            data-layer-tree-key={entry.key}
            data-testid={entry.key}
            style={{ position: "absolute", top: at * 36 }}
          >
            {entry.key}
          </div>
        ))}
      </div>
    </div>
  );
}
test("retains inert exits only until Motion completes, animates new children, and cancels without polling", async () => {
  const view = render(createElement(Host));
  const child = screen.getByTestId("child");
  fireEvent.click(screen.getByText("Toggle"));
  expect(screen.getByTestId("child")).toBe(child);
  expect(child).toHaveAttribute("inert");
  expect(child).toHaveAttribute("aria-hidden", "true");
  const calls = animation.animate.mock.calls;
  expect(calls.some((call) => call[0] === child && call[1].height[1] === 0)).toBe(true);
  await act(() => calls.at(-1)![2].onComplete());
  expect(screen.queryByTestId("child")).toBeNull();
  expect(
    animation.animate.mock.results.every((result) => result.value.stop.mock.calls.length),
  ).toBe(true);
  animation.animate.mockClear();
  fireEvent.click(screen.getByText("Toggle"));
  expect(animation.animate.mock.calls.some((call) => call[1].opacity?.[0] === 0)).toBe(true);
  fireEvent.click(screen.getByText("Scroll or drag"));
  expect(document.querySelector("[data-expanding]")).toBeNull();
  view.unmount();
});

test("a canonical height change during animation cannot be overwritten by the old cleanup", () => {
  function Fixture({ count, documentScope = scope }: { count: number; documentScope?: object }) {
    const [open, setOpen] = useState(true),
      viewport = useRef<HTMLDivElement>(null);
    const entries = Array.from({ length: open ? count : 1 }, (_, at) => ({
      key: `row-${at}`,
      kind: "layer",
    }));
    const expansion = useExpansion(
      entries.map((entry, at) => ({ entry, at })),
      entries,
      entries.length * 36,
      documentScope,
      viewport,
      false,
    );
    return (
      <div ref={viewport}>
        <button
          onClick={() => {
            expansion.begin("row-0");
            setOpen((value) => !value);
          }}
        >
          Change
        </button>
        <div className="layer-tree-window" style={{ height: entries.length * 36 }}>
          {expansion.items.map(({ entry, at }) => (
            <div key={entry.key} data-layer-tree-key={entry.key} style={{ top: at * 36 }} />
          ))}
        </div>
      </div>
    );
  }
  const view = render(<Fixture count={2} />);
  fireEvent.click(screen.getByText("Change"));
  fireEvent.click(screen.getByText("Change"));
  const tree = document.querySelector<HTMLElement>(".layer-tree-window")!;
  expect(tree).toHaveAttribute("data-expanding", "true");
  view.rerender(<Fixture count={5} documentScope={{}} />);
  expect(tree.style.height).toBe("180px");
  view.unmount();
});
test("reduced motion, absent native animation, foreign documents and unmount do not retain animation work", () => {
  const view = render(createElement(Host, { disabled: true }));
  fireEvent.click(screen.getByText("Toggle"));
  expect(screen.queryByTestId("child")).toBeNull();
  expect(animation.animate).not.toHaveBeenCalled();
  view.rerender(createElement(Host));
  fireEvent.click(screen.getByText("Toggle"));
  expect(animation.animate).toHaveBeenCalled();
  view.rerender(createElement(Host, { document: {} }));
  expect(document.querySelector("[data-expanding]")).toBeNull();
  Reflect.deleteProperty(Element.prototype, "animate");
  animation.animate.mockClear();
  fireEvent.click(screen.getByText("Toggle"));
  expect(animation.animate).not.toHaveBeenCalled();
  view.unmount();
});
