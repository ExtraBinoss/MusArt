/** Visible identity only. Legacy storage keys, clipboard payloads and .musart files stay compatible. */
export const brand = {
  name: "Melt",
  description: "A little wonder. A lot to create.",
  colors: {
    primary: "#A259FF",
    foreground: "#FFFFFF",
    onPrimary: "#1B102B",
    soft: "#F2E9FF",
    ink: "#2B1745",
  },
  mascot: { shape: "fleur8", expression: "surpris", eyes: "capsule" },
  assets: {
    icon: "branding/melt.svg",
    maskableIcon: "branding/melt-maskable.svg",
    appleIcon: "branding/melt-icon-180.png",
  },
} as const;
