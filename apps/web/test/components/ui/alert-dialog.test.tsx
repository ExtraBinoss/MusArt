import { expect, test } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
const dialogStyles = readFileSync("apps/web/src/styles/dialogs.css", "utf8");
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogMedia,
} from "../../../src/components/ui/alert-dialog";
test("opens an accessible destructive confirmation with safe cancellation and compact media", () => {
  render(
    <AlertDialog>
      <AlertDialogTrigger>Delete</AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>!</AlertDialogMedia>
          <AlertDialogTitle>Delete project?</AlertDialogTitle>
          <AlertDialogDescription>Local data will be removed.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(screen.getByRole("alertdialog")).toHaveAccessibleName("Delete project?");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

test.each([
  { size: "default", media: true, aligned: true },
  { size: "sm", media: true, aligned: false },
  { size: "default", media: false, aligned: false },
] as const)(
  "scopes responsive media alignment to its $size dialog (media: $media)",
  ({ size, media, aligned }) => {
    const style = document.createElement("style");
    style.textContent = dialogStyles;
    document.head.append(style);
    try {
      const responsive = [...style.sheet!.cssRules].find(
        (rule) =>
          rule.type === CSSRule.MEDIA_RULE &&
          (rule as CSSMediaRule).conditionText === "(min-width: 40rem)",
      ) as CSSMediaRule;
      const alignment = [...responsive.cssRules].find(
        (rule) =>
          rule.type === CSSRule.STYLE_RULE &&
          (rule as CSSStyleRule).style.getPropertyValue("grid-column-start") === "2",
      ) as CSSStyleRule;
      render(
        <AlertDialog open>
          <AlertDialogContent size={size}>
            <AlertDialogHeader>
              {media && <AlertDialogMedia>!</AlertDialogMedia>}
              <AlertDialogTitle>Scoped confirmation</AlertDialogTitle>
              <AlertDialogDescription>Confirm this change.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>,
      );
      const title = screen.getByRole("heading", { name: "Scoped confirmation" });
      expect(title.matches(alignment.selectorText)).toBe(aligned);
      expect(title.className).not.toContain("group-has");
      expect(alignment.selectorText).not.toContain(":has(");
      expect(alignment.selectorText).not.toContain("*");
      expect(document.createElement("div").matches(alignment.selectorText)).toBe(false);
    } finally {
      style.remove();
    }
  },
);
