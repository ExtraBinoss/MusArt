import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../src/components/ui/tooltip";
test("portals accessible tooltip content", async () => {
  render(
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger>Hover</TooltipTrigger>
        <TooltipContent>Label</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Label");
});
