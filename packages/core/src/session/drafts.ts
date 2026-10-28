import type { Command, Project } from "../document/model";
import { cloneValue } from "../document/immutable";
import { createLayerPatchDraft } from "../layers/draft";
type DraftFactories = {
  [K in Command["type"]]?: (
    project: Project,
    pageId: string,
    command: Extract<Command, { type: K }>,
  ) => Project;
};
/** Opt in only handlers whose mutation contract is safe on a shallow layer draft. */
const factories: DraftFactories = Object.freeze({
  updateLayers: (project, pageId, command) =>
    createLayerPatchDraft(
      project,
      pageId,
      command.patch.mask === null ? undefined : new Set(command.ids),
    ),
  updateLayerPatches: (project, pageId, command) =>
    createLayerPatchDraft(
      project,
      pageId,
      command.patches.some(({ patch }) => patch.mask === null)
        ? undefined
        : new Set(command.patches.map(({ id }) => id)),
    ),
});
export function createCommandDraft(
  project: Project,
  pageId: string,
  commands: readonly Command[],
): Project {
  const command = commands.length === 1 ? commands[0] : undefined;
  // Dispatch retains the command/factory correlation checked by DraftFactories.
  const factory = (
    command && Object.hasOwn(factories, command.type) ? factories[command.type] : undefined
  ) as ((project: Project, pageId: string, command: Command) => Project) | undefined;
  return factory && command && Object.isFrozen(project)
    ? factory(project, pageId, command)
    : cloneValue(project);
}
