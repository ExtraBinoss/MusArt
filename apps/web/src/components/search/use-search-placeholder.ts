import { useEffect, useMemo, type RefObject } from "react";
import type { SearchItem } from "./catalog/model";

/** Real catalog labels, written directly to the input: the typewriter never schedules a React render. */
export function useSearchPlaceholder(
  ref: RefObject<HTMLInputElement | null>,
  items: readonly SearchItem[],
  prefix: string,
  reduced: boolean,
) {
  const labels = useMemo(
    () =>
      JSON.stringify(
        ["effect:contrast", "effect:blur", "action:rulers", "action:editorSettings"]
          .map((id) => items.find((item) => item.id === id)?.label)
          .filter((label): label is string => !!label),
      ),
    [items],
  );
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const names = JSON.parse(labels) as string[];
    let timer: ReturnType<typeof setTimeout> | undefined,
      index = 0,
      count = 0,
      deleting = false,
      disposed = false;
    function tick() {
      if (disposed || !input || document.hidden || input.value) return;
      const name = names[index] ?? "";
      input.placeholder = `${prefix}${name ? ` ${name.slice(0, count)}` : ""}…`;
      if (reduced || !names.length) return;
      const finished = count === name.length;
      const delay = finished && !deleting ? 1500 : !count && deleting ? 240 : deleting ? 24 : 65;
      if (finished && !deleting) deleting = true;
      else if (!count && deleting) {
        deleting = false;
        index = (index + 1) % names.length;
      } else count += deleting ? -1 : 1;
      timer = setTimeout(tick, delay);
    }
    function resume() {
      clearTimeout(timer);
      tick();
    }
    if (reduced) count = names[0]?.length ?? 0;
    tick();
    input.addEventListener("input", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      clearTimeout(timer);
      input.removeEventListener("input", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [ref, labels, prefix, reduced]);
}
