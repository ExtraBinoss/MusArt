import { useSyncExternalStore } from "react";
import type { EnginePort } from "@musart/core";
import { attachmentSelection } from "./attachments";
export function useAttachmentSelection(engine: EnginePort) {
  const port = attachmentSelection(engine);
  return useSyncExternalStore(port.subscribe, port.read, port.read);
}
