export interface UiPresentationPort {
  busy(): boolean;
  hold(): () => void;
  subscribe(listener: () => void): () => void;
}
/** Optional work yields during an entrance, with one timer per window and no render loop. */
class UiPresentation implements UiPresentationPort {
  private readonly leases = new Map<object, number>();
  private readonly listeners = new Set<() => void>();
  private timer: number | undefined;
  private deadline: number | undefined;
  private timerGeneration = 0;
  private active = false;
  constructor(private readonly surface: Window) {}
  busy = () => {
    const now = Date.now();
    for (const until of this.leases.values()) if (until > now) return true;
    return false;
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  hold = () => {
    if (this.surface.document.hidden) return () => {};
    const lease = {};
    this.leases.set(lease, Date.now() + 250);
    this.reconcile();
    return () => {
      if (this.leases.delete(lease)) this.reconcile();
    };
  };
  private tick = (generation: number) => {
    if (generation !== this.timerGeneration) return;
    this.timerGeneration++;
    this.timer = undefined;
    this.deadline = undefined;
    this.reconcile();
  };
  private cancel = () => {
    this.leases.clear();
    this.reconcile();
  };
  private visibility = () => {
    if (this.surface.document.hidden) this.cancel();
  };
  private entrance = (event: Event) => {
    const element = event.target as Element | null;
    if (
      element?.nodeType !== 1 ||
      !element.matches(
        ':is([data-slot="popover-content"],[data-slot="context-menu-content"],[data-slot="context-menu-sub-content"],[data-slot="dropdown-menu-content"],[data-slot="dropdown-menu-sub-content"])[data-state="open"]',
      )
    )
      return;
    const until = Date.now() + 250;
    for (const lease of this.leases.keys()) this.leases.set(lease, until);
    this.reconcile();
  };
  private reconcile() {
    const now = Date.now();
    let deadline: number | undefined;
    for (const [lease, until] of this.leases) {
      if (until <= now) this.leases.delete(lease);
      else deadline = Math.min(deadline ?? until, until);
    }
    if (deadline !== this.deadline) {
      const generation = ++this.timerGeneration;
      if (this.timer !== undefined) this.surface.clearTimeout(this.timer);
      this.deadline = deadline;
      this.timer =
        deadline === undefined
          ? undefined
          : this.surface.setTimeout(() => this.tick(generation), Math.max(1, deadline - now));
    }
    const active = this.leases.size > 0;
    if (active === this.active) return;
    this.active = active;
    if (active) {
      this.surface.addEventListener("pagehide", this.cancel);
      this.surface.addEventListener("animationstart", this.entrance, true);
      this.surface.document.addEventListener("visibilitychange", this.visibility);
    } else {
      this.surface.removeEventListener("pagehide", this.cancel);
      this.surface.removeEventListener("animationstart", this.entrance, true);
      this.surface.document.removeEventListener("visibilitychange", this.visibility);
    }
    for (const listener of this.listeners) listener();
  }
}
const presentations = new WeakMap<Window, UiPresentationPort>();
export function getUiPresentation(surface: Window = window): UiPresentationPort {
  let presentation = presentations.get(surface);
  if (!presentation) {
    presentation = new UiPresentation(surface);
    presentations.set(surface, presentation);
  }
  return presentation;
}
