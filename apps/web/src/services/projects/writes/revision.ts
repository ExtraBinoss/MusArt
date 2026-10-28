import { assertProjectWritable } from "../lifecycle";
interface RevisionReader {
  get(key: string): Promise<string | undefined>;
}
interface RevisionWriter extends RevisionReader {
  put(value: string, key: string): Promise<string>;
}
const revisionKey = (projectId: string) => JSON.stringify(["musart:project-write", projectId]);
export class StaleProjectWriteError extends Error {
  readonly code = "STALE_PROJECT_WRITE";
  constructor(readonly projectId: string) {
    super("This project changed while saving. Reload it before retrying your changes.");
    this.name = "StaleProjectWriteError";
  }
}
/** Read before asynchronous preparation; a transaction later compares this durable token. */
export async function readProjectWriteRevision(reader: RevisionReader, projectId: string) {
  await assertProjectWritable(reader, projectId);
  return (await reader.get(revisionKey(projectId))) ?? "";
}
/** Call while holding the same preferences/project write transaction as the payload mutation. */
export async function assertProjectWriteRevision(
  reader: RevisionReader,
  projectId: string,
  expected: string,
) {
  const current = await readProjectWriteRevision(reader, projectId);
  if (current !== expected) throw new StaleProjectWriteError(projectId);
}
export async function renewProjectWriteRevision(writer: RevisionWriter, projectId: string) {
  const revision = crypto.randomUUID();
  await writer.put(revision, revisionKey(projectId));
  return revision;
}
