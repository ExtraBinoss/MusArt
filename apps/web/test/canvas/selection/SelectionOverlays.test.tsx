import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { SelectionOverlays } from "../../../src/canvas/selection/SelectionOverlays";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createPlaybackSource } from "../../../src/canvas/session/playback-source";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
import { motionPoseFixture } from "../../support/motion-pose";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; count?: number }) =>
      options?.defaultValue ?? `${key}:${options?.count ?? ""}`,
  }),
}));
function source(count: number) {
  const layers = Array.from({ length: count }, (_unused, index) =>
    createLayer("rectangle", {
      id: `item-${index}`,
      x: (index % 100) * 10,
      y: Math.floor(index / 100) * 10,
      width: 8,
      height: 8,
    }),
  );
  const engine = new EditorEngine(
      createProject({ pages: [createPage({ width: 1200, height: 1200, layers })] }),
    ),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE),
    listeners = new Set<() => void>();
  let view = { x: 0, y: 0, zoom: 1 };
  const viewSource = {
    read: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    engine,
    controller,
    viewSource,
    listeners,
    page: engine.getSnapshot().project.pages[0]!,
    setView: (next: typeof view) => {
      view = next;
      listeners.forEach((listener) => listener());
    },
  };
}
it("keeps ordinary per-layer handles and locks while exposing the real size", () => {
  const d = source(2),
    onHandle = vi.fn(),
    selected = [d.page.layers[0]!];
  const { rerender, container } = render(
    <SelectionOverlays {...d} selected={selected} zoom={2} onHandle={onHandle} />,
  );
  expect(screen.getByText("8 × 8")).toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(5);
  expect(container.querySelector(".canvas-selection-overlays")).toHaveAttribute(
    "data-selection-count",
    "1",
  );
  fireEvent.pointerDown(screen.getAllByRole("button")[0]!);
  expect(onHandle).toHaveBeenCalledOnce();
  rerender(
    <SelectionOverlays
      {...d}
      selected={[{ ...selected[0]!, locked: true }, d.page.layers[1]!]}
      zoom={1}
      onHandle={onHandle}
    />,
  );
  expect(screen.getAllByRole("button")).toHaveLength(5);
  expect(container.querySelector(".canvas-selection-overlays")).toHaveAttribute(
    "data-selection-count",
    "2",
  );
  expect(screen.queryByText("8 × 8")).toBeNull();
  expect(screen.getByRole("img", { name: "Locked" })).toHaveClass("canvas-layer-lock");
});
it("represents ten thousand selected layers with one accurate collective frame and imperative previews", () => {
  const d = source(10000),
    onHandle = vi.fn();
  let renders = 0;
  function Probe() {
    renders++;
    return <SelectionOverlays {...d} selected={d.page.layers} zoom={1} onHandle={onHandle} />;
  }
  const { container, unmount } = render(<Probe />),
    frame = container.querySelector<HTMLElement>(".canvas-selection-collective")!;
  expect(container.querySelectorAll(".canvas-selection")).toHaveLength(1);
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  expect(frame).toHaveAttribute("data-selection-count", "10000");
  expect(frame).toHaveStyle({ left: "0px", top: "0px", width: "998px", height: "998px" });
  act(() =>
    d.controller.setGesture(
      d.page.layers.map((layer) => ({
        layerId: layer.id,
        patch: { x: layer.x + 5, y: layer.y + 8 },
      })),
    ),
  );
  expect(frame).toHaveStyle({ left: "5px", top: "8px" });
  expect(renders).toBe(1);
  act(() => d.setView({ x: 100, y: 100, zoom: 2 }));
  expect(frame.style.borderWidth).toBe("0.5px");
  expect(frame.querySelector("span")).toHaveStyle({ transform: "translateX(-50%) scale(0.5)" });
  act(() => createPlaybackSource(d.engine).set({ page: d.page, assets: {} }));
  expect(frame.style.display).toBe("");
  expect(frame.style.opacity).toBe("0.2");
  act(() => createPlaybackSource(d.engine).set(null));
  expect(frame.style.display).toBe("");
  unmount();
  expect(d.listeners.size).toBe(0);
});

it("fades selected handles during playback, removes their editing targets and restores them on pause", () => {
  const d = source(1),
    onHandle = vi.fn();
  const mount = render(
    <SelectionOverlays {...d} selected={d.page.layers} zoom={1} onHandle={onHandle} />,
  );
  const handle = screen.getAllByRole("button")[0]!;
  act(() => createPlaybackSource(d.engine).set({ page: d.page, assets: {} }));
  const overlays = mount.container.querySelector<HTMLElement>(".canvas-selection-overlays")!;
  expect(overlays).toHaveAttribute("data-playback", "true");
  expect(overlays.inert).toBe(true);
  expect(handle).toBeDisabled();
  fireEvent.pointerDown(handle);
  expect(onHandle).not.toHaveBeenCalled();
  act(() => createPlaybackSource(d.engine).set(null));
  expect(overlays.inert).toBe(false);
  expect(handle).toBeEnabled();
  fireEvent.pointerDown(handle);
  expect(onHandle).toHaveBeenCalledOnce();
  mount.unmount();
});

it("mounts a newly selected paused media layer on its evaluated size and parent matrix without a new scene frame", () => {
  const d = motionPoseFixture(),
    changes = vi.fn(),
    stop = d.controller.subscribe(changes);
  const props = {
    page: d.page,
    zoom: 1,
    controller: d.controller,
    viewSource: { read: () => ({ x: 0, y: 0, zoom: 1 }), subscribe: () => () => {} },
    onHandle: vi.fn(),
  };
  const mount = render(<SelectionOverlays {...props} selected={[]} />);
  act(() => d.engine.select([d.picture.id]));
  mount.rerender(
    <SelectionOverlays
      {...props}
      selected={[d.page.layers.find((layer) => layer.id === d.picture.id)!]}
    />,
  );
  const outline = mount.container.querySelector<HTMLElement>(
    `.canvas-selection[data-layer-id="${d.picture.id}"]`,
  )!;
  expect(outline).toHaveStyle({ width: "45px", height: "30px" });
  expect(outline.style.transform).toBe(`matrix(${d.index.worldMatrix(d.picture.id).join(",")})`);
  expect(screen.getByText("45 × 30")).toBeInTheDocument();
  act(() => d.engine.select([d.movie.id]));
  mount.rerender(
    <SelectionOverlays
      {...props}
      selected={[d.page.layers.find((layer) => layer.id === d.movie.id)!]}
    />,
  );
  expect(
    mount.container.querySelector<HTMLElement>(`.canvas-selection[data-layer-id="${d.movie.id}"]`)!
      .style.transform,
  ).toBe(`matrix(${d.index.worldMatrix(d.movie.id).join(",")})`);
  expect(d.controller.read()).toBe(d.frame);
  expect(changes).not.toHaveBeenCalled();
  stop();
  mount.unmount();
});
