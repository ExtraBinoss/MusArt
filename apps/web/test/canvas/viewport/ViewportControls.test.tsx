import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ViewportControls } from "../../../src/canvas/viewport/ViewportControls";
import { createViewportActions } from "../../../src/canvas/session/viewport-actions";
import { EditorEngine } from "@musart/core";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
it("keeps essential controls compact, exposes conditional recenter and leaves fit in shared actions", () => {
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
  rerender(<ViewportControls actions={actions} view={{ x: 81, y: 0, zoom: 1 }} />);
  fireEvent.click(screen.getByText("recenterView"));
  rerender(<ViewportControls actions={actions} view={{ x: 0, y: -81, zoom: 1 }} />);
  expect(screen.getByText("recenterView")).toHaveClass("floating-panel");
  expect(listener).toHaveBeenLastCalledWith("recenter");
  stop();
});
