import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { layerDragController } from "../../../../src/components/layers/drag/controller";
import {
  createLayerDragPresentation,
  layerDragPresentation,
} from "../../../../src/components/layers/drag/presentation";

const releases: (() => void)[] = [];
afterEach(() => {
  for (const release of releases.splice(0)) release();
});
function fixture() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "one",
          layers: [
            createLayer("rectangle", { id: "a" }),
            createLayer("rectangle", { id: "b" }),
            createLayer("rectangle", { id: "c" }),
          ],
        }),
        createPage({ id: "two", layers: [createLayer("rectangle", { id: "foreign" })] }),
      ],
    }),
  );
  const page = engine.getSnapshot().project.pages[0]!,
    other = engine.getSnapshot().project.pages[1]!;
  const controller = layerDragController(engine),
    presentation = createLayerDragPresentation(engine),
    owner = Symbol("input");
  const viewport = document.createElement("div"),
    source = document.createElement("div"),
    target = document.createElement("div"),
    foreign = document.createElement("div");
  viewport.dataset.layerDragViewport = "";
  Object.defineProperties(viewport, {
    clientWidth: { value: 500 },
    clientHeight: { value: 300 },
    scrollWidth: { value: 500 },
    scrollHeight: { value: 900 },
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 300));
  for (const [node, id, pageId, y] of [
    [source, "a", "one", 0],
    [target, "b", "one", 40],
    [foreign, "foreign", "two", 40],
  ] as const) {
    node.dataset.layerDropId = id;
    node.dataset.layerDropPageId = pageId;
    node.dataset.layerDropKind = "layer";
    vi.spyOn(node, "getBoundingClientRect").mockReturnValue(new DOMRect(0, y, 200, 40));
    viewport.append(node);
  }
  document.body.append(viewport);
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  const request = globalThis.requestAnimationFrame,
    cancel = globalThis.cancelAnimationFrame,
    Original = globalThis.ResizeObserver;
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++next, callback);
    return next;
  };
  globalThis.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  const callbacks: ResizeObserverCallback[] = [];
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      callbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const elementFromPoint = vi.fn((): Element | null => target);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: elementFromPoint,
  });
  releases.push(() => {
    controller.cancel();
    presentation.release();
    viewport.remove();
    globalThis.requestAnimationFrame = request;
    globalThis.cancelAnimationFrame = cancel;
    globalThis.ResizeObserver = Original;
    delete (document as Partial<Document>).elementFromPoint;
  });
  controller.begin(owner, page, "a", (action) => action());
  presentation.start(owner, source, "Source", { x: 100, y: 5, alt: false }, true);
  const tick = (time = 0) => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(time);
  };
  return {
    engine,
    page,
    other,
    controller,
    presentation,
    owner,
    source,
    target,
    foreign,
    viewport,
    frames,
    callbacks,
    tick,
    elementFromPoint,
  };
}

it("rejects a foreign artboard before the stationary-pointer intent cache", () => {
  const d = fixture(),
    point = { x: 100, y: 45, alt: false };
  expect(d.presentation.over(d.target, d.page.layers[1]!, d.page, point)).toBe(true);
  expect(d.presentation.over(d.foreign, d.other.layers[0]!, d.other, point)).toBe(false);
  expect(d.controller.read()?.target).toBeNull();
  expect(d.controller.read()?.rejected).toEqual({ id: "foreign", reason: "crossComposition" });
});

it("coalesces ghost pixels into one frame without semantic subscriptions or repeated layout reads", () => {
  const d = fixture(),
    publish = vi.fn();
  expect(document.querySelector<HTMLElement>(".layer-drag-preview")?.style.transform).toBe(
    "translate3d(112px,17px,0)",
  );
  const stop = d.controller.subscribe(publish);
  d.presentation.over(d.target, d.page.layers[1]!, d.page, { x: 100, y: 45, alt: false });
  d.presentation.over(d.target, d.page.layers[1]!, d.page, { x: 101, y: 45, alt: false });
  const reads = vi.mocked(d.target.getBoundingClientRect).mock.calls.length;
  const state = d.controller.read(),
    changes = publish.mock.calls.length;
  for (let index = 2; index < 30; index++) {
    d.presentation.over(d.target, d.page.layers[1]!, d.page, { x: 100 + index, y: 45, alt: false });
    d.presentation.move({ x: 100 + index, y: 45, alt: false });
  }
  expect(d.frames.size).toBe(1);
  expect(d.target.getBoundingClientRect).toHaveBeenCalledTimes(reads);
  expect(d.controller.read()).toBe(state);
  expect(publish).toHaveBeenCalledTimes(changes);
  d.tick();
  expect(document.querySelector<HTMLElement>(".layer-drag-preview")?.style.transform).toBe(
    "translate3d(141px,57px,0)",
  );
  expect(d.frames.size).toBe(0);
  stop();
});

