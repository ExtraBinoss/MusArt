import { expect, it } from "vitest";
import {
  DESIGNED_TEMPLATES,
  isDesignedTemplateId,
} from "../../../../../src/services/projects/templates/designed/catalog";

it("publishes four concrete original artworks with searchable Static/Motion metadata", () => {
  expect(DESIGNED_TEMPLATES).toHaveLength(4);
  expect(new Set(DESIGNED_TEMPLATES.map(({ id }) => id)).size).toBe(4);
  expect(DESIGNED_TEMPLATES.filter(({ mode }) => mode === "motion")).toHaveLength(3);
  for (const entry of DESIGNED_TEMPLATES) {
    expect(isDesignedTemplateId(entry.id)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(entry.width).toBeGreaterThan(1000);
    expect(entry.descriptionKey).toContain("templates:");
  }
  expect(isDesignedTemplateId("../../other")).toBe(false);
});
