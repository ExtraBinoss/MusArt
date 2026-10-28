import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button, buttonVariants } from "../../../src/components/ui/button";
test("renders button variants and Radix slotted links", () => {
  render(
    <>
      <Button>Save</Button>
      <Button variant="destructive" size="sm">
        Delete
      </Button>
      <Button asChild variant="outline" size="icon-xs">
        <a href="#save">Link</a>
      </Button>
    </>,
  );
  expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("data-variant", "default");
  expect(screen.getByRole("link")).toHaveAttribute("href", "#save");
  expect(buttonVariants({ variant: "ghost", size: "lg" })).toContain("h-10");
});
