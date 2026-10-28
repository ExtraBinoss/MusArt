import { expect, test } from "vitest";
import {
  bindingSnapshot,
  KeybindingError,
  readBindings,
  serializeBindings,
} from "../../../src/state/keybindings/preferences";
const custom = { key: "p", mod: true, shift: false, alt: true };
test("validates every override, rejects collisions including defaults and keeps disabled bindings explicit", () => {
  const snapshot = bindingSnapshot({ "action:save": [custom], "action:delete": [] });
  expect(snapshot.bindings.get("action:save")).toEqual([custom]);
  expect(snapshot.bindings.get("action:delete")).toEqual([]);
  expect(readBindings(serializeBindings(snapshot)).overrides).toEqual(snapshot.overrides);
  expect(() => bindingSnapshot({ "action:save": [{ ...custom, key: "z", alt: false }] })).toThrow(
    KeybindingError,
  );
  try {
    bindingSnapshot({ "action:save": [{ ...custom, key: "z", alt: false }] });
  } catch (error) {
    expect(error).toMatchObject({ code: "collision", conflict: "action:undo" });
  }
  for (const overrides of [
    { missing: [] },
    { "action:save": "bad" },
    { "action:save": [custom, custom, custom] },
    { "action:save": [{}] },
  ])
    expect(() => bindingSnapshot(overrides as never)).toThrow("invalid");
  expect(
    bindingSnapshot({ "action:save": [custom, custom] }).bindings.get("action:save"),
  ).toHaveLength(1);
});
test("restores safe defaults for malformed/colliding storage and discards unknown IDs across upgrades", () => {
  for (const serialized of [
    null,
    "",
    "not JSON",
    "x".repeat(32769),
    "{}",
    "[]",
    '{"version":2}',
    '{"version":1,"overrides":[]}',
    '{"version":1,"overrides":null}',
    '{"version":1,"overrides":{"action:save":[{}]}}',
  ])
    expect(readBindings(serialized).overrides).toEqual({});
  expect(
    readBindings(
      JSON.stringify({ version: 1, overrides: { obsolete: [custom], "action:save": [custom] } }),
    ).overrides,
  ).toEqual({ "action:save": [custom] });
  expect(
    readBindings(
      JSON.stringify({
        version: 1,
        overrides: { "action:save": [{ ...custom, key: "z", alt: false }] },
      }),
    ).overrides,
  ).toEqual({});
});
