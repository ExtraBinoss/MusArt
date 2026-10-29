import { expect, test, vi } from "vitest";
import { readReleasePoint } from "../../../src/canvas/interaction/release";

function click() {
  return {
    gesture: {
      client: { x: 201.5, y: 112.25 },
      from: { x: 10, y: 20 },
      current: { x: 10, y: 20 },
    },
    pointer: { clientX: 201.5, clientY: 112.25, altKey: false, shiftKey: false },
  };
}

test("an unmoved selection click skips the native geometry reader and keeps its captured origin", () => {
  const { gesture, pointer } = click();
  Object.freeze(gesture.client);
  Object.freeze(gesture.from);
  Object.freeze(gesture.current);
  Object.freeze(gesture);
  const read = vi.fn(() => ({ x: 10, y: 20 }));
  expect(readReleasePoint(gesture, pointer, read)).toBeNull();
  expect(read).not.toHaveBeenCalled();
  // No transform was previewed, so a modifier alone does not turn a click into a resize/move.
  expect(readReleasePoint(gesture, { ...pointer, altKey: true, shiftKey: true }, read)).toBeNull();
  expect(read).not.toHaveBeenCalled();
});

test.each([
  { dx: 0.25, dy: 0 },
  { dx: 0, dy: 0.25 },
])("release-only movement reads the actual transformed page point: $dx,$dy", ({ dx, dy }) => {
  const { gesture, pointer } = click();
  const converted = { x: 11, y: 20.5 };
  const read = vi.fn(() => converted);
  const result = readReleasePoint(
    gesture,
    {
      ...pointer,
      clientX: pointer.clientX + dx,
      clientY: pointer.clientY + dy,
    },
    read,
  );
  expect(read).toHaveBeenCalledOnce();
  expect(result).toBe(converted);
  expect(gesture.current).toEqual({ x: 10, y: 20 });
});

test.each([
  { x: 90, y: 20 },
  { x: 10, y: 70 },
])("a drag released back at its starting pixel replaces the last preview: $x,$y", (current) => {
  const { gesture, pointer } = click();
  gesture.current = current;
  const read = vi.fn(() => gesture.from);
  expect(readReleasePoint(gesture, pointer, read)).toBe(gesture.from);
  expect(read).toHaveBeenCalledOnce();
});

test.each([
  { before: { alt: false, shift: false }, after: { altKey: true, shiftKey: false } },
  { before: { alt: true, shift: false }, after: { altKey: false, shiftKey: false } },
  { before: { alt: false, shift: false }, after: { altKey: false, shiftKey: true } },
  { before: { alt: false, shift: true }, after: { altKey: false, shiftKey: false } },
])(
  "a final modifier change retains the transform's release update: $before -> $after",
  ({ before, after }) => {
    const { gesture, pointer } = click();
    const read = vi.fn(() => gesture.current);
    expect(
      readReleasePoint({ ...gesture, modifiers: before }, { ...pointer, ...after }, read),
    ).toBe(gesture.current);
    expect(read).toHaveBeenCalledOnce();
  },
);

test("matching recorded modifiers do not add a geometry read to an unchanged click", () => {
  const { gesture, pointer } = click();
  const read = vi.fn(() => gesture.current);
  expect(
    readReleasePoint(
      { ...gesture, modifiers: { alt: true, shift: true } },
      { ...pointer, altKey: true, shiftKey: true },
      read,
    ),
  ).toBeNull();
  expect(read).not.toHaveBeenCalled();
});
