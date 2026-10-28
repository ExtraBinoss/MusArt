import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { EditorCanvas } from "../../src/canvas/EditorCanvas";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import { canvasPoint as point, pointerDrag } from "../support/canvas-pointer";

const scene = vi.hoisted(() => vi.fn());
vi.mock("../../src/canvas/render/EditorScene", () => ({
  EditorScene: () => {
    scene();
    return <div data-testid="selection-scene" />;
  },
}));
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 1000, 800),
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
});
afterEach(() => vi.unstubAllGlobals());

async function fixture(tool: "pointer" | "rectangle" = "pointer") {
  const one = createLayer("rectangle", { id: "one", x: 20, y: 20, width: 60, height: 50 });
  const two = createLayer("rectangle", { id: "two", x: 110, y: 20, width: 50, height: 50 });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ width: 200, height: 160, layers: [one, two] })] }),
  );
  engine.select([two.id]);
  render(
    <TooltipProvider>
      <EditorCanvas engine={engine} tool={tool} />
    </TooltipProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("selection-scene")).toBeInTheDocument());
  return {
    engine,
    canvas: screen.getByTestId("editor-canvas"),
    box: document.querySelector<HTMLElement>(".canvas-marquee")!,
  };
}

test("right drag can begin on artwork, paints imperatively, selects crossing bounds once and leaves history untouched", async () => {
  const { engine, canvas, box } = await fixture(),
    initial = engine.getSnapshot();
  scene.mockClear();
  fireEvent.pointerDown(canvas, { ...point(40, 40), button: 2 });
  for (const [x, y] of [
    [50, 50],
    [70, 70],
    [100, 100],
  ])
    fireEvent.pointerMove(canvas, { ...point(x!, y!), button: 2 });
  expect(box).toBeVisible();
  expect(box).toHaveStyle({ left: "40px", top: "40px", width: "60px", height: "60px" });
  expect(engine.getSnapshot()).toBe(initial);
  expect(scene).not.toHaveBeenCalled();
  fireEvent.pointerUp(canvas, { ...point(100, 100), button: 2 });
  expect(engine.getSnapshot().selection).toEqual(["one"]);
  expect(engine.getSnapshot().project).toBe(initial.project);
  expect(engine.getSnapshot().canUndo).toBe(false);
  expect(box).not.toBeVisible();
});

test.each(["shiftKey", "ctrlKey", "metaKey"] as const)(
  "right marquee %s unions its initial selection and uses the final release position",
  async (modifier) => {
    const { engine, canvas } = await fixture("rectangle");
    fireEvent.pointerDown(canvas, { ...point(40, 40), button: 2, [modifier]: true });
    fireEvent.pointerMove(canvas, { ...point(45, 45), button: 2 });
    fireEvent.pointerUp(canvas, { ...point(100, 100), button: 2 });
    expect(engine.getSnapshot().selection).toEqual(["two", "one"]);
    expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(2);
    expect(engine.getSnapshot().canUndo).toBe(false);
  },
);

test("right click alone, canceled/lost capture, Escape and stale gestures preserve the previous selection", async () => {
  const { engine, canvas, box } = await fixture(),
    initial = engine.getSnapshot();
  pointerDrag(canvas, point(40, 40), point(40, 40), { button: 2 });
  expect(engine.getSnapshot()).toBe(initial);
  expect(fireEvent.contextMenu(canvas)).toBe(false);
  for (const cancel of [
    () => fireEvent.pointerCancel(canvas, { pointerId: 1 }),
    () => fireEvent.lostPointerCapture(canvas, { pointerId: 1 }),
    () => fireEvent.keyDown(canvas, { key: "Escape" }),
  ]) {
    fireEvent.pointerDown(canvas, { ...point(40, 40), button: 2 });
    fireEvent.pointerMove(canvas, { ...point(100, 100), button: 2 });
    expect(box).toBeVisible();
    cancel();
    fireEvent.pointerUp(canvas, { ...point(100, 100), button: 2 });
    expect(engine.getSnapshot().selection).toEqual(["two"]);
    expect(box).not.toBeVisible();
  }
  fireEvent.pointerDown(canvas, { ...point(40, 40), button: 2 });
  fireEvent.pointerMove(canvas, { ...point(100, 100), button: 2 });
  act(() => engine.execute({ type: "updateLayers", ids: ["one"], patch: { fill: "#abcdef" } }));
  expect(box).not.toBeVisible();
  fireEvent.pointerUp(canvas, { ...point(100, 100), button: 2 });
  expect(engine.getSnapshot().selection).toEqual(["two"]);
});

test("foreign pointers cannot replace, complete or cancel the captured marquee", async () => {
  const { engine, canvas, box } = await fixture();
  const send = (
    kind: "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel",
    id: number,
    x: number,
    y: number,
  ) => {
    const event = createEvent[kind](canvas, { ...point(x, y), button: 2 });
    Object.defineProperty(event, "pointerId", { value: id });
    fireEvent(canvas, event);
  };
  send("pointerDown", 1, 40, 40);
  send("pointerDown", 2, 130, 30);
  send("pointerMove", 2, 100, 100);
  send("pointerUp", 2, 100, 100);
  expect(box).not.toBeVisible();
  expect(engine.getSnapshot().selection).toEqual(["two"]);
  send("pointerMove", 1, 100, 100);
  expect(box).toBeVisible();
  send("pointerCancel", 2, 100, 100);
  expect(box).toBeVisible();
  send("pointerUp", 1, 100, 100);
  expect(engine.getSnapshot().selection).toEqual(["one"]);
  expect(box).not.toBeVisible();
});

test("right marquee Escape consumes the document shortcut while ordinary Escape keeps normal deselection", async () => {
  const { engine, canvas, box } = await fixture();
  const globalDeselect = vi.fn((event: KeyboardEvent) => {
    if (event.key === "Escape") engine.select([]);
  });
  document.addEventListener("keydown", globalDeselect);
  try {
    fireEvent.pointerDown(canvas, { ...point(40, 40), button: 2 });
    fireEvent.pointerMove(canvas, { ...point(100, 100), button: 2 });
    expect(box).toBeVisible();
    expect(fireEvent.keyDown(canvas, { key: "Escape" })).toBe(false);
    expect(globalDeselect).not.toHaveBeenCalled();
    expect(engine.getSnapshot().selection).toEqual(["two"]);
    expect(box).not.toBeVisible();
    fireEvent.pointerUp(canvas, { ...point(100, 100), button: 2 });
    expect(engine.getSnapshot().selection).toEqual(["two"]);
    fireEvent.keyDown(canvas, { key: "Escape" });
    expect(globalDeselect).toHaveBeenCalledOnce();
    expect(engine.getSnapshot().selection).toEqual([]);
    expect(engine.getSnapshot().canUndo).toBe(false);
  } finally {
    document.removeEventListener("keydown", globalDeselect);
  }
});
