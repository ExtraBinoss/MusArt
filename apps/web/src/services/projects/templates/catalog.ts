import { PRESETS, createProject, serializeProject } from "@musart/core";
import type { EditorServices } from "../../../state/contracts";

export interface ProjectTemplate {
  readonly id: string;
  readonly nameKey: string;
  readonly width: number;
  readonly height: number;
  readonly brandId?: string;
  readonly preview?: string;
  readonly category: "artwork" | "social" | "video" | "print" | "screen";
}
export const TEMPLATE_CATALOG: readonly ProjectTemplate[] = Object.freeze([
  Object.freeze({
    id: "afterhours-techno",
    nameKey: "templates:afterhours",
    width: 1080,
    height: 1920,
    category: "artwork" as const,
    preview: "/templates/afterhours.webp",
  }),
  ...PRESETS.map((preset) =>
    Object.freeze({
      id: `preset:${preset.id}`,
      nameKey: preset.nameKey,
      width: preset.width,
      height: preset.height,
      brandId: preset.brandId,
      category: preset.category,
    }),
  ),
]);

/** Creates an independent, durably saved project through the normal validated service ports. */
export async function createProjectFromTemplate(
  services: Pick<EditorServices, "createProject" | "openPortable">,
  templateId: string,
): Promise<void> {
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
