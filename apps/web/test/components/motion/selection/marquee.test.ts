import type { PointerEvent as ReactPointerEvent } from "react";
import { expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { projectTimelineRows } from "../../../../src/components/motion/tree";
import { createTimelineMarquee } from "../../../../src/components/motion/selection/marquee";

function fixture() {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [createLayer("rectangle", { id: "a" })] })] }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const value of [0, 1, 2])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "a", property: "x" },
      time: { value, rate: 1 },
      value,
    });
  const snapshot = engine.getSnapshot(),
    page = snapshot.project.pages[0]!;
  const rows = projectTimelineRows(page, new Set());
  const property = page.motion!.tracks[0]!.properties[0]!;
  const root = document.createElement("section"),
    viewport = document.createElement("div"),
    space = document.createElement("div");
  root.append(viewport);
  viewport.append(space);
  document.body.append(root);
  vi.spyOn(space, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);
  const nodes = property.keyframes.map((key, index) => {
    const button = document.createElement("button");
    button.className = "motion-key";
    Object.assign(button.dataset, {
      keyId: key.id,
      propertyId: property.id,
      firstKeyIndex: String(index),
      afterKeyIndex: String(index + 1),
    });
    space.append(button);
    return button;
  });
  let selected = new Set<string>();
  const publish = vi.fn((keys: ReadonlySet<string>) => {
    selected = new Set(keys);
  });
  const changed = vi.fn(),
    start = vi.fn();
  const controller = createTimelineMarquee({
    engine,
    compositionId: page.id,
    surface: () => ({ root, viewport, scale: 100 }),
    origin: () => ({ projectId: snapshot.project.id, revision: snapshot.revision }),
    selected: () => selected,
    publish,
    onStart: start,
    onChanged: changed,
  });
  function begin(shiftKey = false) {
    controller.begin(
      {
        currentTarget: space,
        target: space,
        button: 0,
        clientX: 294,
        clientY: 25,
        pointerId: 7,
        shiftKey,
        preventDefault() {},
        stopPropagation() {},
      } as unknown as ReactPointerEvent<HTMLElement>,
      rows,
      24,
    );
  }
  function send(type: string) {
    const event = new MouseEvent(type, { bubbles: true, clientX: 394, clientY: 47 });
    Object.defineProperty(event, "pointerId", { value: 7 });
    space.dispatchEvent(event);
  }
  return {
    engine,
    snapshot,
    property,
    nodes,
    root,
    space,
    controller,
    publish,
    changed,
    begin,
    send,
    setSelected: (ids: string[]) => {
      selected = new Set(ids);
    },
  };
}

it("previews only mounted DOM, publishes exact keys once at release and preserves Shift selection", () => {
  const d = fixture();
  const outside = d.property.keyframes[0]!.id;
  d.setSelected([outside]);
  d.begin(true);
  d.send("pointermove");
  expect(d.publish).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(d.snapshot);
  expect(d.nodes[1]).toHaveAttribute("data-key-preview", "selected");
  expect(d.nodes[2]).toHaveAttribute("data-key-preview", "empty");
  expect(d.space.querySelector(".motion-marquee")).not.toBeNull();
  d.send("pointerup");
  expect(d.publish).toHaveBeenCalledOnce();
  expect([...d.publish.mock.calls[0]![0]]).toEqual([outside, d.property.keyframes[1]!.id]);
  expect(d.space.querySelector(".motion-marquee")).toBeNull();
  expect(d.nodes[1]).not.toHaveAttribute("data-key-preview");
  d.controller.cancel();
  d.root.remove();
});

it("cancels without publication on capture loss, cancellation, disposal and stale projects", () => {
  for (const exit of ["pointercancel", "lostpointercapture", "cancel", "stale"] as const) {
    const d = fixture();
    d.begin();
    d.send("pointermove");
    if (exit === "cancel") d.controller.cancel();
    else if (exit === "stale") d.engine.execute({ type: "renameProject", name: "edited" });
    else d.send(exit);
    d.send("pointerup");
    expect(d.publish).not.toHaveBeenCalled();
    expect(d.space.querySelector(".motion-marquee")).toBeNull();
    expect(d.nodes[1]).not.toHaveAttribute("data-key-preview");
    expect(d.changed).toHaveBeenCalledTimes(exit === "stale" ? 1 : 0);
    d.controller.cancel();
    d.root.remove();
  }
});
