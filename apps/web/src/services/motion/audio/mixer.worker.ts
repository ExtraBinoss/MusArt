import { createAudioMixerWorkerHost } from "./mixer-worker-host";
import type { AudioMixerJob } from "./mixer-worker-model";
type Scope = {
  postMessage(reply: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<AudioMixerJob>) => void) | null;
};
const scope = globalThis as unknown as Scope;
const host = createAudioMixerWorkerHost((reply, transfer) =>
  scope.postMessage(reply, transfer ?? []),
);
scope.onmessage = (event) => {
  void host.receive(event.data);
};
