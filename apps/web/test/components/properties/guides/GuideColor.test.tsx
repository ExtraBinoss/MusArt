import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { GuideColor } from "../../../../src/components/properties/guides/GuideColor";
import { setup } from "../../../support/ui";

test("opens the real compact opaque picker, previews input and commits once on blur", () => {
  const preview = vi.fn(),
    commit = vi.fn(),
    cancel = vi.fn();
  setup().mount(
    <GuideColor
      identity="guide"
      value="#ed66c2"
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Couleur du repère" }));
  const input = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(input, { target: { value: "#00aaff" } });
  expect(preview).toHaveBeenCalledWith("#00aaff");
  expect(commit).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Opacité")).toBeNull();
  fireEvent.blur(input);
  expect(commit).toHaveBeenCalledExactlyOnceWith("#00aaff");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByLabelText("Couleur hexadécimale")).toBeNull();
  expect(cancel).toHaveBeenCalled();
});

test("scope replacement closes a stale picker and disabled guides cannot open it", () => {
  const cancel = vi.fn(),
    noop = vi.fn();
  const d = setup();
  const render = (identity: string, disabled = false) => (
    <GuideColor
      identity={identity}
      value="#ed66c2"
      disabled={disabled}
      onPreview={noop}
      onCommit={noop}
      onCancel={cancel}
    />
  );
  const view = d.mount(render("first"));
  fireEvent.click(screen.getByRole("button", { name: "Couleur du repère" }));
  expect(screen.getByLabelText("Couleur hexadécimale")).toBeInTheDocument();
  view.rerender(render("second", true));
  expect(screen.queryByLabelText("Couleur hexadécimale")).toBeNull();
  expect(cancel).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Couleur du repère" })).toBeDisabled();
  view.unmount();
});
