export interface MediaOriginalInput {
  readonly originalId: string;
  readonly contentRevision: string;
  readonly blob: Blob;
}
export interface StoredMediaHeader {
  projectId: string;
  originalId: string;
  contentRevision: string;
  byteLength: number;
}
export interface StoredMediaOriginal extends MediaOriginalInput {
  readonly projectId: string;
}
