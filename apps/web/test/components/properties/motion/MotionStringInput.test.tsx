import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { planMotionInitialization } from "@musart/core";
import { MotionStringInput } from "../../../../src/components/properties/motion/MotionStringInput";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { setup } from "../../../support/ui";

test("restores a multiline draft on a seek even when the held text value never changes", () => {
  const d = setup(),
    commit = vi.fn(),
    cancel = vi.fn();
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(d.engine.getSnapshot()),
  });
  const target = { kind: "layer" as const, layerId: d.text.id, property: "text" as const };
  let renders = 0;
  function Harness() {
    renders++;
    return (
      <MotionStringInput
        engine={d.engine}
        target={target}
        value="Bonjour"
        label="Text"
        multiline
        onCommit={commit}
        onCancel={cancel}
      />
    );
  }
  d.mount(<Harness />);
  const field = screen.getByRole("textbox", { name: "Text" });
  fireEvent.change(field, { target: { value: "Uncommitted\ncreation" } });
  expect(field).toHaveValue("Uncommitted\ncreation");
  act(() => createMotionTransport(d.engine).seek({ value: 1, rate: 1 }));
  expect(field).toHaveValue("Bonjour");
  expect(renders).toBe(1);
  fireEvent.blur(field);
  expect(commit).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
});
test("validates native string drafts, cancels Escape and commits one completed edit", () => {
  const d = setup(),
    commit = vi.fn(),
    cancel = vi.fn(),
    preview = vi.fn();
  d.mount(
    <MotionStringInput
      target={{ kind: "layer", layerId: d.rectangle.id, property: "stroke" }}
      value="#123456"
      label="Stroke"
      validate={(value) => /^#[\da-f]{6}$/i.test(value)}
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  const field = screen.getByLabelText("Stroke");
  fireEvent.change(field, { target: { value: "bad" } });
  fireEvent.blur(field);
  expect(field).toHaveValue("#123456");
  expect(commit).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: "#abcdef" } });
  expect(preview).toHaveBeenCalledWith("#abcdef");
  fireEvent.keyDown(field, { key: "Escape" });
  expect(field).toHaveValue("#123456");
  fireEvent.change(field, { target: { value: "#abcdef" } });
  fireEvent.blur(field);
  expect(commit).toHaveBeenCalledExactlyOnceWith("#abcdef");
});
