import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Profiler } from "react";
import { SearchCommandSurface } from "../../../src/components/search/SearchCommandSurface";
import { SearchCatalog } from "../../../src/components/search/catalog/cache";
import type { SearchSurface } from "../../../src/components/search/MagicSearch";
import { bindingSnapshot } from "../../../src/state/keybindings/preferences";
import { setup } from "../../support/ui";
import { usePopoverOwner } from "../../../src/components/layers/attachments/use-popover-owner";

test("attachment selection retains the dock while history remains actionable until dismissal", () => {
  const d = setup(),
    catalog = new SearchCatalog(),
    run = vi.fn();
  function Editing() {
    const owner = usePopoverOwner("effect");
    return (
      <>
        <button onClick={() => owner.onOpenChange(true)}>Edit effect</button>
        <button onClick={() => owner.onOpenChange(false)}>Dismiss effect</button>
      </>
    );
  }
  const Content = vi.fn(({ commands, run }: SearchSurface) => (
    <>
      {["undo", "redo", "duplicate"].map((id) => (
        <button
          key={id}
          disabled={!!commands.find((item) => item.id === `action:${id}`)?.disabled}
          onClick={() => run(`action:${id}`)}
        >
          {id}
        </button>
      ))}
    </>
  ));
  d.mount(
    <>
      <Editing />
      <SearchCommandSurface
        engine={d.engine}
        catalog={catalog}
        t={(key) => key}
        bindings={bindingSnapshot()}
        locale="en"
        trigger={null}
        run={run}
        component={Content}
      />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit effect" }));
  const before = Content.mock.calls.length;
  act(() => d.engine.select([d.rectangle.id]));
  expect(Content).toHaveBeenCalledTimes(before);
  expect(screen.getByRole("button", { name: "duplicate" })).toBeDisabled();
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { x: 99 } }));
  expect(screen.getByRole("button", { name: "undo" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "duplicate" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "undo" }));
  expect(run).toHaveBeenCalledExactlyOnceWith("action:undo");
  const after = Content.mock.calls.length;
  act(() => d.engine.select([d.image.id]));
  expect(Content).toHaveBeenCalledTimes(after);
  act(() => d.engine.undo());
  expect(screen.getByRole("button", { name: "redo" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss effect" }));
  expect(screen.getByRole("button", { name: "duplicate" })).toBeEnabled();
});

test("only the command surface follows availability while its retained trigger and callback stay stable", () => {
  const d = setup(),
    run = vi.fn(),
    catalog = new SearchCatalog();
  const trigger = <button>Open search</button>;
  const Content = vi.fn(({ commands, trigger, run }: SearchSurface) => (
    <>
      {trigger}
      <button
        disabled={!!commands.find((item) => item.id === "action:duplicate")?.disabled}
        onClick={() => run("action:duplicate")}
      >
        Duplicate
      </button>
    </>
  ));
  const commits: number[] = [];
  d.mount(
    <Profiler id="command-surface" onRender={() => commits.push(Content.mock.calls.length)}>
      <SearchCommandSurface
        engine={d.engine}
        catalog={catalog}
        t={(key) => key}
        bindings={bindingSnapshot()}
        locale="en"
        trigger={trigger}
        run={run}
        component={Content}
      />
    </Profiler>,
  );
  const button = screen.getByRole("button", { name: "Open search" });
  expect(screen.getByRole("button", { name: "Duplicate" })).toBeDisabled();
  const first = Content.mock.calls.length;
  commits.length = 0;
  act(() => d.engine.select([d.rectangle.id]));
  expect(commits).toEqual([first, first + 1]);
  expect(Content).toHaveBeenCalledTimes(first + 1);
  expect(screen.getByRole("button", { name: "Duplicate" })).not.toBeDisabled();
  expect(screen.getByRole("button", { name: "Open search" })).toBe(button);
  act(() => d.engine.select([d.image.id]));
  expect(Content).toHaveBeenCalledTimes(first + 1);
  fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
  expect(run).toHaveBeenCalledExactlyOnceWith("action:duplicate");
});
