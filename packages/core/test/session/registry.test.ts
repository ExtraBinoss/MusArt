import { it, expect } from "vitest";
import { COMMAND_HANDLERS } from "../../src/session/registry";
import { setup, box } from "../support/fixture";
it("dispatches every domain through an immutable own-key registry", () => {
  expect(Object.isFrozen(COMMAND_HANDLERS)).toBe(true);
  expect(Object.keys(COMMAND_HANDLERS)).toHaveLength(23);
  expect(Object.hasOwn(COMMAND_HANDLERS, "updateLayerPatches")).toBe(true);
  const { engine } = setup([box("a")]);
  for (const type of ["constructor", "toString", "unknown"])
    expect(() => engine.execute({ type } as never)).toThrow("inconnue");
});
