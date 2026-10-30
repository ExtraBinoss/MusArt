import type { VideoProxyProfile } from "./profile";
import type { VideoAsset } from "@musart/core";
export interface VideoProxyActivity {
  read(): boolean;
  subscribe(listener: () => void): () => void;
  ready?(): void;
  readonly profile?: Partial<VideoProxyProfile>;
}
export interface VideoProxy {
  asset: VideoAsset;
  original: Blob;
}
export interface VideoProxyJob {
  type: "prepare";
  id: number;
  asset: VideoAsset;
  original: Blob;
  profile: Readonly<VideoProxyProfile>;
}
export type VideoProxyInput = VideoProxyJob | { type: "pause" | "resume"; id: number };
export type VideoProxyReply =
  | { id: number; state: "paused" | "running" }
  | { id: number; proxy: VideoProxy }
  | { id: number; error: string };
