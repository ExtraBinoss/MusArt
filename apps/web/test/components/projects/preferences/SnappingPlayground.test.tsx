import { act, fireEvent, screen } from "@testing-library/react";
import { Profiler } from "react";
import { expect, test, vi } from "vitest";
import { SnappingPlayground } from "../../../../src/components/projects/preferences/SnappingPlayground";
import { snappingPreferences } from "../../../../src/state/snapping/preferences";
import { setup } from "../../../support/ui";

function sandbox() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 360,
    bottom: 180,
    width: 360,
    height: 180,
    toJSON() {},
  });
  snappingPreferences.reset();
  const d = setup(),
    commits = vi.fn();
  const view = d.mount(
    <Profiler id="sandbox" onRender={commits}>
      <SnappingPlayground />
    </Profiler>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Essayer le magnétisme" }));
  const stage = screen.getByTestId("snapping-playground"),
    object = screen.getByRole("button", { name: "Objet à déplacer" });
  return { ...d, view, commits, stage, object };
}

test("uses the real resolver with live screen-pixel preferences and no per-pointer React or history commits", () => {
  const d = sandbox(),
    before = d.engine.getSnapshot();
  const count = d.commits.mock.calls.length;
  fireEvent.pointerDown(d.object, { button: 0, clientX: 100, clientY: 20 });
  fireEvent.pointerMove(d.stage, { clientX: 278, clientY: 86 });
  expect(d.stage).toHaveAttribute("data-x", "232");
  expect(d.stage).toHaveAttribute("data-snapped", "true");
  expect(d.stage.querySelector('[data-snap-axis="x"]')).toHaveStyle({ visibility: "visible" });
  act(() => {
    snappingPreferences.update({ threshold: 1 });
  });
  expect(d.stage).toHaveAttribute("data-x", "230");
  expect(d.stage).toHaveAttribute("data-snapped", "false");
  act(() => {
    snappingPreferences.update({ threshold: 6 });
  });
  expect(d.stage).toHaveAttribute("data-x", "232");
  fireEvent.pointerMove(d.stage, { clientX: 278, clientY: 86, altKey: true });
  expect(d.stage).toHaveAttribute("data-x", "230");
  act(() => {
    snappingPreferences.update({ enabled: false });
  });
  expect(d.stage).toHaveAttribute("data-x", "230");
  fireEvent.pointerUp(d.stage);
  expect(d.commits).toHaveBeenCalledTimes(count);
  expect(d.engine.getSnapshot()).toBe(before);
  d.view.unmount();
  snappingPreferences.reset();
});

test("supports keyboard movement, reset and cancellation while cleaning up subscriptions and capture", () => {
  const d = sandbox();
  fireEvent.keyDown(d.object, { key: "ArrowRight", shiftKey: true });
  expect(d.stage).toHaveAttribute("data-x", "62");
  fireEvent.keyDown(d.object, { key: "ArrowDown" });
  expect(d.stage).toHaveAttribute("data-y", "17");
  fireEvent.keyDown(d.object, { key: "a" });
  fireEvent.pointerDown(d.object, { button: 2, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(d.stage, { clientX: 120 });
  expect(d.stage).toHaveAttribute("data-x", "62");
  fireEvent.pointerDown(d.object, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(d.stage, { clientX: 100, clientY: 0 });
  expect(d.stage.dataset.x).not.toBe("62");
  fireEvent.keyDown(d.object, { key: "Escape" });
  expect(d.stage).toHaveAttribute("data-x", "62");
  fireEvent.pointerDown(d.object, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(d.stage, { clientX: 100 });
  fireEvent.pointerCancel(d.stage);
  expect(d.stage).toHaveAttribute("data-x", "62");
  fireEvent.click(screen.getByRole("button", { name: "Recommencer" }));
  expect(d.stage).toHaveAttribute("data-x", "52");
  const captures = vi.spyOn(d.stage, "hasPointerCapture").mockReturnValue(true),
    release = vi.spyOn(d.stage, "releasePointerCapture");
  fireEvent.pointerDown(d.object, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.click(screen.getByRole("button", { name: "Fermer l’essai" }));
  expect(release).toHaveBeenCalledOnce();
  expect(captures).toHaveBeenCalled();
  expect(screen.queryByTestId("snapping-playground")).toBeNull();
  d.view.unmount();
  snappingPreferences.reset();
});
