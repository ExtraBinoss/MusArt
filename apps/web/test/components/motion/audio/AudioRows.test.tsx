import "../../../../src/state/i18n";
import { expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { TooltipProvider } from "../../../../src/components/ui/tooltip";
import { AudioRows } from "../../../../src/components/motion/audio/AudioRows";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { audioFixture } from "../../../support/audio";
it("virtualizes audio independently from visual hierarchy and supports audio-only selection/deletion", () => {
  const d = audioFixture(100),
    transport = createMotionTransport(d.engine),
    onError = vi.fn();
  const view = render(
    <TooltipProvider>
      <AudioRows
        engine={d.engine}
        tracks={d.page().motion!.audioTracks!}
        assets={d.engine.getSnapshot().project.assets}
        transport={transport}
        first={52}
        last={57}
        offset={50}
        rowHeight={24}
        scale={120}
        duration={3}
        left={0}
        width={300}
        active
        visualSelected={false}
        onError={onError}
      />
    </TooltipProvider>,
  );
  const rows = view.container.querySelectorAll<HTMLElement>(".motion-audio-row");
  expect(rows).toHaveLength(5);
  expect(rows[0]!.dataset.audioTrackId).toBe("audio-2");
  expect(rows[0]!.style.top).toBe("1248px");
  expect(rows[0]!.hasAttribute("data-layer-drop-id")).toBe(false);
  fireEvent.click(rows[0]!.querySelector(".motion-row-name")!);
  expect(rows[0]!.classList.contains("is-selected")).toBe(true);
  expect(d.engine.getSnapshot().selection).toEqual([]);
  fireEvent.keyDown(rows[0]!, { key: "Delete" });
  expect(d.page().motion!.audioTracks).toHaveLength(99);
  d.engine.undo();
  expect(d.page().motion!.audioTracks).toHaveLength(100);
  expect(d.page().layers).toEqual([]);
  view.unmount();
  transport.dispose();
});

it("preserves retained waveform nodes and React commits across vertical scrolling, then updates only changed selection leaves", () => {
  const old = location.href;
  history.replaceState(null, "", "?automation=1");
  const d = audioFixture(20),
    transport = createMotionTransport(d.engine),
    props = {
      engine: d.engine,
      tracks: d.page().motion!.audioTracks!,
      assets: d.engine.getSnapshot().project.assets,
      transport,
      first: 2,
      last: 7,
      offset: 0,
      rowHeight: 24,
      scale: 120,
      duration: 3,
      left: 0,
      width: 300,
      active: true,
      visualSelected: false,
      onError: vi.fn(),
    };
  const view = render(
    <TooltipProvider>
      <AudioRows {...props} />
    </TooltipProvider>,
  );
  const rows = () => Array.from(view.container.querySelectorAll<HTMLElement>(".motion-audio-row"));
  const read = () =>
    new Map(
      rows().map((row) => {
        const node = row.querySelector<SVGSVGElement>(".motion-audio-waveform")!;
        return [
          row.dataset.audioTrackId!,
          { node, renders: Number(node.dataset.reactRenders) },
        ] as const;
      }),
    );
  try {
    const before = read();
    view.rerender(
      <TooltipProvider>
        <AudioRows {...props} first={3} last={8} />
      </TooltipProvider>,
    );
    const scrolled = read();
    for (const id of ["audio-3", "audio-4", "audio-5", "audio-6"]) {
      expect(scrolled.get(id)!.node).toBe(before.get(id)!.node);
      expect(scrolled.get(id)!.renders).toBe(before.get(id)!.renders);
    }
    expect(before.get("audio-2")!.node.isConnected).toBe(false);
    expect(scrolled.get("audio-7")!.renders).toBe(1);
    fireEvent.click(rows()[0]!.querySelector(".motion-row-name")!);
    const selected = read();
    expect(selected.get("audio-3")!.renders).toBe(scrolled.get("audio-3")!.renders + 1);
    for (const id of ["audio-4", "audio-5", "audio-6", "audio-7"])
      expect(selected.get(id)!.renders).toBe(scrolled.get(id)!.renders);
    fireEvent.click(rows()[1]!.querySelector(".motion-row-name")!);
    const switched = read();
    expect(switched.get("audio-3")!.renders).toBe(selected.get("audio-3")!.renders + 1);
    expect(switched.get("audio-4")!.renders).toBe(selected.get("audio-4")!.renders + 1);
    expect(switched.get("audio-5")!.renders).toBe(selected.get("audio-5")!.renders);
    view.rerender(
      <TooltipProvider>
        <AudioRows {...props} first={3} last={8} left={90} width={260} />
      </TooltipProvider>,
    );
    for (const [id, item] of read()) expect(item.renders).toBe(switched.get(id)!.renders + 1);
  } finally {
    view.unmount();
    transport.dispose();
    history.replaceState(null, "", old);
  }
});
