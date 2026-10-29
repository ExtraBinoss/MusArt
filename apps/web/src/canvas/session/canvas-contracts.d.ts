import type { EnginePort } from "@musart/core";
import type { FontResolver } from "@musart/render";
import type { EditorServices } from "../../state/contracts";
import type { PreviewSource } from "../../state/session/preview-source";
import type { Tool } from "../interaction/gestures";
import type { ArtboardServices } from "../artboards/use-previews";
export interface EditorCanvasProps {
  fontResolver?: FontResolver;
  services?: ArtboardServices & Pick<EditorServices, "pixelSelection" | "mediaResolverFor">;
  engine: EnginePort;
  tool: Tool;
  previewSource?: PreviewSource;
  onError?: (message: string, details?: string) => void;
  onDropFiles?: (files: File[]) => void;
  onImagePoint?: (layerId: string, x: number, y: number) => void;
}
