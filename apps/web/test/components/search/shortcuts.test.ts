import { expect, test } from "vitest";
import {
  modifierLabel,
  CANVAS_GESTURES,
  bindingLabel,
} from "../../../src/components/search/shortcuts";
import { bindingSnapshot } from "../../../src/state/keybindings/preferences";
test("documents implemented editor shortcuts and uses the platform modifier", () => {
  expect(modifierLabel("MacIntel")).toBe("⌘");
  expect(modifierLabel("iPad")).toBe("⌘");
  expect(modifierLabel("Linux x86_64")).toBe("Ctrl");
  expect(modifierLabel()).toBe("Ctrl");
  expect(CANVAS_GESTURES.map((item) => item[0])).toContain("search:zoom");
  expect(bindingLabel("action:save")).toBe("Ctrl+S");
  expect(bindingLabel("action:save", bindingSnapshot({ "action:save": [] }))).toBe("");
});
