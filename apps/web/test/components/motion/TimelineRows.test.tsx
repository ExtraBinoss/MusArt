import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { setup } from "../../support/ui";
import { TimelineRows } from "../../../src/components/motion/TimelineRows";
import { createTimelineGestures } from "../../../src/components/motion/gestures";
import { projectTimelineRows } from "../../../src/components/motion/tree";
import { makeTransport } from "./support";
import { createTimelineHoverSource } from "../../../src/state/motion/hover";

const counters = vi.hoisted(() => ({ clips: vi.fn() }));
vi.mock("../../../src/components/motion/occurrences/TrackClips", async (load) => {
  const actual =
    await load<typeof import("../../../src/components/motion/occurrences/TrackClips")>();
  return {
    ...actual,
    TrackClips(props: Parameters<typeof actual.TrackClips>[0]) {
      counters.clips(props.layerId);
      return <actual.TrackClips {...props} />;
    },
  };
});

it("selects canonical layers, toggles expansion and seeks an exact stored keyframe", () => {
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
    select = vi.fn(),
    toggle = vi.fn();
  const rows = projectTimelineRows(page, new Set());
  d.mount(
    <TimelineRows
      rows={rows}
      first={0}
      last={rows.length}
      rowHeight={26}
      selected={new Set([d.rectangle.id])}
      pixelsPerSecond={240}
      duration={2}
      left={0}
      width={500}
      unit="ms"
      transport={runtime.transport}
      onToggle={toggle}
      onSelect={select}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Replier Rectangle bleu" }));
  expect(toggle).toHaveBeenCalledWith(d.rectangle.id);
  fireEvent.click(screen.getByRole("button", { name: "Sélectionner Rectangle bleu" }), {
    shiftKey: true,
  });
  expect(select).toHaveBeenLastCalledWith(d.rectangle.id, true);
  fireEvent.click(screen.getByRole("button", { name: "Position X : image clé à 500 ms" }));
  expect(runtime.transport.seek).toHaveBeenCalledWith({ value: 1, rate: 2 });
  expect(select).toHaveBeenLastCalledWith(d.rectangle.id, false);
  fireEvent.click(screen.getByRole("button", { name: "Intervalle actif de Rectangle bleu" }));
  expect(select).toHaveBeenLastCalledWith(d.rectangle.id, false);
});

it("opens the destination-key easing editor from real continuous connectors only", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const property of ["x", "visible"] as const)
    for (const value of [0, 1])
      d.engine.execute({
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId: d.rectangle.id, property },
        time: { value, rate: 1 },
        value: property === "x" ? value * 100 : value === 0,
      });
  const page = d.engine.getSnapshot().project.pages[0]!,
    runtime = makeTransport(page);
  const rows = projectTimelineRows(page, new Set());
  d.mount(
    <TimelineRows
      rows={rows}
      first={0}
      last={rows.length}
      rowHeight={26}
      selected={new Set()}
      pixelsPerSecond={240}
      duration={2}
      left={0}
      width={500}
      unit="ms"
      transport={runtime.transport}
      onToggle={vi.fn()}
      onSelect={vi.fn()}
      engine={d.engine}
      compositionId={page.id}
    />,
  );
  const connectors = screen.getAllByRole("button", { name: /Modifier l’interpolation vers/ });
  expect(connectors).toHaveLength(1);
  expect(connectors[0]).toHaveAttribute(
    "aria-label",
    "Modifier l’interpolation vers Position X · 1000 ms",
  );
  fireEvent.click(connectors[0]!);
  expect(screen.getByRole("dialog", { name: "Interpolation" })).toHaveTextContent(
    "Contrôle la transition vers cette image clé.",
  );
});

