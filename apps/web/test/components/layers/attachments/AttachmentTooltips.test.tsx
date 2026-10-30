import { useRef } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AttachmentTooltips } from "../../../../src/components/layers/attachments/AttachmentTooltips";
import { setup } from "../../../support/ui";

test("shares one named tooltip across attachment hover/focus and cleans delayed work on click, scroll and unmount", async () => {
  const d = setup();
  function Host() {
    const ref = useRef<HTMLElement>(null);
    return (
      <section ref={ref}>
        <AttachmentTooltips host={ref} />
        <button data-attachment-tooltip="Flou" aria-describedby="existing">
          Blur preview
        </button>
        <button data-attachment-tooltip="Ombre portée">Shadow preview</button>
      </section>
    );
  }
  const view = d.mount(<Host />),
    blur = screen.getByText("Blur preview"),
    shadow = screen.getByText("Shadow preview");
  fireEvent.pointerOver(blur);
  expect(await screen.findByRole("tooltip", { name: "Flou" })).toBeVisible();
  expect(blur.getAttribute("aria-describedby")).toContain("existing");
  fireEvent.pointerOut(blur, { relatedTarget: shadow });
  fireEvent.pointerOver(shadow);
  expect(await screen.findByRole("tooltip", { name: "Ombre portée" })).toBeVisible();
  expect(screen.getAllByRole("tooltip")).toHaveLength(1);
  expect(blur).toHaveAttribute("aria-describedby", "existing");
  fireEvent.scroll(shadow.parentElement!);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(blur);
  expect(await screen.findByRole("tooltip", { name: "Flou" })).toBeVisible();
  fireEvent.pointerDown(blur);
  expect(screen.queryByRole("tooltip")).toBeNull();
  vi.useFakeTimers();
  fireEvent.pointerOver(shadow);
  view.unmount();
  await act(() => vi.runAllTimersAsync());
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(shadow).not.toHaveAttribute("aria-describedby");
  vi.useRealTimers();
});
