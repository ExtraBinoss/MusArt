/** All reorder adapters keep canonical content stationary and commit only after drop.
 * Domain adapters validate destinations; this engine owns exclusivity and publication.
 */
let active: (() => void) | null = null;
let cueAnchor: HTMLElement | null = null;
const cueListeners = new Set<() => void>();
export const readDragCueAnchor = () => cueAnchor;
export function subscribeDragCueAnchor(listener: () => void) {
  cueListeners.add(listener);
  return () => cueListeners.delete(listener);
}
export function setDragCueAnchor(node: HTMLElement | null) {
  if (cueAnchor === node) return;
  cueAnchor?.removeAttribute("data-layer-drop-cue-target");
  cueAnchor = node;
  cueAnchor?.setAttribute("data-layer-drop-cue-target", "true");
  for (const listener of cueListeners) listener();
}
export class DeferredDragSession<State> {
  private state: State | null = null;
  private listeners = new Set<() => void>();
  private release: (() => void) | null = null;
  read = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  begin(cancel: () => void) {
    active?.();
    this.release = cancel;
    active = cancel;
    setDragCueAnchor(null);
  }
  publish(state: State | null) {
    if (this.state === state) return;
    this.state = state && Object.freeze(state);
    for (const listener of this.listeners) listener();
  }
  finish(accepted: boolean, commit: () => void): boolean {
    if (!this.state || !this.release) return false;
    const cancel = this.release;
    cancel();
    if (accepted) commit();
    return accepted;
  }
  cancel() {
    if (active === this.release) {
      active = null;
      setDragCueAnchor(null);
    }
    this.release = null;
    this.publish(null);
  }
}
