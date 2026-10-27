import { expect, it } from "vitest";
import { AMOUNT, DEFAULTS, defineEffect } from "../../src/effects/definition";
it("isolates and deeply freezes defaults and nested descriptors", () => {
  const settings = { preset: "custom" },
    options = [{ value: "custom", labelKey: "custom" }];
  const definition = defineEffect("gradient", { settings }, [
    AMOUNT,
    {
      kind: "select",
      key: "preset",
      scope: "settings",
      labelKey: "preset",
      default: "custom",
      options,
      visibleWhen: { key: "style", values: ["silk"] },
    },
  ]);
  settings.preset = "silk";
  options[0]!.value = "silk";
  expect(definition.defaults.settings?.preset).toBe("custom");
  const choice = definition.parameters[1]!;
  expect(choice.kind === "select" && choice.options[0]?.value).toBe("custom");
  expect(Object.isFrozen(definition.defaults.settings)).toBe(true);
  expect(Object.isFrozen(choice)).toBe(true);
  expect(definition.defaults.amount).toBe(DEFAULTS.amount);
});
