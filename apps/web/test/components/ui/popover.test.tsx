import { getUiPresentation } from "../../../src/state/session/ui-presentation";
import { expect, test, vi } from "vitest";
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

test("only actually mounted Radix content acquires a bounded presentation lease", () => {
  vi.useFakeTimers();
  const port = getUiPresentation(),
    view = render(
      <Popover open={false}>
        <PopoverTrigger>Toggle</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );
  try {
    expect(port.busy()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    view.rerender(
      <Popover open>
        <PopoverTrigger>Toggle</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Content");
    expect(port.busy()).toBe(true);
    view.unmount();
    expect(port.busy()).toBe(false);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});
test("asChild retains the original content element and acquires only on its mounted lifetime", () => {
  const port = getUiPresentation(),
    view = render(
      <Popover open>
        <PopoverTrigger>Toggle</PopoverTrigger>
        <PopoverContent asChild>
          <article data-original-content>
            <b>Details</b>
          </article>
        </PopoverContent>
      </Popover>,
    );
  const content = screen.getByRole("dialog");
  expect(content.tagName).toBe("ARTICLE");
  expect(content).toHaveAttribute("data-original-content");
  expect(content.firstElementChild?.tagName).toBe("B");
  expect(port.busy()).toBe(true);
  view.unmount();
  expect(port.busy()).toBe(false);
});
