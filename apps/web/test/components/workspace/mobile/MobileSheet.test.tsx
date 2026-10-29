import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { MobileNumberInput } from "../../../../src/components/workspace/mobile/MobileNumberInput";
import { MobileSheet } from "../../../../src/components/workspace/mobile/MobileSheet";
import { setup } from "../../../support/ui";
test("focuses its surface, allows canvas access and closes with keyboard or button", () => {
  const d = setup(),
    close = vi.fn();
  d.mount(
    <>
      <button>Canvas</button>
      <MobileSheet title="Properties" onClose={close}>
        <p>Content</p>
      </MobileSheet>
    </>,
  );
  expect(screen.getByRole("dialog", { name: "Properties" })).not.toHaveAttribute(
    "aria-modal",
    "true",
  );
  const handle = screen.getByRole("button", { name: "Glisser vers le bas pour fermer" });
  expect(screen.getByRole("dialog", { name: "Properties" })).toHaveFocus();
  fireEvent.keyDown(handle, { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("button", { name: "Fermer le panneau" }));
  expect(close).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Canvas" })).toBeVisible();
});

test("Escape cancels an active numeric preview before a second Escape dismisses the sheet", () => {
  const d = setup(),
    close = vi.fn(),
    cancel = vi.fn(),
    commit = vi.fn();
  d.mount(
    <MobileSheet title="Properties" onClose={close}>
      <MobileNumberInput
        label="Opacity"
        value={50}
        min={0}
        max={100}
        onCancel={cancel}
        onCommit={commit}
      />
    </MobileSheet>,
  );
  const slider = screen.getByRole("slider");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(screen.getByLabelText("Opacity")).toHaveValue("51");
  fireEvent.keyDown(slider, { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledOnce();
  expect(commit).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Opacity")).toHaveValue("50");
  expect(document.querySelector("[data-mobile-adjusting]")).toBeNull();
  fireEvent.keyDown(slider, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});

test("uses the shared shadow around its actual viewport and releases neutral pill feedback on cancellation", () => {
  const d = setup();
  d.mount(
    <MobileSheet title="Tools" onClose={vi.fn()}>
      <p>Content</p>
    </MobileSheet>,
  );
  const wrapper = document.querySelector(".mobile-sheet-scroll.scroll-shadow")!;
  expect(wrapper.firstElementChild).toHaveClass("mobile-sheet-content");
  const handle = screen.getByRole("button", { name: "Glisser vers le bas pour fermer" });
  fireEvent.pointerDown(handle, { button: 0 });
  expect(handle).toHaveAttribute("data-active", "true");
  fireEvent.pointerCancel(handle);
  expect(handle).not.toHaveAttribute("data-active");
});

test("a pending operation blocks dismissal through Escape, handle keys and the close button", () => {
  const d = setup(),
    close = vi.fn();
  d.mount(
    <MobileSheet title="Export" onClose={close} dismissible={false}>
      <p>Pending</p>
    </MobileSheet>,
  );
  const dialog = screen.getByRole("dialog", { name: "Export" });
  fireEvent.keyDown(dialog, { key: "Escape" });
  const handle = screen.getByRole("button", { name: "Glisser vers le bas pour fermer" });
  fireEvent.keyDown(handle, { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("button", { name: "Fermer le panneau" }));
  expect(handle).toBeDisabled();
  expect(close).not.toHaveBeenCalled();
});
