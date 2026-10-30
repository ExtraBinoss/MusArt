import { isPublishedComposition, type Composition, type SessionSnapshot } from "@musart/core";
function sameExcept(a: object, b: object, excluded: readonly string[]) {
  const keys = Object.keys(a).filter((key) => !excluded.includes(key)),
    other = Object.keys(b).filter((key) => !excluded.includes(key));
  return (
    keys.length === other.length &&
    keys.every(
      (key) => Object.hasOwn(b, key) && Object.is(Reflect.get(a, key), Reflect.get(b, key)),
    )
  );
}
/** Only an immutable ruler edit on the active composition may preserve the running Motion clock. */
export function rulerChange(before: SessionSnapshot, after: SessionSnapshot): Composition | null {
  if (
    after.revision !== before.revision + 1 ||
    before.pageId !== after.pageId ||
    !sameExcept(before.project, after.project, ["pages", "updatedAt"]) ||
    before.project.pages.length !== after.project.pages.length
  )
    return null;
  const page = after.project.pages.find((page) => page.id === after.pageId),
    previous = before.project.pages.find((page) => page.id === before.pageId);
  if (
    !page ||
    !previous ||
    !isPublishedComposition(previous) ||
    !isPublishedComposition(page) ||
    previous.rulers === page.rulers ||
    !sameExcept(previous, page, ["rulers"])
  )
    return null;
  return before.project.pages.every((old, index) =>
    old.id === page.id ? after.project.pages[index] === page : after.project.pages[index] === old,
  )
    ? page
    : null;
}
