import { assetOriginalIdentity, type VideoAsset } from "@musart/core";
import { videoProxyProfile, videoProxyProfileKey } from "./profile";
import type { VideoProxy, VideoProxyActivity, VideoProxyReply } from "./model";
interface Wanted {
  asset: VideoAsset;
  original: Blob;
}
type WorkerPort = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror">;
/** One idle-only native converter; at most eight identities / 64 MiB of session-local proxies. */
export class VideoProxyCache {
  private readonly wanted = new Map<string, Wanted>();
  private readonly ready = new Map<string, VideoProxy>();
  private readonly attempted = new Set<string>();
  private readonly failures = new Map<string, string>();
  private profile = videoProxyProfile();
  private profileInput: VideoProxyActivity["profile"];
  private bytes = 0;
  private sequence = 0;
  private active: { identity: string; id: number; pauseSent: boolean; paused: boolean } | null =
    null;
  private worker: WorkerPort | null = null;
  private activity: VideoProxyActivity | undefined;
  private stop: (() => void) | null = null;
  private enabled = false;
  private closed = false;
  constructor(
    private readonly createWorker: () => WorkerPort = () =>
      new Worker(new URL("./proxy.worker.ts", import.meta.url), { type: "module" }),
  ) {}
  configure(enabled: boolean, activity?: VideoProxyActivity) {
    const next =
      this.profileInput === activity?.profile ? this.profile : videoProxyProfile(activity?.profile);
    this.profileInput = activity?.profile;
    if (
      next !== this.profile &&
      videoProxyProfileKey(next) !== videoProxyProfileKey(this.profile)
    ) {
      this.retire();
      this.ready.clear();
      this.wanted.clear();
      this.bytes = 0;
      this.attempted.clear();
      this.failures.clear();
      this.profile = next;
    }
    this.enabled = enabled;
    if (this.activity !== activity) {
      this.stop?.();
      this.activity = activity;
      this.stop = activity?.subscribe(() => this.pump()) ?? null;
    }
    this.pump();
  }
  private allowed() {
    return this.enabled && (this.activity?.read() ?? false);
  }
  retain(identities: ReadonlySet<string>) {
    for (const key of this.wanted.keys())
      if (!identities.has(key)) {
        this.wanted.delete(key);
        this.attempted.delete(key);
        this.failures.delete(key);
        const proxy = this.ready.get(key);
        if (proxy) {
          this.bytes -= proxy.original.size;
          this.ready.delete(key);
        }
      }
    if (this.active && !identities.has(this.active.identity)) this.retire();
  }
  read(asset: VideoAsset, original: Blob): VideoProxy | undefined {
    const identity = assetOriginalIdentity(asset);
    const cached = this.ready.get(identity);
    if (cached) {
      this.ready.delete(identity);
      this.ready.set(identity, cached);
      return cached;
    }
    if (
      this.enabled &&
      Math.max(asset.width, asset.height) > this.profile.maxEdge &&
      !this.wanted.has(identity) &&
      this.wanted.size < this.profile.maxEntries
    )
      this.wanted.set(identity, { asset, original });
    this.pump();
    return undefined;
  }
  private retire() {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.active = null;
  }
  private pump() {
    if (this.closed) return;
    if (!this.allowed()) {
      if (this.active && !this.active.pauseSent) {
        this.active.pauseSent = true;
        this.worker?.postMessage({ type: "pause", id: this.active.id });
      }
      return;
    }
    if (this.active) {
      if (this.active.pauseSent) {
        this.active.pauseSent = false;
        this.worker?.postMessage({ type: "resume", id: this.active.id });
      }
      return;
    }
    const candidate = [...this.wanted].find(
      ([key]) => !this.ready.has(key) && !this.attempted.has(key),
    );
    if (!candidate) return;
    const [identity, value] = candidate;
    this.attempted.add(identity);
    try {
      const worker = this.worker ?? this.createWorker(),
        id = ++this.sequence;
      this.worker = worker;
      this.active = { identity, id, pauseSent: false, paused: false };
      worker.onmessage = ({ data }: MessageEvent<VideoProxyReply>) => {
        if (this.worker !== worker || this.active?.id !== data.id) return;
        if ("state" in data) {
          this.active.paused = data.state === "paused";
          this.pump();
          return;
        }
        if ("error" in data) this.failures.set(identity, data.error);
        else if (
          this.wanted.get(identity) === value &&
          data.proxy.original.size <= this.profile.maxBytes
        ) {
          this.ready.set(identity, data.proxy);
          this.bytes += data.proxy.original.size;
          while (
            this.bytes > this.profile.cacheBytes ||
            this.ready.size > this.profile.maxEntries
          ) {
            const key = this.ready.keys().next().value!;
            this.bytes -= this.ready.get(key)!.original.size;
            this.ready.delete(key);
          }
          this.activity?.ready?.();
        } else this.failures.set(identity, "Video proxy exceeded its preview budget.");
        this.active = null;
        this.pump();
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        if (this.worker !== worker) return;
        this.failures.set(identity, event.message || "Video preview conversion failed.");
        this.retire();
        this.pump();
      };
      worker.postMessage({
        type: "prepare",
        id,
        asset: value.asset,
        original: value.original,
        profile: this.profile,
      });
    } catch (error) {
      this.failures.set(identity, error instanceof Error ? error.message : String(error));
      this.retire();
      this.pump();
    }
  }
  stats() {
    return {
      ready: this.ready.size,
      bytes: this.bytes,
      queued: [...this.wanted.keys()].filter((key) => !this.attempted.has(key)).length,
      preparing: !!this.active && !this.active.paused,
      paused: !!this.active?.paused,
      failures: [...this.failures.values()],
    };
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.stop?.();
    this.stop = null;
    this.retire();
    this.wanted.clear();
    this.ready.clear();
    this.attempted.clear();
    this.failures.clear();
    this.bytes = 0;
  }
}
