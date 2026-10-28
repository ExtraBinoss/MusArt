import { vi } from "vitest";
import { createJournalHost } from "../../../../src/services/animation/journal/host";
import type {
  JournalRequest,
  JournalResponse,
  JournalWorkerPort,
} from "../../../../src/services/animation/journal/model";

/** Native structuredClone and separate tasks preserve the actual worker's ownership/order boundary. */
export class TestJournalWorker implements JournalWorkerPort {
  onmessage: JournalWorkerPort["onmessage"] = null;
  onerror: JournalWorkerPort["onerror"] = null;
  onmessageerror: JournalWorkerPort["onmessageerror"] = null;
  readonly messages: JournalRequest[] = [];
  private closed = false;
  readonly host = createJournalHost((reply) => {
    void Promise.resolve(this.reply?.(reply, this) ?? true).then((deliver) => {
      if (!this.closed && deliver)
        setTimeout(() => this.onmessage?.({ data: structuredClone(reply) } as MessageEvent), 0);
    });
  });
  constructor(
    private readonly reply?: (
      reply: JournalResponse,
      port: TestJournalWorker,
    ) => boolean | Promise<boolean>,
  ) {}
  postMessage(message: JournalRequest) {
    const cloned = structuredClone(message);
    this.messages.push(cloned);
    setTimeout(() => {
      if (!this.closed) this.host.receive(cloned);
    }, 0);
  }
  terminate = vi.fn(() => {
    this.closed = true;
    void this.host.dispose();
  });
  crash(message = "worker restarted") {
    this.onerror?.({ message, preventDefault() {} } as ErrorEvent);
  }
}
