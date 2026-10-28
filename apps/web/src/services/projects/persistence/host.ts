import type { IDBPDatabase } from "idb";
import { openStudioDatabase, type StudioDatabase } from "../database";
import { FragmentAssembly } from "../../serialization/fragments/assembly";
import { persistProjectWrite } from "./transaction";
import { persistThumbnail } from "./thumbnail";
import { readThumbnailInfo, readThumbnails } from "./reads";
import type {
  ProjectWriteFrame,
  PersistenceRequest,
  PersistenceResponse,
  PersistenceResult,
} from "./model";
/** The complete record is assembled and cloned by IndexedDB here, never on the UI thread. */
export function createPersistenceHost(
  post: (message: PersistenceResponse) => void,
  open: (name: string) => Promise<IDBPDatabase<StudioDatabase>> = openStudioDatabase,
) {
  let active: { id: number; database: string; assembly: FragmentAssembly; parts: number } | null =
      null,
    busy = false,
    closed = false,
    connection: Promise<IDBPDatabase<StudioDatabase>> | undefined,
    name = "",
    work = Promise.resolve();
  function reject(id: number, error: unknown) {
    const value = error as { name?: unknown; message?: unknown; code?: unknown } | null;
    post({
      id,
      error: {
        name: typeof value?.name === "string" ? value.name : "Error",
        message: typeof value?.message === "string" ? value.message : "Project persistence failed.",
        ...(typeof value?.code === "string" ? { code: value.code } : {}),
      },
    });
  }
  async function database(databaseName: string) {
    if (name !== databaseName) {
      (await connection)?.close();
      connection = undefined;
      name = databaseName;
    }
    return (connection ??= open(databaseName).catch((error) => {
      connection = undefined;
      throw error;
    }));
  }
  function run(
    id: number,
    databaseName: string,
    task: (db: IDBPDatabase<StudioDatabase>) => Promise<PersistenceResult>,
  ) {
    busy = true;
    work = (async () => {
      try {
        const result = await task(await database(databaseName));
        if (!closed) post({ id, result });
      } catch (error) {
        if (!closed) reject(id, error);
      } finally {
        busy = false;
        active = null;
      }
    })();
  }
  return {
    receive(value: unknown) {
      const message = value as (Partial<PersistenceRequest> & { database?: unknown }) | null,
        id = message && Number.isSafeInteger(message.id) ? message.id! : 0;
      try {
        if (closed) throw Error("Project persistence host is disposed.");
        if (!message || id < 1) throw Error("Invalid project persistence request.");
        if (
          message.type === "begin" ||
          message.type === "thumbnail" ||
          message.type === "info" ||
          message.type === "thumbnails"
        ) {
          if (active || busy) throw Error("A project persistence request is already active.");
          if (
            typeof message.database !== "string" ||
            !message.database ||
            message.database.length > 256
          )
            throw Error("Invalid project database.");
          if (message.type === "thumbnail") {
            const record = message.record!;
            run(id, message.database, async (db) => ({
              kind: "thumbnail",
              value: await persistThumbnail(db, record),
            }));
            return;
          }
          if (message.type === "info" || message.type === "thumbnails") {
            if (typeof message.projectId !== "string" || !message.projectId)
              throw Error("Invalid thumbnail project.");
            const projectId = message.projectId;
            if (message.type === "info")
              run(id, message.database, async (db) => ({
                kind: "info",
                value: await readThumbnailInfo(db, projectId),
              }));
            else if (message.type === "thumbnails") {
              const ids = message.pageIds;
              run(id, message.database, async (db) => ({
                kind: "thumbnails",
                value: await readThumbnails(db, projectId, ids),
              }));
            }
            return;
          }
          active = { id, database: message.database, assembly: new FragmentAssembly(), parts: 0 };
          return;
        }
        if (!active || active.id !== id || busy)
          throw Error("Unknown project persistence request.");
        if (message.type === "part") {
          active.assembly.add(message.part!);
          active.parts++;
          return;
        }
        if (
          message.type !== "finish" ||
          !Number.isSafeInteger(message.parts) ||
          message.parts !== active.parts
        )
          throw Error("Project persistence fragment count does not match.");
        const frame = active.assembly.finish() as ProjectWriteFrame;
        const job = active;
        run(id, job.database, async (db) => ({
          kind: "save",
          value: await persistProjectWrite(db, frame),
        }));
      } catch (error) {
        if (active?.id === id && !busy) active = null;
        reject(id, error);
      }
    },
    async dispose() {
      closed = true;
      active = null;
      await work;
      (await connection?.catch(() => undefined))?.close();
      connection = undefined;
    },
  };
}
