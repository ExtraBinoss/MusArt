import { createPersistenceHost } from "./host";
import type { PersistenceResponse } from "./model";
const scope = globalThis as unknown as {
  postMessage(message: PersistenceResponse): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
};
const host = createPersistenceHost((message) => scope.postMessage(message));
scope.onmessage = (event) => host.receive(event.data);
