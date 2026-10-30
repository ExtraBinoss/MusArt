/** Presentation policy, never part of portable media or authored timing. */
export interface VideoProxyProfile {
  maxEdge: number;
  bitrate: number;
  keyFrameInterval: number;
  maxBytes: number;
  cacheBytes: number;
  maxEntries: number;
}
export const DEFAULT_VIDEO_PROXY_PROFILE: Readonly<VideoProxyProfile> = Object.freeze({
  maxEdge: 960,
  bitrate: 1_200_000,
  keyFrameInterval: 1,
  maxBytes: 16 * 1024 * 1024,
  cacheBytes: 64 * 1024 * 1024,
  maxEntries: 8,
});
export function videoProxyProfile(input?: Partial<VideoProxyProfile>): Readonly<VideoProxyProfile> {
  const value = { ...DEFAULT_VIDEO_PROXY_PROFILE, ...input };
  if (
    !Number.isInteger(value.maxEdge) ||
    value.maxEdge < 64 ||
    value.maxEdge > 1920 ||
    !Number.isInteger(value.bitrate) ||
    value.bitrate < 64000 ||
    value.bitrate > 8_000_000 ||
    !Number.isFinite(value.keyFrameInterval) ||
    value.keyFrameInterval < 0.1 ||
    value.keyFrameInterval > 5 ||
    !Number.isInteger(value.maxBytes) ||
    value.maxBytes < 256 * 1024 ||
    value.maxBytes > 32 * 1024 * 1024 ||
    !Number.isInteger(value.cacheBytes) ||
    value.cacheBytes < value.maxBytes ||
    value.cacheBytes > 128 * 1024 * 1024 ||
    !Number.isInteger(value.maxEntries) ||
    value.maxEntries < 1 ||
    value.maxEntries > 8
  )
    throw new RangeError("Invalid video proxy profile.");
  return Object.freeze(value);
}
export const videoProxyProfileKey = (profile: Readonly<VideoProxyProfile>) =>
  JSON.stringify(profile);
