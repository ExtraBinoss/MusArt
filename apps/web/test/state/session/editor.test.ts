import { createElement } from "react";
import { expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import {
  applyTheme,
  readTheme,
  themeAtom,
  useEngine,
  useTheme,
} from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
test("subscribes to immutable engine snapshots and cleans theme observer", () => {
  const { engine, store } = setup();
  const snapshot = renderHook(() => useEngine(engine));
  act(() => engine.select([engine.getSnapshot().project.pages[0]!.layers[0]!.id]));
  expect(snapshot.result.current.selection).toHaveLength(1);
  const theme = renderHook(() => useTheme(), {
    wrapper: ({ children }) => createElement(Provider, { store }, children),
  });
  act(() => store.set(themeAtom, "dark"));
  expect(document.documentElement).toHaveClass("dark");
  act(() => store.set(themeAtom, "light"));
  expect(document.documentElement).not.toHaveClass("dark");
  theme.unmount();
});
test("reads saved theme, follows system and tolerates blocked storage", () => {
  localStorage.setItem("musart.theme", "dark");
  expect(readTheme()).toBe("dark");
  localStorage.setItem("musart.theme", "light");
  expect(readTheme()).toBe("light");
  localStorage.setItem("musart.theme", "invalid");
  expect(readTheme()).toBe("system");
  applyTheme("system");
  applyTheme("dark");
  applyTheme("light");
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(readTheme()).toBe("system");
  get.mockRestore();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(() => applyTheme("dark")).not.toThrow();
});
