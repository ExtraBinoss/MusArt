import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Textarea } from "../../../src/components/ui/textarea";
test("renders editable multiline content", () => {
  render(<Textarea aria-label="Content" defaultValue="Hello" />);
  expect(screen.getByRole("textbox")).toHaveValue("Hello");
});
