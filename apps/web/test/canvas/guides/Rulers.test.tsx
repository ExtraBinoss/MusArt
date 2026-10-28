import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createPage, createProject, EditorEngine } from "@musart/core";
import { Rulers } from "../../../src/canvas/guides/Rulers";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import type { PreviewValue } from "../../../src/state/session/preview-source";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => vi.unstubAllGlobals());
const view = { x: 5, y: -3, zoom: 2 },
  pointer = (x: number, y: number, button = 0) => ({
    clientX: 15 + x * 2,
    clientY: 17 + y * 2,
    button,
    pointerId: 1,
  });
function fixture(rulers = true) {
  const page = createPage({ width: 100, height: 80, rulers }),
    engine = new EditorEngine(createProject({ pages: [page] })),
    viewport = document.createElement("div");
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    left: 10,
    top: 20,
    width: 200,
    height: 160,
  } as DOMRect);
  const commands = vi.spyOn(engine, "execute");
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  return { page, engine, viewport: { current: viewport }, commands, cancel };
}
it("adds one horizontal or vertical world guide after the drag, retaining subpixel precision", () => {
  const d = fixture(),
    { container, unmount } = render(<Rulers {...d} view={view} />);
  const horizontal = screen.getByLabelText("horizontal"),
    vertical = screen.getByLabelText("vertical");
  expect(container.querySelectorAll("g").length).toBeGreaterThan(0);
  fireEvent.pointerMove(horizontal, pointer(30, 20));
  fireEvent.pointerDown(horizontal, pointer(10, 0, 2));
  expect(d.commands).not.toHaveBeenCalled();
  fireEvent.pointerDown(horizontal, pointer(10, 0));
  fireEvent.pointerMove(horizontal, pointer(30, 20.125));
  expect(container.querySelector(".ruler-guide-preview")).toHaveStyle({ top: "37.25px" });
  expect(d.commands).not.toHaveBeenCalled();
  vi.spyOn(horizontal, "hasPointerCapture").mockReturnValue(true);
  const release = vi.spyOn(horizontal, "releasePointerCapture");
  fireEvent.pointerUp(horizontal, pointer(30, 20.125));
  expect(d.commands).toHaveBeenCalledExactlyOnceWith({
    type: "addGuide",
    guide: { id: expect.any(String), axis: "y", position: 20.13 },
  });
  expect(release).toHaveBeenCalled();
  fireEvent.pointerDown(vertical, pointer(0, 0));
  fireEvent.pointerUp(vertical, pointer(25, 20));
  expect(d.commands).toHaveBeenLastCalledWith({
    type: "addGuide",
    guide: { id: expect.any(String), axis: "x", position: 25 },
  });
  expect(container.querySelector(".ruler-guide-preview")).toBeNull();
  unmount();
  expect(d.cancel).toHaveBeenCalledWith(1);
});
it("cancels interrupted drags and ignores out-of-page drops, disabled rulers and absent viewports", () => {
  const d = fixture(),
    { rerender, container } = render(<Rulers {...d} view={view} />),
    horizontal = screen.getByLabelText("horizontal");
  fireEvent.pointerUp(horizontal, pointer(20, 20));
  for (const event of ["pointerCancel", "lostPointerCapture"] as const) {
    fireEvent.pointerDown(horizontal, pointer(20, 20));
    fireEvent[event](horizontal, pointer(20, 30));
  }
  fireEvent.pointerDown(horizontal, pointer(20, 20));
  fireEvent.pointerUp(horizontal, pointer(20, 100));
  expect(d.commands).not.toHaveBeenCalled();
  rerender(<Rulers {...d} page={{ ...d.page, rulers: false }} view={view} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<Rulers {...d} viewport={{ current: null }} view={view} />);
  const vertical = screen.getByLabelText("vertical");
  fireEvent.pointerDown(vertical, pointer(20, 20));
  fireEvent.pointerMove(vertical, pointer(20, 20));
  fireEvent.pointerUp(vertical, pointer(20, 20));
  expect(d.commands).not.toHaveBeenCalled();
});
it("uses current imperative page dimensions for ruler origin and guide bounds during previews", () => {
  const d = fixture(),
    listeners = new Set<() => void>();
  let preview: PreviewValue | null = null;
  const controller = new SceneController(d.engine, {
    read: () => preview,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const { unmount } = render(<Rulers {...d} controller={controller} view={view} />);
  act(() => {
    preview = { target: "page", patch: { width: 200 } };
    listeners.forEach((listener) => listener());
  });
  const vertical = screen.getByLabelText("vertical"),
    event = { clientX: 215, clientY: 57, pointerId: 1, button: 0 };
  fireEvent.pointerDown(vertical, event);
  fireEvent.pointerUp(vertical, event);
  expect(d.commands).toHaveBeenCalledExactlyOnceWith({
    type: "addGuide",
    guide: { id: expect.any(String), axis: "x", position: 150 },
  });
  unmount();
  expect(listeners.size).toBe(0);
});

it.each(["project", "page", "commit"] as const)(
  "cancels an old ruler drag after authoritative %s changes and releases capture",
  (change) => {
    const d = fixture(),
      other = createPage();
    d.engine.load(createProject({ pages: [d.page, other] }));
    const { container, unmount } = render(<Rulers {...d} view={view} />);
    const handle = screen.getByLabelText("horizontal");
    vi.spyOn(handle, "hasPointerCapture").mockReturnValue(true);
    const release = vi.spyOn(handle, "releasePointerCapture");
    fireEvent.pointerDown(handle, pointer(10, 0));
    fireEvent.pointerMove(handle, pointer(20, 30));
    act(() => {
      if (change === "project") d.engine.load(structuredClone(d.engine.getSnapshot().project));
      else if (change === "page") d.engine.setPage(other.id);
      else d.engine.execute({ type: "updatePage", patch: { name: "Concurrent" } });
    });
    const baseline = d.engine.getSnapshot();
    expect(container.querySelector(".ruler-guide-preview")).toBeNull();
    expect(release).toHaveBeenCalled();
    fireEvent.pointerMove(handle, pointer(20, 40));
    fireEvent.pointerUp(handle, pointer(20, 40));
    expect(d.engine.getSnapshot()).toBe(baseline);
    unmount();
  },
);

it("one completed ruler drag adds one guide with one undo entry", () => {
  const d = fixture();
  render(<Rulers {...d} view={view} />);
  const handle = screen.getByLabelText("horizontal");
  fireEvent.pointerDown(handle, pointer(10, 0));
  fireEvent.pointerMove(handle, pointer(20, 30));
  fireEvent.pointerUp(handle, pointer(20, 30));
  expect(d.engine.getSnapshot().project.pages[0]!.guides).toHaveLength(1);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.guides).toHaveLength(0);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
