import { expect, test, vi } from "vitest";
import { EditorEngine } from "@musart/core";
import { createViewportResizeAnchor } from "../../../src/canvas/session/viewport-resize";

test("shares one imperative resize owner per engine and stale cleanup cannot retire a replacement", () => {
  const engine = new EditorEngine(),
    other = new EditorEngine();
  const port = createViewportResizeAnchor(engine),
    snapshot = engine.getSnapshot();
  expect(createViewportResizeAnchor(engine)).toBe(port);
  expect(createViewportResizeAnchor(other)).not.toBe(port);
  expect(port.capture()).toBeUndefined();
  const lease = { apply: vi.fn(), cancel: vi.fn(), finished: Promise.resolve() };
  const capture = vi.fn(() => lease),
    next = vi.fn(() => undefined);
  const stop = port.register(capture);
  expect(port.capture()).toBe(lease);
  const stopNext = port.register(next);
  stop();
  expect(port.capture()).toBeUndefined();
  expect(next).toHaveBeenCalledOnce();
  expect(capture).toHaveBeenCalledOnce();
  stopNext();
  expect(port.capture()).toBeUndefined();
  expect(next).toHaveBeenCalledOnce();
  const firstRegistration = port.register(capture);
  const replacement = port.register(capture);
  firstRegistration();
  expect(port.capture()).toBe(lease);
  replacement();
  expect(port.capture()).toBeUndefined();
  expect(engine.getSnapshot()).toBe(snapshot);
});
