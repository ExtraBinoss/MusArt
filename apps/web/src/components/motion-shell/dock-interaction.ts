interface DockActions {
  expanded(): boolean;
  pinned(): boolean;
  open(): void;
  close(): void;
  idle(): void;
}

/** Follow only portals controlled by this timeline, including nested Radix selects. */
export function dockRegions(root: HTMLElement): ReadonlySet<HTMLElement> {
  const regions = new Set<HTMLElement>([root]);
  for (const region of regions) {
    for (const trigger of region.querySelectorAll('[aria-expanded="true"][aria-controls]')) {
      const id = trigger.getAttribute("aria-controls");
      const content = id && root.ownerDocument.getElementById(id);
      if (content && regions.size < 32) regions.add(content);
    }
  }
  return regions;
}

/** Input ownership, hover hysteresis and timers stay outside React and the playback clock. */
export function observeDockInteraction(root: HTMLElement, actions: DockActions) {
  const document = root.ownerDocument;
  const pointers = new Set<number>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let hovering = false,
    suppressed = false,
    engaged = false,
    keyboard = false,
    nativeDrag = false,
    disposed = false;
  let previousExpansion = actions.expanded();
  let bounds: DOMRect | null = null;
  let point: { x: number; y: number; at: number; speed: number } | null = null;
  let nearHandle = false,
    fastExit = false;
  const panel = root.querySelector<HTMLElement>(".motion-timeline") ?? root;
  const intentEnabled = () => actions.expanded() && !actions.pinned();
  function measure() {
    if (!intentEnabled()) return;
    const next = panel.getBoundingClientRect();
    bounds = next.width > 0 && next.height > 0 ? next : null;
  }
  function sample(event: PointerEvent) {
    const at = performance.now();
    const elapsed = point ? at - point.at : 0;
    const distance = point ? Math.hypot(event.clientX - point.x, event.clientY - point.y) : 0;
    const speed =
      point && elapsed <= 120
        ? distance > 0
          ? distance / Math.max(1, elapsed)
          : elapsed < 80
            ? point.speed
            : 0
        : 0;
    point = { x: event.clientX, y: event.clientY, at, speed };
  }
  function outsideIntent() {
    const beforeNear = nearHandle,
      beforeFast = fastExit;
    nearHandle = Boolean(
      intentEnabled() &&
      bounds &&
      point &&
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top - 24 &&
      point.y <= bounds.top + 8,
    );
    if (nearHandle) fastExit = false;
    else if (point && performance.now() - point.at <= 120 && point.speed >= 0.8) fastExit = true;
    return beforeNear !== nearHandle || beforeFast !== fastExit;
  }
  const owns = (target: EventTarget | null) =>
    target instanceof Node && [...dockRegions(root)].some((region) => region.contains(target));
  function clear() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  function held() {
    const focused = document.activeElement;
    return (
      actions.pinned() ||
      nearHandle ||
      pointers.size > 0 ||
      nativeDrag ||
      document.documentElement.dataset.layerReorderActive === "true" ||
      dockRegions(root).size > 1 ||
      (owns(focused) &&
        (keyboard ||
          (focused instanceof HTMLElement &&
            focused.matches('input,textarea,select,[contenteditable="true"]'))))
    );
  }
  function reconsider() {
    clear();
    if (disposed || suppressed || held()) return;
    if (hovering) {
      if (!actions.expanded())
        timer = setTimeout(() => {
          timer = null;
          if (!disposed && hovering && !suppressed && !pointers.size) actions.open();
        }, 100);
    } else if (engaged && actions.expanded())
      timer = setTimeout(
        () => {
          timer = null;
          if (!disposed && !hovering && !held()) actions.close();
        },
        fastExit ? 90 : 280,
      );
  }
  const over = (event: PointerEvent) => {
    const wasHovering = hovering;
    hovering = owns(event.target);
    const wasSuppressed = suppressed;
    if (intentEnabled()) sample(event);
    if (hovering && !wasHovering) {
      measure();
      nearHandle = false;
      fastExit = false;
    }
    const intentChanged = !hovering && outsideIntent();
    if (hovering) engaged = true;
    if (!hovering) suppressed = false;
    if (wasHovering !== hovering || intentChanged || wasSuppressed !== suppressed) reconsider();
  };
  const out = (event: PointerEvent) => {
    if (!owns(event.target) || owns(event.relatedTarget)) return;
    hovering = false;
    measure();
    if (intentEnabled()) sample(event);
    outsideIntent();
    suppressed = false;
    reconsider();
  };
  const down = (event: PointerEvent) => {
    keyboard = false;
    engaged = true;
    if (owns(event.target)) pointers.add(event.pointerId);
    reconsider();
  };
  const up = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    actions.idle();
    if (intentEnabled() && !hovering) {
      sample(event);
      outsideIntent();
    }
    reconsider();
  };
  const dragStart = (event: DragEvent) => {
    if (!owns(event.target)) return;
    nativeDrag = true;
    engaged = true;
    clear();
  };
  const dragOver = (event: DragEvent) => {
    if (!owns(event.target)) return;
    nativeDrag = true;
    hovering = true;
    engaged = true;
    clear();
    if (!actions.expanded()) actions.open();
  };
  const dragEnd = () => {
    if (!nativeDrag) return;
    nativeDrag = false;
    pointers.clear();
    hovering = false;
    actions.idle();
    reconsider();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "Tab") keyboard = true;
  };
  const focus = () =>
    queueMicrotask(() => {
      if (!disposed) reconsider();
    });
  const move = (event: PointerEvent) => {
    if (!intentEnabled() || !engaged || suppressed || pointers.size) return;
    sample(event);
    if (!hovering && outsideIntent()) reconsider();
  };
  const layout = () => {
    if (disposed) return;
    measure();
    if (!hovering && outsideIntent()) reconsider();
  };
  const resize = new ResizeObserver(layout);
  resize.observe(panel);
  const observer = new MutationObserver(reconsider);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "aria-controls", "data-state"],
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-layer-reorder-active"],
  });
  document.addEventListener("pointerover", over, true);
  document.addEventListener("pointerout", out, true);
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointerup", up, true);
  document.addEventListener("pointercancel", up, true);
  document.addEventListener("dragstart", dragStart, true);
  document.addEventListener("dragover", dragOver, true);
  document.addEventListener("drop", dragEnd, true);
  document.addEventListener("dragend", dragEnd, true);
  document.addEventListener("pointermove", move, true);
  document.addEventListener("keydown", key, true);
  document.addEventListener("focusin", focus, true);
  document.addEventListener("focusout", focus, true);
  const blur = () => {
    nativeDrag = false;
    pointers.clear();
    hovering = false;
    nearHandle = false;
    fastExit = false;
    point = null;
    actions.idle();
    reconsider();
  };
  window.addEventListener("blur", blur);
  window.addEventListener("resize", layout);
  return {
    dragging: () =>
      pointers.size > 0 ||
      nativeDrag ||
      document.documentElement.dataset.layerReorderActive === "true",
    refresh() {
      const expanded = actions.expanded();
      if (!expanded && previousExpansion && !suppressed && held()) {
        actions.open();
        return;
      }
      if (expanded && !previousExpansion && !hovering && !owns(document.activeElement))
        engaged = false;
      previousExpansion = expanded;
      if (!expanded || actions.pinned()) {
        nearHandle = false;
        fastExit = false;
      }
      reconsider();
    },
    dismiss() {
      clear();
      suppressed = true;
      nearHandle = false;
      fastExit = false;
    },
    dispose() {
      disposed = true;
      clear();
      observer.disconnect();
      resize.disconnect();
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("pointerout", out, true);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("dragstart", dragStart, true);
      document.removeEventListener("dragover", dragOver, true);
      document.removeEventListener("drop", dragEnd, true);
      document.removeEventListener("dragend", dragEnd, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("focusout", focus, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", layout);
      pointers.clear();
    },
  };
}
