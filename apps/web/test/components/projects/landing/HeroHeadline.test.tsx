import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HeroHeadline } from "../../../../src/components/projects/landing/HeroHeadline";

test("keeps the complete heading accessible while staggered decorative letters animate", () => {
  render(<HeroHeadline lines={["Créez.", "Animez."]} />);
  expect(screen.getByRole("heading", { level: 1, name: "Créez. Animez." })).toBeVisible();
  expect(document.querySelectorAll(".hero-line[aria-hidden]")).toHaveLength(2);
  expect(document.querySelectorAll(".hero-letter")).toHaveLength(13);
  expect((document.querySelectorAll(".hero-letter")[6] as HTMLElement).style.animationDelay).toBe(
    "0.22s",
  );
});

test("pauses the finite reveal while hidden and removes its visibility listener", () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const remove = vi.spyOn(document, "removeEventListener");
  const view = render(<HeroHeadline lines={["Create."]} />);
  const heading = screen.getByRole("heading");
  hidden.mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  expect(heading).toHaveAttribute("data-paused");
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  expect(heading).not.toHaveAttribute("data-paused");
  view.unmount();
  expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
});
