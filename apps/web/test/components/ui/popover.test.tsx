import { expect, test } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "../../../src/components/ui/popover";
test("opens anchored popover and closes with Escape", async () => {
  render(
    <Popover>
      <PopoverAnchor>
        <span>Anchor</span>
      </PopoverAnchor>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Details</PopoverTitle>
          <PopoverDescription>Configure</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>,
  );
  fireEvent.click(screen.getByText("Open"));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Details");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
});
