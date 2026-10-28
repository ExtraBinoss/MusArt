import { expect, test, vi } from "vitest";
import { fireEvent, renderHook } from "@testing-library/react";
import { useSearchShortcuts } from "../../../src/components/search/use-search-shortcuts";
import { keybindings } from "../../../src/state/keybindings/store";
test("opens and toggles with Ctrl/Cmd K, preserves modal/editing shortcuts and cleans up", () => {
  const toggle = vi.fn(),
    help = vi.fn();
  const hook = renderHook(() => useSearchShortcuts(toggle, help));
  for (const key of ["k", "K"]) fireEvent.keyDown(document, { key, ctrlKey: true });
  fireEvent.keyDown(document, { key: "k", metaKey: true });
  expect(toggle).toHaveBeenCalledTimes(3);
  const input = document.createElement("input");
  document.body.append(input);
  fireEvent.keyDown(input, { key: "?" });
  fireEvent.keyDown(input, { key: "k", ctrlKey: true });
  expect(toggle).toHaveBeenCalledTimes(4);
  expect(help).not.toHaveBeenCalled();
  input.remove();
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  document.body.append(dialog);
  fireEvent.keyDown(dialog, { key: "k", ctrlKey: true });
  fireEvent.keyDown(dialog, { key: "?" });
  expect(toggle).toHaveBeenCalledTimes(4);
  dialog.setAttribute("data-magic-search", "");
  fireEvent.keyDown(dialog, { key: "k", metaKey: true });
  expect(toggle).toHaveBeenCalledTimes(5);
  dialog.remove();
  fireEvent.keyDown(document, { key: "?" });
  expect(help).toHaveBeenCalledOnce();
  for (const options of [{ repeat: true }, { isComposing: true }, { altKey: true }])
    fireEvent.keyDown(document, { key: "k", ctrlKey: true, ...options });
  fireEvent.keyDown(document, { key: "?", ctrlKey: true });
  fireEvent.keyDown(document, { key: "a" });
  const consumed = new KeyboardEvent("keydown", {
    key: "k",
    ctrlKey: true,
    cancelable: true,
    bubbles: true,
  });
  consumed.preventDefault();
  document.dispatchEvent(consumed);
  expect(toggle).toHaveBeenCalledTimes(5);
  hook.unmount();
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  fireEvent.keyDown(document, { key: "?" });
  expect(toggle).toHaveBeenCalledTimes(5);
  expect(help).toHaveBeenCalledOnce();
});
test("uses changed search/help bindings immediately and blocks another dialog or active recording", () => {
  const toggle = vi.fn(),
    help = vi.fn(),
    hook = renderHook(() => useSearchShortcuts(toggle, help));
  keybindings.assign("app:search", [{ key: "p", mod: true, alt: true, shift: false }]);
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  fireEvent.keyDown(document, { key: "p", ctrlKey: true, altKey: true });
  expect(toggle).toHaveBeenCalledOnce();
  const modal = document.createElement("div");
  modal.setAttribute("role", "alertdialog");
  document.body.append(modal);
  fireEvent.keyDown(document, { key: "p", ctrlKey: true, altKey: true });
  expect(toggle).toHaveBeenCalledOnce();
  modal.remove();
  const recording = document.createElement("button");
  recording.setAttribute("data-keybinding-capture", "");
  document.body.append(recording);
  fireEvent.keyDown(recording, { key: "p", ctrlKey: true, altKey: true });
  expect(toggle).toHaveBeenCalledOnce();
  recording.remove();
  keybindings.reset();
  hook.unmount();
  localStorage.clear();
});
