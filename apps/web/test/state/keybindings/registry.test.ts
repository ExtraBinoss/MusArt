import { expect, test } from "vitest";
import { EFFECT_CATALOG } from "@musart/core";
import { ACTIONS } from "../../../src/components/search/catalog/definitions";
import { BINDING_COMMANDS, isCommandId } from "../../../src/state/keybindings/registry";
import { bindingSnapshot } from "../../../src/state/keybindings/preferences";
test("covers every actual search command/effect and eight directional moves with unique collision-free defaults", () => {
  expect(new Set(BINDING_COMMANDS.map((command) => command.id)).size).toBe(
    ACTIONS.length + Object.keys(EFFECT_CATALOG).length + 9,
  );
  expect(isCommandId("app:search")).toBe(true);
  expect(isCommandId("__proto__")).toBe(false);
  expect(bindingSnapshot().bindings.get("action:redo")).toHaveLength(2);
  expect(bindingSnapshot().bindings.get("action:delete")).toHaveLength(2);
  expect(bindingSnapshot().bindings.get("action:reset")?.[0]).toMatchObject({
    key: "1",
    mod: true,
  });
  expect(bindingSnapshot().bindings.get("nudge:LeftLarge")?.[0]).toMatchObject({
    key: "ArrowLeft",
    shift: true,
  });
});
