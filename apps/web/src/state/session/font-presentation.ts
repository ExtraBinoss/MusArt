import {
  createLayerGeometryIndex,
  type Composition,
  type EnginePort,
  type Project,
} from "@musart/core";
import type { CanonicalOrigin } from "./canonical-presentation";

export interface FontRenderInput {
  readonly fontId?: string;
  readonly layerId: string;
  readonly family: string;
  readonly weight: number;
}
export interface FontRenderTicket extends FontRenderInput, CanonicalOrigin {
  readonly sequence: number;
  readonly pageId: string;
}
export interface FontRenderState {
  readonly available: boolean;
  readonly ticket: FontRenderTicket | null;
  readonly status: "idle" | "pending" | "ready" | "error" | "unavailable";
  readonly message?: string;
}
export interface FontPresentationPublisher {
  capture(page: Composition, origin: CanonicalOrigin): FontRenderTicket | undefined;
  present(ticket: FontRenderTicket): void;
  fail(ticket: FontRenderTicket, error: unknown): void;
  unavailable(): void;
  release(): void;
}
/** Engine-scoped presentation metadata. Only a matching renderer draw can acknowledge a font. */
export class FontPresentation {
  private readonly listeners = new Set<() => void>();
  private state: FontRenderState = Object.freeze({
    available: false,
    ticket: null,
    status: "idle",
  });
  private sequence = 0;
  private publishers = 0;
  private project: Project | null = null;
  private targetExists = false;
  private stopEngine: (() => void) | undefined;
  constructor(private readonly engine: EnginePort) {}
  read = (): FontRenderState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(status: FontRenderState["status"], ticket = this.state.ticket, message?: string) {
    const available = this.publishers > 0;
    if (
      status === this.state.status &&
      ticket === this.state.ticket &&
      available === this.state.available &&
      message === this.state.message
    )
      return;
    this.state = Object.freeze({ available, ticket, status, ...(message ? { message } : {}) });
    for (const listener of this.listeners) listener();
  }
  private current(ticket: FontRenderTicket): boolean {
    const snapshot = this.engine.getSnapshot();
    return (
      this.targetExists &&
      this.state.ticket === ticket &&
      snapshot.project === this.project &&
      snapshot.project.id === ticket.projectId &&
      snapshot.pageId === ticket.pageId &&
      snapshot.revision === ticket.revision
    );
  }
  request(input: FontRenderInput): FontRenderTicket {
    this.stopEngine?.();
    const snapshot = this.engine.getSnapshot();
    const ticket = Object.freeze({
      ...input,
      sequence: ++this.sequence,
      projectId: snapshot.project.id,
      pageId: snapshot.pageId,
      revision: snapshot.revision,
    });
    this.project = snapshot.project;
    this.targetExists = Boolean(
      snapshot.project.pages
        .find((page) => page.id === snapshot.pageId)
        ?.layers.some((layer) => layer.id === input.layerId && layer.kind === "text"),
    );
    this.stopEngine = this.targetExists
      ? this.engine.subscribe(() => {
          if (!this.current(ticket)) this.cancel(ticket);
        })
      : undefined;
    this.publish(this.publishers && this.targetExists ? "pending" : "unavailable", ticket);
    return ticket;
  }
  cancel(ticket: FontRenderTicket): void {
    if (this.state.ticket !== ticket) return;
    this.stopEngine?.();
    this.stopEngine = undefined;
    this.project = null;
    this.targetExists = false;
    this.publish("idle", null);
  }
  acquire(): FontPresentationPublisher {
    let released = false,
      available = true;
    const owned = new WeakSet<FontRenderTicket>();
    this.publishers++;
    this.publish(
      this.targetExists && this.state.ticket && this.state.status === "unavailable"
        ? "pending"
        : this.state.status,
    );
    const unavailable = () => {
      if (released || !available) return;
      available = false;
      this.publishers--;
      this.publish(this.state.ticket && !this.publishers ? "unavailable" : this.state.status);
    };
    return {
      capture: (page, origin) => {
        const ticket = this.state.ticket;
        if (
          released ||
          !available ||
          !ticket ||
          this.state.status === "ready" ||
          this.state.status === "error" ||
          !this.current(ticket) ||
          ticket.projectId !== origin.projectId ||
          ticket.revision !== origin.revision ||
          page.id !== ticket.pageId
        )
          return;
        const layer = page.layers.find((item) => item.id === ticket.layerId);
        if (
          !layer ||
          layer.kind !== "text" ||
          layer.fontFamily !== ticket.family ||
          layer.fontWeight !== ticket.weight
        )
          return;
        if (!createLayerGeometryIndex(page).isVisible(layer.id) || layer.opacity <= 0) {
          owned.delete(ticket);
          this.publish("unavailable");
          return;
        }
        owned.add(ticket);
        return ticket;
      },
      present: (ticket) => {
        if (
          !released &&
          available &&
          this.state.status !== "error" &&
          owned.has(ticket) &&
          this.current(ticket)
        )
          this.publish("ready");
      },
      fail: (ticket, error) => {
        if (!released && available && owned.has(ticket) && this.current(ticket)) {
          owned.delete(ticket);
          this.publish(
            "error",
            ticket,
            (error instanceof Error ? error.message : String(error)).slice(0, 512),
          );
        }
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
const presentations = new WeakMap<EnginePort, FontPresentation>();
export function getFontPresentation(engine: EnginePort): FontPresentation {
  let port = presentations.get(engine);
  if (!port) {
    port = new FontPresentation(engine);
    presentations.set(engine, port);
  }
  return port;
}
