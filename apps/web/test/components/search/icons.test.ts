import { expect, test } from "vitest";
import { createSearchItems } from "../../../src/components/search/catalog/items";
import { getSearchIcon } from "../../../src/components/search/icons";
import { setup } from "../../support/ui";
test("provides a real icon for every stable command, effect and project item", () => {
  const { engine } = setup();
  for (const item of createSearchItems(engine.getSnapshot(), (key) => key))
    expect(getSearchIcon(item)).toBeTruthy();
});
