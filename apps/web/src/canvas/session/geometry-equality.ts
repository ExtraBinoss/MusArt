import type { Composition, Guide, Insets, Layer, SessionSnapshot } from "@musart/core";

const layerFields = [
  "id",
  "kind",
  "name",
  "parentId",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "visible",
  "locked",
  "maskSource",
] as const satisfies readonly (keyof Layer)[];

function sameInsets(a: Insets | undefined, b: Insets | undefined): boolean {
  return (
    a === b ||
    Boolean(
      a &&
      b &&
      a.top === b.top &&
      a.right === b.right &&
      a.bottom === b.bottom &&
      a.left === b.left,
    )
  );
}
function sameGuides(a: readonly Guide[] | undefined, b: readonly Guide[] | undefined): boolean {
  return (
    a === b ||
    Boolean(
      a &&
      b &&
      a.length === b.length &&
      a.every((guide, index) => {
        const other = b[index]!;
        return (
          guide === other ||
          (guide.id === other.id && guide.axis === other.axis && guide.position === other.position)
        );
      }),
    )
  );
}
function sameLayer(a: Layer, b: Layer): boolean {
  return (
    a === b ||
    (layerFields.every((field) => a[field] === b[field]) &&
      sameInsets(a.margin, b.margin) &&
      sameInsets(a.padding, b.padding) &&
      sameGuides(a.guides, b.guides))
  );
}
function samePage(a: Composition, b: Composition): boolean {
  return (
    a === b ||
    (a.name === b.name &&
      a.width === b.width &&
      a.height === b.height &&
      sameInsets(a.margins, b.margins) &&
      sameGuides(a.guides, b.guides) &&
      a.layers.length === b.layers.length &&
      a.layers.every((layer, index) => sameLayer(layer, b.layers[index]!)))
  );
}

/** Geometry views ignore paint; changed geometry exits before constructing any per-layer DTOs. */
export function sameCanvasGeometry(a: SessionSnapshot, b: SessionSnapshot): boolean {
  if (a.project.id !== b.project.id || a.pageId !== b.pageId) return false;
  if (a.project === b.project) return true;
  if (
    a.project.pages.length !== b.project.pages.length ||
    !a.project.pages.every((page, index) => {
      const other = b.project.pages[index]!;
      return (
        page === other ||
        (page.id === other.id &&
          page.name === other.name &&
          page.width === other.width &&
          page.height === other.height)
      );
    })
  )
    return false;
  const current = a.project.pages.find((page) => page.id === a.pageId) ?? a.project.pages[0]!;
  const next = b.project.pages.find((page) => page.id === b.pageId) ?? b.project.pages[0]!;
  return samePage(current, next);
}
