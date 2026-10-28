import { expect, it, vi } from "vitest";
import { EditorEngine } from "@musart/core";
import { createViewportActions } from "../../../src/canvas/session/viewport-actions";

it("shares canvas actions per engine without queuing absent views or modifying documents", () => {
  const engine = new EditorEngine(),
    other = new EditorEngine(),
    port = createViewportActions(engine),
    baseline = engine.getSnapshot(),
    listener = vi.fn();
  expect(createViewportActions(engine)).toBe(port);
  expect(createViewportActions(other)).not.toBe(port);
  expect(port.run("fit")).toBe(false);
  const stop = port.subscribe(listener);
  expect(listener).not.toHaveBeenCalled();
  for (const action of ["zoomIn", "zoomOut", "reset", "recenter", "fit"] as const)
    expect(port.run(action)).toBe(true);
  expect(listener.mock.calls.map(([action]) => action)).toEqual([
    "zoomIn",
    "zoomOut",
    "reset",
    "recenter",
    "fit",
  ]);
  expect(engine.getSnapshot()).toBe(baseline);
  stop();
  stop();
  expect(port.run("reset")).toBe(false);
  expect(listener).toHaveBeenCalledTimes(5);
});
