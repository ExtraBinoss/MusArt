import { expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { keybindings } from "../../../src/state/keybindings/store";
import { useKeybindings } from "../../../src/state/keybindings/use-keybindings";
test("synchronizes independent mounted consumers immediately after a persisted binding edit", () => {
  const a = renderHook(useKeybindings),
    b = renderHook(useKeybindings);
  const custom = { key: "p", mod: true, alt: true, shift: false };
  act(() => keybindings.assign("action:save", [custom]));
  expect(a.result.current).toBe(b.result.current);
  expect(a.result.current.bindings.get("action:save")).toEqual([custom]);
  act(() => keybindings.reset());
  a.unmount();
  b.unmount();
  localStorage.clear();
});
