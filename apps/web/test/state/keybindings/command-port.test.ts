import { expect, test, vi } from "vitest";
import { EditorEngine } from "@musart/core";
import { createCommandPort } from "../../../src/state/keybindings/command-port";
test("routes only to the current mounted runner, isolates engines and rejects unknown commands", () => {
  const engine = new EditorEngine(),
    port = createCommandPort(engine),
    first = vi.fn(() => true),
    second = vi.fn(() => true);
  expect(createCommandPort(engine)).toBe(port);
  expect(port.run("action:save")).toBe(false);
  const stale = port.subscribe(first),
    stop = port.subscribe(second);
  stale();
  expect(port.run("action:save")).toBe(true);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledExactlyOnceWith("action:save");
  expect(port.run("unknown" as never)).toBe(false);
  expect(createCommandPort(new EditorEngine()).run("action:save")).toBe(false);
  stop();
  expect(port.run("action:save")).toBe(false);
});
