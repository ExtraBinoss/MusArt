import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { SHAPE_CATALOG } from "@musart/assets";
import { ShapeToolSlot } from "../../../src/components/assets/ShapeToolSlot";
import { shapeChoiceAtom } from "../../../src/components/assets/selection";
import { toolAtom } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
import { createLibraryActions } from "../../../src/components/assets/library-actions";
vi.mock("../../../src/components/assets/ShapePalette", () => ({
  ShapePalette: ({ onChoose }: { onChoose: (item: (typeof SHAPE_CATALOG)[number]) => void }) => (
    <button onClick={() => onChoose(SHAPE_CATALOG[1]!)}>Choose artwork</button>
  ),
}));
afterEach(() => vi.useRealTimers());
test("opens the same artwork library through an engine-scoped action and releases it on unmount", () => {
  const d = setup(),
    view = d.mount(<ShapeToolSlot engine={d.engine} />),
    actions = createLibraryActions(d.engine);
  act(() => {
    expect(actions.open()).toBe(true);
  });
  expect(screen.getByText("Choose artwork")).toBeVisible();
  view.unmount();
  expect(actions.open()).toBe(false);
});
test("opens on long press and remembers the selected artwork across tools", async () => {
  vi.useFakeTimers();
  const d = setup();
  d.mount(<ShapeToolSlot engine={d.engine} />);
  const tool = screen.getByLabelText("Outil forme");
  fireEvent.pointerDown(tool, { button: 0 });
  await act(async () => {
    vi.advanceTimersByTime(449);
  });
  expect(screen.queryByText("Choose artwork")).toBeNull();
  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  fireEvent.click(screen.getByText("Choose artwork"));
  expect(d.store.get(toolAtom)).toBe("shape");
  expect(d.store.get(shapeChoiceAtom)).toBe(SHAPE_CATALOG[1]);
});
test("supports context menu, keyboard disclosure and cancelled presses with cleanup", async () => {
  vi.useFakeTimers();
  const d = setup();
  const view = d.mount(<ShapeToolSlot engine={d.engine} />);
  const tool = screen.getByLabelText("Outil forme");
  fireEvent.pointerDown(tool, { button: 0 });
  fireEvent.pointerCancel(tool);
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  expect(screen.queryByText("Choose artwork")).toBeNull();
  fireEvent.pointerDown(tool, { button: 0 });
  fireEvent.pointerLeave(tool);
  fireEvent.pointerUp(tool);
  fireEvent.click(tool);
  expect(d.store.get(toolAtom)).toBe("shape");
  fireEvent.contextMenu(tool);
  expect(screen.getByText("Choose artwork")).toBeVisible();
  fireEvent.click(screen.getByText("Choose artwork"));
  fireEvent.keyDown(tool, { key: "ArrowRight" });
  expect(screen.getByText("Choose artwork")).toBeVisible();
  fireEvent.click(screen.getByText("Choose artwork"));
  fireEvent.keyDown(tool, { key: "ArrowDown" });
  expect(screen.getByText("Choose artwork")).toBeVisible();
  fireEvent.pointerDown(tool, { button: 0 });
  const pending = vi.getTimerCount();
  view.unmount();
  expect(vi.getTimerCount()).toBeLessThan(pending);
  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  expect(vi.getTimerCount()).toBe(0);
});
