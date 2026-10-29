import { createElement } from "react";
import { expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import {
  applyTheme,
  readTheme,
  themeAtom,
  useEngine,
  useEngineValue,
  useTheme,
} from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
test("selected engine values skip unrelated publications, follow new selectors and release subscriptions", () => {
  const { engine, rectangle, text } = setup();
  const subscribed = vi.spyOn(engine, "subscribe");
  const view = vi.fn();
  const hook = renderHook(
    ({ selection }) => {
      const value = useEngineValue(engine, (snapshot) =>
        selection ? snapshot.selection[0] : snapshot.project,
      );
      view(value);
      return value;
    },
    { initialProps: { selection: false } },
  );
  const project = hook.result.current;
  act(() => engine.select([rectangle.id]));
  expect(view).toHaveBeenCalledTimes(1);
  expect(hook.result.current).toBe(project);
  hook.rerender({ selection: true });
  expect(hook.result.current).toBe(rectangle.id);
  act(() => engine.select([text.id]));
  expect(hook.result.current).toBe(text.id);
  act(() => engine.execute({ type: "renameProject", name: "Updated" }));
  expect(view).toHaveBeenCalledTimes(3);
  hook.rerender({ selection: false });
  expect(hook.result.current).toHaveProperty("name", "Updated");
  expect(subscribed).toHaveBeenCalledTimes(1);
  hook.unmount();
  const renders = view.mock.calls.length;
  act(() => engine.select([]));
  expect(view).toHaveBeenCalledTimes(renders);
});
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
