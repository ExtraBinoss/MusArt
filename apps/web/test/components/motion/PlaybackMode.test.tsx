import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { setup } from "../../support/ui";
import { PlaybackMode } from "../../../src/components/motion/PlaybackMode";
import type { TimelineTransportState } from "../../../src/components/motion/model";

it("offers three named playback icons without a text-heavy toolbar selector", () => {
  const d = setup(),
    changed = vi.fn();
  function Host() {
    const [value, setValue] = useState<TimelineTransportState["playbackMode"]>("once");
    return (
      <PlaybackMode
        value={value}
        onChange={(mode) => {
          setValue(mode);
          changed(mode);
        }}
      />
    );
  }
  d.mount(<Host />);
  const button = screen.getByRole("button", { name: "Mode de lecture · Une fois" });
  expect(button.textContent).toBe("");
  fireEvent.click(button);
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  expect(screen.getByRole("radio", { name: "Une fois" })).toHaveAttribute("data-state", "checked");
  fireEvent.click(screen.getByRole("radio", { name: "Boucle" }));
  expect(changed).toHaveBeenCalledWith("loop");
  expect(screen.getByRole("button", { name: "Mode de lecture · Boucle" }).textContent).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Mode de lecture · Boucle" }));
  fireEvent.click(screen.getByRole("radio", { name: "Aller-retour" }));
  expect(changed).toHaveBeenLastCalledWith("pingPong");
});

it("retains native radio-keyboard navigation despite tooltip wrappers", async () => {
  const d = setup(),
    changed = vi.fn(),
    user = userEvent.setup();
  function Host() {
    const [value, setValue] = useState<TimelineTransportState["playbackMode"]>("once");
    return (
      <PlaybackMode
        value={value}
        onChange={(mode) => {
          setValue(mode);
          changed(mode);
        }}
      />
    );
  }
  d.mount(<Host />);
  await user.click(screen.getByRole("button", { name: "Mode de lecture · Une fois" }));
  await waitFor(() => expect(screen.getByRole("radio", { name: "Une fois" })).toHaveFocus());
  // Radix moves focus in the next task; keep keydown and keyup as separate browser events.
  fireEvent.keyDown(screen.getByRole("radio", { name: "Une fois" }), { key: "ArrowRight" });
  await waitFor(() => expect(changed).toHaveBeenCalledWith("pingPong"));
  fireEvent.keyUp(document.activeElement!, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Mode de lecture · Aller-retour" })).toHaveFocus();
});

it("closes its portal and disables authoring immediately when the dock exits", () => {
  const d = setup(),
    changed = vi.fn();
  const view = d.mount(<PlaybackMode value="once" onChange={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "Mode de lecture · Une fois" }));
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  view.rerender(<PlaybackMode value="once" onChange={changed} active={false} />);
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Mode de lecture · Une fois" })).toBeDisabled();
  expect(changed).not.toHaveBeenCalled();
});
