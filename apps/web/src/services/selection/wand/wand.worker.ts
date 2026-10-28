import { createWandHost } from "./worker-host";
import type { WandRequest, WandResponse } from "./model";
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WandRequest>) => void) | null;
  postMessage(message: WandResponse, transfer: Transferable[]): void;
};
const process = createWandHost();
scope.onmessage = ({ data }) => {
  const result = process(data);
  scope.postMessage(result, "mask" in result ? [result.mask.data.buffer as ArrayBuffer] : []);
};
