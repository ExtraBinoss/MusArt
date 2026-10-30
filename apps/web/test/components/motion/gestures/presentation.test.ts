import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createProject, EditorEngine } from "@musart/core";
import { createTimelineGesturePresentation } from "../../../../src/components/motion/gestures/presentation";
import { createTimelineGestures } from "../../../../src/components/motion/gestures";
import type { TimelineCanvasDraft } from "../../../../src/components/motion/canvas/model";
import type { TimelineTransport } from "../../../../src/components/motion/model";
import { canvasFixture } from "../canvas/support";

type Gesture = Parameters<ReturnType<typeof createTimelineGesturePresentation>["render"]>[0];
const delta = { value: 1001, rate: 30_000 };
function expectPixels(value: string, expected: number) {
  expect(value.endsWith("px")).toBe(true);
  expect(parseFloat(value)).toBeCloseTo(expected, 10);
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it("publishes bounded marquee ranges without expanding their key identities and retires the preview once", () => {
  const { tracks } = canvasFixture(),
    port = createTimelineGesturePresentation(),
    listener = vi.fn(),
    stop = port.subscribe(listener),
    base = new Set(["b"]),
    ranges = [
      {
        row: 1,
        layerId: "hero",
        propertyId: "position",
        keys: tracks[0]!.properties[0]!.keyframes,
        first: 0,
        after: 1,
      },
    ];
  port.marquee(ranges, base);
  expect(port.readMarquee()).toEqual({ ranges, base });
  expect(port.readMarquee()!.ranges).toBe(ranges);
  expect(port.readMarquee()!.base).toBe(base);
  expect(listener).toHaveBeenCalledOnce();
  port.clearMarquee();
  port.clearMarquee();
  expect(port.readMarquee()).toBeNull();
  expect(listener).toHaveBeenCalledTimes(2);
  stop();
  port.marquee(ranges, base);
  expect(listener).toHaveBeenCalledTimes(2);
});

function fixture(action: Gesture["action"] = "keys") {
  const { page, tracks } = canvasFixture(),
    root = document.createElement("section");
  root.innerHTML =
    '<div class="motion-row" data-layer-id="hero">' +
    '<div class="motion-track-wrap" data-track-id="first"><button></button></div>' +
    '<div class="motion-track-wrap" data-track-id="second"></div>' +
    '<button class="motion-key" data-key-id="a"></button>' +
    '<button class="motion-key" data-key-id="b"></button></div>' +
    '<div class="motion-row" data-layer-id="other"><button class="motion-key" data-key-id="c"></button></div>';
  document.body.append(root);
  const gesture: Gesture = {
    action,
    delta,
    keyIds: ["b"],
    layerIds: new Set(["hero"]),
    ...(action === "keys" ? {} : { track: tracks[0]! }),
    page,
    touched: new Set(),
    links: { shift: vi.fn() },
  };
  const node = (selector: string) => root.querySelector<HTMLElement>(selector)!;
  return { root, gesture, node };
}

it("publishes exact rational drafts synchronously and retains Set identities between pointer deltas", () => {
  const d = fixture(),
    port = createTimelineGesturePresentation(),
    seen: (TimelineCanvasDraft | null)[] = [];
  const stop = port.subscribe(() => seen.push(port.read()));
  expect(port.read()).toBeNull();
  port.render(d.gesture, d.root, 30_000);
  const first = port.read()!;
  expect(seen).toEqual([first]);
  expect(first.delta).toBe(delta);
  expect(first.trackId).toBeUndefined();
  expect(first.keyIds).toEqual(new Set(["b"]));
  expect(first.layerIds).toBe(d.gesture.layerIds);
  port.render({ ...d.gesture, delta: { ...delta } }, d.root, 30_000);
  expect(port.read()).toBe(first);
  expect(seen).toHaveLength(1);
  for (let value = 1002; value <= 1021; value++) {
    port.render({ ...d.gesture, delta: { value, rate: 30_000 } }, d.root, 30_000);
    expect(port.read()!.keyIds).toBe(first.keyIds);
    expect(port.read()!.layerIds).toBe(first.layerIds);
  }
  expect(seen).toHaveLength(21);
  expect(seen.at(-1)!.delta).toEqual({ value: 1021, rate: 30_000 });
  const current = port.read();
  port.notify();
  expect(seen.at(-1)).toBe(current);
  expect(seen).toHaveLength(22);
  stop();
  stop();
  port.clear();
  port.notify();
  expect(port.read()).toBeNull();
  expect(seen).toHaveLength(22);
});

it("replaces the key Set only when the immutable key list changes and clears once per live draft", () => {
  const d = fixture(),
    port = createTimelineGesturePresentation(),
    listener = vi.fn();
  port.subscribe(listener);
  port.clear();
  expect(listener).not.toHaveBeenCalled();
  port.render(d.gesture, d.root, 100);
  const first = port.read()!.keyIds;
  port.render({ ...d.gesture, keyIds: ["a", "b"] }, d.root, 100);
  expect(port.read()!.keyIds).not.toBe(first);
  expect(port.read()!.keyIds).toEqual(new Set(["a", "b"]));
  port.clear();
  expect(port.read()).toBeNull();
  expect(listener).toHaveBeenCalledTimes(3);
  port.clear();
  expect(listener).toHaveBeenCalledTimes(3);
  port.render(d.gesture, d.root, 100);
  expect(port.read()!.keyIds).not.toBe(first);
});

it("updates only active key nodes and records each touched element once", () => {
  const d = fixture(),
    port = createTimelineGesturePresentation();
  port.render(d.gesture, d.root, 30_000);
  expectPixels(d.node('[data-key-id="b"]').style.getPropertyValue("--motion-drag-x"), 1001);
  expect(d.node('[data-key-id="a"]').getAttribute("style")).toBeNull();
  expect(d.node('[data-key-id="c"]').getAttribute("style")).toBeNull();
  port.render({ ...d.gesture, delta: { value: -1, rate: 4 } }, d.root, 100);
  expect(d.node('[data-key-id="b"]').style.getPropertyValue("--motion-drag-x")).toBe("-25px");
  expect([...d.gesture.touched]).toEqual([d.node('[data-key-id="b"]')]);
});

it("moves legacy rows but scopes v2 previews to one occurrence and its own keys", () => {
  for (const version of [1, 2] as const) {
    const d = fixture("move"),
      port = createTimelineGesturePresentation();
    d.gesture.page = { ...d.gesture.page, motion: { ...d.gesture.page.motion!, version } };
    port.render(d.gesture, d.root, 30_000);
    expect(d.gesture.links!.shift).toHaveBeenCalledWith(delta);
    const hero = d.node('[data-layer-id="hero"]'),
      clip = d.node('[data-track-id="first"]');
    expectPixels((version === 1 ? hero : clip).style.getPropertyValue("--motion-drag-x"), 1001);
    expect((version === 1 ? clip : hero).getAttribute("style")).toBeNull();
    expect(d.node('[data-track-id="second"]').getAttribute("style")).toBeNull();
    expect(d.node('[data-layer-id="other"]').getAttribute("style")).toBeNull();
    const movedKey = d.node('[data-key-id="b"]').style.getPropertyValue("--motion-drag-x");
    if (version === 2) expectPixels(movedKey, 1001);
    else expect(movedKey).toBe("");
  }
});

it("sets exact trim geometry on the active wrapper including an authored null end", () => {
  const d = fixture("trimStart"),
    port = createTimelineGesturePresentation();
  port.render({ ...d.gesture, delta: { value: 1, rate: 4 } }, d.root, 100);
  const wrap = d.node('[data-track-id="first"]');
  expect(wrap.style.getPropertyValue("--motion-trim-left")).toBe("25px");
  expect(wrap.style.getPropertyValue("--motion-trim-width")).toBe("75px");
  port.render(
    {
      ...d.gesture,
      action: "trimEnd",
      delta: { value: 1, rate: 2 },
      track: { ...d.gesture.track!, end: null },
    },
    d.root,
    100,
  );
  expect(wrap.style.getPropertyValue("--motion-trim-left")).toBe("0px");
  expect(wrap.style.getPropertyValue("--motion-trim-width")).toBe("450px");
  expect(port.read()!.trackId).toBe("first");
  expect(d.gesture.touched).toEqual(new Set([wrap]));
  expect(d.node('[data-track-id="second"]').getAttribute("style")).toBeNull();
});

it("the owning controller clears Canvas drafts and active DOM variables on cancel and disposal", () => {
  for (const action of ["move", "trimStart", "trimEnd"] as const) {
    const d = fixture(action),
      page = { ...d.gesture.page, layers: [createLayer("rectangle", { id: "hero" })] };
    const engine = new EditorEngine(createProject({ pages: [page] })),
      before = engine.getSnapshot().project;
    const viewport = document.createElement("div"),
      feedback = document.createElement("output");
    d.root.append(viewport, feedback);
    const transport: TimelineTransport = {
      read: () => ({
        compositionId: page.id,
        mode: "motion",
        time: { value: 0, rate: 1 },
        duration: page.motion!.duration,
        frameRate: page.motion!.frameRate,
        playing: false,
        playbackMode: "once",
      }),
      subscribe: () => () => undefined,
      seek: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      setPlaybackMode: vi.fn(),
    };
    const controller = createTimelineGestures({
      engine,
      transport,
      compositionId: page.id,
      onSelection: vi.fn(),
      onError: vi.fn(),
    });
    controller.connect({ root: d.root, viewport, feedback, scale: 100 });
    const seen: (TimelineCanvasDraft | null)[] = [],
      stop = controller.subscribePreview(() => seen.push(controller.readPreview()));
    const button = d.node('[data-track-id="first"] button');
    const track = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
    controller.beginTrackInput(
      { node: button, pointerId: 7, button: 0, clientX: 100, clientY: 5, shiftKey: true },
      track,
      action,
    );
    controller.updatePointer({ pointerId: 7, clientX: 125, clientY: 5, shiftKey: true });
    expect(controller.readPreview()!.delta).toEqual({ value: 1, rate: 4 });
    controller.cancel();
    expect(controller.readPreview()).toBeNull();
    expect(seen.at(-1)).toBeNull();
    for (const node of d.root.querySelectorAll<HTMLElement>("[style]"))
      for (const property of ["--motion-drag-x", "--motion-trim-left", "--motion-trim-width"])
        expect(node.style.getPropertyValue(property)).toBe("");
    const calls = seen.length;
    stop();
    stop();
    controller.dispose();
    controller.dispose();
    button.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientX: 160 }));
    expect(seen).toHaveLength(calls);
    expect(controller.readPreview()).toBeNull();
    expect(engine.getSnapshot().project).toBe(before);
  }
});
