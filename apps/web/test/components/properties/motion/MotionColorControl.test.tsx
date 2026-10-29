import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { planMotionInitialization } from "@musart/core";
import { MotionColorControl } from "../../../../src/components/properties/motion/MotionColorControl";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { setup } from "../../../support/ui";
test("paint follows the evaluated color in a leaf while its owner stays mounted and unchanged", () => {
  const d = setup();
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(d.engine.getSnapshot()),
  });
  const target = { kind: "layer" as const, layerId: d.rectangle.id, property: "fill" as const };
  d.engine.transaction([
    { type: "upsertMotionKeyframe", target, time: { value: 0, rate: 1 }, value: "#000000" },
    { type: "upsertMotionKeyframe", target, time: { value: 1, rate: 1 }, value: "#ffffff" },
  ]);
  let renders = 0;
  function Harness() {
    renders++;
    return (
      <MotionColorControl
        engine={d.engine}
        target={target}
        label="Fill"
        value="#3366ff"
        onPreview={vi.fn()}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
  }
  d.mount(<Harness />);
  const field = screen.getByRole("textbox", { name: "Couleur hexadécimale" });
  expect(field).toHaveValue("#000000");
  act(() => createMotionTransport(d.engine).seek({ value: 1, rate: 1 }));
  expect(field).toHaveValue("#FFFFFF");
  expect(renders).toBe(1);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe("#3366ff");
});
test("a same-color seek cancels the active paint draft without changing the document", () => {
  const d = setup(),
    cancel = vi.fn(),
    commit = vi.fn();
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(d.engine.getSnapshot()),
  });
  const before = d.engine.getSnapshot();
  d.mount(
    <MotionColorControl
      engine={d.engine}
      target={{ kind: "layer", layerId: d.rectangle.id, property: "fill" }}
      label="Fill"
      value="#3366ff"
      onPreview={vi.fn()}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  const field = screen.getByRole("textbox", { name: "Couleur hexadécimale" });
  fireEvent.change(field, { target: { value: "#123456" } });
  act(() => createMotionTransport(d.engine).seek({ value: 1, rate: 1 }));
  expect(field).toHaveValue("#3366FF");
  expect(cancel).toHaveBeenCalled();
  fireEvent.blur(field);
  expect(commit).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(before);
});
