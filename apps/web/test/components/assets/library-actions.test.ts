import { expect, it, vi } from "vitest";
import { EditorEngine } from "@musart/core";
import { createLibraryActions } from "../../../src/components/assets/library-actions";
it("shares only an engine's library presentation port and releases listeners", () => {
  const engine = new EditorEngine(),
    port = createLibraryActions(engine),
    listener = vi.fn();
  expect(createLibraryActions(engine)).toBe(port);
  expect(port.open()).toBe(false);
  const stop = port.subscribe(listener);
  expect(port.open()).toBe(true);
  expect(listener).toHaveBeenCalledOnce();
  expect(createLibraryActions(new EditorEngine()).open()).toBe(false);
  stop();
  stop();
  expect(port.open()).toBe(false);
});
