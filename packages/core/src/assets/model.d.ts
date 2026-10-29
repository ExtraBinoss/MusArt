import type { MotionTime } from "../motion/time";

interface AssetDescription {
  id: string;
  name: string;
  mime: string;
  /** Display dimensions, after the original's rotation and pixel-aspect correction. */
  width: number;
  height: number;
}

/** Missing kind preserves the original portable image format. */
export interface ImageAsset extends AssetDescription {
  kind?: "image";
  dataUrl: string;
}

export interface VideoAsset extends AssetDescription {
  kind: "video";
  dataUrl?: never;
  originalId: string;
  contentRevision: string;
  byteLength: number;
  /** Playable video length: end timestamp minus first timestamp. */
  duration: MotionTime;
  firstTimestamp: MotionTime;
  timeResolution: number;
  orientation: {
    rotation: 0 | 90 | 180 | 270;
    flip: boolean;
    pixelAspectRatio: { numerator: number; denominator: number };
  };
}

export type Asset = ImageAsset | VideoAsset;
