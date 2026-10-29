import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Profiler } from "react";
import { SearchCommandSurface } from "../../../src/components/search/SearchCommandSurface";
import { SearchCatalog } from "../../../src/components/search/catalog/cache";
import type { SearchSurface } from "../../../src/components/search/MagicSearch";
import { bindingSnapshot } from "../../../src/state/keybindings/preferences";
import { setup } from "../../support/ui";

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
