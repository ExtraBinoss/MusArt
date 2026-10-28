import { expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../src/components/ui/tooltip";
import { IconButton } from "../../../src/components/shared/IconButton";
import { Popover, PopoverContent, PopoverTrigger } from "../../../src/components/ui/popover";
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

test.each([false, true])(
  "real popover autofocus stays quiet after pointer and keyboard opening; hover still works (reduced motion: %s)",
  async (reduced) => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      media: query,
      matches: reduced && query.includes("prefers-reduced-motion"),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    }));
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Popover>
          <PopoverTrigger>Open controls</PopoverTrigger>
          <PopoverContent aria-label="Controls">
            <IconButton label="Inspect control">
              <span>+</span>
            </IconButton>
            <IconButton label="Another control">
              <span>−</span>
            </IconButton>
          </PopoverContent>
        </Popover>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Open controls" });
    await user.click(trigger);
    let action = await screen.findByRole("button", { name: "Inspect control" });
    await waitFor(() => expect(action).toHaveFocus());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.hover(action);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Inspect control");
    await user.unhover(action);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    action = await screen.findByRole("button", { name: "Inspect control" });
    await waitFor(() => expect(action).toHaveFocus());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("button", { name: "Another control" })).toHaveFocus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.hover(action);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Inspect control");
    await user.unhover(action);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  },
);

test("focus callbacks and accessible labels remain available without opening a tooltip", () => {
  const focus = vi.fn();
  render(
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger aria-label="Accessible action" onFocus={focus}>
          Action
        </TooltipTrigger>
        <TooltipContent>Extra explanation</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  fireEvent.focus(screen.getByRole("button", { name: "Accessible action" }));
  expect(focus).toHaveBeenCalledOnce();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
