import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import type { EnginePort, MotionAnimationPreset } from "@musart/core";
import { bindHoverPreview } from "../../shared/preview/hover-preview";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { useVirtualList } from "../../shared/scroll/use-virtual-list";
import { Button } from "../../ui/button";
import { PresetPreview } from "./PresetPreview";
import { ANIMATION_PREVIEW_IMAGE } from "./preview-document";

/** Scroll state belongs to this bounded two-column window, never the picker header or editor. */
export function PresetGrid({
  engine,
  entries,
  apply,
  remove,
  busy,
  empty,
  onError,
  children,
}: {
  engine: EnginePort;
  entries: readonly MotionAnimationPreset[];
  apply: (preset: MotionAnimationPreset) => void;
  remove?: (id: string) => void;
  busy: boolean;
  empty: string;
  onError: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation("animations");
  const viewport = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(178);
  const [hover, setHover] = useState<{ id: string; mount: HTMLDivElement } | null>(null);
  const pendingFocus = useRef<number | null>(null);
  const rows = Math.ceil(entries.length / 2);
  const { first, last, height, attachViewport, onScroll } = useVirtualList(
    rows,
    rowHeight,
    viewport,
    2,
  );
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => {
      const grid = node.querySelector<HTMLElement>(".animation-preset-grid");
      if (grid && grid.clientWidth > 0)
        setRowHeight(Math.ceil(((grid.clientWidth - 10) / 2 - 2) * 0.75 + 59));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const intent = bindHoverPreview(node, {
      selector: ".animation-preset-card",
      onChange: (button) => {
        const preset = button ? entries[Number(button.dataset.presetIndex)] : undefined;
        const mount = button?.querySelector<HTMLDivElement>(".animation-card-live");
        setHover(preset && mount ? { id: preset.id, mount } : null);
      },
    });
    return () => intent.dispose();
  }, [entries]);
  const visible = entries.slice(first * 2, last * 2);
  const hovered = hover && visible.find((preset) => preset.id === hover.id);
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const button = viewport.current?.querySelector<HTMLButtonElement>(
      `[data-preset-index="${pendingFocus.current}"]`,
    );
    if (button) {
      pendingFocus.current = null;
      button.focus({ preventScroll: true });
    }
  }, [first, last, entries]);
  function focus(index: number) {
    const node = viewport.current;
    if (!node) return;
    const at = Math.max(0, Math.min(entries.length - 1, index));
    const button = node.querySelector<HTMLButtonElement>(`[data-preset-index="${at}"]`);
    const top = Math.floor(at / 2) * rowHeight;
    if (top < node.scrollTop) node.scrollTop = top;
    else if (top + rowHeight > node.scrollTop + node.clientHeight)
      node.scrollTop = top + rowHeight - node.clientHeight;
    if (button) button.focus({ preventScroll: true });
    else {
      pendingFocus.current = at;
      onScroll({ currentTarget: node });
    }
  }

  return (
    <>
      <ScrollShadow className="animation-preset-shadow">
        <div ref={attachViewport} className="animation-preset-scroll">
          <div
            className="animation-preset-grid"
            role="list"
            data-total-presets={entries.length}
            style={{ height: height }}
          >
            <div
              className="animation-preset-window"
              style={{ top: first * rowHeight, gridAutoRows: rowHeight - 10 }}
            >
              {visible.map((preset, offset) => {
                const index = first * 2 + offset;
                return (
                  <div
                    className="animation-preset-cell"
                    key={preset.id}
                    role="listitem"
                    aria-posinset={index + 1}
                    aria-setsize={entries.length}
                  >
                    <button
                      className="animation-preset-card"
                      type="button"
                      aria-label={preset.name}
                      data-preset-index={index}
                      onKeyDown={(event) => {
                        const delta =
                          event.key === "ArrowDown"
                            ? 2
                            : event.key === "ArrowUp"
                              ? -2
                              : event.key === "ArrowRight"
                                ? 1
                                : event.key === "ArrowLeft"
                                  ? -1
                                  : 0;
                        if (delta) {
                          event.preventDefault();
                          focus(index + delta);
                        } else if (event.key === "Home" || event.key === "End") {
                          event.preventDefault();
                          focus(event.key === "Home" ? 0 : entries.length - 1);
                        }
                      }}
                      onClick={() => apply(preset)}
                    >
                      <span className="animation-card-image">
                        <img src={ANIMATION_PREVIEW_IMAGE} alt="" loading="lazy" />
                        <div className="animation-card-live" aria-hidden />
                      </span>
                      <span className="animation-card-name">{preset.name}</span>
                      <span className="animation-card-category">
                        {t(`category.${preset.category}`)}
                      </span>
                    </button>
                    {remove && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="animation-preset-delete"
                        disabled={busy}
                        aria-label={t("deletePreset")}
                        onClick={() => remove(preset.id)}
                      >
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {!entries.length && <p className="animation-picker-empty">{empty}</p>}
          {children}
        </div>
      </ScrollShadow>
      <PresetPreview
        engine={engine}
        preset={hovered || undefined}
        mount={hovered ? hover!.mount : null}
        onError={onError}
      />
    </>
  );
}
