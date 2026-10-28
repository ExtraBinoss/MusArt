import { expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getWorldMatrix,
  transformPoint,
} from "@musart/core";
import { GuideOverlay } from "../../../src/canvas/guides/GuideOverlay";
import { createStore } from "jotai";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createPreviewSource } from "../../../src/state/session/preview-source";
import { previewAtom } from "../../../src/state/session/editor";
const view = { x: 5, y: -3, zoom: 2 };
function fixture() {
  const group = createLayer("group", {
      id: "group",
      x: 20,
      y: 20,
      width: 40,
      height: 40,
      rotation: 90,
    }),
    layer = createLayer("rectangle", {
      id: "child",
      parentId: group.id,
      x: 4,
      y: 6,
      width: 20,
      height: 20,
      guides: [{ id: "local", axis: "y", position: 5 }],
    });
  const page = createPage({
      width: 100,
      height: 80,
      guides: [{ id: "page", axis: "x", position: 10 }],
      layers: [group, layer],
    }),
    engine = new EditorEngine(createProject({ pages: [page] })),
    viewport = document.createElement("div");
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    left: 10,
    top: 20,
    width: 200,
    height: 160,
  } as DOMRect);
  const commands = vi.spyOn(engine, "execute");
  return { page, engine, layer, viewport: { current: viewport }, commands };
}
const pointer = (x: number, y: number, button = 0) => ({
  clientX: 15 + x * 2,
  clientY: 17 + y * 2,
  button,
  pointerId: 1,
});
it("previews page guide drags without history then commits one rounded update or deletes outside bounds", () => {
  const d = fixture(),
    { container } = render(<GuideOverlay {...d} selected={[]} view={view} />),
    line = container.querySelector(".guide-x")!;
  expect(line).toHaveStyle({ left: "10px", width: "4px", height: "80px" });
  fireEvent.pointerUp(line, pointer(20, 0));
  fireEvent.pointerDown(line, pointer(10, 0, 2));
  fireEvent.pointerMove(line, pointer(20, 0));
  expect(d.commands).not.toHaveBeenCalled();
  fireEvent.pointerDown(line, pointer(10, 0));
  expect(line).toHaveAttribute("data-dragging", "true");
  fireEvent.pointerMove(line, pointer(20.125, 0));
  expect(line).toHaveStyle({ left: "20.125px" });
  expect(d.commands).not.toHaveBeenCalled();
  const capture = vi.spyOn(line, "hasPointerCapture").mockReturnValue(true),
    release = vi.spyOn(line, "releasePointerCapture");
  fireEvent.pointerUp(line, pointer(20.125, 0));
  expect(d.commands).toHaveBeenCalledExactlyOnceWith({
    type: "updateGuide",
    id: "page",
    patch: { position: 20.13 },
  });
  expect(release).toHaveBeenCalled();
  expect(line).not.toHaveAttribute("data-dragging");
  capture.mockRestore();
  fireEvent.pointerDown(line, pointer(20.13, 0));
  fireEvent.pointerUp(line, pointer(-1, 0));
  expect(d.commands).toHaveBeenLastCalledWith({ type: "deleteGuide", id: "page" });
});
it("maps a child guide through rotated parent coordinates and cancellation leaves history untouched", () => {
  const d = fixture(),
    { container } = render(<GuideOverlay {...d} selected={[d.layer.id]} view={view} />),
    wrapper = container.querySelector(".layer-guides")!,
    line = wrapper.querySelector(".guide-y")!;
  expect(wrapper).toHaveStyle({
    transform: `matrix(${getWorldMatrix(d.page, d.layer.id).join(",")})`,
  });
  expect(line.querySelector("span")).toHaveStyle({ transform: "rotate(-90deg) scale(0.5)" });
  const world = transformPoint(getWorldMatrix(d.page, d.layer.id), { x: 3, y: 12 });
  fireEvent.pointerDown(line, pointer(world.x, world.y));
  fireEvent.pointerMove(line, pointer(world.x, world.y));
  expect(line).toHaveStyle({ top: "12px" });
  fireEvent.pointerCancel(line, pointer(world.x, world.y));
  expect(d.commands).not.toHaveBeenCalled();
  expect(line).toHaveStyle({ top: "5px" });
  fireEvent.pointerDown(line, pointer(world.x, world.y));
  fireEvent.lostPointerCapture(line, pointer(world.x, world.y));
  expect(d.commands).not.toHaveBeenCalled();
  fireEvent.pointerDown(line, pointer(world.x, world.y));
  fireEvent.pointerUp(line, pointer(world.x, world.y));
  expect(d.commands).toHaveBeenCalledExactlyOnceWith({
    type: "updateGuide",
    id: "local",
    targetId: "child",
    patch: { position: 12 },
  });
});
it("does not record a click without movement and deletes a layer guide beyond its own extent", () => {
  const d = fixture(),
    { container } = render(<GuideOverlay {...d} selected={[d.layer.id]} view={view} />),
    line = container.querySelector(".layer-guides .guide-y")!;
  for (const y of [5, 21]) {
    const world = transformPoint(getWorldMatrix(d.page, d.layer.id), { x: 0, y });
    fireEvent.pointerDown(line, pointer(world.x, world.y));
    fireEvent.pointerUp(line, pointer(world.x, world.y));
  }
  expect(d.commands).toHaveBeenCalledExactlyOnceWith({
    type: "deleteGuide",
    id: "local",
    targetId: "child",
  });
});
it("does not draw local guide handles when a selected layer or ancestor is hidden", () => {
  const d = fixture(),
    { container, rerender } = render(
      <GuideOverlay
        {...d}
        page={{
          ...d.page,
          layers: d.page.layers.map((layer) =>
            layer.id === "group" ? { ...layer, visible: false } : layer,
          ),
        }}
        selected={[d.layer.id]}
        view={view}
      />,
    );
  expect(container.querySelector(".layer-guides")).toBeNull();
  rerender(
    <GuideOverlay
      {...d}
      page={{
        ...d.page,
        layers: d.page.layers.map((layer) =>
          layer.id === d.layer.id ? { ...layer, visible: false } : layer,
        ),
      }}
      selected={[d.layer.id]}
      view={view}
    />,
  );
  expect(container.querySelector(".layer-guides")).toBeNull();
  expect(container.querySelector(".guide-x")).not.toBeNull();
});

