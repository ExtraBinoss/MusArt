import { expect, test } from "vitest";
import { messages } from "../../../../src/ui/brand/ssr/messages";
test("the social artwork has corresponding French/English copy and real failure messages", () => {
  expect(Object.keys(messages.fr).sort()).toEqual(Object.keys(messages.en).sort());
  expect(messages.fr.failed).toBeTruthy();
});
