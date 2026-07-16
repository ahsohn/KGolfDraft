export type ThemeKey = "golf" | "worldcup";

export interface ThemeConfig {
  appTitle: string;
  subtitle: string;
  tagline: string;
  availableHeading: string;
  searchPlaceholder: string;
  noResultsText: string;
}

// The Clubhouse palette (deep green / cream / gold) applies to both themes;
// these configs only swap the copy.
export const THEMES: Record<ThemeKey, ThemeConfig> = {
  golf: {
    appTitle: "KGolfDraft",
    subtitle: "Golf Snake Draft",
    tagline: "Gentlemen, take your places.",
    availableHeading: "The Field",
    searchPlaceholder: "Search the field…",
    noResultsText: "No such player in the field",
  },
  worldcup: {
    appTitle: "World Cup Draft",
    subtitle: "World Cup Country Draft",
    tagline: "Take your places.",
    availableHeading: "The Field",
    searchPlaceholder: "Search countries…",
    noResultsText: "No such country in the field",
  },
};

export function getTheme(key: string | undefined): ThemeConfig {
  return THEMES[key as ThemeKey] ?? THEMES.golf;
}

// Switches <html data-theme="..."> (kept for potential palette swaps)
export function applyThemeAttr(key: string | undefined) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme =
      key === "worldcup" ? "worldcup" : "golf";
  }
}
