import { expect, it, vi } from "vitest";
import { act, fireEvent, render as baseRender, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider, createStore } from "jotai";
import { TooltipProvider } from "../../../src/components/ui/tooltip";
import { ViewportControls } from "../../../src/canvas/viewport/ViewportControls";
import { createViewportActions } from "../../../src/canvas/session/viewport-actions";
import { EditorEngine } from "@musart/core";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const render = (node: ReactNode) => {
  const store = createStore();
  return baseRender(node, {
    wrapper: ({ children }) => (
      <Provider store={store}>
        <TooltipProvider>{children}</TooltipProvider>
      </Provider>
    ),
  });
};
it("keeps zoom controls and toggles the Motion timeline while recenter remains a shared action", () => {
  const actions = createViewportActions(new EditorEngine()),
    listener = vi.fn(),
    stop = actions.subscribe(listener);
  const { rerender } = render(
    <ViewportControls actions={actions} view={{ x: 0, y: 0, zoom: 0.5 }} />,
  );
  expect(screen.queryByLabelText("recenterView")).toBeNull();
  expect(screen.queryByLabelText("fitView")).toBeNull();
  fireEvent.click(screen.getByLabelText("zoomOut"));
  fireEvent.click(screen.getByLabelText("resetView"));
  fireEvent.click(screen.getByLabelText("zoomIn"));
  expect(listener.mock.calls.map(([action]) => action)).toEqual(["zoomOut", "reset", "zoomIn"]);
  rerender(<ViewportControls actions={actions} view={{ x: 81, y: 0, zoom: 1 }} motionEnabled />);
  const timeline = screen.getByRole("button", { name: "motion:timeline" });
  expect(timeline).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(timeline);
  expect(timeline).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(timeline);
  expect(timeline).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByText("recenterView")).toBeNull();
  actions.run("recenter");
  expect(listener).toHaveBeenLastCalledWith("recenter");
  stop();
});

it("observes mode changes independently from the canvas geometry subscription", () => {
  const engine = new EditorEngine();
  const actions = createViewportActions(engine);
  render(<ViewportControls engine={engine} actions={actions} view={{ x: 0, y: 0, zoom: 1 }} />);
  expect(screen.queryByRole("button", { name: "motion:timeline" })).toBeNull();
  act(() => engine.execute({ type: "setCompositionMode", mode: "motion" }));
  expect(screen.getByRole("button", { name: "motion:timeline" })).toBeVisible();
  act(() => engine.execute({ type: "setCompositionMode", mode: "static" }));
  expect(screen.queryByRole("button", { name: "motion:timeline" })).toBeNull();
});
