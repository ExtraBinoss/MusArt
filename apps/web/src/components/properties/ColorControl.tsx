import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pipette } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/input";
import { IconButton } from "../shared/IconButton";
import { ColorPalette } from "./color/ColorPalette";
import { hexToHsva, hsvaToHex, normalizeHex } from "./color/conversion";
import { pickScreenColor, supportsEyeDropper } from "./color/eyedropper";
import "./color/messages";

export function ColorControl({
  value,
  onPreview,
  onCommit,
  onCancel,
  disabled = false,
  alpha = true,
  identity,
  invalidation,
}: {
  disabled?: boolean;
  alpha?: boolean;
  identity?: string;
  invalidation?: { subscribe(listener: () => void): () => void };
  value: string;
  onPreview: (value: string) => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(),
    { t: colorMessage } = useTranslation("color");
  const [reset, setReset] = useState(0);
  const [override, setOverride] = useState<{ base: string; hex: string } | null>(null);
  const [available] = useState(supportsEyeDropper);
  const [pending, setPending] = useState<{ value: string; commit: typeof onCommit } | null>(null);
  const [error, setError] = useState("");
  const field = useRef<HTMLInputElement>(null),
    swatch = useRef<HTMLSpanElement>(null);
  const draft = useRef(normalizeHex(value) ?? value),
    committed = useRef(normalizeHex(value) ?? value);
  const session = useRef<{ mounted: boolean; generation: number; request: AbortController | null }>(
    { mounted: false, generation: 0, request: null },
  );
  const gesture = useRef(false),
    blockedGesture = useRef(false),
    pointer = useRef<number | null>(null);
  const cancelFromClock = useRef<() => void>(() => {});
  const busy = !disabled && pending?.value === value && pending.commit === onCommit;
  const paletteValue = !disabled && override?.base === value ? override.hex : value;

  useLayoutEffect(() => {
    const next = normalizeHex(value) ?? value;
    draft.current = committed.current = next;
    if (field.current) field.current.value = next.toUpperCase();
    if (swatch.current) swatch.current.style.background = next;
  }, [value, disabled, identity]);
  useLayoutEffect(() => {
    const state = session.current;
    state.mounted = true;
    state.generation++;
    if (disabled) onCancel();
    return () => {
      state.mounted = false;
      state.generation++;
      state.request?.abort();
      state.request = null;
      if (gesture.current) {
        gesture.current = false;
        blockedGesture.current = true;
        onCancel();
      }
    };
  }, [value, onPreview, onCommit, onCancel, disabled, identity]);

  useEffect(() => {
    const release = (event: Event) => {
      if (!blockedGesture.current || (event.type === "blur" && event.target !== window)) return;
      if (
        event.type !== "blur" &&
        pointer.current !== null &&
        (event as PointerEvent).pointerId !== pointer.current
      )
        return;
      pointer.current = null;
      blockedGesture.current = false;
      gesture.current = false;
      draft.current = committed.current;
      if (field.current) field.current.value = committed.current.toUpperCase();
      if (swatch.current) swatch.current.style.background = committed.current;
      onCancel();
      setReset((current) => current + 1);
    };
    for (const type of ["pointerup", "pointercancel", "blur"])
      window.addEventListener(type, release, true);
    return () => {
      for (const type of ["pointerup", "pointercancel", "blur"])
        window.removeEventListener(type, release, true);
    };
  }, [onCancel]);

  function invalidateSampling() {
    if (!session.current.request) return;
    session.current.generation++;
    session.current.request.abort();
    session.current.request = null;
    setPending(null);
  }
  function display(color: string) {
    draft.current = color;
    if (field.current) field.current.value = color.toUpperCase();
    if (swatch.current) swatch.current.style.background = color;
  }
  function preview(color: string) {
    if (disabled || blockedGesture.current) return false;
    if (!alpha) color = color.slice(0, 7);
    invalidateSampling();
    setError("");
    display(color);
    onPreview(color);
  }
  function cancel(blockUntilRelease = false) {
    invalidateSampling();
    blockedGesture.current = blockUntilRelease;
    if (!blockUntilRelease) pointer.current = null;
    gesture.current = false;
    display(committed.current);
    onCancel();
    setOverride(null);
    setReset((current) => current + 1);
  }
  useLayoutEffect(() => {
    cancelFromClock.current = () => cancel(gesture.current);
  });
  useEffect(
    () =>
      invalidation?.subscribe(() => {
        if (gesture.current || session.current.request || draft.current !== committed.current)
          cancelFromClock.current();
      }),
    [invalidation],
  );
  function commit(color = draft.current) {
    if (disabled || blockedGesture.current) return;
    const normalized = normalizeHex(alpha ? color : color.slice(0, 7));
    if (!normalized) {
      cancel();
      return;
    }
    display(normalized);
    if (normalized !== committed.current) {
      committed.current = normalized;
      onCommit(normalized);
    } else onCancel();
  }
  async function sampleScreen() {
    if (disabled) return;
    invalidateSampling();
    const token = ++session.current.generation,
      controller = new AbortController();
    session.current.request = controller;
    setPending({ value, commit: onCommit });
    setError("");
    try {
      const picked = await pickScreenColor(controller.signal);
      if (
        !session.current.mounted ||
        session.current.generation !== token ||
        controller.signal.aborted
      )
        return;
      if (!/^#[\da-f]{6}$/i.test(picked.sRGBHex)) throw new Error("Invalid native screen color.");
      const next = hsvaToHex({ ...hexToHsva(picked.sRGBHex), a: hexToHsva(committed.current).a });
      setOverride({ base: value, hex: next });
      commit(next);
    } catch (reason) {
      const aborted =
        typeof reason === "object" &&
        reason !== null &&
        "name" in reason &&
        reason.name === "AbortError";
      if (
        session.current.mounted &&
        session.current.generation === token &&
        !controller.signal.aborted &&
        !aborted
      )
        setError(colorMessage("failed"));
    } finally {
      if (session.current.mounted && session.current.generation === token) {
        session.current.request = null;
        setPending(null);
      }
    }
  }
  return (
    <div
      className="color-control"
      role="group"
      aria-label={t("colorPicker")}
      aria-disabled={disabled || undefined}
      onPointerDownCapture={(event) => {
        if (event.button === 0 && (event.target as HTMLElement).closest(".color-channels")) {
          invalidateSampling();
          blockedGesture.current = false;
          pointer.current = event.pointerId;
          gesture.current = true;
        }
      }}
      onPointerUp={(event) => {
        if (pointer.current !== null && event.pointerId !== pointer.current) return;
        pointer.current = null;
        const blocked = blockedGesture.current;
        blockedGesture.current = false;
        gesture.current = false;
        if (blocked) cancel();
        else commit();
      }}
      onPointerCancel={() => cancel()}
      onLostPointerCapture={() => {
        if (gesture.current || blockedGesture.current) cancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          cancel(gesture.current);
        }
      }}
      onKeyUp={(event) => {
        if (event.key.startsWith("Arrow") || event.key === "Enter") commit();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) commit();
      }}
    >
      <ColorPalette
        resetKey={`${reset}:${disabled}:${identity ?? ""}`}
        value={paletteValue}
        alpha={alpha}
        disabled={disabled}
        onPreview={preview}
        onCommit={() => commit()}
      />
      <div className="color-value">
        <span ref={swatch} className="color-swatch" style={{ background: value }} />
        <Input
          ref={field}
          aria-label={t("copyColor")}
          defaultValue={(normalizeHex(value) ?? value).toUpperCase()}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            draft.current = raw;
            if (/^#(?:[\da-f]{6}|[\da-f]{8})$/i.test(raw)) {
              const hex = normalizeHex(raw)!;
              setOverride({ base: value, hex });
              preview(hex);
            }
          }}
        />
        {available && (
          <IconButton
            type="button"
            className="color-eyedropper"
            label={colorMessage("sample")}
            disabled={busy || disabled}
            aria-busy={busy}
            onClick={() => {
              void sampleScreen();
            }}
          >
            <Pipette size={14} />
          </IconButton>
        )}
      </div>
      {busy && (
        <p className="color-sampling" role="status">
          {colorMessage("pending")}
        </p>
      )}
      {error && (
        <p className="color-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
