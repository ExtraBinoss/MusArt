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
test("an explicit selector finds a native viewport after sibling component metadata", () => {
  const observe = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = observe;
      disconnect() {}
    },
  );
  render(
    <ScrollShadow viewportSelector="[data-native-viewport]">
      <>
        <style>{".metadata {}"}</style>
        <div data-native-viewport role="list" />
      </>
    </ScrollShadow>,
  );
  expect(observe).toHaveBeenCalledWith(screen.getByRole("list"));
  expect(observe).not.toHaveBeenCalledWith(document.querySelector("style"));
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
  act(() => resize([], {} as ResizeObserver));
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

test("keeps fades above scrollbars and caches layout measurements between resize notifications", () => {
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
        <div role="list" />
      </ScrollShadow>,
    ),
    viewport = screen.getByRole("list"),
    root = viewport.parentElement!,
    height = vi.fn(() => 100),
    scrollHeight = vi.fn(() => 500);
  Object.defineProperties(viewport, {
    clientHeight: { get: height, configurable: true },
    scrollHeight: { get: scrollHeight, configurable: true },
    clientWidth: { value: 200, configurable: true },
    scrollWidth: { value: 500, configurable: true },
    offsetHeight: { value: 108, configurable: true },
    offsetWidth: { value: 208, configurable: true },
  });
  act(() => resize([], {} as ResizeObserver));
  expect(root.style.getPropertyValue("--scroll-shadow-scrollbar-bottom")).toBe("8px");
  expect(root.style.getPropertyValue("--scroll-shadow-scrollbar-right")).toBe("8px");
  height.mockClear();
  scrollHeight.mockClear();
  fireEvent.scroll(viewport, { target: { scrollTop: 200 } });
  expect(root).toHaveAttribute("data-overflow-bottom");
  expect(height).not.toHaveBeenCalled();
  expect(scrollHeight).not.toHaveBeenCalled();
  Object.defineProperties(viewport, {
    offsetHeight: { value: 100 },
    offsetWidth: { value: 200 },
  });
  act(() => resize([], {} as ResizeObserver));
  expect(root.style.getPropertyValue("--scroll-shadow-scrollbar-bottom")).toBe("6px");
  expect(root.style.getPropertyValue("--scroll-shadow-scrollbar-right")).toBe("6px");
  view.unmount();
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

test("both axes decorate the existing viewport without layout reads or React renders on scroll", () => {
  let resize!: ResizeObserverCallback;
  const observe = vi.fn(),
    renders = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe = observe;
      disconnect() {}
    },
  );
  const view = render(
      <Profiler id="both" onRender={renders}>
        <ScrollShadow axis="both">
          <div role="list">
            <div>Content</div>
          </div>
        </ScrollShadow>
      </Profiler>,
    ),
    viewport = screen.getByRole("list"),
    root = viewport.parentElement!,
    height = vi.fn(() => 100),
    width = vi.fn(() => 200),
    scrollHeight = vi.fn(() => 500),
    scrollWidth = vi.fn(() => 800);
  Object.defineProperties(viewport, {
    clientHeight: { get: height, configurable: true },
    clientWidth: { get: width, configurable: true },
    scrollHeight: { get: scrollHeight, configurable: true },
    scrollWidth: { get: scrollWidth, configurable: true },
    offsetHeight: { value: 108, configurable: true },
    offsetWidth: { value: 208, configurable: true },
  });
  expect(root.firstElementChild).toBe(viewport);
  expect(root.childElementCount).toBe(3);
  expect(root.querySelector(".scroll-shadow-inline-start")).toHaveAttribute("aria-hidden", "true");
  expect(root.querySelector(".scroll-shadow-inline-end")).toHaveAttribute("aria-hidden", "true");
  expect(observe).not.toHaveBeenCalledWith(root.lastElementChild);
  act(() => resize([], {} as ResizeObserver));
  expect(root).toHaveAttribute("data-overflow-right");
  expect(root).toHaveAttribute("data-overflow-bottom");
  expect(root).not.toHaveAttribute("data-overflow-left");
  expect(root).not.toHaveAttribute("data-overflow-top");
  expect(root.style.getPropertyValue("--scroll-shadow-scrollbar-right")).toBe("8px");
  expect(root.style.getPropertyValue("--scroll-shadow-scrollbar-bottom")).toBe("8px");
  const baseline = renders.mock.calls.length;
  for (const measure of [height, width, scrollHeight, scrollWidth]) measure.mockClear();
  fireEvent.scroll(viewport, { target: { scrollTop: 150, scrollLeft: 250 } });
  for (const side of ["left", "right", "top", "bottom"])
    expect(root).toHaveAttribute(`data-overflow-${side}`);
  fireEvent.scroll(viewport, { target: { scrollTop: 400, scrollLeft: 600 } });
  expect(root).not.toHaveAttribute("data-overflow-bottom");
  expect(root).not.toHaveAttribute("data-overflow-right");
  expect(root).toHaveAttribute("data-overflow-left");
  expect(root).toHaveAttribute("data-overflow-top");
  expect(renders).toHaveBeenCalledTimes(baseline);
  for (const measure of [height, width, scrollHeight, scrollWidth])
    expect(measure).not.toHaveBeenCalled();
  view.unmount();
});

