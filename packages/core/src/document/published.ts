import type { Composition, Project } from "./model";

const published = new WeakSet<Project>();
const compositions = new WeakSet<Composition>();
const assets = new WeakSet<Project["assets"]>();
/** Internal: called only after the engine has validated and deeply frozen a published state. */
export function markPublishedProject(project: Project): void {
  published.add(project);
  assets.add(project.assets);
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
/** Certificates apply to the collection, including every validated immutable original. */
export function isPublishedAssets(collection: Project["assets"]): boolean {
  return assets.has(collection);
}
