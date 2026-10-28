import { DeletedProjectError } from "../lifecycle";
import { StaleProjectWriteError } from "../writes/revision";
import { AssetBasisMismatchError } from "./transaction";
import type { PersistenceResponse, PersistenceResult } from "./model";
const token = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256;
function thumbnailHeader(value: unknown, blob: boolean): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    token(item.projectId) &&
    token(item.pageId) &&
    token(item.revision) &&
    Number.isInteger(item.width) &&
    Number.isInteger(item.height) &&
    Number(item.width) >= 1 &&
    Number(item.width) <= 768 &&
    Number(item.height) >= 1 &&
    Number(item.height) <= 768 &&
    typeof item.updatedAt === "string" &&
    (item.stale === undefined || typeof item.stale === "boolean") &&
    (blob
      ? item.blob instanceof Blob && item.blob.size <= 1024 * 1024
      : Number.isSafeInteger(item.bytes) &&
        Number(item.bytes) >= 0 &&
        Number(item.bytes) <= 1024 * 1024)
  );
}
export class PersistenceUncertainError extends Error {
  readonly code = "UNCERTAIN_PROJECT_WRITE";
  constructor() {
    super(
      "The save acknowledgment was lost. Reopen the project to check its saved state before retrying.",
    );
    this.name = "PersistenceUncertainError";
  }
}
export function persistenceFailure(
  value: { name: string; message: string; code?: string },
  projectId: string,
): Error {
  if (value.code === "STALE_PROJECT_WRITE") return new StaleProjectWriteError(projectId);
  if (value.code === "PROJECT_DELETED") return new DeletedProjectError(projectId);
  if (value.code === "ASSET_BASIS_MISMATCH") return new AssetBasisMismatchError();
  const error = new Error(value.message);
  error.name = value.name;
  if (value.code) Object.defineProperty(error, "code", { value: value.code });
  return error;
}
/** Validate the same small result in both the worker and compatibility paths. */
export function persistenceResult(value: unknown): PersistenceResult {
  const result = value as Partial<PersistenceResult> | null;
  if (result?.kind === "thumbnail" && typeof result.value === "boolean")
    return result as PersistenceResult;
  if (
    (result?.kind === "info" || result?.kind === "thumbnails") &&
    Array.isArray(result.value) &&
    result.value.length <= 100 &&
    result.value.every((item) => thumbnailHeader(item, result.kind === "thumbnails"))
  )
    return result as PersistenceResult;
  if (
    result?.kind === "save" &&
    result.value &&
    token(result.value.projectId) &&
    token(result.value.assetsRevision) &&
    token(result.value.writeRevision)
  )
    return result as PersistenceResult;
  throw Error("Malformed project persistence response.");
}
export function persistenceResponse(value: unknown, id: number): PersistenceResponse {
  if (!value || typeof value !== "object" || !("id" in value) || value.id !== id)
    throw Error("Unexpected project persistence response.");
  if ("error" in value) {
    const error = value.error;
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      typeof error.name === "string" &&
      "message" in error &&
      typeof error.message === "string" &&
      (!("code" in error) || typeof error.code === "string")
    )
      return value as PersistenceResponse;
  }
  if ("result" in value) {
    persistenceResult(value.result);
    return value as PersistenceResponse;
  }
  throw Error("Malformed project persistence response.");
}
