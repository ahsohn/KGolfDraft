export type ThemeKey = "golf" | "worldcup";

export interface ThemeConfig {
  appTitle: string;
  subtitle: string;
  availableHeading: string;
  searchPlaceholder: string;
}

export const THEMES: Record<ThemeKey, ThemeConfig> = {
  golf: {
    appTitle: "KGolfDraft",
    subtitle: "Golf Snake Draft",
    availableHeading: "Available Players",
    searchPlaceholder: "Search players...",
  },
  worldcup: {
    appTitle: "World Cup Draft",
    subtitle: "World Cup Country Draft",
    availableHeading: "Available Countries",
    searchPlaceholder: "Search countries...",
  },
};

export function getTheme(key: string | undefined): ThemeConfig {
  return THEMES[key as ThemeKey] ?? THEMES.golf;
}

// Switches the CSS palette by setting <html data-theme="...">
export function applyThemeAttr(key: string | undefined) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme =
      key === "worldcup" ? "worldcup" : "golf";
  }
}
