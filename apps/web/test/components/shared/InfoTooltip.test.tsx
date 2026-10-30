import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { InfoTooltip } from "../../../src/components/shared/InfoTooltip";
import { setup } from "../../support/ui";

it("reveals help on keyboard focus, dismisses with Escape and releases focus normally", async () => {
  setup().mount(
    <>
      <InfoTooltip label="About scale">100% is the original size.</InfoTooltip>
      <button>Next field</button>
    </>,
  );
  const user = userEvent.setup();
  expect(screen.queryByRole("tooltip")).toBeNull();
  await user.tab();
  expect(await screen.findByRole("tooltip")).toHaveTextContent("100% is the original size.");
  expect(screen.getByRole("button", { name: "About scale" })).toHaveAccessibleDescription(
    "100% is the original size.",
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
  await user.tab();
  expect(screen.getByRole("button", { name: "Next field" })).toHaveFocus();
});

it("supports hover and deliberate taps without submitting an enclosing form", async () => {
  setup().mount(
    <form>
      <InfoTooltip label="About time">Time runs from 0% to 100%.</InfoTooltip>
      <button type="button">Other control</button>
    </form>,
  );
  const user = userEvent.setup(),
    info = screen.getByRole("button", { name: "About time" });
  await user.hover(info);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Time runs from 0% to 100%.");
  await user.unhover(info);
  expect(screen.queryByRole("tooltip")).toBeNull();
  await user.click(info);
  expect(await screen.findByRole("tooltip")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Other control" }));
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(info).toHaveAttribute("type", "button");
});
