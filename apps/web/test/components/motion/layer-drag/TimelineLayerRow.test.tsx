import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { setup } from "../../../support/ui";
import { projectTimelineRows } from "../../../../src/components/motion/tree";
import { TimelineLayerRow } from "../../../../src/components/motion/layer-drag/TimelineLayerRow";

it("retains its source DOM shell, shares target handlers and shows an explicit invalid-drop explanation", () => {
  const d = setup();
  const row = projectTimelineRows(d.page, new Set()).find(
    (row) => row.layer.id === d.rectangle.id,
  )!;
  const drag = {
    page: d.page,
    moving: true,
    dragging: d.rectangle.id,
    target: null,
    rejected: { id: d.rectangle.id, reason: "animatedHierarchy" as const },
    native: { over: vi.fn(), drop: vi.fn() },
    rejectProperty: vi.fn(),
  };
  const view = d.mount(
    <TimelineLayerRow row={row} top={24} height={24} reduced drag={drag} className="motion-row">
      Source
    </TimelineLayerRow>,
  );
  const node = view.container.firstElementChild!;
  expect(node).toHaveAttribute("data-layer-reorder-source", "true");
  expect(node).toHaveAttribute("data-layer-drop-kind", "layer");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Les calques animés doivent garder leur groupe",
  );
  fireEvent.dragOver(node);
  fireEvent.drop(node);
  expect(drag.native.over).toHaveBeenCalledWith(expect.anything(), row.layer);
  expect(drag.native.drop).toHaveBeenCalledWith(expect.anything(), row.layer);
  view.rerender(
    <TimelineLayerRow row={row} top={120} height={24} reduced drag={drag} className="motion-row">
      Source
    </TimelineLayerRow>,
  );
  expect(view.container.firstElementChild).toBe(node);
  expect(node).toHaveStyle({ top: "120px" });
});

it("routes native drops on property rows to rejection rather than a layer command", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: d.rectangle.id, property: "x" },
    time: { value: 1, rate: 1 },
    value: 25,
  });
  const page = d.engine.getSnapshot().project.pages[0]!,
    row = projectTimelineRows(page, new Set()).find((row) => row.kind === "property")!;
  const drag = {
    page,
    moving: false,
    dragging: null,
    target: null,
    rejected: null,
    native: { over: vi.fn(), drop: vi.fn() },
    rejectProperty: vi.fn(),
  };
  const view = d.mount(
    <TimelineLayerRow row={row} top={24} height={24} reduced drag={drag}>
      Property
    </TimelineLayerRow>,
  );
  const node = view.container.firstElementChild!;
  expect(node).toHaveAttribute("data-layer-drop-kind", "property");
  fireEvent.dragOver(node);
  fireEvent.drop(node);
  expect(drag.rejectProperty).toHaveBeenCalledTimes(2);
  expect(drag.native.over).not.toHaveBeenCalled();
  expect(drag.native.drop).not.toHaveBeenCalled();
});
