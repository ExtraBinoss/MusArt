import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { InlineTimelineName } from "../../../src/components/motion/InlineTimelineName";
function props() {
  return {
    identity: "audio:one",
    name: "Original",
    label: "Select name",
    renameLabel: "Rename",
    changedLabel: "Changed",
    failedLabel: "Failed",
    onSelect: vi.fn(),
    capture: vi.fn(() => ({ name: "Original" })),
    commit: vi.fn(() => "applied" as const),
  };
}
test("double click keeps typing local, Enter commits once and the following blur cannot duplicate it", () => {
  const d = props();
  render(<InlineTimelineName {...d} />);
  fireEvent.doubleClick(screen.getByRole("button"));
  const input = screen.getByRole("textbox");
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: "Renamed" } });
  expect(d.commit).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.blur(input);
  expect(d.commit).toHaveBeenCalledOnce();
  expect(d.commit).toHaveBeenCalledWith({ name: "Original" }, "Renamed");
});
test("F2 is accessible, Escape cancels, and a plain blur completes one draft", () => {
  const d = props();
  render(<InlineTimelineName {...d} />);
  fireEvent.click(screen.getByRole("button"), { shiftKey: true });
  expect(d.onSelect).toHaveBeenCalledWith(true);
  fireEvent.keyDown(screen.getByRole("button"), { key: "F2" });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(d.commit).not.toHaveBeenCalled();
  fireEvent.doubleClick(screen.getByRole("button"));
  fireEvent.blur(screen.getByRole("textbox"));
  expect(d.commit).toHaveBeenCalledOnce();
});
test("scope recycling cancels the prior name and disabled editors never capture", () => {
  const d = props(),
    mount = render(<InlineTimelineName {...d} />);
  fireEvent.doubleClick(screen.getByRole("button"));
  mount.rerender(<InlineTimelineName {...d} identity="audio:two" name="Other" />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(d.commit).not.toHaveBeenCalled();
  mount.rerender(<InlineTimelineName {...d} interactive={false} />);
  fireEvent.doubleClick(screen.getByRole("button"));
  expect(d.capture).toHaveBeenCalledOnce();
});
