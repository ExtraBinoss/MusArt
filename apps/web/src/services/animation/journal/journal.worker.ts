import { createJournalHost } from "./host";
import type { JournalResponse } from "./model";
const scope = globalThis as unknown as {
  postMessage(message: JournalResponse): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
};
const host = createJournalHost((response) => scope.postMessage(response));
scope.onmessage = (event) => host.receive(event.data);
