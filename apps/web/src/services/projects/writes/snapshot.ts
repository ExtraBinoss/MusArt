import { isPublishedProject, type Project } from "@musart/core";
const owned = new WeakSet<Project>();
/** A private immutable snapshot prevents a caller changing paint while its hashes are pending. */
export function snapshotProject(project: Project): Project {
  if (isPublishedProject(project) || owned.has(project)) return project;
  const snapshot = structuredClone(project);
  const seen = new WeakSet<object>();
  function freeze(value: unknown): void {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  freeze(snapshot);
  owned.add(snapshot);
  return snapshot;
}
