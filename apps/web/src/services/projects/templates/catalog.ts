import { beginProjectTiming } from "../../performance/project-timing";
import { PRESETS, createProject, serializeProject } from "@musart/core";
import type { EditorServices } from "../../../state/contracts";
import type { TemplateLoadOptions } from "./motion/loader";
import { DESIGNED_TEMPLATES, isDesignedTemplateId } from "./designed/catalog";

export interface ProjectTemplate {
  readonly id: string;
  readonly nameKey: string;
  readonly width: number;
  readonly height: number;
  readonly brandId?: string;
  readonly preview?: string;
  readonly category: "artwork" | "social" | "video" | "print" | "screen";
  readonly mode: "static" | "motion";
  readonly descriptionKey?: string;
}
export const TEMPLATE_CATALOG: readonly ProjectTemplate[] = Object.freeze([
  Object.freeze({
    id: "morphing-type",
    nameKey: "templates:morphingType",
    descriptionKey: "templates:morphingTypeDescription",
    width: 1920,
    height: 1080,
    mode: "motion",
    category: "artwork",
    preview: `${import.meta.env.BASE_URL}templates/motion/morphing-type.webp?v=melt-mascot-1`,
  }),
  ...DESIGNED_TEMPLATES.map((template) =>
    Object.freeze({
      ...template,
      preview: `${import.meta.env.BASE_URL}templates/designed/${template.id}.webp`,
    }),
  ),
  Object.freeze({
    id: "afterhours-techno",
    nameKey: "templates:afterhours",
    width: 1080,
    height: 1920,
    category: "artwork" as const,
    mode: "static" as const,
    descriptionKey: "templates:editable",
    preview: `${import.meta.env.BASE_URL}templates/afterhours.webp`,
  }),
  Object.freeze({
    id: "in-bloom",
    nameKey: "templates:bloom",
    width: 1440,
    height: 1040,
    category: "artwork" as const,
    mode: "motion" as const,
    descriptionKey: "templates:bloomDescription",
    preview: `${import.meta.env.BASE_URL}templates/motion/in-bloom.webp`,
  }),
  Object.freeze({
    id: "motion-stress-lab",
    nameKey: "templates:stress",
    width: 1440,
    height: 1200,
    category: "artwork" as const,
    mode: "motion" as const,
    descriptionKey: "templates:stressDescription",
    preview: `${import.meta.env.BASE_URL}templates/motion/motion-stress-lab.webp`,
  }),
  Object.freeze({
    id: "sound-playground",
    nameKey: "templates:soundPlayground",
    width: 1080,
    height: 1080,
    category: "artwork" as const,
    mode: "motion" as const,
    descriptionKey: "templates:soundPlaygroundDescription",
    preview: `${import.meta.env.BASE_URL}templates/motion/sound-playground.webp`,
  }),
  Object.freeze({
    id: "share-your-work",
    nameKey: "templates:shareYourWork",
    width: 480,
    height: 480,
    category: "artwork" as const,
    mode: "motion" as const,
    descriptionKey: "templates:shareYourWorkDescription",
    preview: `${import.meta.env.BASE_URL}templates/motion/share-your-work.webp?v=haunt-loop-1`,
  }),
  ...PRESETS.map((preset) =>
    Object.freeze({
      id: `preset:${preset.id}`,
      nameKey: preset.nameKey,
      width: preset.width,
      height: preset.height,
      brandId: preset.brandId,
      category: preset.category,
      mode: "static" as const,
    }),
  ),
]);

/** Creates an independent, durably saved project through the normal validated service ports. */
async function openProjectTemplate(
  services: Pick<EditorServices, "createProject" | "openPortable" | "openMediaProject">,
  templateId: string,
  options: TemplateLoadOptions = {},
): Promise<void> {
  options.signal?.throwIfAborted();
  if (isDesignedTemplateId(templateId)) {
    const { openDesignedTemplate } = await import("./designed/load");
    await openDesignedTemplate(services, templateId, options);
    return;
  }
  if (
    templateId === "morphing-type" ||
    templateId === "in-bloom" ||
    templateId === "motion-stress-lab" ||
    templateId === "sound-playground" ||
    templateId === "share-your-work"
  ) {
    const { openMotionTemplate } = await import("./motion/loader");
    await openMotionTemplate(services, templateId, options);
    return;
  }
  if (templateId === "afterhours-techno") {
    const { createTechnoArtboard } = await import("./techno");
    const project = createProject({
      id: crypto.randomUUID(),
      name: "AFTERHOURS — Techno",
      pages: [createTechnoArtboard()],
    });
    await services.openPortable(
      new File([serializeProject(project)], "afterhours.musart", { type: "application/json" }),
    );
    return;
  }
  const preset = PRESETS.find((item) => `preset:${item.id}` === templateId);
  if (!preset) throw new Error("Unknown project template.");
  await services.createProject({
    presetId: preset.id,
    name: preset.name,
    width: preset.width,
    height: preset.height,
    background: "#ffffff",
  });
}

/** One timing follows the whole template operation, including the native first frame. */
export async function createProjectFromTemplate(
  services: Pick<EditorServices, "createProject" | "openPortable" | "openMediaProject">,
  templateId: string,
  options: TemplateLoadOptions = {},
): Promise<void> {
  const timing = options.timing ?? beginProjectTiming("Open template", { templateId });
  timing?.stage("Resolve template");
  try {
    await openProjectTemplate(services, templateId, { ...options, ...(timing ? { timing } : {}) });
    if (!timing?.waitingForFrame) timing?.finish("published");
  } catch (error) {
    timing?.finish(options.signal?.aborted ? "cancelled" : "failed", error);
    throw error;
  }
}
