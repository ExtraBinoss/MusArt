import { expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { setup } from "../../../support/ui";
import { TimelineMotionAction } from "../../../../src/components/motion/rows/TimelineMotionAction";
import { TimelineControlTooltips } from "../../../../src/components/motion/control-tooltips";
import { makeTransport } from "../support";
import { captureTransitionOrigin } from "../../../../src/components/motion/transitions/authoring";

const opened = vi.hoisted(() => ({ renders: vi.fn(), close: () => {} }));
vi.mock("../../../../src/components/motion/transitions/TransitionPopover", () => ({
  TransitionPopover: (props: {
    initialOrigin: unknown;
    anchor: React.ReactNode;
    onClose: () => void;
  }) => {
    opened.renders(props.initialOrigin);
    opened.close = props.onClose;
    return (
      <>
        {props.anchor}
        <button onClick={props.onClose}>Close editor</button>
      </>
    );
  },
}));
it("constructs the editor only after activation with a validated origin and returns focus on close", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = d.engine.getSnapshot().project.pages[0]!;
  const { transport } = makeTransport(page);
  const expected = captureTransitionOrigin(d.engine, page.id, d.rectangle.id);
  d.mount(
    <TimelineControlTooltips value={false}>
      <TimelineMotionAction
        engine={d.engine}
        compositionId={page.id}
        layerId={d.rectangle.id}
        transport={transport}
      />
    </TimelineControlTooltips>,
  );
  expect(opened.renders).not.toHaveBeenCalled();
  const button = screen.getByRole("button", { name: "Ajouter une animation" });
  fireEvent.click(button);
  expect(opened.renders).toHaveBeenCalledWith(expected);
  fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
  expect(screen.queryByText("Close editor")).toBeNull();
  expect(screen.getByRole("button", { name: "Ajouter une animation" })).toHaveFocus();
});
