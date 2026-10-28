import { TooltipProvider } from "../../../src/components/ui/tooltip";
import type { ReactNode } from "react";
import type { RenderOptions } from "@testing-library/react";
import { act, fireEvent, render as renderBase, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createProject, EditorEngine } from "@musart/core";
import { AddArtboardOverlay } from "../../../src/canvas/artboards/AddArtboardOverlay";
import { createCommandPort } from "../../../src/state/keybindings/command-port";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createPlaybackSource } from "../../../src/canvas/session/playback-source";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
const render = (node: ReactNode, options?: RenderOptions) =>
  renderBase(node, {
    ...options,
    wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider>,
  });
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
it("dispatches the genuine shared add action and reports unavailable commands", () => {
  const engine = new EditorEngine(createProject()),
    onError = vi.fn();
  render(<AddArtboardOverlay engine={engine} onError={onError} />);
  const button = screen.getByRole("button", { name: "quickAdd:addArtboard" });
  expect(button).toHaveAttribute("data-canvas-control");
  fireEvent.click(button);
  expect(onError).toHaveBeenCalledWith("quickAdd:unavailable");
  const run = vi.fn(() => true),
    stop = createCommandPort(engine).subscribe(run);
  fireEvent.click(button);
  expect(run).toHaveBeenCalledWith("action:addPage");
  stop();
});
it("disables during playback and releases its scene subscription on unmount", () => {
  const engine = new EditorEngine(createProject()),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE),
    run = vi.fn(() => true),
    stop = createCommandPort(engine).subscribe(run);
  const { unmount } = render(<AddArtboardOverlay engine={engine} controller={controller} />);
  const button = screen.getByRole("button");
  const page = engine.getSnapshot().project.pages[0]!;
  act(() => createPlaybackSource(engine).set({ page, assets: {} }));
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(run).not.toHaveBeenCalled();
  act(() => createPlaybackSource(engine).set(null));
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(run).toHaveBeenCalledOnce();
  unmount();
  stop();
});
