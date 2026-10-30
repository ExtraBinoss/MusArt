import { handleBankJob } from "./worker-host";
import type { BankJob } from "./model";
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<BankJob>) => void) | null;
  postMessage(value: unknown, transfer?: Transferable[]): void;
};
scope.onmessage = (event) => {
  void handleBankJob(event.data, (reply, transfer) => scope.postMessage(reply, transfer));
};
