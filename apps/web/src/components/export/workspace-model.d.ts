import type { ReactNode } from "react";
import type { Composition, EnginePort, SessionSnapshot } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
export interface ExportPaneProps {
  engine: EnginePort;
  origin: SessionSnapshot;
  page: Composition;
  selection: readonly string[];
  controls: ReactNode;
  services: EditorServices;
  onClose: () => void;
}
