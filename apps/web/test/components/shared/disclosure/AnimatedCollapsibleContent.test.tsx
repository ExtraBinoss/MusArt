import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { AnimatedCollapsibleContent } from "../../../../src/components/shared/disclosure/AnimatedCollapsibleContent";
import { Collapsible, CollapsibleTrigger } from "../../../../src/components/ui/collapsible";

it("mounts controls lazily and makes exiting controls inert before removing them", async () => {
  function Disclosure() {
    const [open, setOpen] = useState(false);
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger>Settings</CollapsibleTrigger>
        <AnimatedCollapsibleContent open={open}>
          <button>Edit duration</button>
        </AnimatedCollapsibleContent>
      </Collapsible>
    );
  }
  render(<Disclosure />);
  const trigger = screen.getByRole("button", { name: "Settings" });
  expect(screen.queryByText("Edit duration")).toBeNull();
  fireEvent.click(trigger);
  const control = screen.getByRole("button", { name: "Edit duration" });
  expect(control.parentElement).not.toHaveAttribute("inert");
  fireEvent.click(trigger);
  expect(control.parentElement).toHaveAttribute("inert");
  expect(control.parentElement).toHaveAttribute("aria-hidden", "true");
  await waitFor(() => expect(screen.queryByText("Edit duration")).toBeNull());
});
