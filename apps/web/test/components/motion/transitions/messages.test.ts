import { expect, it } from "vitest";
import { TRANSITION_CATALOG, TRANSITION_CATEGORIES } from "@musart/core";
import { messages } from "../../../../src/components/motion/transitions/messages";

it("names every transition, category and parameter in both supported languages", () => {
  for (const language of ["en", "fr"] as const) {
    const resource = messages[language];
    for (const { id } of TRANSITION_CATALOG) expect(resource.style[id]).toBeTruthy();
    for (const id of TRANSITION_CATEGORIES) expect(resource.category[id]).toBeTruthy();
    expect(resource.parameter.progress).toBeTruthy();
    expect(resource.hint).toBeTruthy();
    expect(resource.changed).toBeTruthy();
  }
});