it("refreshes row geometry on container ResizeObserver, then reuses it for subsequent pixels", () => {
  const d = fixture();
  d.presentation.over(d.target, d.page.layers[1]!, d.page, { x: 100, y: 45, alt: false });
  d.presentation.over(d.target, d.page.layers[1]!, d.page, { x: 101, y: 45, alt: false });
  const reads = vi.mocked(d.target.getBoundingClientRect).mock.calls.length;
  vi.mocked(d.target.getBoundingClientRect).mockReturnValue(new DOMRect(0, 38, 200, 40));
  d.callbacks[0]!([], {} as ResizeObserver);
  for (let index = 2; index < 20; index++)
    d.presentation.over(d.target, d.page.layers[1]!, d.page, { x: 100 + index, y: 45, alt: false });
  expect(d.target.getBoundingClientRect).toHaveBeenCalledTimes(reads + 1);
});

it("retires invalid property targets, stale origins and old ghost leases without deleting replacements", () => {
  const d = fixture();
  d.target.dataset.layerDropKind = "property";
  d.presentation.move({ x: 100, y: 45, alt: false });
  d.tick();
  expect(d.controller.read()?.rejected?.reason).toBe("property");
  const next = Symbol("replacement");
  d.controller.begin(next, d.page, "b", (action) => action());
  d.presentation.start(next, d.target, "Replacement", { x: 120, y: 45, alt: false }, true);
  const ghost = document.querySelector(".layer-drag-preview");
  d.presentation.release(d.owner);
  d.controller.cancel(d.owner);
  expect(document.querySelector(".layer-drag-preview")).toBe(ghost);
  expect(document.documentElement.dataset.layerReorderActive).toBe("true");
  d.engine.load(d.engine.getSnapshot().project);
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
  expect(document.documentElement.dataset.layerReorderActive).toBeUndefined();
  expect(d.frames.size).toBe(0);
});

it("returns one presentation per engine and releases cursor/ghost ownership after outside hits", () => {
  const d = fixture();
  expect(layerDragPresentation(d.engine)).toBe(layerDragPresentation(d.engine));
  d.elementFromPoint.mockReturnValue(null);
  d.presentation.move({ x: 450, y: 150, alt: false });
  d.tick();
  expect(d.controller.read()?.target).toBeNull();
  d.presentation.release();
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
  expect(d.frames.size).toBe(0);
});

it("holds the insertion intent through stationary layout expansion, then retargets on actual scroll", () => {
  const d = fixture(),
    point = { x: 100, y: 45, alt: false };
  d.presentation.over(d.target, d.page.layers[1]!, d.page, point);
  const next = document.createElement("div");
  d.viewport.append(next);
  vi.spyOn(next, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 40, 200, 40));
  d.presentation.invalidate();
  expect(d.presentation.over(next, d.page.layers[2]!, d.page, point)).toBe(true);
  expect(d.controller.read()?.target?.id).toBe("b");
  d.viewport.scrollTop = 40;
  expect(d.presentation.over(next, d.page.layers[2]!, d.page, point)).toBe(true);
  expect(d.controller.read()?.target?.id).toBe("c");
});

it("keeps an accepted stationary insertion when preview motion moves a property underneath release", () => {
  const d = fixture(),
    point = { x: 100, y: 45, alt: false };
  d.presentation.over(d.target, d.page.layers[1]!, d.page, point);
  const property = document.createElement("div");
  Object.assign(property.dataset, {
    layerDropId: "c",
    layerDropPageId: "one",
    layerDropKind: "property",
  });
  d.viewport.append(property);
  d.elementFromPoint.mockReturnValue(property);
  d.presentation.invalidate();
  d.presentation.flush();
  expect(d.controller.read()?.target?.id).toBe("b");
  d.presentation.move({ ...point, x: 101 });
  d.presentation.flush();
  expect(d.controller.read()?.target?.id).toBe("b");
  d.presentation.move({ ...point, x: 107 });
  d.presentation.flush();
  expect(d.controller.read()?.target).toBeNull();
  expect(d.controller.read()?.rejected?.reason).toBe("property");
});
it("a real scroll, outside hit or foreign page still retires stationary insertion", () => {
  for (const changed of ["scroll", "outside", "foreign"] as const) {
    const d = fixture(),
      point = { x: 100, y: 45, alt: false };
    d.presentation.over(d.target, d.page.layers[1]!, d.page, point);
    if (changed === "outside") d.elementFromPoint.mockReturnValue(null);
    else if (changed === "foreign") d.elementFromPoint.mockReturnValue(d.foreign);
    else {
      d.target.dataset.layerDropKind = "property";
      d.viewport.scrollTop = 40;
    }
    d.presentation.flush();
    expect(d.controller.read()?.target).toBeNull();
  }
});

it("does not latch a property outside the actual viewport or across modifier changes", () => {
  const d = fixture(),
    point = { x: 100, y: 45, alt: false };
  d.presentation.over(d.target, d.page.layers[1]!, d.page, point);
  expect(d.presentation.retainIntent({ ...point, x: 101 }, "one", d.target)).toBe(true);
  expect(d.presentation.retainIntent(point, "two", d.target)).toBe(false);
  expect(d.presentation.retainIntent({ ...point, alt: true }, "one", d.target)).toBe(false);
  expect(d.presentation.retainIntent(point, "one", document.createElement("div"))).toBe(false);
});
