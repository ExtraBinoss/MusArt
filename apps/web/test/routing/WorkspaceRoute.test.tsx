import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { StudioRouting } from "../../src/state/contracts";
const state = vi.hoisted(() => ({
  location: { pathname: "/dashboard", search: {} as Record<string, unknown> },
  navigate: vi.fn(),
  routing: null as StudioRouting | null,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  useRouterState: () => state.location,
}));
vi.mock("../../src/bootstrap/Studio", () => ({
  Studio: ({ routing }: { routing: StudioRouting }) => {
    state.routing = routing;
    return <span>{routing.view}</span>;
  },
}));
import { WorkspaceRoute } from "../../src/routing/WorkspaceRoute";
test("URL changes preserve the shared Studio while forwarding durable source identities", async () => {
  const view = render(<WorkspaceRoute />);
  await screen.findByText("dashboard");
  state.location = { pathname: "/editor", search: { project: "uuid" } };
  view.rerender(<WorkspaceRoute />);
  await screen.findByText("editor");
  expect(state.routing).toMatchObject({ projectId: "uuid" });
  state.routing!.navigate("editor", "new-uuid");
  expect(state.navigate).toHaveBeenLastCalledWith({
    to: "/editor",
    search: { project: "new-uuid" },
  });
});
