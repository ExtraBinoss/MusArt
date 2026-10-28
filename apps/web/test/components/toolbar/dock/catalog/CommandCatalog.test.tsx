import { expect, test, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { SearchItem } from "../../../../../src/components/search/catalog/model";
import { CommandCatalog } from "../../../../../src/components/toolbar/dock/catalog/CommandCatalog";
import { setup } from "../../../../support/ui";
test("a five-hundred-command metadata catalog remains virtualized, scrolls and searches its full data", () => {
  const d = setup(),
    change = vi.fn();
  const commands: SearchItem[] = Array.from({ length: 500 }, (_, at) => ({
    id: `test-${at}`,
    label: `Command ${at}`,
    terms: `keyword${at}`,
    category: "tools",
    target: { kind: "action", action: "toolPointer" },
  }));
  d.mount(<CommandCatalog commands={commands} ids={[]} onChange={change} />);
  const list = screen.getByRole("list");
  expect(within(list).getAllByRole("button").length).toBeLessThan(20);
  expect(list.querySelector("[data-total-commands]")).toHaveAttribute("data-total-commands", "500");
  fireEvent.scroll(list, { target: { scrollTop: 3500 } });
  expect(screen.queryByRole("button", { name: "Épingler Command 0" })).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "keyword499" } });
  expect(list.scrollTop).toBe(0);
  expect(within(list).getAllByRole("button")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Épingler Command 499" }));
  expect(change).toHaveBeenCalledExactlyOnceWith(["test-499"]);
});
