import { afterEach, expect, it, vi } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  compileMotion,
  createMotionKeyframePreview,
} from "@musart/core";
import { createTimelineLinkPreview } from "../../../src/components/motion/link-preview";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function setup(property: "x" | "visible" = "x") {
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ id: "page", layers: [createLayer("rectangle", { id: "item" })] })],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const value of [0, 1, 2])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "item", property },
      time: { value, rate: 1 },
      value: property === "visible" ? !!value : value * 100,
    });
  const before = engine.getSnapshot(),
    page = before.project.pages[0]!,
    keys = page.motion!.tracks[0]!.properties[0]!.keyframes;
  const root = document.createElement("section"),
    row = document.createElement("div");
  row.className = "motion-row-time";
  row.dataset.motionPropertyId = page.motion!.tracks[0]!.properties[0]!.id;
  const controls = keys.slice(1).map(() => {
    const node = document.createElement("button");
    node.className = "motion-easing-segment";
    node.append(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    row.append(node);
    return node;
  });
  root.append(row);
  document.body.append(root);
  let view: { root: HTMLElement; left: number; width: number; scale: number } | null = {
    root,
    left: 0,
    width: 400,
    scale: 100,
  };
  const selected = [keys[1]!.id],
    preview = createTimelineLinkPreview(page, selected, () => view),
    retime = createMotionKeyframePreview(
      compileMotion(before.project, { compositionId: page.id }),
      selected,
    );
  return {
    engine,
    before,
    root,
    row,
    controls,
    keys,
    preview,
    render: (value: number, rate = 2) => preview.render(retime.sample({ value, rate }).composition),
    surface: (next: typeof view) => {
      view = next;
    },
  };
}

it("resizes both neighboring links while keeping the canvas draft and canonical document separate", () => {
  const d = setup();
  d.controls[1]!.hidden = true;
  d.render(1);
  const first = d.row.querySelector<HTMLElement>(`[data-motion-link-preview="${d.keys[1]!.id}"]`)!,
    last = d.row.querySelector<HTMLElement>(`[data-motion-link-preview="${d.keys[2]!.id}"]`)!;
  expect(first.style.left).toBe("6px");
  expect(first.style.width).toBe("138px");
  expect(last.style.left).toBe("156px");
  expect(last.style.width).toBe("38px");
  expect(first.querySelector("svg")).toBeNull();
  expect(d.controls.every((node) => node.disabled)).toBe(true);
  expect(d.engine.getSnapshot()).toBe(d.before);
  d.render(-1);
  expect(d.row.querySelector(`[data-motion-link-preview="${d.keys[1]!.id}"]`)).toBe(first);
  expect(first.style.width).toBe("38px");
  expect(last.style.width).toBe("138px");
  d.preview.clear();
  d.preview.clear();
  expect(d.row.querySelectorAll("[data-motion-link-preview]")).toHaveLength(0);
  expect(d.controls.map((node) => node.hidden)).toEqual([false, true]);
  expect(d.controls.some((node) => node.disabled)).toBe(false);
});

it("reconnects reordered keys and clips to the current viewport instead of retaining old neighbors", () => {
  const d = setup();
  d.render(3);
  const middle = d.row.querySelector<HTMLElement>(`[data-motion-link-preview="${d.keys[1]!.id}"]`)!;
  expect(middle.style.left).toBe("206px");
  expect(middle.style.width).toBe("38px");
  d.surface({ root: d.root, left: 220, width: 40, scale: 100 });
  d.render(3);
  expect(middle.style.left).toBe("226px");
  expect(middle.style.width).toBe("18px");
  expect(d.row.querySelectorAll("[data-motion-link-preview]")).toHaveLength(1);
  d.preview.clear();
});

it("retires detached row owners and all previews when the surface closes", () => {
  const d = setup();
  d.render(1);
  const rebound = d.row.cloneNode(false) as HTMLElement;
  d.root.replaceChildren(rebound);
  d.render(1);
  expect(d.row.querySelectorAll("[data-motion-link-preview]")).toHaveLength(0);
  expect(d.controls[0]!.hidden).toBe(false);
  expect(rebound.querySelectorAll("[data-motion-link-preview]")).toHaveLength(2);
  d.surface(null);
  d.render(-1);
  d.preview.clear();
  expect(rebound.children).toHaveLength(0);
});

it("does not add continuous easing controls to discrete property tracks", () => {
  const d = setup("visible");
  d.render(1);
  expect(d.row.querySelectorAll("[data-motion-link-preview]")).toHaveLength(0);
  expect(d.controls.some((node) => node.hidden)).toBe(false);
  d.preview.clear();
});

it("coalesces whole-track movement and reclips links instead of translating the clipped edge", () => {
  const d = setup(),
    frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  d.surface({ root: d.root, left: 120, width: 100, scale: 100 });
  d.preview.shift({ value: 1, rate: 10 });
  d.preview.shift({ value: 1, rate: 2 });
  expect(frames).toHaveLength(1);
  expect(d.row.querySelectorAll("[data-motion-link-preview]")).toHaveLength(0);
  frames[0]!(16);
  const left = d.row.querySelector<HTMLElement>(`[data-motion-link-preview="${d.keys[1]!.id}"]`)!;
  expect(left.style.left).toBe("126px");
  expect(left.style.width).toBe("18px");
  const right = d.row.querySelector<HTMLElement>(`[data-motion-link-preview="${d.keys[2]!.id}"]`)!;
  expect(right.style.left).toBe("156px");
  expect(right.style.width).toBe("38px");
  d.preview.clear();
});

it("cancels a queued shift and never resurrects retired preview DOM", () => {
  const d = setup(),
    frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const cancel = vi.spyOn(window, "cancelAnimationFrame");
  d.preview.shift({ value: 1, rate: 2 });
  d.preview.clear();
  expect(cancel).toHaveBeenCalledWith(1);
  frames[0]!(16);
  d.render(1);
  d.preview.shift({ value: 1, rate: 1 });
  expect(frames).toHaveLength(1);
  expect(d.row.querySelectorAll("[data-motion-link-preview]")).toHaveLength(0);
  expect(d.controls.some((control) => control.disabled)).toBe(false);
});
