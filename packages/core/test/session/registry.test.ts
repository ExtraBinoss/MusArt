import { it, expect } from "vitest";
import { COMMAND_HANDLERS, isCommandType } from "../../src/session/registry";
import { setup, box } from "../support/fixture";
it("dispatches every domain through an immutable own-key registry", () => {
  expect(Object.isFrozen(COMMAND_HANDLERS)).toBe(true);
  expect(Object.keys(COMMAND_HANDLERS)).toHaveLength(23);
  expect(Object.hasOwn(COMMAND_HANDLERS, "updateLayerPatches")).toBe(true);
  const { engine } = setup([box("a")]);
  for (const type of ["constructor", "toString", "unknown"])
    expect(() => engine.execute({ type } as never)).toThrow("inconnue");
});

it("validates transport command names against the same authoritative registry", () => {
  for (const type of Object.keys(COMMAND_HANDLERS)) expect(isCommandType(type)).toBe(true);
  for (const value of [null, undefined, 1, {}, "toString", "constructor", "__proto__", "unknown"])
    expect(isCommandType(value)).toBe(false);
});
