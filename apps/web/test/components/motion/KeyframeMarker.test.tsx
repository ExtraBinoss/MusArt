import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { setup } from "../../support/ui";
import { KeyframeMarker } from "../../../src/components/motion/KeyframeMarker";
import { makeTransport } from "./support";

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
