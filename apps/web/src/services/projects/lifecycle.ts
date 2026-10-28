interface PreferencesReader {
  get(key: string): Promise<string | undefined>;
}
interface PreferencesWriter extends PreferencesReader {
  put(value: string, key: string): Promise<string>;
}
const deletionKey = (projectId: string) => `deleted-project:${projectId}`;

export class DeletedProjectError extends Error {
  readonly code = "PROJECT_DELETED";
  constructor(readonly projectId: string) {
    super("This project was deleted. Import the document again to create a new copy.");
    this.name = "DeletedProjectError";
  }
}

/** Durable identities are retired forever; a deliberate recreation receives a new UUID. */
export async function isProjectDeleted(preferences: PreferencesReader, projectId: string) {
  return (await preferences.get(deletionKey(projectId))) !== undefined;
}

/** Call inside the same write transaction as the manifest or journal mutation. */
export async function assertProjectWritable(preferences: PreferencesReader, projectId: string) {
  if (await isProjectDeleted(preferences, projectId)) throw new DeletedProjectError(projectId);
}

/** This marker must commit atomically with deleting every project-owned record. */
export async function retireProject(preferences: PreferencesWriter, projectId: string) {
  await preferences.put("1", deletionKey(projectId));
}
