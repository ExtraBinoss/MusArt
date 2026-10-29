import { expect, test } from "vitest";
import { renderHook } from "@testing-library/react";
import { rowSlots, useRowSlots } from "../../../../src/components/layers/tree/use-row-slots";

const rows = (...keys: string[]) => keys.map((key, at) => ({ entry: { key, kind: "layer" }, at }));
test("reuses only retired row shells while retaining canonical order and existing identities", () => {
  const initial = rowSlots(rows("a", "b", "c"), [], false),
    next = rowSlots(rows("b", "c", "d"), initial, false);
  expect(initial.map((row) => row.slot)).toEqual([0, 1, 2]);
  expect(next.map((row) => [row.entry.key, row.slot])).toEqual([
    ["b", 1],
    ["c", 2],
    ["d", 0],
  ]);
  expect(rowSlots(rows("b", "c", "d", "e"), initial, false).map((row) => row.slot)).toEqual([
    1, 2, 0, 3,
  ]);
  const reverse = rowSlots(rows("a", "b", "c"), next, false);
  expect(reverse.map((row) => row.slot)).toEqual([0, 1, 2]);
  expect(rowSlots([], reverse, false)).toEqual([]);
});
test("a native drag never rebinds a retired DOM key ahead of its held source", () => {
  const initial = rowSlots(rows("a", "source", "b"), [], false),
    next = rowSlots(rows("new", "source", "b"), initial, true);
  expect(next.map((row) => [row.entry.key, row.slot])).toEqual([
    ["new", 3],
    ["source", 1],
    ["b", 2],
  ]);
  const continued = rowSlots(rows("newer", "source", "b"), next, true);
  expect(continued.map((row) => row.slot)).toEqual([4, 1, 2]);
  const ended = rowSlots(rows("last", "source", "b"), continued, false);
  expect(ended.map((row) => row.slot)).toEqual([0, 1, 2]);
  expect(rowSlots(rows("fresh"), [], true)[0]!.slot).toBe(0);
});
test("the hook publishes only committed bounded windows", () => {
  const view = renderHook(({ values, dragging }) => useRowSlots(values, dragging), {
    initialProps: { values: rows("a", "b"), dragging: false },
  });
  view.rerender({ values: rows("b", "c"), dragging: false });
  expect(view.result.current.map((row) => row.slot)).toEqual([1, 0]);
  view.rerender({ values: rows("b", "d"), dragging: true });
  expect(view.result.current.map((row) => row.slot)).toEqual([1, 2]);
  view.unmount();
});
