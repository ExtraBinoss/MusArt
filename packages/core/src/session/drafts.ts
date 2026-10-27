import type { Command, Project } from "../document/model";
import { cloneValue } from "../document/immutable";
import { createLayerPatchDraft } from "../layers/draft";
type DraftFactory = (project: Project, pageId: string) => Project;
/** Opt in only handlers whose mutation contract is safe on a shallow layer draft. */
const factories: Partial<Record<Command["type"], DraftFactory>> = Object.freeze({
  updateLayers: createLayerPatchDraft,
  updateLayerPatches: createLayerPatchDraft,
});
export function createCommandDraft(
  project: Project,
  pageId: string,
  commands: readonly Command[],
): Project {
  const command = commands.length === 1 ? commands[0] : undefined;
  const factory =
    command && Object.hasOwn(factories, command.type) ? factories[command.type] : undefined;
  return factory && Object.isFrozen(project) ? factory(project, pageId) : cloneValue(project);
}
