import { expect, test } from "vitest";
import { cn } from "../../../src/components/ui/utils";
test("merges conditional classes and resolves Tailwind conflicts", () => {
  expect(cn("p-2", { hidden: false, block: true }, ["p-4"])).toBe("block p-4");
});
