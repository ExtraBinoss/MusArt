import { expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { Button } from "../../../src/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "../../../src/components/ui/button-group";

test("groups connected controls without changing their actions or accessible names", () => {
  const save = vi.fn();
  render(
    <ButtonGroup aria-label="Document actions">
      <ButtonGroupText>Document</ButtonGroupText>
      <Button onClick={save}>Save</Button>
      <ButtonGroupSeparator decorative={false} />
      <Button disabled>Publish</Button>
    </ButtonGroup>,
  );
  expect(screen.getByRole("group", { name: "Document actions" })).toHaveAttribute(
    "data-orientation",
    "horizontal",
  );
  expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
});

test("supports vertical grouping and a text slot without introducing extra wrappers", () => {
  render(
    <ButtonGroup orientation="vertical" aria-label="Layer controls" className="custom-group">
      <ButtonGroupText asChild>
        <label htmlFor="layer">Layer</label>
      </ButtonGroupText>
      <input id="layer" defaultValue="Background" />
      <ButtonGroupSeparator orientation="horizontal" decorative={false} />
    </ButtonGroup>,
  );
  const group = screen.getByRole("group", { name: "Layer controls" });
  expect(group).toHaveAttribute("data-orientation", "vertical");
  expect(group).toHaveClass("custom-group");
  expect(screen.getByLabelText("Layer")).toHaveValue("Background");
  expect(group.firstElementChild?.tagName).toBe("LABEL");
  expect(screen.getByRole("separator")).not.toHaveAttribute("aria-orientation");
});
