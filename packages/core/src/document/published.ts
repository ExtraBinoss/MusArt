import type { Composition, Project } from "./model";

const published = new WeakSet<Project>();
const compositions = new WeakSet<Composition>();
/** Internal: called only after the engine has validated and deeply frozen a published state. */
export function markPublishedProject(project: Project): void {
  published.add(project);
  for (const page of project.pages) compositions.add(page);
}
/** An identity certificate, not a test for arbitrary external Object.freeze results. */
export function isPublishedProject(project: Project): boolean {
  return published.has(project);
}
/** Certified pages can be streamed without copying their entire immutable layer graph first. */
export function isPublishedComposition(page: Composition): boolean {
  return compositions.has(page);
}
