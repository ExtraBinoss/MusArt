import type { DragEvent } from "react";
import { expect, it, vi } from "vitest";
import {
  applyMotionFrame,
  compileMotion,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  evaluateMotion,
} from "@musart/core";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
import { createCanvasTransfers } from "../../../src/canvas/interaction/transfers";

function fixture() {
  const layer = createLayer("rectangle", { id: "visible", x: 20, y: 20, width: 60, height: 50 });
  const a = createPage({ id: "a", width: 200, height: 160, layers: [layer] });
  const b = createPage({
    id: "b",
    width: 200,
    height: 160,
    layers: [createLayer("rectangle", { ...layer, id: "locked", locked: true })],
  });
  const engine = new EditorEngine(createProject({ pages: [a, b] }));
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: layer.id, property: "x" },
    time: { value: 1, rate: 1 },
    value: 100,
  });
  const program = compileMotion(engine.getSnapshot().project, { compositionId: "a" });
  let presented = applyMotionFrame(program, evaluateMotion(program, { value: 1, rate: 1 }));
  const viewport = document.createElement("div");
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1000, 600));
  const onFiles = vi.fn(),
    onActive = vi.fn();
  const refs = { current: viewport as HTMLElement | null };
  const transfers = createCanvasTransfers({
    engine,
    readPage: () => presented,
    readWorkspace: () => arrangeArtboards(engine.getSnapshot().project.pages),
    readView: () => ({ x: 0, y: 0, zoom: 1 }),
    viewport: refs,
    onFiles,
    onActive,
  });
  return {
    engine,
    transfers,
    viewport,
    refs,
    onFiles,
    onActive,
    hide: () => {
      presented = {
        ...presented,
        layers: presented.layers.map((layer) => ({ ...layer, visible: false })),
      };
    },
  };
}
it("picks the evaluated pose and frozen neighboring artboard without mutating selection or page", () => {
  const d = fixture(),
    before = d.engine.getSnapshot();
  expect(d.transfers.target({ x: 366, y: 255 })).toEqual({
    compositionId: "a",
    layerId: "visible",
    locked: false,
  });
  expect(d.transfers.target({ x: 286, y: 255 })).toBeNull();
  expect(d.transfers.target({ x: 614, y: 255 })).toEqual({
    compositionId: "b",
    layerId: "locked",
    locked: true,
  });
  expect(d.transfers.target({ x: 500, y: 10 })).toBeNull();
  expect(d.engine.getSnapshot()).toBe(before);
  d.hide();
  expect(d.transfers.target({ x: 366, y: 255 })).toBeNull();
  d.refs.current = null;
  expect(d.transfers.target({ x: 366, y: 255 })).toBeNull();
});
it("routes real file drops into the hit artboard while ignoring internal drags", () => {
  const d = fixture(),
    file = new File(["image"], "image.png", { type: "image/png" });
  const input = {
    clientX: 614,
    clientY: 255,
    currentTarget: d.viewport,
    dataTransfer: { types: ["Files"], files: [file] },
    preventDefault: vi.fn(),
  } as unknown as DragEvent<HTMLDivElement>;
  d.transfers.files.onDrop(input);
  expect(d.engine.getSnapshot().pageId).toBe("b");
  expect(d.onFiles).toHaveBeenCalledWith([file]);
  d.onFiles.mockClear();
  d.transfers.files.onDrop({
    ...input,
    dataTransfer: { types: ["application/x-musart-layer"], files: [] },
  } as unknown as DragEvent<HTMLDivElement>);
  expect(d.onFiles).not.toHaveBeenCalled();
});
