import { it, expect } from "vitest";
import { COMMAND_HANDLERS, isCommandType } from "../../src/session/registry";
import type { Command } from "../../src/document/model";
import { setup, box } from "../support/fixture";

const commandTypes = [
  "addLayers",
  "updateLayers",
  "updateLayerPatches",
  "deleteLayers",
  "duplicateLayers",
  "reorderLayer",
  "groupLayers",
  "ungroupLayers",
  "addPage",
  "updatePage",
  "deletePage",
  "renameProject",
  "addAssets",
  "addGuide",
  "updateGuide",
  "deleteGuide",
  "alignLayers",
  "distributeLayers",
  "attachLayerMask",
  "createMaskFromSelection",
  "updateMask",
  "removeLayerMask",
  "setReplay",
  "setCompositionMode",
  "setMotionDuration",
  "setMotionTrackRange",
  "setMotionMedia",
  "upsertMotionKeyframe",
  "moveMotionKeyframe",
  "deleteMotionKeyframe",
  "moveMotionTrack",
  "moveMotionKeyframes",
  "deleteMotionKeyframes",
] as const satisfies readonly Command["type"][];

it("dispatches every domain through an immutable own-key registry", () => {
  expect(Object.isFrozen(COMMAND_HANDLERS)).toBe(true);
  expect(Object.keys(COMMAND_HANDLERS).sort()).toEqual([...commandTypes].sort());
  for (const type of commandTypes) {
    expect(Object.hasOwn(COMMAND_HANDLERS, type)).toBe(true);
    expect(COMMAND_HANDLERS[type]).toBeTypeOf("function");
    expect(Object.getOwnPropertyDescriptor(COMMAND_HANDLERS, type)).toMatchObject({
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  const { engine } = setup([box("a")]);
  for (const type of ["constructor", "toString", "__proto__", "unknown"])
    expect(() => engine.execute({ type } as never)).toThrow("inconnue");
});

it("validates transport command names against the same authoritative registry", () => {
  for (const type of Object.keys(COMMAND_HANDLERS)) expect(isCommandType(type)).toBe(true);
  for (const value of [null, undefined, 1, {}, "toString", "constructor", "__proto__", "unknown"])
    expect(isCommandType(value)).toBe(false);
});
