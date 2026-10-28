import type { SessionSnapshot } from "@musart/core";
import type { ExportScope } from "../../state/contracts";

export class ExportScopeError extends Error {
  constructor() {
    super("The export target has changed.");
    this.name = "ExportScopeError";
  }
}
/** Validate at execution time, even when a task adapter runs after the engine changed. */
export function assertExportScope(snapshot: SessionSnapshot, scope?: ExportScope): void {
  if (!scope) return;
  if (
    snapshot.revision !== scope.revision ||
    snapshot.project.pages.find((page) => page.id === snapshot.pageId) !== scope.page ||
    snapshot.selection.length !== scope.selection.length ||
    snapshot.selection.some((id, index) => id !== scope.selection[index])
  )
    throw new ExportScopeError();
}
