import { act, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { setup } from "../../support/ui";
import { makeTransport, pointer } from "./support";
import { TimelinePanel } from "../../../src/components/motion/TimelinePanel";
import { canvasContext } from "./canvas/support";

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext() as never);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
});

it("compact mobile timeline uses one gutter for layout and gesture geometry", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const snapshot = d.engine.getSnapshot();
  const runtime = makeTransport(snapshot.project.pages[0]!);
  const view = d.mount(
    <TimelinePanel
      compact
      engine={d.engine}
      snapshot={snapshot}
      transport={runtime.transport}
      onClose={vi.fn()}
    />,
  );
  const panel = view.container.querySelector<HTMLElement>(".motion-timeline")!;
  expect(panel.style.getPropertyValue("--motion-gutter")).toBe("120px");
  expect(panel.style.height).toBe("");
  expect(panel).toHaveAttribute("data-compact", "true");
  expect(view.container.querySelector(".motion-compact-toolbar")).toContainElement(
    screen.getByRole("spinbutton", { name: "Temps actuel" }),
  );
  expect(view.container.querySelector(".motion-ruler-label")).not.toContainElement(
    screen.getByRole("spinbutton", { name: "Temps actuel" }),
  );
  expect(view.container.querySelector(".motion-compact-zoom")).toContainElement(
    screen.getByRole("slider", { name: "Zoom de la timeline" }),
  );
  expect(view.container.querySelector(".motion-row")).toHaveStyle({ height: "32px" });
  const area = view.container.querySelector<HTMLElement>(".motion-row-space")!;
  act(() => pointer(area, "pointerdown", 110, 50));
  expect(area.querySelector(".motion-marquee")).toBeNull();
  act(() => pointer(area, "pointerdown", 130, 50));
  act(() => pointer(area, "pointermove", 190, 82));
  expect(area.querySelector(".motion-marquee")).toHaveStyle({
    left: "130px",
    width: "60px",
    height: "32px",
  });
  expect(area.querySelector(".motion-marquee")).not.toBeNull();
  act(() => pointer(area, "pointercancel", 180, 50));
  expect(area.querySelector(".motion-marquee")).toBeNull();
  view.unmount();
  expect(runtime.listeners.size).toBe(0);
});

it("uses the full mobile time area for playback following without a hidden desktop action gutter", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(390);
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({ type: "setMotionDuration", duration: { value: 10, rate: 1 } });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  d.mount(
    <TimelinePanel
      compact
      engine={d.engine}
      snapshot={d.engine.getSnapshot()}
      transport={runtime.transport}
      onClose={vi.fn()}
    />,
  );
  const viewport = document.querySelector<HTMLElement>(".motion-timeline-scroll")!;
  act(() => runtime.update({ time: { value: 4, rate: 1 }, playing: true, playbackMode: "loop" }));
  expect(viewport.scrollLeft).toBe(258);
  expect(document.querySelector(".motion-playhead-clip")).toHaveStyle({
    left: "378px",
    width: "270px",
  });
  expect(document.querySelector(".motion-playhead")).toHaveStyle({
    transform: "translateX(222px)",
  });
  expect(document.querySelector(".motion-scroll-shadow")).toHaveAttribute(
    "data-scroll-axis",
    "both",
  );
  expect(document.querySelector(".motion-timeline-actions")).toBeNull();
});
