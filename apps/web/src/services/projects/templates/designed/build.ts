import { createOrbitStudy, createPaperMotion, createColorfield } from "./artwork";
import { createTransitionAtlas } from "./atlas";
import type { DesignedTemplateId } from "./catalog";

const builders = {
  "orbit-study": createOrbitStudy,
  "paper-motion": createPaperMotion,
  colorfield: createColorfield,
  "transition-atlas": createTransitionAtlas,
} as const;
/** No UI, storage, media decoder or GPU is involved in authoring these portable documents. */
export function buildDesignedTemplate(id: DesignedTemplateId) {
  return builders[id]();
}
