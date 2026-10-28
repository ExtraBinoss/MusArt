import { Profiler } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ScrollShadow } from "../../../../src/components/shared/scroll/ScrollShadow";
afterEach(() => vi.unstubAllGlobals());
test("surface colors can be explicit or inherited without overwriting viewport styles", () => {
  const view = render(
    <ScrollShadow surface="var(--popover)" style={{ height: 120 }}>
      <div role="list" />
    </ScrollShadow>,
  );
  const root = screen.getByRole("list").parentElement!;
  expect(root.style.getPropertyValue("--scroll-shadow-surface")).toBe("var(--popover)");
  expect(root.style.height).toBe("120px");
  view.rerender(
    <ScrollShadow style={{ height: 80 }}>
      <div role="list" />
    </ScrollShadow>,
  );
  expect(root.style.getPropertyValue("--scroll-shadow-surface")).toBe("");
  expect(root.style.height).toBe("80px");
});
test("scroll boundaries update shadows imperatively, preserve the viewport, and clean observers/listeners", async () => {
  let resize!: ResizeObserverCallback;
  const disconnect = vi.fn(),
    observe = vi.fn(),
    renders = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const onScroll = vi.fn();
  const view = render(
    <Profiler id="scroll" onRender={renders}>
      <ScrollShadow>
        <div role="list" onScroll={onScroll}>
          <div>Content</div>
        </div>
      </ScrollShadow>
    </Profiler>,
  );
  const viewport = screen.getByRole("list"),
    root = viewport.parentElement!;
  Object.defineProperties(viewport, {
    scrollHeight: { value: 500, configurable: true },
    clientHeight: { value: 100, configurable: true },
  });
  const baseline = renders.mock.calls.length;
  fireEvent.scroll(viewport);
  expect(root).toHaveAttribute("data-overflow-bottom");
  expect(root).not.toHaveAttribute("data-overflow-top");
  fireEvent.scroll(viewport, { target: { scrollTop: 200 } });
  expect(root).toHaveAttribute("data-overflow-top");
  expect(root).toHaveAttribute("data-overflow-bottom");
  fireEvent.scroll(viewport, { target: { scrollTop: 400 } });
  expect(root).not.toHaveAttribute("data-overflow-bottom");
  expect(onScroll).toHaveBeenCalledTimes(3);
  expect(renders).toHaveBeenCalledTimes(baseline);
  act(() => resize([], {} as ResizeObserver));
  await act(async () => {
    viewport.append(document.createElement("div"));
    await Promise.resolve();
  });
  expect(observe).toHaveBeenCalledWith(viewport.lastElementChild);
  const remove = vi.spyOn(viewport, "removeEventListener");
  view.unmount();
  expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  expect(disconnect).toHaveBeenCalled();
});
test("changing the viewport type rebinds observation to the new element", () => {
  const view = render(
    <ScrollShadow>
      <div key="first" role="list" />
    </ScrollShadow>,
  );
  const old = screen.getByRole("list"),
    remove = vi.spyOn(old, "removeEventListener");
  view.rerender(
    <ScrollShadow>
      <section key="second" role="list" />
    </ScrollShadow>,
  );
  expect(screen.getByRole("list").tagName).toBe("SECTION");
  expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
});

test("child mutation observation defers boundary measurements until the browser resize phase", async () => {
  let resize!: ResizeObserverCallback;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const view = render(
      <ScrollShadow>
        <div role="list">
          <div>First</div>
        </div>
      </ScrollShadow>,
    ),
    viewport = screen.getByRole("list"),
    height = vi.fn(() => 100),
    scrollHeight = vi.fn(() => 500);
  Object.defineProperties(viewport, {
    clientHeight: { get: height, configurable: true },
    scrollHeight: { get: scrollHeight, configurable: true },
  });
  await act(async () => {
    viewport.append(document.createElement("div"));
    await Promise.resolve();
  });
  expect(height).not.toHaveBeenCalled();
  expect(scrollHeight).not.toHaveBeenCalled();
  act(() => resize([], {} as ResizeObserver));
  expect(height).toHaveBeenCalledOnce();
  expect(viewport.parentElement).toHaveAttribute("data-overflow-bottom");
  view.unmount();
});
