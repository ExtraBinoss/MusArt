import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { cn } from "./utils";
import "./copy-button-messages";

export const COPY_FEEDBACK_MS = 1500;
type CopyState = "idle" | "copying" | "copied" | "failed" | "unavailable";
interface CopyButtonProps extends Omit<
  ComponentProps<typeof Button>,
  "onClick" | "children" | "aria-label" | "asChild"
> {
  text: string;
  label?: string;
  onCopyingChange?: (copying: boolean) => void;
  onCopyError?: (error: unknown) => void;
}

/** Genuine Button/Tooltip composition; clipboard success is acknowledged only after native completion. */
export function CopyButton({
  text,
  label,
  onCopyingChange,
  onCopyError,
  className,
  disabled,
  size = "icon-xs",
  variant = "ghost",
  ...props
}: CopyButtonProps) {
  const { t } = useTranslation("copyButton");
  const reduced = useReducedMotion();
  const [state, setState] = useState<{ text: string; phase: CopyState }>({ text, phase: "idle" });
  const phase = state.text === text ? state.phase : "idle";
  const generation = useRef<symbol | null>(null),
    pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onCopyingChange, onCopyError });
  useLayoutEffect(() => {
    callbacks.current = { onCopyingChange, onCopyError };
  }, [onCopyingChange, onCopyError]);
  useLayoutEffect(() => {
    generation.current = Symbol();
    return () => {
      generation.current = null;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      if (pending.current) callbacks.current.onCopyingChange?.(false);
      pending.current = false;
    };
  }, [text]);
  async function copy() {
    if (disabled || pending.current) return;
    const token = Symbol();
    generation.current = token;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    let clipboard: Clipboard | undefined;
    try {
      clipboard = navigator.clipboard;
    } catch (error) {
      setState({ text, phase: "unavailable" });
      callbacks.current.onCopyError?.(error);
      return;
    }
    if (!clipboard?.writeText) {
      const error = new Error(t("unavailable"));
      setState({ text, phase: "unavailable" });
      callbacks.current.onCopyError?.(error);
      return;
    }
    pending.current = true;
    callbacks.current.onCopyingChange?.(true);
    setState({ text, phase: "copying" });
    try {
      await clipboard.writeText(text);
      if (generation.current !== token) return;
      setState({ text, phase: "copied" });
      timer.current = setTimeout(() => {
        timer.current = null;
        if (generation.current === token) setState({ text, phase: "idle" });
      }, COPY_FEEDBACK_MS);
    } catch (error) {
      if (generation.current !== token) return;
      setState({ text, phase: "failed" });
      callbacks.current.onCopyError?.(error);
    } finally {
      if (generation.current === token) {
        pending.current = false;
        callbacks.current.onCopyingChange?.(false);
      }
    }
  }
  const feedback = phase === "idle" ? (label ?? t("copy")) : t(phase);
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            {...props}
            type="button"
            size={size}
            variant={variant}
            disabled={disabled || phase === "copying"}
            className={cn(phase === "copied" && "text-primary", className)}
            aria-label={feedback}
            aria-busy={phase === "copying" || undefined}
            data-copy-state={phase}
            onClick={() => {
              void copy();
            }}
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={phase === "copied" ? "copied" : phase === "copying" ? "copying" : "copy"}
                className="inline-flex"
                aria-hidden
                initial={reduced ? false : { opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduced ? 1 : 0.75 }}
                transition={{ duration: reduced ? 0 : 0.12 }}
              >
                {phase === "copied" ? (
                  <Check size={14} />
                ) : phase === "copying" ? (
                  <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <Copy size={14} />
                )}
              </motion.span>
            </AnimatePresence>
            {phase !== "idle" && (
              <span
                className="sr-only"
                role={phase === "failed" || phase === "unavailable" ? "alert" : "status"}
              >
                {feedback}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{feedback}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
