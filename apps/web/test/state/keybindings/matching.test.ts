import { expect, test } from "vitest";
import { isEditingShortcutTarget, matchBinding } from "../../../src/state/keybindings/matching";
import { bindingSnapshot } from "../../../src/state/keybindings/preferences";
test("matches live portable bindings and leaves composing/unknown keys and editable widgets untouched", () => {
  const defaults = bindingSnapshot();
  expect(matchBinding(new KeyboardEvent("keydown", { key: "S", metaKey: true }), defaults)).toBe(
    "action:save",
  );
  expect(
    matchBinding(
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true, isComposing: true }),
      defaults,
    ),
  ).toBeUndefined();
  expect(matchBinding(new KeyboardEvent("keydown", { key: "q" }), defaults)).toBeUndefined();
  expect(isEditingShortcutTarget(null)).toBe(false);
  for (const tag of ["input", "textarea", "select"])
    expect(isEditingShortcutTarget(document.createElement(tag))).toBe(true);
  const widget = document.createElement("div"),
    child = document.createElement("button");
  widget.append(child);
  for (const role of [
    "dialog",
    "alertdialog",
    "slider",
    "spinbutton",
    "combobox",
    "listbox",
    "menu",
  ]) {
    widget.setAttribute("role", role);
    expect(isEditingShortcutTarget(child)).toBe(true);
  }
  widget.removeAttribute("role");
  expect(isEditingShortcutTarget(child)).toBe(false);
  Object.defineProperty(widget, "isContentEditable", { value: true });
  expect(isEditingShortcutTarget(widget)).toBe(true);
});

test("document scopes allow non-text widgets while retaining text and modal ownership", () => {
  const scope = document.createElement("div"),
    child = document.createElement("button");
  scope.setAttribute("data-keybinding-capture", "");
  scope.append(child);
  expect(isEditingShortcutTarget(child)).toBe(true);
  expect(isEditingShortcutTarget(child, { documentScope: true })).toBe(false);
  for (const role of ["slider", "spinbutton"]) {
    child.setAttribute("role", role);
    expect(isEditingShortcutTarget(child, { documentScope: true })).toBe(false);
  }
  for (const role of ["dialog", "alertdialog", "menu", "combobox", "listbox"]) {
    child.setAttribute("role", role);
    expect(isEditingShortcutTarget(child, { documentScope: true })).toBe(true);
  }
  child.removeAttribute("role");
  scope.setAttribute("contenteditable", "true");
  expect(isEditingShortcutTarget(child, { documentScope: true })).toBe(true);
  for (const tag of ["input", "textarea", "select"]) {
    const field = document.createElement(tag);
    scope.removeAttribute("contenteditable");
    scope.append(field);
    expect(isEditingShortcutTarget(field, { documentScope: true })).toBe(true);
  }
});
