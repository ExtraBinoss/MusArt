import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Separator } from "../../../src/components/ui/separator";
test("supports both orientations and semantic separators", () => {
  render(
    <>
      <Separator />
      <Separator orientation="vertical" decorative={false} />
    </>,
  );
  expect(screen.getByRole("separator")).toHaveAttribute("data-orientation", "vertical");
});
