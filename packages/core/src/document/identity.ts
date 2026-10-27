import type { Project } from "./model";

let sequence = 0;
const reserved = new Set<string>();

/** A session-local allocator; imported IDs are reserved before further creation. */
export function createId(prefix = "node"): string {
  let id: string;
  do {
    sequence += 1;
    id = `${prefix}-${sequence.toString(36)}`;
  } while (reserved.has(id));
  reserved.add(id);
  return id;
}

/** Reserve the complete validated graph, including IDs not produced by this allocator. */
export function reserveProjectIds(project: Project): void {
  reserved.add(project.id);
  for (const asset of Object.values(project.assets)) reserved.add(asset.id);
  for (const page of project.pages) {
    reserved.add(page.id);
    for (const guide of page.guides) reserved.add(guide.id);
    for (const layer of page.layers) {
      reserved.add(layer.id);
      for (const effect of layer.effects) reserved.add(effect.id);
    }
  }
}
