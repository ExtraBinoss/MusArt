import { prepareVideoProxy } from "./prepare";
import { VideoProxyConversionControl } from "./control";
import type { VideoProxyInput, VideoProxyReply } from "./model";
type Scope = {
  onmessage: ((event: MessageEvent<VideoProxyInput>) => void) | null;
  postMessage(reply: VideoProxyReply): void;
};
const scope = globalThis as unknown as Scope;
let active: { id: number; control: VideoProxyConversionControl } | null = null;
scope.onmessage = ({ data }) => {
  if (data.type !== "prepare") {
    if (active?.id === data.id) active.control.setPaused(data.type === "pause");
    return;
  }
  if (active) {
    scope.postMessage({ id: data.id, error: "Video proxy converter is busy." });
    return;
  }
  const control = new VideoProxyConversionControl((state) =>
    scope.postMessage({ id: data.id, state }),
  );
  active = { id: data.id, control };
  void prepareVideoProxy(data.asset, data.original, data.profile, control)
    .then(
      (proxy) => scope.postMessage({ id: data.id, proxy }),
      (error) =>
        scope.postMessage({
          id: data.id,
          error: error instanceof Error ? error.message : String(error),
        }),
    )
    .finally(() => {
      active = null;
    });
};
