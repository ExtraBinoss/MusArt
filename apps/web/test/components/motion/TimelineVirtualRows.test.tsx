import "../../../src/state/i18n";
import { useRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TimelineVirtualRows } from "../../../src/components/motion/TimelineVirtualRows";
import { TooltipProvider } from "../../../src/components/ui/tooltip";
import { createMotionTransport } from "../../../src/services/motion/transport";
import { audioFixture } from "../../support/audio";

it("admits bounded audio windows without rerendering its owner or editing the document", () => {
  const d = audioFixture(100),
    transport = createMotionTransport(d.engine);
  const snapshot = d.engine.getSnapshot();
  let ownerRenders = 0;
  function Owner() {
    ownerRenders++;
    const viewport = useRef<HTMLDivElement>(null);
    return (
      <div ref={viewport} data-testid="viewport">
        <TimelineVirtualRows
          viewport={viewport}
          engine={d.engine}
          compositionId={snapshot.pageId}
          rows={[]}
          audioTracks={d.page().motion!.audioTracks!}
          assets={snapshot.project.assets}
          onAudioError={vi.fn()}
          rowHeight={24}
          selected={new Set()}
          pixelsPerSecond={120}
          duration={3}
          left={0}
          width={600}
          unit="ms"
          transport={transport}
          onToggle={vi.fn()}
          onSelect={vi.fn()}
          interactive
        />
      </div>
    );
  }
  const view = render(
    <TooltipProvider>
      <Owner />
    </TooltipProvider>,
  );
  try {
    const ownerBefore = ownerRenders;
    const viewport = screen.getByTestId("viewport");
    expect(view.container.querySelector(".motion-row-space")).toHaveStyle({ height: "2400px" });
    fireEvent.scroll(viewport, { target: { scrollTop: 1200 } });
    const rows = view.container.querySelectorAll<HTMLElement>(".motion-audio-row");
    expect(rows.length).toBeLessThan(30);
    expect(rows[0]!.dataset.audioTrackId).toBe("audio-45");
    expect(rows[0]!.style.top).toBe("1080px");
    fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
    expect(
      view.container.querySelector<HTMLElement>(".motion-audio-row")!.dataset.audioTrackId,
    ).toBe("audio-0");
    expect(ownerRenders).toBe(ownerBefore);
    expect(d.engine.getSnapshot()).toBe(snapshot);
  } finally {
    view.unmount();
    transport.dispose();
  }
});
