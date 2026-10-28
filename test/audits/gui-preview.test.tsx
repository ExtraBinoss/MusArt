import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
} from "../../packages/core/src/index";
import { createStore } from "jotai";
import { EditorCanvas } from "../../apps/web/src/canvas/EditorCanvas";
import { SceneController } from "../../apps/web/src/canvas/session/scene-controller";
import { createPreviewSource } from "../../apps/web/src/state/session/preview-source";
import { previewAtom } from "../../apps/web/src/state/session/editor";
import { TooltipProvider } from "../../apps/web/src/components/ui/tooltip";
import { NumberInput } from "../../apps/web/src/components/shared/NumberInput";
vi.mock("../../apps/web/src/canvas/render/EditorScene", () => ({ EditorScene: () => null }));
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 800,
    right: 1000,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("independent imperative GUI preview audit", () => {
  it("uses the current document for hit testing after an opacity-only commit", () => {
    const layer = createLayer("rectangle", { x: 20, y: 20, width: 60, height: 50 });
    const engine = new EditorEngine(
      createProject({ pages: [createPage({ width: 200, height: 160, layers: [layer] })] }),
    );
    render(
      <TooltipProvider>
        <EditorCanvas engine={engine} tool="pointer" />
      </TooltipProvider>,
    );
    act(() => engine.execute({ type: "updateLayers", ids: [layer.id], patch: { opacity: 0 } }));
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.opacity).toBe(0);
    const canvas = screen.getByTestId("editor-canvas");
    const click = { clientX: 440, clientY: 360, pointerId: 1, button: 0 };
    fireEvent.pointerDown(canvas, click);
    fireEvent.pointerUp(canvas, click);
    expect(engine.getSnapshot().selection).toEqual([]);
  });
  it("cancels a slider preview when the platform cancels pointer capture", () => {
    const preview = vi.fn();
    const commit = vi.fn();
    const cancel = vi.fn();
    const { container } = render(
      <NumberInput
        label="Opacity"
        value={50}
        onPreview={preview}
        onCommit={commit}
        onCancel={cancel}
      />,
    );
    const slider = container.querySelector<HTMLElement>(".number-scrub")!;
    fireEvent.pointerDown(slider, { clientX: 750, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerMove(slider, { clientX: 800, clientY: 10, pointerId: 1, button: 0 });
    expect(preview).toHaveBeenLastCalledWith(60);
    fireEvent.pointerCancel(slider, { pointerId: 1 });
    expect(cancel).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });
  it("does not interpret a valid layer id as a page-background command", () => {
    const layer = createLayer("rectangle", { id: "__page__", fill: "#ffffff" });
    const engine = new EditorEngine(
      createProject({ pages: [createPage({ background: "#112233", layers: [layer] })] }),
    );
    const store = createStore();
    const controller = new SceneController(engine, createPreviewSource(store));
    store.set(previewAtom, { target: "layer", layerId: layer.id, patch: { fill: "#ff0000" } });
    expect(controller.read().page.layers[0]!.fill).toBe("#ff0000");
    expect(controller.read().page.background).toBe("#112233");
  });
});
