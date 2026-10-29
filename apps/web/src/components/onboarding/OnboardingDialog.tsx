import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  FolderHeart,
  Layers3,
  LayoutTemplate,
  Pause,
  Play,
  Search,
  Sparkles,
  Type,
  WandSparkles,
  Film,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { MusArtLogo } from "../branding/MusArtLogo";
import { GradientArtwork } from "./GradientArtwork";
import { changeLanguage } from "../../state/i18n";
import { completeOnboarding } from "../../state/onboarding/preferences";
import { modifierLabel } from "../search/shortcuts";
import type { OnboardingPalette } from "../../services/onboarding/gradient";
import "./messages";
import "./onboarding.css";

const steps = [
  { key: "intro", icons: [LayoutTemplate, Type, Film] },
  { key: "tools", icons: [Layers3, WandSparkles, Search] },
  { key: "save", icons: [FolderHeart, Download, Copy] },
] as const;
const palettes = ["daydream", "aurora", "ultraviolet"] as const;

export function OnboardingDialog({ onComplete }: { onComplete: () => void }) {
  const { t, i18n } = useTranslation("onboarding");
  const [step, setStep] = useState(0);
  const [palette, setPalette] = useState<OnboardingPalette>("daydream");
  const [paused, setPaused] = useState(false);
  const [rememberError, setRememberError] = useState(false);
  const completed = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);
  const next = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const current = steps[step]!;
  const final = step === steps.length - 1;
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
    if (previousStep.current !== step) heading.current?.focus({ preventScroll: true });
    previousStep.current = step;
  }, [step]);
  function advance() {
    if (!final) {
      setStep((value) => Math.min(steps.length - 1, value + 1));
      return;
    }
    if (completed.current) return;
    if (!rememberError && !completeOnboarding()) {
      setRememberError(true);
      return;
    }
    completed.current = true;
    onComplete();
  }
  return (
    <Dialog open>
      <DialogContent
        className="project-dashboard onboarding-dialog"
        showCloseButton={false}
        data-welcome="true"
        aria-label={t("welcome")}
        aria-labelledby={undefined}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          next.current?.focus({ preventScroll: true });
        }}
      >
        <div className="onboarding-art">
          <GradientArtwork palette={palette} paused={paused} />
          <div className="onboarding-art-shade" />
          <div className="onboarding-brand">
            <MusArtLogo size={30} />
            <span>MusArt</span>
            <span className="onboarding-edition">{t("edition")}</span>
          </div>
          <div className="onboarding-poster" aria-hidden="true">
            <span className="onboarding-poster-spark">✳</span>
            <span>{t("artLine1")}</span>
            <span className="onboarding-outline">{t("artLine2")}</span>
            <p>{t("artCaption")}</p>
          </div>
          <div className="onboarding-art-bottom">
            <span>{t("live")}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="onboarding-motion"
              aria-label={t(paused ? "play" : "pause")}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </Button>
          </div>
          <div className="onboarding-palettes" role="group" aria-label={t("palettes")}>
            {palettes.map((value) => (
              <button
                key={value}
                type="button"
                className={`onboarding-swatch swatch-${value}`}
                aria-label={t(value)}
                aria-pressed={palette === value}
                onClick={() => setPalette(value)}
              >
                {palette === value && <Check size={13} />}
              </button>
            ))}
          </div>
        </div>
        <div className="onboarding-copy">
          <header className="onboarding-topline">
            <span>
              <Sparkles size={13} />
              {t("free")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="onboarding-language"
              aria-label={t("language")}
              onClick={() => void changeLanguage(i18n.resolvedLanguage === "fr" ? "en" : "fr")}
            >
              {i18n.resolvedLanguage === "fr" ? "EN" : "FR"}
              <span aria-hidden="true">↗</span>
            </Button>
          </header>
          <div ref={scroll} className="onboarding-scroll scrollable-panel">
            <motion.div
              key={current.key}
              className="onboarding-step"
              initial={reduce ? false : { opacity: 0, y: 9 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.22 }}
            >
              <p className="onboarding-eyebrow">{t(`${current.key}Label`)}</p>
              <DialogTitle ref={heading} tabIndex={-1} className="onboarding-title">
                {t(`${current.key}Title`)}
              </DialogTitle>
              <DialogDescription className="onboarding-description">
                {t(`${current.key}Description`)}
              </DialogDescription>
              <div className="onboarding-features">
                {current.icons.map((Icon, index) => (
                  <div className="onboarding-feature" key={index}>
                    <span className="onboarding-feature-icon">
                      <Icon size={17} strokeWidth={1.6} />
                    </span>
                    <div>
                      <h3>{t(`${current.key}Feature${index + 1}`)}</h3>
                      <p>{t(`${current.key}Detail${index + 1}`)}</p>
                    </div>
                  </div>
                ))}
              </div>
              {step === 1 && (
                <div className="onboarding-tip">
                  <Kbd>{modifierLabel()} K</Kbd>
                  <span>{t("searchTip")}</span>
                </div>
              )}
              {step === 2 && <p className="onboarding-tip">{t("imageTip")}</p>}
              {rememberError && final && (
                <p className="onboarding-storage-notice" role="status">
                  {t("rememberError")}
                </p>
              )}
            </motion.div>
          </div>
          <footer className="onboarding-footer">
            <ol className="onboarding-progress" aria-label={t("steps")}>
              {steps.map((value, index) => (
                <li
                  key={value.key}
                  aria-current={index === step ? "step" : undefined}
                  data-complete={index < step || undefined}
                >
                  <span aria-hidden="true">{index < step ? <Check size={10} /> : index + 1}</span>
                  <span>{t(`step${index + 1}`)}</span>
                </li>
              ))}
            </ol>
            <div className="onboarding-actions">
              <span className="onboarding-step-count">
                {t("progress", { current: step + 1, total: steps.length })}
              </span>
              {step > 0 && (
                <Button
                  variant="ghost"
                  className="onboarding-back"
                  aria-label={t("back")}
                  onClick={() => setStep((value) => Math.max(0, value - 1))}
                >
                  <ArrowLeft size={15} />
                </Button>
              )}
              <Button ref={next} onClick={advance} className="onboarding-next">
                {t(
                  final
                    ? rememberError
                      ? "continueSession"
                      : "start"
                    : step === 0
                      ? "discover"
                      : "next",
                )}
                <ArrowRight size={15} />
              </Button>
            </div>
            {final && <p className="onboarding-final-note">{t("localTip")}</p>}
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
