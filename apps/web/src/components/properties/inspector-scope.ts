import { isPublishedComposition, type Composition, type EnginePort } from "@musart/core";

/** Only ruler visibility belongs to an independent consumer inside an unchanged Inspector. */
export function sameInspectorPage(a: Composition, b: Composition): boolean {
  if (a === b) return true;
  if (!isPublishedComposition(a) || !isPublishedComposition(b) || a.layers !== b.layers)
    return false;
  const fields = Object.keys(a).filter((key) => key !== "rulers") as (keyof Composition)[];
  return (
    fields.length === Object.keys(b).filter((key) => key !== "rulers").length &&
    fields.every((key) => Object.hasOwn(b, key) && Object.is(a[key], b[key]))
  );
}

/** Resolve the authoritative page; a replacement, load or any other page edit is stale. */
export function resolveInspectorPage(engine: EnginePort, page: Composition): Composition | null {
  const snapshot = engine.getSnapshot();
  if (snapshot.pageId !== page.id) return null;
  const current = snapshot.project.pages.find((item) => item.id === page.id);
  return current && sameInspectorPage(page, current) ? current : null;
}
