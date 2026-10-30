import { isPublishedComposition, type Composition } from "@musart/core";

/** Ruler visibility belongs to the DOM overlay; every other input must retain its identity. */
export function sameCompositionInput(before: Composition | undefined, after: Composition): boolean {
  if (before === after) return true;
  if (!before || !isPublishedComposition(before) || !isPublishedComposition(after)) return false;
  const fields = Object.keys(before).filter((field) => field !== "rulers") as (keyof Composition)[];
  return (
    fields.length === Object.keys(after).filter((field) => field !== "rulers").length &&
    fields.every((field) => Object.hasOwn(after, field) && Object.is(before[field], after[field]))
  );
}
