import { expect, test } from "vitest";
import { messages } from "../../../src/ui/brand/messages";
test("provides honest loading and preparation labels in both interface languages", () => {
  expect(Object.keys(messages.en)).toEqual(Object.keys(messages.fr));
  expect(messages.en.loading).toBe("Melt is loading");
  expect(messages.fr.preparing).toBe("Melt prépare votre création");
});
