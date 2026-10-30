import { useLayoutEffect, useRef, useState } from "react";
import { Input } from "../ui/input";
import "./layer-name.css";
export type InlineNameResult = "applied" | "unchanged" | "changed" | "failed";

/** Shared visual/audio name draft; its adapter owns canonical validation and the single commit. */
export function InlineTimelineName<Origin extends { name: string }>({
  identity,
  name,
  label,
  renameLabel,
  changedLabel,
  failedLabel,
  interactive = true,
  onSelect,
  capture,
  commit,
}: {
  identity: object | string;
  name: string;
  label: string;
  renameLabel: string;
  changedLabel: string;
  failedLabel: string;
  interactive?: boolean;
  onSelect: (additive: boolean) => void;
  capture: () => Origin | null;
  commit: (origin: Origin, draft: string) => InlineNameResult;
}) {
  const [edit, setEdit] = useState<{
    origin: Origin;
    text: string;
    token: object;
    identity: object | string;
  } | null>(null);
  const [error, setError] = useState("");
  const owner = useRef<object | null>(null);
  const editing = edit?.identity === identity && interactive;
  if (edit && !editing) setEdit(null);
  useLayoutEffect(
    () => () => {
      owner.current = null;
    },
    [identity],
  );
  function begin() {
    if (!interactive) return;
    const origin = capture();
    if (!origin) return;
    const token = {};
    owner.current = token;
    setError("");
    setEdit({ origin, text: origin.name, token, identity });
  }
  function finish(cancel = false) {
    if (!edit || owner.current !== edit.token) return;
    owner.current = null;
    setEdit(null);
    if (cancel || !editing) return;
    const result = commit(edit.origin, edit.text);
    if (result === "changed" || result === "failed")
      setError(result === "changed" ? changedLabel : failedLabel);
  }
  return (
    <>
      {editing ? (
        <Input
          className="motion-row-name motion-row-name-input"
          autoFocus
          draggable={false}
          aria-label={renameLabel}
          value={edit.text}
          data-keybinding-capture
          data-canvas-control
          onFocus={(event) => event.currentTarget.select()}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setEdit({ ...edit, text: event.currentTarget.value })}
          onBlur={() => finish()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              finish(event.key === "Escape");
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="motion-row-name"
          disabled={!interactive}
          aria-label={label}
          title={name}
          onClick={(event) => onSelect(event.shiftKey || event.metaKey || event.ctrlKey)}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            begin();
          }}
          onKeyDown={(event) => {
            if (event.key === "F2") {
              event.preventDefault();
              event.stopPropagation();
              begin();
            }
          }}
        >
          {name}
        </button>
      )}
      {error && (
        <span className="sr-only" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
