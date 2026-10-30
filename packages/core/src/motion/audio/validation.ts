import type { Asset } from "../../assets/model";
import { isAudioAsset } from "../../assets/identity";
import { validateMotionAudioProcessing } from "./processing";
import {
  assertBoolean,
  assertList,
  assertNumber,
  assertRecord,
  assertText,
  assertUniqueId,
} from "../../document/guards";
import { ensure } from "../../errors";
import { addMotionTime, compareMotionTime, subtractMotionTime, validateMotionTime } from "../time";

export function validateMotionAudioTracks(
  value: unknown,
  ids: Set<string>,
  assets?: Readonly<Record<string, Asset>>,
) {
  if (value === undefined) return;
  assertList(value, 10000);
  for (const track of value) {
    assertRecord(track);
    assertUniqueId(track.id, ids);
    assertText(track.name, 160);
    assertText(track.assetId);
    validateMotionTime(track.start);
    validateMotionTime(track.end);
    validateMotionTime(track.sourceIn);
    assertBoolean(track.mute);
    assertNumber(track.volume, 0, 2);
    validateMotionAudioProcessing(track.processing, subtractMotionTime(track.end, track.start));
    ensure(
      track.start.value >= 0 &&
        track.sourceIn.value >= 0 &&
        compareMotionTime(track.end, track.start) > 0,
      "INVALID_DOCUMENT",
      "Invalid audio clip interval",
    );
    const asset = assets?.[track.assetId];
    if (assets) {
      ensure(asset && isAudioAsset(asset), "INVALID_DOCUMENT", "Audio clip has no audio original");
      ensure(
        compareMotionTime(
          addMotionTime(track.sourceIn, subtractMotionTime(track.end, track.start)),
          asset.duration,
        ) <= 0,
        "INVALID_DOCUMENT",
        "Audio trim exceeds its original source range",
      );
    }
  }
}
