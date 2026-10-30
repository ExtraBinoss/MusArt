import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../src/components/ui/collapsible";

it("connects keyboard disclosure state to its content and honors disabled interaction", async () => {
  const user = userEvent.setup();
  const view = render(
    <Collapsible>
      <CollapsibleTrigger>Animation</CollapsibleTrigger>
      <CollapsibleContent>Duration</CollapsibleContent>
    </Collapsible>,
  );
  const trigger = screen.getByRole("button", { name: "Animation" });
  await user.tab();
  await user.keyboard("{Enter}");
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Duration").id).toBe(trigger.getAttribute("aria-controls"));
  await user.keyboard(" ");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  view.rerender(
    <Collapsible disabled>
      <CollapsibleTrigger>Animation</CollapsibleTrigger>
    </Collapsible>,
  );
  await user.click(screen.getByRole("button", { name: "Animation" }));
  expect(screen.getByRole("button", { name: "Animation" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
