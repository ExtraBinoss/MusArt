import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { atom, useAtomValue, useStore } from "jotai";
import {
  attachmentPopoverAtom as attachmentPopover,
  type AttachmentPopoverBinding as Binding,
  type AttachmentPopoverOpening as Opening,
} from "../../../state/session/attachment-popover";

function retire(opening: Opening) {
  if (!opening.live) return;
  opening.live = false;
  opening.cancel();
}

/** One editor per Provider; a card's derived atom changes only for its own handoffs. */
export function usePopoverOwner(owner: string) {
  const store = useStore();
  const [instance] = useState(() => ({}));
  const binding = useMemo(() => ({ instance, owner }), [instance, owner]);
  const ownSlot = useMemo(
    () =>
      atom((get) => {
        const slot = get(attachmentPopover);
        return slot?.opening.binding === binding ? slot : null;
      }),
    [binding],
  );
  const slot = useAtomValue(ownSlot);
  const opening = slot?.opening;
  const current = useRef<Binding | null>(binding);
  const sequence = useRef(0);
  const deactivate = useRef<{ binding: Binding; cancel: () => void } | null>(null);
  useLayoutEffect(() => {
    current.current = binding;
    return () => {
      if (current.current === binding) current.current = null;
      const active = store.get(attachmentPopover);
      if (active?.opening.binding === binding) {
        retire(active.opening);
        store.set(attachmentPopover, null);
      }
    };
  }, [binding, store]);
  const registerDeactivate = useCallback(
    (cancel: () => void) => {
      let live = true;
      const entry = {
        binding,
        cancel: () => {
          if (!live) return;
          live = false;
          cancel();
        },
      };
      deactivate.current = entry;
      return () => {
        if (deactivate.current === entry) {
          deactivate.current = null;
          entry.cancel();
        }
      };
    },
    [binding],
  );
  const replace = useCallback(
    (open: boolean) => {
      const previous = store.get(attachmentPopover);
      if (previous) retire(previous.opening);
      const next: Opening = {
        binding,
        generation: ++sequence.current,
        live: open,
        opened: open,
        cancel: () => {
          if (deactivate.current?.binding === binding) deactivate.current.cancel();
        },
      };
      store.set(attachmentPopover, { opening: next, open });
    },
    [binding, store],
  );
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (current.current !== binding) return false;
      if (open) replace(true);
      else {
        const active = store.get(attachmentPopover);
        if (active?.opening.binding !== binding) return false;
        retire(active.opening);
        store.set(attachmentPopover, { ...active, open: false });
      }
      return true;
    },
    [binding, replace, store],
  );
  const onTriggerPointerDown = useCallback(
    (event: { button: number; ctrlKey: boolean }) => {
      if (event.button !== 0 || event.ctrlKey || current.current !== binding) return;
      const active = store.get(attachmentPopover);
      // Cancel the old typed draft before native focus/blur can commit it.
      if (active && active.opening.binding !== binding) replace(false);
    },
    [binding, replace, store],
  );
  const isCurrent = useCallback(() => {
    const active = store.get(attachmentPopover);
    return (
      current.current === binding &&
      active !== null &&
      active.opening === opening &&
      active.open &&
      opening?.live === true
    );
  }, [binding, opening, store]);
  const onCloseAutoFocus = useCallback(
    (event: { preventDefault(): void; target?: EventTarget | null }) => {
      const active = store.get(attachmentPopover);
      const focus = document.activeElement;
      const outside =
        event.target instanceof Node &&
        focus &&
        focus !== document.body &&
        !event.target.contains(focus);
      if (current.current !== binding || active?.opening !== opening || !opening?.opened || outside)
        event.preventDefault();
    },
    [binding, opening, store],
  );
  return {
    open: slot?.open ?? false,
    present: slot !== null,
    generation: opening?.generation ?? 0,
    onOpenChange,
    onTriggerPointerDown,
    onCloseAutoFocus,
    isCurrent,
    registerDeactivate,
  };
}
