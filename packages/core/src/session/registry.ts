import * as animations from "../motion/animations/commands";
import * as layers from "../layers/commands";
import * as pages from "../pages/commands";
import * as guides from "../guides/commands";
import * as masks from "../masks/commands";
import * as layout from "../layout/commands";
import { renameProject } from "../document/commands";
import { addAssets } from "../assets/commands";
import { setReplay } from "../animation/commands";
import type { CommandHandlers } from "./context";
import type { Command } from "../document/model";
import { updateLayerPatches } from "../layers/patches";
import * as motion from "../motion/commands";
import * as occurrences from "../motion/occurrence-commands";
import * as audio from "../motion/audio/commands";
import { applyMotionTransition } from "../motion/transitions/commands";
import {
  moveMotionTrack,
  moveMotionKeyframes,
  deleteMotionKeyframes,
} from "../motion/track-commands";
/** Domain handlers are exhaustively checked against the portable command union. */
export const COMMAND_HANDLERS: CommandHandlers = Object.freeze({
  addLayers: layers.addLayers,
  updateLayers: layers.updateLayers,
  updateLayerPatches,
  deleteLayers: layers.deleteLayers,
  duplicateLayers: layers.duplicateLayers,
  reorderLayer: layers.reorderLayer,
  groupLayers: layers.createGroup,
  ungroupLayers: layers.removeGroup,
  addPage: pages.addPage,
  updatePage: pages.updatePage,
  deletePage: pages.deletePage,
  renameProject,
  addAssets,
  addGuide: guides.addGuide,
  updateGuide: guides.updateGuide,
  deleteGuide: guides.deleteGuide,
  alignLayers: layout.alignLayers,
  distributeLayers: layout.distributeLayers,
  attachLayerMask: masks.attachLayerMask,
  createMaskFromSelection: masks.createMaskFromSelection,
  updateMask: masks.updateMask,
  removeLayerMask: masks.removeLayerMask,
  setReplay,
  setCompositionMode: motion.setCompositionMode,
  setMotionDuration: motion.setMotionDuration,
  addMotionOccurrence: occurrences.addMotionOccurrence,
  duplicateMotionOccurrence: occurrences.duplicateMotionOccurrence,
  deleteMotionOccurrence: occurrences.deleteMotionOccurrence,
  setMotionTrackRange: motion.setMotionTrackRange,
  setMotionMedia: motion.setMotionMedia,
  upsertMotionKeyframe: motion.upsertMotionKeyframe,
  moveMotionKeyframe: motion.moveMotionKeyframe,
  deleteMotionKeyframe: motion.deleteMotionKeyframe,
  addMotionAudioTrack: audio.addMotionAudioTrack,
  moveMotionAudioTrack: audio.moveMotionAudioTrack,
  setMotionAudioTrackRange: audio.setMotionAudioTrackRange,
  updateMotionAudioTrack: audio.updateMotionAudioTrack,
  deleteMotionAudioTrack: audio.deleteMotionAudioTrack,
  addMotionAnimation: animations.addMotionAnimation,
  updateMotionAnimation: animations.updateMotionAnimation,
  deleteMotionAnimation: animations.deleteMotionAnimation,
  applyMotionTransition,
  moveMotionTrack,
  moveMotionKeyframes,
  deleteMotionKeyframes,
});
/** Transport and journal boundaries validate names against the engine's authoritative registry. */
export function isCommandType(value: unknown): value is Command["type"] {
  return typeof value === "string" && Object.hasOwn(COMMAND_HANDLERS, value);
}
