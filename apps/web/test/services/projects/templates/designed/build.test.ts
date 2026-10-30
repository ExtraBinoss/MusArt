import { expect, it } from "vitest";
import { buildDesignedTemplate } from "../../../../../src/services/projects/templates/designed/build";
import { DESIGNED_TEMPLATES } from "../../../../../src/services/projects/templates/designed/catalog";

it("builds exact named dimensions and mode from the shared template catalog", () => {
  for (const definition of DESIGNED_TEMPLATES) {
    const { project, batches } = buildDesignedTemplate(definition.id),
      page = project.pages[0]!;
    expect(page).toMatchObject({ width: definition.width, height: definition.height });
    expect(page.motion?.mode ?? "static").toBe(definition.mode);
    expect(batches.length).toBeGreaterThan(0);
  }
});
