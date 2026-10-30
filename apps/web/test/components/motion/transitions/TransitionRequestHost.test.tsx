import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { setup } from "../../../support/ui";
import { TransitionRequestHost } from "../../../../src/components/motion/transitions/TransitionRequestHost";
import {
  getTransitionRequests,
  requestLayerTransition,
} from "../../../../src/components/motion/transitions/requests";
test("the persistent host opens without a toolbar trigger, closes cleanly and creates one undoable transition", async () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({ type: "setMotionDuration", duration: { value: 1, rate: 5 } });
  const before = d.engine.getSnapshot().project;
  const mount = d.mount(<TransitionRequestHost engine={d.engine} />);
  await act(async () => {
    await requestLayerTransition(d.engine, d.page.id, d.rectangle.id, { x: 40, y: 90 });
  });
  expect(screen.getByRole("dialog", { name: "Transition" })).toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "Durée" })).toHaveValue(200);
  const apply = screen
    .getByRole("dialog")
    .querySelector<HTMLButtonElement>("footer button:last-child")!;
  fireEvent.click(apply);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(getTransitionRequests(d.engine).read()).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.type).toBe("transition");
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  mount.unmount();
});
