import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { setup } from "../../support/ui";
import { TimelineRows } from "../../../src/components/motion/TimelineRows";
import { projectTimelineRows } from "../../../src/components/motion/tree";
import { makeTransport } from "./support";
import { createTimelineHoverSource } from "../../../src/state/motion/hover";

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
