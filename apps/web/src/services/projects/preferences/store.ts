import type { IDBPDatabase } from "idb";
import type { StudioDatabase } from "../database";
import { assertProjectWritable } from "../lifecycle";
import type { ProjectLayoutPreferences, ProjectPreferencesPort } from "./model";
import {
  parseProjectPreferences,
  projectPreferencesKey,
  validateProjectPreferences,
} from "./schema";

export class ProjectPreferencesError extends Error {
  readonly code: "PROJECT_PREFERENCES_LOAD_FAILED" | "PROJECT_PREFERENCES_SAVE_FAILED";
  constructor(operation: "load" | "save", cause: unknown) {
    super(
      `The project's panel sizes and timeline zoom could not be ${operation === "load" ? "restored" : "saved"}.`,
      { cause },
    );
    this.name = "ProjectPreferencesError";
    this.code =
      operation === "load" ? "PROJECT_PREFERENCES_LOAD_FAILED" : "PROJECT_PREFERENCES_SAVE_FAILED";
  }
}

/** One sub-kilobyte record; read/merge/write shares the durable deletion transaction guard. */
export class ProjectPreferencesStore implements ProjectPreferencesPort {
  constructor(private readonly database: () => Promise<IDBPDatabase<StudioDatabase>>) {}

  async read(projectId: string): Promise<ProjectLayoutPreferences> {
    try {
      const transaction = (await this.database()).transaction("preferences");
      const done = transaction.done;
      try {
        await assertProjectWritable(transaction.store, projectId);
        const value = parseProjectPreferences(
          await transaction.store.get(projectPreferencesKey(projectId)),
        );
        await done;
        return value;
      } catch (error) {
        await done.catch(() => undefined);
        throw error;
      }
    } catch (cause) {
      throw new ProjectPreferencesError("load", cause);
    }
  }

  async update(projectId: string, patch: ProjectLayoutPreferences): Promise<void> {
    try {
      const captured = validateProjectPreferences(patch);
      const transaction = (await this.database()).transaction("preferences", "readwrite");
      const done = transaction.done;
      try {
        await assertProjectWritable(transaction.store, projectId);
        const key = projectPreferencesKey(projectId);
        const current = parseProjectPreferences(await transaction.store.get(key));
        await transaction.store.put(
          JSON.stringify({ version: 1, values: { ...current, ...captured } }),
          key,
        );
        await done;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          /* A native request may already have aborted it. */
        }
        await done.catch(() => undefined);
        throw error;
      }
    } catch (cause) {
      throw new ProjectPreferencesError("save", cause);
    }
  }
}
