import * as layers from "../layers/commands";
import * as pages from "../pages/commands";
import * as guides from "../guides/commands";
import * as masks from "../masks/commands";
import * as layout from "../layout/commands";
import { renameProject } from "../document/commands";
import { addAssets } from "../assets/commands";
import { setReplay } from "../animation/commands";
import type { CommandHandlers } from "./context";
import { updateLayerPatches } from "../layers/patches";
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
});
