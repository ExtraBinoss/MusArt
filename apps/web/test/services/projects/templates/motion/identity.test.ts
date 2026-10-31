import { expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { EditorServices } from "../../../../../src/state/contracts";
import { TEMPLATE_CATALOG } from "../../../../../src/services/projects/templates/catalog";
import { isMotionTemplateId } from "../../../../../src/services/projects/templates/motion/identity";
import {
  openMotionTemplate,
  prepareMotionTemplate,
  type TemplateFetcher,
} from "../../../../../src/services/projects/templates/motion/loader";
import { isDesignedTemplateId } from "../../../../../src/services/projects/templates/designed/catalog";

const templates = TEMPLATE_CATALOG.filter((item) => item.mode === "motion");
test.each(templates)(
  "prepares the real $id bundle from its owning directory without installing it",
  async (template) => {
    expect(isMotionTemplateId(template.id)).toBe(true);
    if (!isMotionTemplateId(template.id)) throw Error("Missing Motion identity");
    const requests: string[] = [];
    const fetcher: TemplateFetcher = async (url) => {
      requests.push(url);
      const path = new URL(url, "https://melt.test").pathname;
      const bytes = await readFile(resolve("apps/web/public", path.slice(1)));
      return new Response(new Uint8Array(bytes));
    };
    const prepared = await prepareMotionTemplate(template.id, {}, fetcher);
    const folder = isDesignedTemplateId(template.id) ? "designed" : "motion";
    expect(requests[0]).toBe(`/templates/${folder}/${template.id}.json`);
    expect(prepared.project.pages[0]!.motion!.mode).toBe("motion");
    expect(prepared.project.pages[0]!.width).toBe(template.width);
    expect(prepared.project.pages[0]!.height).toBe(template.height);
    if (template.id === "morphing-type") {
      const openMediaProject = vi.fn<NonNullable<EditorServices["openMediaProject"]>>(
        async () => {},
      );
      await openMotionTemplate({ openMediaProject }, template.id, {}, fetcher);
      expect(openMediaProject).toHaveBeenCalledOnce();
      expect(openMediaProject.mock.calls[0]![0]).toMatchObject({ name: "Melt Mascot" });
    }
  },
);
test("rejects static and unknown templates before downloading", async () => {
  expect(isMotionTemplateId("colorfield")).toBe(false);
  expect(isMotionTemplateId("unknown")).toBe(false);
});
