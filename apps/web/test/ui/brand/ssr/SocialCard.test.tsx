import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../../../src/state/i18n";
vi.mock("../../../../src/ui/brand/ssr/CompositionPreview", () => ({
  CompositionPreview: () => <div data-testid="native-composition" />,
}));
import { SocialCard } from "../../../../src/ui/brand/ssr/SocialCard";
test("the share card combines the canonical mascot, brand, future domain and native art slot", () => {
  render(<SocialCard />);
  expect(screen.getByRole("heading", { name: "Melt" })).toBeVisible();
  expect(screen.getByText("melt.plinka.eu")).toBeVisible();
  expect(screen.getByTestId("native-composition")).toBeVisible();
  expect(document.querySelector("img")?.src).toContain("branding/melt.svg");
});

test("the exported share image stays English, without an eyebrow or an extra poster slogan", () => {
  render(<SocialCard />);
  expect(screen.getByText("Design with ease.", { exact: false })).toBeVisible();
  expect(screen.getByText("Animate to captivate.")).toBeVisible();
  expect(screen.queryByText("YOUR IDEAS, UNFILTERED.")).toBeNull();
});
