import { useEffect, useRef } from "react";
import { OnboardingGradient, type OnboardingPalette } from "../../services/onboarding/gradient";

export function GradientArtwork({
  palette,
  paused,
}: {
  palette: OnboardingPalette;
  paused: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<OnboardingGradient | null>(null);
  const latest = useRef({ palette, paused });
  useEffect(() => {
    latest.current = { palette, paused };
    controller.current?.setPalette(palette);
    controller.current?.setPaused(paused);
  }, [palette, paused]);
  useEffect(() => {
    if (!host.current) return;
    const gradient = new OnboardingGradient(host.current);
    controller.current = gradient;
    gradient.setPalette(latest.current.palette);
    gradient.setPaused(latest.current.paused);
    return () => {
      void gradient.dispose();
      controller.current = null;
    };
  }, []);
  return <div className="onboarding-gradient" ref={host} aria-hidden="true" />;
}
