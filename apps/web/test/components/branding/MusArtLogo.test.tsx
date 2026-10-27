import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MusArtLogo } from "../../../src/components/branding/MusArtLogo";

it("uses the supplied transparent PNGs with stable dimensions and high-density artwork", () => {
  const { container } = render(<MusArtLogo />);
  const logo = container.querySelector("img")!;
  expect(logo).toHaveAttribute("src", "/branding/musart-icon-32.png");
  expect(logo).toHaveAttribute(
    "srcset",
    "/branding/musart-icon-32.png 1x, /branding/musart-icon-64.png 2x",
  );
  expect(logo).toHaveAttribute("width", "30");
  expect(logo).toHaveAttribute("height", "30");
  expect(logo).toHaveAttribute("aria-hidden", "true");
  expect(logo).toHaveAttribute("draggable", "false");
});
it("provides a brand name when displayed outside an already-labelled control", () => {
  render(<MusArtLogo size={48} decorative={false} />);
  expect(screen.getByRole("img", { name: "MusArt" })).toHaveAttribute("width", "48");
  expect(screen.getByRole("img", { name: "MusArt" })).not.toHaveAttribute("aria-hidden");
});
