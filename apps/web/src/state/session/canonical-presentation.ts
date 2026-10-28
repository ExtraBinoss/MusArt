import type { EnginePort } from "@musart/core";

export interface CanonicalOrigin {
  readonly projectId: string;
  readonly revision: number;
}
export interface PresentationTicket extends CanonicalOrigin {
  readonly sequence: number;
  readonly canonical: boolean;
}
export interface PresentationState {
  readonly available: boolean;
  readonly requested: PresentationTicket | null;
  readonly presented: PresentationTicket | null;
}
export interface PresentationPublisher {
  request(origin: CanonicalOrigin, canonical: boolean): PresentationTicket;
  present(ticket: PresentationTicket): void;
  unavailable(): void;
  release(): void;
}

/** One engine-scoped latest-frame signal; no React state, document bytes or GPU resources. */
export class CanonicalPresentation {
  private readonly listeners = new Set<() => void>();
  private available = 0;
  private sequence = 0;
  private state: PresentationState = Object.freeze({
    available: false,
    requested: null,
    presented: null,
  });
  read = (): PresentationState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<PresentationState>) {
    this.state = Object.freeze({ ...this.state, ...patch, available: this.available > 0 });
    for (const listener of this.listeners) listener();
  }
  ready(origin: CanonicalOrigin): boolean {
    const { available, requested, presented } = this.state;
    return Boolean(
      available &&
      requested?.canonical &&
      presented &&
      presented.sequence >= requested.sequence &&
      (presented.revision > origin.revision ||
        (presented.revision === origin.revision && presented.projectId === origin.projectId)),
    );
  }
  acquire(): PresentationPublisher {
    let released = false,
      available = true;
    const owned = new WeakSet<PresentationTicket>();
    this.available++;
    this.publish({});
    const unavailable = () => {
      if (released || !available) return;
      available = false;
      this.available--;
      this.publish({});
    };
    return {
      request: (origin, canonical) => {
        if (released) throw new Error("Presentation publisher is released.");
        const ticket = Object.freeze({
          projectId: origin.projectId,
          revision: origin.revision,
          canonical,
          sequence: ++this.sequence,
        });
        if (!available) {
          available = true;
          this.available++;
        }
        owned.add(ticket);
        this.publish({ requested: ticket });
        return ticket;
      },
      present: (ticket) => {
        if (
          released ||
          !owned.has(ticket) ||
          !ticket.canonical ||
          ticket.sequence < (this.state.presented?.sequence ?? 0)
        )
          return;
        if (!available) {
          available = true;
          this.available++;
        }
        if (this.state.presented !== ticket || !this.state.available)
          this.publish({ presented: ticket });
      },
      unavailable,
      release: () => {
        if (released) return;
        unavailable();
        released = true;
      },
    };
  }
}
const presentations = new WeakMap<EnginePort, CanonicalPresentation>();
export function getCanonicalPresentation(engine: EnginePort): CanonicalPresentation {
  let presentation = presentations.get(engine);
  if (!presentation) {
    presentation = new CanonicalPresentation();
    presentations.set(engine, presentation);
  }
  return presentation;
}