it("publishes row/property hover without selecting and retires virtualized hover owners", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: d.rectangle.id, property: "x" },
    time: { value: 1, rate: 2 },
    value: 42,
  });
  const page = d.engine.getSnapshot().project.pages[0]!,
    rows = projectTimelineRows(page, new Set()),
    hover = createTimelineHoverSource(d.engine),
    runtime = makeTransport(page),
    select = vi.fn();
  const props = {
    rows,
    first: 0,
    last: rows.length,
    rowHeight: 26,
    selected: new Set<string>(),
    pixelsPerSecond: 240,
    duration: 2,
    left: 0,
    width: 500,
    unit: "ms" as const,
    transport: runtime.transport,
    onToggle: vi.fn(),
    onSelect: select,
    engine: d.engine,
    compositionId: page.id,
  };
  const view = d.mount(<TimelineRows {...props} />),
    before = d.engine.getSnapshot();
  const layer = document.querySelector<HTMLElement>(
      `.motion-row:not(.is-property)[data-layer-id="${d.rectangle.id}"]`,
    )!,
    property = document.querySelector<HTMLElement>(
      `.motion-row.is-property[data-layer-id="${d.rectangle.id}"]`,
    )!;
  fireEvent.pointerOver(layer);
  expect(hover.read()?.layerId).toBe(d.rectangle.id);
  expect(layer).toHaveAttribute("data-motion-hovered", "true");
  fireEvent.pointerOver(property);
  fireEvent.pointerOut(layer, { relatedTarget: property });
  expect(hover.read()?.layerId).toBe(d.rectangle.id);
  expect(property).toHaveAttribute("data-motion-hovered", "true");
  expect(d.engine.getSnapshot()).toBe(before);
  expect(select).not.toHaveBeenCalled();
  view.rerender(<TimelineRows {...props} first={rows.length} />);
  expect(hover.read()).toBeNull();
  view.unmount();
});

it("keeps layer-row clip subtrees memoized when only key selection changes while property markers update", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: d.rectangle.id, property: "x" },
    time: { value: 1, rate: 2 },
    value: 42,
  });
  const before = d.engine.getSnapshot(),
    page = before.project.pages[0]!,
    rows = projectTimelineRows(page, new Set()),
    runtime = makeTransport(page),
    gestures = createTimelineGestures({
      engine: d.engine,
      transport: runtime.transport,
      compositionId: page.id,
      onSelection: vi.fn(),
      onError: vi.fn(),
    });
  const property = rows.find((row) => row.kind === "property")!;
  if (property.kind !== "property") throw Error("Missing property");
  const props = {
    rows,
    first: 0,
    last: rows.length,
    rowHeight: 26,
    selected: new Set<string>(),
    pixelsPerSecond: 240,
    duration: 2,
    left: 0,
    width: 500,
    unit: "ms" as const,
    transport: runtime.transport,
    onToggle: vi.fn(),
    onSelect: vi.fn(),
    gestures,
    engine: d.engine,
    compositionId: page.id,
  };
  counters.clips.mockClear();
  const view = d.mount(<TimelineRows {...props} />),
    baseline = counters.clips.mock.calls.length,
    wrap = document.querySelector(
      `.motion-row:not(.is-property)[data-layer-id="${d.rectangle.id}"] .motion-track-wrap`,
    ),
    marker = screen.getByRole("button", { name: "Position X : image clé à 500 ms" });
  expect(baseline).toBeGreaterThan(0);
  expect(marker).toHaveAttribute("aria-pressed", "false");
  act(() => gestures.selectKey(property.property.keyframes[0]!.id, false));
  view.rerender(<TimelineRows {...props} />);
  expect(marker).toHaveAttribute("aria-pressed", "true");
  expect(counters.clips).toHaveBeenCalledTimes(baseline);
  expect(
    document.querySelector(
      `.motion-row:not(.is-property)[data-layer-id="${d.rectangle.id}"] .motion-track-wrap`,
    ),
  ).toBe(wrap);
  act(() => gestures.selectKey(property.property.keyframes[0]!.id, true));
  view.rerender(<TimelineRows {...props} />);
  expect(marker).toHaveAttribute("aria-pressed", "false");
  expect(counters.clips).toHaveBeenCalledTimes(baseline);
  expect(d.engine.getSnapshot()).toBe(before);
  view.rerender(<TimelineRows {...props} labelsOnly />);
  expect(document.querySelector(".motion-row-time,.motion-key,.motion-track-wrap")).toBeNull();
  expect(
    document.querySelector(`[data-motion-property-id="${property.property.id}"]`),
  ).not.toBeNull();
  expect(counters.clips).toHaveBeenCalledTimes(baseline);
  view.unmount();
  gestures.dispose();
});
