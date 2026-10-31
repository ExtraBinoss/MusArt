import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("../../src/components/projects/landing/LandingPage", () => ({
  LandingPage: ({
    onCreate,
    onTemplate,
    navigation,
  }: {
    onCreate: () => void;
    onTemplate: (id: string) => void;
    navigation: React.ReactNode;
  }) => (
    <>
      <button onClick={onCreate}>Create</button>
      <button onClick={() => onTemplate("in-bloom")}>Template</button>
      {navigation}
    </>
  ),
}));
import { LandingRoute } from "../../src/routing/LandingRoute";
test("Try Melt is the sole library entry and choosing a template creates an editor URL", () => {
  render(<LandingRoute />);
  expect(screen.queryAllByRole("link")).toHaveLength(0);
  fireEvent.click(screen.getByText("Create"));
  expect(navigate).toHaveBeenCalledWith({ to: "/dashboard" });
  fireEvent.click(screen.getByText("Template"));
  expect(navigate).toHaveBeenCalledWith({ to: "/editor", search: { template: "in-bloom" } });
});
