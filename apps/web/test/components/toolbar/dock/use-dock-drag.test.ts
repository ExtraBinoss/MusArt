import { createElement, type DragEvent, type PropsWithChildren } from "react";
import { Provider } from "jotai";
import { act, fireEvent, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useDockDrag } from "../../../../src/components/toolbar/dock/use-dock-drag";
import { dockCommandsAtom } from "../../../../src/components/toolbar/dock/preferences";
import { createSearchCommandItems } from "../../../../src/components/search/catalog/items";
import { setup } from "../../../support/ui";
function fixture() {
  const d = setup(),
    ids = ["action:addPage", "action:save", "action:delete"],
    commands = createSearchCommandItems(d.engine.getSnapshot(), (key) => key);
  d.store.set(dockCommandsAtom, ids);
  const hook = renderHook(({ items }) => useDockDrag(d.store.get(dockCommandsAtom), items), {
    initialProps: { items: commands },
    wrapper: ({ children }: PropsWithChildren) =>
      createElement(Provider, { store: d.store }, children),
  });
  const values = new Map<string, string>(),
    viewport = document.createElement("div");
  viewport.dataset.dockScroll = "";
  const transfer = {
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? "",
    effectAllowed: "",
    dropEffect: "",
  };
  function event(at: number, y = 100) {
    const row = document.createElement("div");
    viewport.append(row);
    row.getBoundingClientRect = () => ({ top: at * 35, height: 35 }) as DOMRect;
    return {
      clientX: 0,
      clientY: y,
      currentTarget: row,
      dataTransfer: transfer,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as DragEvent<HTMLElement>;
  }
  return { ...d, ...hook, ids, commands, event, viewport, transfer };
}
test("projected spring order never persists until drop and stationary pointers retarget only after viewport scroll", () => {
  const d = fixture(),
    original = d.store.get(dockCommandsAtom);
  act(() => d.result.current.start(d.event(0), d.ids[0]!));
  act(() => d.result.current.over(d.event(1), d.ids[1]!));
  expect(d.result.current.ids).toEqual([d.ids[1], d.ids[0], d.ids[2]]);
  expect(d.store.get(dockCommandsAtom)).toBe(original);
  act(() => d.result.current.over(d.event(2), d.ids[2]!));
  expect(d.result.current.ids).toEqual([d.ids[1], d.ids[0], d.ids[2]]);
  d.viewport.scrollTop = 35;
  act(() => d.result.current.over(d.event(2), d.ids[2]!));
  expect(d.result.current.ids).toEqual([d.ids[1], d.ids[2], d.ids[0]]);
  act(() => expect(d.result.current.drop(d.event(2))).toBe(true));
  expect(d.store.get(dockCommandsAtom)).toEqual([d.ids[1], d.ids[2], d.ids[0]]);
});
test("no-op/foreign/cancelled drops do not write and replacing preferences invalidates held drags", () => {
  const d = fixture(),
    set = vi.spyOn(d.store, "set");
  act(() => d.result.current.start(d.event(0), d.ids[0]!));
  act(() => d.result.current.over(d.event(1, 35), d.ids[1]!));
  act(() => expect(d.result.current.drop(d.event(1))).toBe(false));
  expect(set).not.toHaveBeenCalled();
  act(() => d.result.current.start(d.event(0), d.ids[0]!));
  act(() => d.result.current.over(d.event(1), d.ids[1]!));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(d.result.current.ids).toEqual(d.ids);
  act(() => expect(d.result.current.drop(d.event(1))).toBe(false));
  act(() => d.result.current.start(d.event(0), d.ids[0]!));
  act(() => d.result.current.over(d.event(1), d.ids[1]!));
  d.store.set(dockCommandsAtom, [d.ids[2]!, d.ids[1]!]);
  act(() => expect(d.result.current.drop(d.event(1))).toBe(false));
  expect(d.store.get(dockCommandsAtom)).toEqual([d.ids[2], d.ids[1]]);
});
test("command scope changes and disposal reject late or foreign drag handlers", () => {
  const d = fixture();
  act(() => d.result.current.start(d.event(0), d.ids[0]!));
  d.rerender({ items: d.commands.filter((item) => item.id !== d.ids[0]) });
  expect(d.result.current.dragging).toBeNull();
  act(() => expect(d.result.current.drop(d.event(1))).toBe(false));
  d.rerender({ items: d.commands });
  act(() => d.result.current.start(d.event(0), d.ids[0]!));
  const late = d.result.current;
  d.unmount();
  expect(late.drop(d.event(1))).toBe(false);
});