it("updates guide positions and group transforms through the imperative preview source", () => {
  const d = fixture(),
    store = createStore(),
    controller = new SceneController(d.engine, createPreviewSource(store));
  const { container } = render(
    <GuideOverlay {...d} controller={controller} selected={[d.layer.id]} view={view} />,
  );
  const pageLine = container.querySelector<HTMLElement>("[data-guide-id=page]")!;
  act(() =>
    store.set(previewAtom, {
      target: "page",
      patch: { guides: [{ id: "page", axis: "x", position: 37 }] },
    }),
  );
  expect(pageLine.style.left).toBe("37px");
  expect(pageLine.textContent).toContain("X 37 px");
  const baseline = d.engine.getSnapshot();
  act(() =>
    store.set(previewAtom, {
      target: "layer",
      layerId: d.layer.id,
      patch: { x: 15, guides: [{ id: "local", axis: "y", position: 12 }] },
    }),
  );
  expect(container.querySelector<HTMLElement>("[data-guide-id=local]")!.style.top).toBe("12px");
  expect(container.querySelector<HTMLElement>(".layer-guides")!.style.transform).not.toBe(
    `matrix(${getWorldMatrix(d.page, d.layer.id).join(",")})`,
  );
  expect(d.engine.getSnapshot()).toBe(baseline);
  act(() => store.set(previewAtom, { target: "layer", layerId: "group", patch: { rotation: 45 } }));
  expect(container.querySelector<HTMLElement>("[data-guide-id=local] span")!.style.transform).toBe(
    "rotate(-45deg) scale(0.5)",
  );
  act(() => store.set(previewAtom, null));
  expect(pageLine.style.left).toBe("10px");
});

it.each(["project", "page"] as const)(
  "cancels old page and layer guide drags after %s replacement",
  (change) => {
    for (const id of ["page", "local"]) {
      const d = fixture(),
        other = createPage();
      d.engine.load(createProject({ pages: [d.page, other] }));
      const { container, unmount } = render(
        <GuideOverlay {...d} selected={[d.layer.id]} view={view} />,
      );
      const handle = container.querySelector<HTMLElement>(`[data-guide-id="${id}"]`)!;
      vi.spyOn(handle, "hasPointerCapture").mockReturnValue(true);
      const release = vi.spyOn(handle, "releasePointerCapture");
      fireEvent.pointerDown(handle, pointer(10, 10));
      fireEvent.pointerMove(handle, pointer(20, 20));
      act(() => {
        if (change === "project") d.engine.load(structuredClone(d.engine.getSnapshot().project));
        else d.engine.setPage(other.id);
      });
      const baseline = d.engine.getSnapshot();
      expect(handle).not.toHaveAttribute("data-dragging");
      expect(release).toHaveBeenCalled();
      fireEvent.pointerMove(handle, pointer(30, 30));
      fireEvent.pointerUp(handle, pointer(30, 30));
      expect(d.engine.getSnapshot()).toBe(baseline);
      unmount();
    }
  },
);
