import type { Composition } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../projects/ProjectDialog";
export interface ExportPopoverProps {
  page: Composition;
  pageCount: number;
  selection?: readonly string[];
  revision?: number;
  services: EditorServices;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTask: TaskRunner;
}
