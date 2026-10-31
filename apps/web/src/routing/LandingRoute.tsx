import { useNavigate } from "@tanstack/react-router";
import { LandingPage } from "../components/projects/landing/LandingPage";
import { useTranslation } from "react-i18next";
import { useTheme } from "../state/session/editor";
import "./messages";
import { useEffect } from "react";
import { readLanguage } from "../state/i18n";

export function LandingRoute() {
  const navigate = useNavigate(),
    { i18n } = useTranslation("routing");
  useEffect(() => {
    void i18n.changeLanguage(readLanguage());
    document.documentElement.lang = readLanguage();
  }, [i18n]);
  useTheme();
  return (
    <LandingPage
      onCreate={() => {
        void navigate({ to: "/dashboard" });
      }}
      onTemplate={(id) => {
        void navigate({ to: "/editor", search: { template: id } });
      }}
      onPrepare={() => {
        void import("../bootstrap/Studio");
      }}
    />
  );
}
