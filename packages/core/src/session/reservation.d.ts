import type { Project } from "../document/model";

export interface PreparedEngineTransaction {
  readonly project: Project;
  /** Acquire a short publication lock after expensive platform preparation completes. */
  lock(): void;
  commit(): void;
  cancel(): void;
}
