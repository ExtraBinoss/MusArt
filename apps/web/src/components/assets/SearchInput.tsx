// Copied from ResumI (MIT); input wrapper adapted to MusArt shadcn.
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "motion/react";
import { Search } from "lucide-react";
import { Input } from "../ui/input";
import type { ComponentProps } from "react";
type TextInputProps = ComponentProps<typeof Input>;
import styles from "./SearchInput.module.css";

type Hint = { label: string; preview?: Exclude<ReactNode, Promise<unknown>> };
/** One timer updates the input attribute; typing never re-renders the catalog.
 * A stable serialized hint list keeps the clock independent from query renders. */
export function SearchInput({
  hints = [],
  prefix,
  captureTyping = false,
  autoFocus,
  focusKey,
  searchButton = false,
  ...props
}: TextInputProps & {
  hints?: readonly Hint[];
  prefix?: string;
  captureTyping?: boolean;
  focusKey?: string | number;
  searchButton?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const previews = useRef<HTMLSpanElement>(null);
  const { t } = useTranslation();
  const searchPrefix = prefix ?? t("common.search");
  const reduced = useReducedMotion();
  const labels = JSON.stringify(hints.slice(0, 6).map((hint) => hint.label));
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const names = JSON.parse(labels) as string[];
    let timer: ReturnType<typeof setTimeout> | undefined,
      index = 0,
      count = 0,
      deleting = false,
      displayed = -1;
    function tick() {
      if (!element) return;
      const name = names[index] ?? "";
      if (document.hidden) return;
      if (element.value) {
        displayed = -1;
        timer = setTimeout(tick, 400);
        return;
      }
      if (displayed !== index) {
        for (const [at, preview] of [...(previews.current?.children ?? [])].entries())
          (preview as HTMLElement).hidden = at !== index;
        displayed = index;
      }
      element.placeholder = name ? `${searchPrefix} ${name.slice(0, count)}…` : `${searchPrefix}…`;
      if (reduced || !names.length) return;
      const finished = count === name.length;
      const delay = finished && !deleting ? 1500 : !count && deleting ? 240 : deleting ? 24 : 65;
      if (finished && !deleting) deleting = true;
      else if (!count && deleting) {
        deleting = false;
        displayed = -1;
        index = (index + 1) % names.length;
      } else count += deleting ? -1 : 1;
      timer = setTimeout(tick, delay);
    }
    if (reduced) count = names[0]?.length ?? 0;
    function visibility() {
      clearTimeout(timer);
      if (!document.hidden) tick();
    }
    tick();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [labels, searchPrefix, reduced]);
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus, focusKey]);
  useEffect(() => {
    if (!captureTyping) return;
    function keydown(event: KeyboardEvent) {
      const field = input.current;
      if (
        !field ||
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1 ||
        /^\s$/.test(event.key)
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]',
        )
      )
        return;
      const overlay = target?.closest(
        '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-slot="popover-content"]',
      );
      if (overlay && !overlay.contains(field)) return;
      if (!overlay && document.querySelector('[role="dialog"],[role="alertdialog"]')) return;
      event.preventDefault();
      field.focus();
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      descriptor?.set?.call(field, field.value + event.key);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [captureTyping]);
  return (
    <div className={styles.control}>
      {searchButton ? (
        <button
          type="button"
          className={styles.searchButton}
          aria-label={props["aria-label"] ?? searchPrefix}
          onClick={() => input.current?.focus({ preventScroll: true })}
        >
          <Search size={15} aria-hidden />
        </button>
      ) : (
        <Search size={15} aria-hidden />
      )}
      <Input
        {...props}
        ref={input}
        type="search"
        autoFocus={autoFocus}
        placeholder={`${searchPrefix}…`}
      />
      {hints.some((hint) => hint.preview) && !props.value && (
        <span ref={previews} className={styles.previews} aria-hidden>
          {hints.slice(0, 6).map((hint, index) => (
            <span key={hint.label} hidden={index !== 0}>
              {hint.preview}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
