import type { Composition, EnginePort } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../projects/ProjectDialog";
export interface ExportPopoverProps {
  engine?: EnginePort;
  initialCompositionId?: string;
  onPendingChange?: (pending: boolean) => void;
  page: Composition;
  pageCount: number;
  selection?: readonly string[];
  revision?: number;
  services: EditorServices;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTask: TaskRunner;
}
