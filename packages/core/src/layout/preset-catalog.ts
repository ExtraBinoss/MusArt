import { freezeValue } from "../document/immutable";
import type { Insets } from "./model";
export type PresetBrand = "instagram" | "tiktok" | "youtube" | "linkedin" | "print" | "generic";
export interface CompositionPreset {
  readonly id: string;
  readonly name: string;
  readonly nameKey: string;
  readonly brandId: PresetBrand;
  readonly category: "social" | "video" | "print" | "screen";
  readonly width: number;
  readonly height: number;
  readonly safeArea?: Readonly<Insets>;
}
export const SOCIAL_PRESETS: readonly CompositionPreset[] = freezeValue([
  {
    id: "instagram-post",
    name: "Instagram post",
    nameKey: "preset.instagramPost",
    brandId: "instagram",
    category: "social",
    width: 1080,
    height: 1080,
  },
  {
    id: "instagram-portrait",
    name: "Instagram portrait",
    nameKey: "preset.instagramPortrait",
    brandId: "instagram",
    category: "social",
    width: 1080,
    height: 1350,
  },
  {
    id: "instagram-story",
    name: "Instagram story",
    nameKey: "preset.instagramStory",
    brandId: "instagram",
    category: "social",
    width: 1080,
    height: 1920,
  },
  {
    id: "instagram-reels",
    name: "Instagram reels",
    nameKey: "preset.instagramReels",
    brandId: "instagram",
    category: "video",
    width: 1080,
    height: 1920,
  },
  {
    id: "tiktok-video",
    name: "TikTok video",
    nameKey: "preset.tiktokVideo",
    brandId: "tiktok",
    category: "video",
    width: 1080,
    height: 1920,
  },
  {
    id: "youtube-thumbnail",
    name: "YouTube thumbnail",
    nameKey: "preset.youtubeThumbnail",
    brandId: "youtube",
    category: "video",
    width: 1280,
    height: 720,
  },
  {
    id: "youtube-banner",
    name: "YouTube banner",
    nameKey: "preset.youtubeBanner",
    brandId: "youtube",
    category: "social",
    width: 2560,
    height: 1440,
    safeArea: { top: 508.5, right: 507, bottom: 508.5, left: 507 },
  },
  {
    id: "linkedin-post",
    name: "LinkedIn post",
    nameKey: "preset.linkedinPost",
    brandId: "linkedin",
    category: "social",
    width: 1200,
    height: 627,
  },
]);
