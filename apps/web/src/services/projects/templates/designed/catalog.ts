export const DESIGNED_TEMPLATES = Object.freeze(
  (
    [
      {
        id: "orbit-study",
        nameKey: "templates:orbit",
        width: 1080,
        height: 1080,
        mode: "motion",
        descriptionKey: "templates:orbitDescription",
        category: "artwork",
      },
      {
        id: "paper-motion",
        nameKey: "templates:paper",
        width: 1080,
        height: 1350,
        mode: "motion",
        descriptionKey: "templates:paperDescription",
        category: "artwork",
      },
      {
        id: "colorfield",
        nameKey: "templates:colorfield",
        width: 1080,
        height: 1350,
        mode: "static",
        descriptionKey: "templates:colorfieldDescription",
        category: "artwork",
      },
      {
        id: "transition-atlas",
        nameKey: "templates:atlas",
        width: 1440,
        height: 960,
        mode: "motion",
        descriptionKey: "templates:atlasDescription",
        category: "artwork",
      },
    ] as const
  ).map((template) => Object.freeze(template)),
);
export type DesignedTemplateId = (typeof DESIGNED_TEMPLATES)[number]["id"];
export function isDesignedTemplateId(id: string): id is DesignedTemplateId {
  return DESIGNED_TEMPLATES.some((template) => template.id === id);
}
