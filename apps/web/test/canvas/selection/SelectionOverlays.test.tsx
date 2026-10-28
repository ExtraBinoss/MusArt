import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { SelectionOverlays } from "../../../src/canvas/selection/SelectionOverlays";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createPlaybackSource } from "../../../src/canvas/session/playback-source";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
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
  const { rerender } = render(
    <SelectionOverlays {...d} selected={selected} zoom={2} onHandle={onHandle} />,
  );
  expect(screen.getByText("8 × 8")).toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(5);
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
  expect(screen.queryByText("8 × 8")).toBeNull();
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
  expect(frame).toHaveStyle({ display: "none" });
  act(() => createPlaybackSource(d.engine).set(null));
  expect(frame.style.display).toBe("");
  unmount();
  expect(d.listeners.size).toBe(0);
});
