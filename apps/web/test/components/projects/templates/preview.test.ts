import { expect, test } from "vitest";
import { templatePreview } from "../../../../src/components/projects/templates/preview";
import { TEMPLATE_CATALOG } from "../../../../src/services/projects/templates/catalog";
test("assigns deterministic bounded decorative palettes without changing template documents", () => {
  const previews = TEMPLATE_CATALOG.map((item) => templatePreview(item.id));
  expect(new Set(previews).size).toBeGreaterThan(8);
  for (const [index, value] of previews.entries()) {
    expect(value).toBe(templatePreview(TEMPLATE_CATALOG[index]!.id));
    expect(value).toContain("radial-gradient");
    expect(value).toContain("linear-gradient");
    expect(value.length).toBeLessThan(400);
  }
});
