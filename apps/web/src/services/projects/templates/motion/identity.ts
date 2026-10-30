import { TEMPLATE_CATALOG } from "../catalog";
import type { MotionTemplateId } from "./model";
/** The same registered Motion catalogue controls both loaders and hover presentation. */
export function isMotionTemplateId(id: string): id is MotionTemplateId {
  return TEMPLATE_CATALOG.some((item) => item.id === id && item.mode === "motion");
}
