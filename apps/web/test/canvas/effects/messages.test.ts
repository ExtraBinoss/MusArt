import { expect, it } from "vitest";
import { messages } from "../../../src/canvas/effects/messages";
import { i18n } from "../../../src/state/i18n";
it("translates every radial gizmo action in both languages", () => {
  expect(Object.keys(messages.en)).toEqual(Object.keys(messages.fr));
  for (const lng of ["en", "fr"] as const)
    for (const [key, value] of Object.entries(messages[lng]))
      expect(i18n.t(`effectGizmo:${key}`, { lng })).toBe(value);
});
