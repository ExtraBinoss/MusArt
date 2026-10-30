import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  LibraryItemsContext,
  useLibraryItemActivation,
} from "../../../../src/components/projects/items/context";
afterEach(() => vi.useRealTimers());
it("inspects on a single click, opens on double click or the direct action, and cancels pending work on unmount", () => {
  vi.useFakeTimers();
  const inspect = vi.fn(),
    open = vi.fn(),
    item = { kind: "project" as const, id: "id", name: "Name", mode: "motion" as const };
  function Card() {
    const activation = useLibraryItemActivation(item, open);
    return (
      <>
        <button onClick={activation.click} onDoubleClick={activation.double}>
          Card
        </button>
        <button onClick={activation.direct}>Open</button>
      </>
    );
  }
  const view = render(
    <LibraryItemsContext.Provider value={{ inspect }}>
      <Card />
    </LibraryItemsContext.Provider>,
  );
  const card = screen.getByText("Card");
  fireEvent.click(card, { detail: 1 });
  vi.advanceTimersByTime(280);
  expect(inspect).toHaveBeenCalledExactlyOnceWith(item, open);
  expect(open).not.toHaveBeenCalled();
  inspect.mockClear();
  fireEvent.click(card, { detail: 1 });
  fireEvent.click(card, { detail: 2 });
  fireEvent.doubleClick(card);
  vi.advanceTimersByTime(300);
  expect(open).toHaveBeenCalledOnce();
  expect(inspect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Open"));
  expect(open).toHaveBeenCalledTimes(2);
  fireEvent.click(card, { detail: 1 });
  view.unmount();
  vi.advanceTimersByTime(300);
  expect(inspect).not.toHaveBeenCalled();
});
