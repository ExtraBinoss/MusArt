import { expect, test, vi } from "vitest";
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import {
  PanelHeaderActions,
  PanelHeaderTarget,
} from "../../../../src/components/shared/panels/PanelHeaderActions";

test("desktop keeps its own header, while a sheet mounts the same action owner exactly once", () => {
  const mounted = vi.fn(),
    disposed = vi.fn();
  function Action() {
    useEffect(() => {
      mounted();
      return disposed;
    }, []);
    return <button>Layer action</button>;
  }
  const actions = <Action />;
  const view = render(
    <PanelHeaderActions
      fallback={
        <header>
          <h2>Layers</h2>
          {actions}
        </header>
      }
    >
      {actions}
    </PanelHeaderActions>,
  );
  expect(screen.getByRole("heading", { name: "Layers" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Layer action" })).toHaveLength(1);
  expect(mounted).toHaveBeenCalledOnce();
  const target = document.createElement("div");
  document.body.append(target);
  view.rerender(
    <PanelHeaderTarget value={target}>
      <PanelHeaderActions fallback={<h2>Duplicate header</h2>}>{actions}</PanelHeaderActions>
    </PanelHeaderTarget>,
  );
  expect(screen.queryByRole("heading")).toBeNull();
  expect(target.querySelector("button")).toBe(screen.getByRole("button", { name: "Layer action" }));
  expect(screen.getAllByRole("button", { name: "Layer action" })).toHaveLength(1);
  view.unmount();
  expect(target.children).toHaveLength(0);
  expect(disposed).toHaveBeenCalledTimes(mounted.mock.calls.length);
  target.remove();
});

test("an attaching sheet never flashes a second header or mounts duplicate subscriptions", () => {
  render(
    <PanelHeaderTarget value={null}>
      <PanelHeaderActions fallback={<h2>Duplicate header</h2>}>
        <button>Pending action</button>
      </PanelHeaderActions>
    </PanelHeaderTarget>,
  );
  expect(screen.queryByRole("heading")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});
