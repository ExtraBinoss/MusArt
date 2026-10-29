import { getUiPresentation } from "../../../src/state/session/ui-presentation";
import { expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

test("an explicit portal container retains genuine Radix presence and normal close cleanup", async () => {
  const container = document.createElement("aside");
  document.body.append(container);
  const changed = vi.fn(),
    port = getUiPresentation(),
    view = render(
      <Popover onOpenChange={changed}>
        <PopoverTrigger>Explicit container</PopoverTrigger>
        <PopoverContent portalContainer={container}>Scoped editor</PopoverContent>
      </Popover>,
    );
  try {
    expect(container).toBeEmptyDOMElement();
    expect(port.busy()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Explicit container" }));
    const content = await screen.findByRole("dialog");
    expect(container.contains(content)).toBe(true);
    expect(view.container.contains(content)).toBe(false);
    expect(content).toHaveAttribute("data-slot", "popover-content");
    expect(content).toHaveAttribute("data-state", "open");
    expect(content.closest("[data-radix-popper-content-wrapper]")).not.toBeNull();
    expect(changed).toHaveBeenLastCalledWith(true);
    expect(port.busy()).toBe(true);
    fireEvent.keyDown(content, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(changed).toHaveBeenLastCalledWith(false);
    expect(container).toBeEmptyDOMElement();
    expect(port.busy()).toBe(false);
  } finally {
    view.unmount();
    container.remove();
  }
});
