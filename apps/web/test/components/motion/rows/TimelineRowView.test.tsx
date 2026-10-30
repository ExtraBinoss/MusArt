import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { setup } from "../../../support/ui";
import {
  TimelineRowView,
  type TimelineRowViewProps,
} from "../../../../src/components/motion/rows/TimelineRowView";
import { projectTimelineRows } from "../../../../src/components/motion/tree";
import { createTimelineGestures } from "../../../../src/components/motion/gestures";
import { makeTransport } from "../support";
import { createProject } from "@musart/core";

const counters = vi.hoisted(() => ({ clips: vi.fn() }));
vi.mock("../../../../src/components/motion/occurrences/TrackClips", async (load) => {
  const actual =
    await load<typeof import("../../../../src/components/motion/occurrences/TrackClips")>();
  return {
    ...actual,
    TrackClips(props: Parameters<typeof actual.TrackClips>[0]) {
      counters.clips(props.layerId);
      return <actual.TrackClips {...props} />;
    },
  };
});
function fixture() {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: d.rectangle.id, property: "x" },
    time: { value: 1, rate: 2 },
    value: 42,
  });
  const page = d.engine.getSnapshot().project.pages[0]!,
    runtime = makeTransport(page),
    rows = projectTimelineRows(page, new Set());
  const props: TimelineRowViewProps = {
    row: rows.find((row) => row.layer.id === d.rectangle.id && row.kind === "layer")!,
    top: 0,
    height: 26,
    reduced: true,
    active: false,
    locked: false,
    page,
    project: d.engine.getSnapshot().project,
    pixelsPerSecond: 240,
    duration: 2,
    left: 0,
    width: 500,
    unit: "ms",
    transport: runtime.transport,
    onToggle: vi.fn(),
    onSelect: vi.fn(),
    interactive: true,
    showHover: vi.fn(),
    clearHover: vi.fn(),
  };
  return { ...d, props, rows, page, runtime };
}
it("skips the expensive clip subtree for unchanged leaf props while selection and handlers remain live", () => {
  const d = fixture();
  counters.clips.mockClear();
  const view = d.mount(<TimelineRowView {...d.props} />);
  expect(counters.clips).toHaveBeenCalledTimes(1);
  const original = document.querySelector(".motion-track-wrap");
  view.rerender(<TimelineRowView {...d.props} />);
  expect(counters.clips).toHaveBeenCalledTimes(1);
  expect(document.querySelector(".motion-track-wrap")).toBe(original);
  view.rerender(<TimelineRowView {...d.props} active />);
  expect(counters.clips).toHaveBeenCalledTimes(2);
  expect(document.querySelector(".motion-row")).toHaveClass("is-selected");
  const onSelect = vi.fn();
  view.rerender(<TimelineRowView {...d.props} active onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: "Sélectionner Rectangle bleu" }), {
    shiftKey: true,
  });
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(d.rectangle.id, true);
  expect(d.props.onSelect).not.toHaveBeenCalled();
  const project = createProject({ ...d.engine.getSnapshot().project, name: "Reopened owner" });
  view.rerender(<TimelineRowView {...d.props} active onSelect={onSelect} project={project} />);
  expect(counters.clips).toHaveBeenCalledTimes(4);
});
it("key selection and deselection invalidate memoized marker leaves without a document edit", () => {
  const d = fixture(),
    row = d.rows.find((row) => row.kind === "property")!;
  if (row.kind !== "property") throw new Error("Missing property fixture");
  const gestures = createTimelineGestures({
    engine: d.engine,
    compositionId: d.page.id,
    transport: d.runtime.transport,
    onSelection: vi.fn(),
    onError: vi.fn(),
  });
  const props = { ...d.props, row, gestures, keySelection: gestures.readSelected() };
  const view = d.mount(<TimelineRowView {...props} />);
  const key = screen.getByRole("button", { name: "Position X : image clé à 500 ms" });
  expect(key).toHaveAttribute("aria-pressed", "false");
  const before = d.engine.getSnapshot();
  act(() => gestures.selectKey(row.property.keyframes[0]!.id, false));
  view.rerender(<TimelineRowView {...props} keySelection={gestures.readSelected()} />);
  expect(key).toHaveAttribute("aria-pressed", "true");
  act(() => gestures.selectKey(row.property.keyframes[0]!.id, true));
  view.rerender(<TimelineRowView {...props} keySelection={gestures.readSelected()} />);
  expect(key).toHaveAttribute("aria-pressed", "false");
  expect(d.engine.getSnapshot()).toBe(before);
  view.unmount();
  gestures.dispose();
});
it("renders only interactive HTML labels when the temporal surface owns clips, keys and easing", () => {
  const d = fixture();
  counters.clips.mockClear();
  const props = { ...d.props, labelsOnly: true, engine: d.engine, compositionId: d.page.id },
    view = d.mount(<TimelineRowView {...props} />);
  expect(document.querySelector(".motion-row-time")).toBeNull();
  expect(document.querySelector(".motion-track-wrap")).toBeNull();
  expect(counters.clips).not.toHaveBeenCalled();
  expect(document.querySelector(".motion-row-label")).toHaveStyle({ pointerEvents: "auto" });
  expect(document.querySelector(".motion-row")).toHaveStyle({ pointerEvents: "none" });
  expect(document.querySelector(".motion-transition-trigger")).not.toBeNull();
  fireEvent.click(document.querySelector(".motion-row-expand")!);
  expect(props.onToggle).toHaveBeenCalledWith(d.rectangle.id);
  const row = d.rows.find((entry) => entry.kind === "property")!;
  const gestures = createTimelineGestures({
    engine: d.engine,
    compositionId: d.page.id,
    transport: d.runtime.transport,
    onSelection: vi.fn(),
    onError: vi.fn(),
  });
  view.rerender(<TimelineRowView {...props} row={row} gestures={gestures} />);
  expect(document.querySelector(".motion-row")?.getAttribute("data-motion-property-id")).toBe(
    row.kind === "property" ? row.property.id : "",
  );
  expect(
    document.querySelector(".motion-key,.motion-key-cluster,.motion-easing-segment"),
  ).toBeNull();
  fireEvent.click(document.querySelector(".motion-row-name")!);
  expect(gestures.readSelected().size).toBeGreaterThan(0);
  expect(props.onSelect).toHaveBeenCalledWith(d.rectangle.id, false);
  view.unmount();
  gestures.dispose();
});