test("axis changes clear retired flags, preserve vertical defaults and remeasure resized overflow", () => {
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
      <ScrollShadow axis="both">
        <div role="list" />
      </ScrollShadow>,
    ),
    viewport = screen.getByRole("list"),
    root = viewport.parentElement!;
  Object.defineProperties(viewport, {
    clientHeight: { value: 100, configurable: true },
    scrollHeight: { value: 500, configurable: true },
    clientWidth: { value: 200, configurable: true },
    scrollWidth: { value: 800, configurable: true },
    offsetHeight: { value: 100 },
    offsetWidth: { value: 200 },
  });
  act(() => resize([], {} as ResizeObserver));
  fireEvent.scroll(viewport, { target: { scrollTop: 200, scrollLeft: 300 } });
  view.rerender(
    <ScrollShadow axis="horizontal">
      <div role="list" />
    </ScrollShadow>,
  );
  expect(root).toHaveAttribute("data-scroll-shadow-axis", "horizontal");
  for (const side of ["left", "right", "top", "bottom"])
    expect(root).not.toHaveAttribute(`data-overflow-${side}`);
  act(() => resize([], {} as ResizeObserver));
  expect(root).toHaveAttribute("data-overflow-left");
  expect(root).toHaveAttribute("data-overflow-right");
  expect(root).not.toHaveAttribute("data-overflow-top");
  expect(root).not.toHaveAttribute("data-overflow-bottom");
  expect(root.style.getPropertyValue("--scroll-shadow-scrollbar-right")).toBe("6px");
  expect(root.style.getPropertyValue("--scroll-shadow-scrollbar-bottom")).toBe("6px");
  Object.defineProperties(viewport, { scrollWidth: { value: 200 }, scrollHeight: { value: 100 } });
  fireEvent.scroll(viewport, { target: { scrollLeft: 0, scrollTop: 0 } });
  act(() => resize([], {} as ResizeObserver));
  expect(root).not.toHaveAttribute("data-overflow-left");
  expect(root).not.toHaveAttribute("data-overflow-right");
  expect(root.style.getPropertyValue("--scroll-shadow-scrollbar-right")).toBe("0px");
  expect(root.style.getPropertyValue("--scroll-shadow-scrollbar-bottom")).toBe("0px");
  view.rerender(
    <ScrollShadow>
      <div role="list" />
    </ScrollShadow>,
  );
  expect(root).toHaveAttribute("data-scroll-shadow-axis", "vertical");
  act(() => resize([], {} as ResizeObserver));
  expect(root).not.toHaveAttribute("data-overflow-left");
  expect(root).not.toHaveAttribute("data-overflow-right");
  view.unmount();
});

test("a missing or non-HTML viewport installs no observers and a later valid selector can bind", () => {
  const construct = vi.fn(),
    observe = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor() {
        construct();
      }
      observe = observe;
      disconnect() {}
    },
  );
  const view = render(
    <ScrollShadow axis="horizontal" viewportSelector=".missing">
      <div role="list" />
    </ScrollShadow>,
  );
  expect(construct).not.toHaveBeenCalled();
  view.rerender(
    <ScrollShadow axis="horizontal" viewportSelector="[role=list]">
      <div role="list" />
    </ScrollShadow>,
  );
  expect(observe).toHaveBeenCalledWith(screen.getByRole("list"));
  view.rerender(
    <ScrollShadow axis="both">
      <svg role="img" />
    </ScrollShadow>,
  );
  expect(construct).toHaveBeenCalledOnce();
  view.unmount();
});

test("retired observer deliveries perform no reads, observations or shadow writes after cleanup", () => {
  let resize!: ResizeObserverCallback, mutate!: MutationCallback;
  const observe = vi.fn(),
    resizeDisconnect = vi.fn(),
    mutationDisconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe = observe;
      disconnect = resizeDisconnect;
    },
  );
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback: MutationCallback) {
        mutate = callback;
      }
      observe() {}
      disconnect = mutationDisconnect;
    },
  );
  const view = render(
      <ScrollShadow axis="both">
        <div role="list" />
      </ScrollShadow>,
    ),
    viewport = screen.getByRole("list"),
    root = viewport.parentElement!,
    width = vi.fn(() => 200);
  Object.defineProperty(viewport, "clientWidth", { get: width, configurable: true });
  const remove = vi.spyOn(viewport, "removeEventListener"),
    toggle = vi.spyOn(root, "toggleAttribute");
  view.unmount();
  observe.mockClear();
  act(() => {
    resize([], {} as ResizeObserver);
    mutate([], {} as MutationObserver);
  });
  expect(width).not.toHaveBeenCalled();
  expect(observe).not.toHaveBeenCalled();
  expect(toggle).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  expect(resizeDisconnect).toHaveBeenCalled();
  expect(mutationDisconnect).toHaveBeenCalledOnce();
});

