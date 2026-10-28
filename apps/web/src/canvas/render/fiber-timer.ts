import { Timer, type Clock } from "three";

/** R3F v9's Clock-shaped timing port, backed by Three.Timer rather than deprecated Clock. */
export class FiberTimerClock implements Clock {
  autoStart: boolean;
  startTime = 0;
  oldTime = 0;
  elapsedTime = 0;
  running = false;
  private readonly timer = new Timer();
  private users = 0;
  private document: Document | null = null;
  private closed = false;

  constructor(autoStart = true) {
    this.autoStart = autoStart;
  }
  start(): void {
    if (this.closed) throw new Error("Fiber timer is disposed.");
    this.startTime = this.oldTime = performance.now();
    this.elapsedTime = 0;
    this.timer.reset();
    this.running = true;
  }
  stop(): void {
    this.getElapsedTime();
    this.running = false;
    this.autoStart = false;
  }
  getDelta(): number {
    if (this.autoStart && !this.running) {
      this.start();
      return 0;
    }
    if (!this.running) return 0;
    this.timer.update();
    const delta = this.timer.getDelta();
    this.oldTime = performance.now();
    this.elapsedTime += delta;
    return delta;
  }
  getElapsedTime(): number {
    this.getDelta();
    return this.elapsedTime;
  }

  /** Only a committed scene owns visibility listeners; abandoned roots allocate none. */
  retain(document: Document): () => void {
    if (this.closed) throw new Error("Fiber timer is disposed.");
    if (this.document && this.document !== document)
      throw new Error("Fiber timer belongs to another document.");
    if (!this.document) {
      this.timer.connect(document);
      this.document = document;
    }
    this.users++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.users--;
      // React StrictMode immediately retains the same clock again before this microtask.
      queueMicrotask(() => {
        if (this.users === 0) this.dispose();
      });
    };
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.running = this.autoStart = false;
    this.timer.dispose();
    this.document = null;
  }
}
