import {
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

const ROW_HEIGHT = 36;
const FIRST_ROWS = 14;
const focusable =
  'input:not([disabled]),button:not([disabled]):not([tabindex="-1"]),[tabindex="0"]';
function offsetTop(node: HTMLElement) {
  let top = 0;
  for (let item: HTMLElement | null = node; item; item = item.offsetParent as HTMLElement | null)
    top += item.offsetTop;
  return top;
}

/** Window only the scrollable controls; one retained interaction row cannot lose its draft. */
export function useParameterWindow(
  root: RefObject<HTMLDivElement | null>,
  owner: string,
  count: number,
  enabled: boolean,
) {
  const [window, setWindow] = useState({ owner, first: 0, last: FIRST_ROWS });
  const [active, setActive] = useState({ owner, index: -1 });
  const pending = useRef<{ owner: string; index: number; backwards: boolean } | null>(null);
  if (window.owner !== owner) setWindow({ owner, first: 0, last: FIRST_ROWS });
  const virtual = enabled && count > FIRST_ROWS;
  const first =
    virtual && window.owner === owner ? Math.min(Math.max(0, count - 1), window.first) : 0;
  const last = virtual ? Math.min(count, window.owner === owner ? window.last : FIRST_ROWS) : count;
  const indices = Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i);
  if (
    virtual &&
    active.owner === owner &&
    active.index >= 0 &&
    active.index < count &&
    !indices.includes(active.index)
  ) {
    indices.push(active.index);
    indices.sort((a, b) => a - b);
  }
  useLayoutEffect(() => {
    const list = root.current;
    const viewport = list?.closest<HTMLElement>(".layer-attachment-viewport");
    if (!virtual || !list || !viewport) return;
    let offset = 0,
      height = 0;
    let live = true;
    const publish = () => {
      if (!live) return;
      const top = viewport.scrollTop - offset;
      const first = Math.min(Math.max(0, count - 1), Math.max(0, Math.floor(top / ROW_HEIGHT) - 1));
      const last = Math.min(count, Math.max(first + 1, Math.ceil((top + height) / ROW_HEIGHT) + 1));
      setWindow((previous) =>
        previous.owner === owner && previous.first === first && previous.last === last
          ? previous
          : { owner, first, last },
      );
    };
    // ResizeObserver owns layout reads; scroll events use cached dimensions and row buckets.
    const resize = new ResizeObserver(() => {
      if (!live) return;
      offset = offsetTop(list) - offsetTop(viewport);
      height = viewport.clientHeight;
      if (height) publish();
    });
    resize.observe(list);
    resize.observe(viewport);
    viewport.addEventListener("scroll", publish, { passive: true });
    return () => {
      live = false;
      resize.disconnect();
      viewport.removeEventListener("scroll", publish);
    };
  }, [root, owner, count, virtual]);
  useLayoutEffect(() => {
    const request = pending.current;
    pending.current = null;
    if (!request || request.owner !== owner) return;
    const row = root.current?.querySelector(`[data-parameter-index="${request.index}"]`);
    const fields = row?.querySelectorAll<HTMLElement>(focusable);
    const target = request.backwards ? fields?.[fields.length - 1] : fields?.[0];
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  });
  const remember = (event: FocusEvent | { target: EventTarget }) => {
    if (!virtual) return;
    const row = (event.target as Element).closest<HTMLElement>("[data-parameter-index]");
    if (row && root.current?.contains(row)) {
      const index = Number(row.dataset.parameterIndex);
      setActive((previous) =>
        previous.owner === owner && previous.index === index ? previous : { owner, index },
      );
    }
  };
  const keyDown = (event: KeyboardEvent) => {
    if (!virtual || event.key !== "Tab") return;
    const row = (event.target as Element).closest<HTMLElement>("[data-parameter-index]");
    if (!row || !root.current?.contains(row)) return;
    const fields = row.querySelectorAll<HTMLElement>(focusable);
    if (event.target !== (event.shiftKey ? fields[0] : fields[fields.length - 1])) return;
    const index = Number(row.dataset.parameterIndex) + (event.shiftKey ? -1 : 1);
    if (index < 0 || index >= count) return;
    event.preventDefault();
    pending.current = { owner, index, backwards: event.shiftKey };
    setActive({ owner, index });
  };
  return {
    indices,
    virtual,
    height: Math.max(0, count * ROW_HEIGHT - 6),
    remember,
    keyDown,
    rowTop: (index: number) => index * ROW_HEIGHT,
  };
}
