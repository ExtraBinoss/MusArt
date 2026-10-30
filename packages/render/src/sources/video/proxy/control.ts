import type { Conversion } from "mediabunny";

/** Mediabunny's pauseSignal keeps the conversion and encoded prefix alive across interactions. */
export class VideoProxyConversionControl {
  private paused = false;
  private signal: AbortController | null = null;
  private wake: (() => void) | null = null;
  constructor(private readonly publish: (state: "paused" | "running") => void) {}
  setPaused(value: boolean) {
    this.paused = value;
    if (value) this.signal?.abort();
    else {
      this.wake?.();
      this.wake = null;
    }
  }
  async execute(conversion: Conversion): Promise<void> {
    while (conversion.state !== "done" && conversion.state !== "canceled") {
      if (this.paused) {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
          this.publish("paused");
        });
      }
      if (this.paused) continue;
      this.signal = new AbortController();
      this.publish("running");
      try {
        await conversion.execute({ pauseSignal: this.signal.signal });
      } finally {
        this.signal = null;
      }
    }
  }
}
