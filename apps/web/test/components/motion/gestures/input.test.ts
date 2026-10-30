import { expect, it } from "vitest";
import { toTimelinePointerInput } from "../../../../src/components/motion/gestures/input";

it("retains stable initial coordinates and a DOM target after the event source changes", () => {
  const node = document.createElement("button");
  const event = {
    currentTarget: node,
    button: 0,
    pointerId: 7,
    clientX: 40,
    clientY: 80,
    shiftKey: true,
  };
  const input = toTimelinePointerInput(event);
  event.currentTarget = document.createElement("button");
  event.clientX = 100;
  event.shiftKey = false;
  expect(input).toEqual({
    node,
    button: 0,
    pointerId: 7,
    clientX: 40,
    clientY: 80,
    shiftKey: true,
  });
  expect(input).not.toHaveProperty("preventDefault");
});
