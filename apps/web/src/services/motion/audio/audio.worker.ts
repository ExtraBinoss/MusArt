import { handleAudioWorkerJob, type AudioWorkerJob } from "./worker-host";
type AudioWorkerScope = {
  onmessage: ((event: MessageEvent<AudioWorkerJob>) => void) | null;
  postMessage(value: unknown, transfer?: Transferable[]): void;
};
const scope = globalThis as unknown as AudioWorkerScope;
scope.onmessage = (event) => {
  void handleAudioWorkerJob(event.data).then((result) =>
    scope.postMessage(result, "peaks" in result && result.peaks ? [result.peaks.buffer] : []),
  );
};
