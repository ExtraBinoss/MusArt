import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Search, RotateCcw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EffectType } from "@musart/core";
import { keybindings } from "../../../state/keybindings/store";
import { eventChord, chordTokens } from "../../../state/keybindings/chords";
import { BINDING_COMMANDS, type BindingCommand } from "../../../state/keybindings/registry";
import { KeybindingError } from "../../../state/keybindings/preferences";
import type { BindingSnapshot, CommandId } from "../../../state/keybindings/model";
import { getSearchIcon } from "../icons";
import type { SearchAction, SearchItem } from "../catalog/model";
import { modifierLabel } from "../shortcuts";
import { Button } from "../../ui/button";
import { Kbd, KbdGroup } from "../../ui/kbd";

const arrows = { Left: ArrowLeft, Right: ArrowRight, Up: ArrowUp, Down: ArrowDown };
function iconFor(command: BindingCommand) {
  if (command.id === "app:search") return Search;
  if (command.id.startsWith("nudge:"))
    return arrows[command.id.slice(6).replace("Large", "") as keyof typeof arrows];
  const item: Pick<SearchItem, "category" | "target"> = {
    category: command.category,
    target: command.id.startsWith("action:")
      ? { kind: "action", action: command.id.slice(7) as SearchAction }
      : { kind: "effect", effect: command.id.slice(7) as EffectType },
  };
  return getSearchIcon(item);
}
const bindingIcons = Object.fromEntries(
  BINDING_COMMANDS.map((command) => [command.id, iconFor(command)]),
) as Record<CommandId, ReturnType<typeof iconFor>>;
export function BindingRow({
  command,
  snapshot,
}: {
  command: BindingCommand;
  snapshot: BindingSnapshot;
}) {
  const { t } = useTranslation(),
    label = t(command.label),
    Icon = bindingIcons[command.id];
  const [recording, setRecording] = useState(false),
    [error, setError] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  const values = snapshot.bindings.get(command.id) ?? [];
  function change(action: () => void) {
    try {
      action();
      setError("");
      setRecording(false);
    } catch (error) {
      const failure = error instanceof KeybindingError ? error : new KeybindingError("invalid");
      const conflict = BINDING_COMMANDS.find((item) => item.id === failure.conflict);
      setError(t(`keybindings:${failure.code}`, { command: conflict ? t(conflict.label) : "" }));
    }
  }
  return (
    <div role="listitem" className="binding-row" data-binding-command={command.id}>
      <Icon size={17} strokeWidth={1.5} aria-hidden />
      <div className="binding-command">
        <span>{label}</span>
        <small>{t(`search:${command.category}`)}</small>
      </div>
      <Button
        ref={button}
        variant="outline"
        size="sm"
        className="binding-capture"
        data-keybinding-capture
        data-recording={recording || undefined}
        aria-label={t("keybindings:record", { command: label })}
        onClick={() => {
          setRecording(true);
          setError("");
          button.current?.focus();
        }}
        onBlur={() => setRecording(false)}
        onKeyDown={(event) => {
          if (!recording) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") {
            setRecording(false);
            setError("");
            return;
          }
          if (["Control", "Shift", "Alt", "Meta", "AltGraph"].includes(event.key) || event.repeat)
            return;
          const chord = eventChord(event.nativeEvent);
          if (!chord) {
            setError(t("keybindings:invalid"));
            return;
          }
          change(() => keybindings.assign(command.id, [chord]));
        }}
      >
        {recording ? (
          <span>{t("keybindings:press")}</span>
        ) : values.length ? (
          values.map((chord, index) => (
            <KbdGroup key={index}>
              {chordTokens(chord).map((key) => (
                <Kbd key={key}>{key === "Mod" ? modifierLabel() : key}</Kbd>
              ))}
            </KbdGroup>
          ))
        ) : (
          <span className="binding-unbound">{t("keybindings:unbound")}</span>
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t("keybindings:clear", { command: label })}
        disabled={!values.length || recording}
        onClick={() => change(() => keybindings.assign(command.id, []))}
      >
        <X size={13} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t("keybindings:reset", { command: label })}
        disabled={!Object.hasOwn(snapshot.overrides, command.id) || recording}
        onClick={() => change(() => keybindings.reset(command.id))}
      >
        <RotateCcw size={13} />
      </Button>
      {(error || recording) && (
        <p className="binding-feedback" role={error ? "alert" : "status"}>
          {error || t("keybindings:cancel")}
        </p>
      )}
    </div>
  );
}
