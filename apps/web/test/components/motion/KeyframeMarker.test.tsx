import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { setup } from "../../support/ui";
import { KeyframeMarker } from "../../../src/components/motion/KeyframeMarker";
import { makeTransport } from "./support";
import { createTimelineGestures } from "../../../src/components/motion/gestures";

it("shows a themed time tooltip only after 500ms and cancels its timer on leaving", async () => {
  vi.useFakeTimers();
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const transport = makeTransport(d.engine.getSnapshot().project.pages[0]!).transport;
  const view = d.mount(
    <KeyframeMarker
      marker={{
        key: { id: "key", time: { value: 1, rate: 2 }, value: 42 },
        count: 1,
        x: 50,
        firstKeyIndex: 0,
        afterKeyIndex: 1,
      }}
      name="Position X"
      propertyId="property"
      layerId={d.rectangle.id}
      unit="ms"
      transport={transport}
      onSelect={vi.fn()}
    />,
  );
  const key = screen.getByRole("button", { name: "Position X : image clé à 500 ms" });
  try {
    fireEvent.pointerMove(key, { pointerType: "mouse" });
    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole("tooltip")).toHaveTextContent("500 ms");
    expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveClass("themed-tooltip");
    fireEvent.pointerLeave(key);
    await act(() => vi.advanceTimersByTimeAsync(10));
    fireEvent.pointerMove(key, { pointerType: "mouse" });
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.pointerLeave(key);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

function editableMarker(multiple = false) {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: d.rectangle.id, property: "x" },
    time: { value: 1, rate: 2 },
    value: 42,
  });
  if (multiple)
    d.engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: d.rectangle.id, property: "x" },
      time: { value: 1, rate: 1 },
      value: 99,
    });
  const page = d.engine.getSnapshot().project.pages[0]!,
    key = page.motion!.tracks[0]!.properties[0]!.keyframes[0]!;
  const { transport } = makeTransport(page),
    onSelect = vi.fn();
  const gestures = createTimelineGestures({
    engine: d.engine,
    compositionId: page.id,
    transport,
    onSelection: vi.fn(),
    onError: vi.fn(),
  });
  if (multiple)
    gestures.selectKeys(
      page.motion!.tracks[0]!.properties[0]!.keyframes.map((item) => item.id),
      false,
    );
  const mount = d.mount(
    <KeyframeMarker
      marker={{ key, count: 1, x: 50, firstKeyIndex: 0, afterKeyIndex: 1 }}
      name="Position X"
      propertyId="property"
      layerId={d.rectangle.id}
      unit="ms"
      transport={transport}
      gestures={gestures}
      onSelect={onSelect}
    />,
  );
  return { ...d, mount, gestures, key, onSelect };
}
it("right-click offers deletion and a focused key owns Delete without a second panel transaction", async () => {
  const d = editableMarker(),
    before = d.engine.getSnapshot().project;
  const key = screen.getByRole("button", { name: "Position X : image clé à 500 ms" });
  fireEvent.contextMenu(key);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Supprimer l’image clé" }));
  expect(
    d.engine
      .getSnapshot()
      .project.pages[0]!.motion!.tracks[0]!.properties.flatMap((property) => property.keyframes),
  ).toHaveLength(0);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  d.mount.unmount();
  d.gestures.dispose();
  const keyboard = editableMarker(),
    origin = keyboard.engine.getSnapshot().project;
  fireEvent.keyDown(screen.getByRole("button", { name: "Position X : image clé à 500 ms" }), {
    key: "Delete",
  });
  expect(keyboard.gestures.readSelected().size).toBe(0);
  expect(keyboard.onSelect).toHaveBeenCalledOnce();
  act(() => keyboard.engine.undo());
  expect(keyboard.engine.getSnapshot().project).toEqual(origin);
  keyboard.mount.unmount();
  keyboard.gestures.dispose();
});

it("counts the captured selected keys in the plural action and deletes them in one undo step", async () => {
  const d = editableMarker(true),
    before = d.engine.getSnapshot().project;
  fireEvent.contextMenu(screen.getByRole("button", { name: "Position X : image clé à 500 ms" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Supprimer 2 images clés" }));
  expect(
    d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes,
  ).toHaveLength(0);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  d.mount.unmount();
  d.gestures.dispose();
});