test("two-axis fades track horizontal boundaries without React/layout reads and clear native scrollbar gutters", () => {
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
  const renders = vi.fn();
  const view = render(
    <Profiler id="axes" onRender={renders}>
      <ScrollShadow axis="both">
        <div role="list" />
      </ScrollShadow>
    </Profiler>,
  );
  const viewport = screen.getByRole("list"),
    root = viewport.parentElement!;
  const width = vi.fn(() => 390),
    scrollWidth = vi.fn(() => 1400);
  Object.defineProperties(viewport, {
    clientWidth: { get: width },
    scrollWidth: { get: scrollWidth },
    clientHeight: { value: 200 },
    scrollHeight: { value: 600 },
    offsetWidth: { value: 398 },
    offsetHeight: { value: 208 },
  });
  act(() => resize([], {} as ResizeObserver));
  expect(root).toHaveAttribute("data-overflow-right");
  expect(root).not.toHaveAttribute("data-overflow-left");
  expect(root).toHaveAttribute("data-overflow-bottom");
  expect(root.querySelectorAll(".scroll-shadow-side")).toHaveLength(2);
  expect(root.style.getPropertyValue("--scroll-shadow-scrollbar-right")).toBe("8px");
  expect(root.style.getPropertyValue("--scroll-shadow-scrollbar-bottom")).toBe("8px");
  width.mockClear();
  scrollWidth.mockClear();
  const baseline = renders.mock.calls.length;
  fireEvent.scroll(viewport, { target: { scrollLeft: 320, scrollTop: 100 } });
  expect(root).toHaveAttribute("data-overflow-left");
  expect(root).toHaveAttribute("data-overflow-right");
  fireEvent.scroll(viewport, { target: { scrollLeft: 1010 } });
  expect(root).not.toHaveAttribute("data-overflow-right");
  expect(width).not.toHaveBeenCalled();
  expect(scrollWidth).not.toHaveBeenCalled();
  expect(renders).toHaveBeenCalledTimes(baseline);
  view.unmount();
});

test("horizontal-only surfaces preserve the first viewport and suppress vertical fades", () => {
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
    <ScrollShadow axis="horizontal">
      <div role="list" />
    </ScrollShadow>,
  );
  const viewport = screen.getByRole("list"),
    root = viewport.parentElement!;
  Object.defineProperties(viewport, {
    clientWidth: { value: 100 },
    scrollWidth: { value: 500 },
    clientHeight: { value: 100 },
    scrollHeight: { value: 500 },
  });
  act(() => resize([], {} as ResizeObserver));
  expect(root.firstElementChild).toBe(viewport);
  expect(root).toHaveAttribute("data-scroll-axis", "horizontal");
  expect(root).toHaveAttribute("data-overflow-right");
  expect(root).not.toHaveAttribute("data-overflow-bottom");
  view.rerender(
    <ScrollShadow>
      <div role="list" />
    </ScrollShadow>,
  );
  act(() => resize([], {} as ResizeObserver));
  expect(root.querySelector(".scroll-shadow-side")).toBeNull();
  expect(root).toHaveAttribute("data-overflow-bottom");
  expect(root).not.toHaveAttribute("data-overflow-right");
});

test("horizontal fades and an explicit nested viewport coexist for Select-style metadata siblings", () => {
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
    <ScrollShadow axis="both" viewportSelector=".nested-viewport">
      <div>
        <span>Metadata</span>
        <section className="nested-viewport" role="list" />
      </div>
    </ScrollShadow>,
  );
  const viewport = screen.getByRole("list"),
    wrapper = view.container.querySelector(".scroll-shadow")!;
  Object.defineProperties(viewport, {
    clientWidth: { value: 100 },
    scrollWidth: { value: 500 },
    clientHeight: { value: 100 },
    scrollHeight: { value: 500 },
  });
  act(() => resize([], {} as ResizeObserver));
  expect(wrapper).toHaveAttribute("data-overflow-right");
  expect(wrapper).toHaveAttribute("data-overflow-bottom");
  fireEvent.scroll(viewport, { target: { scrollLeft: 400 } });
  expect(wrapper).toHaveAttribute("data-overflow-left");
  expect(wrapper).not.toHaveAttribute("data-overflow-right");
});
