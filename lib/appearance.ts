/**
 * The reader's appearance preferences — theme and density — in one place.
 *
 * Client-safe: string literals and pure functions, nothing else.
 *
 * Constraint C8: one module owns a fact. The root layout reads these cookies
 * to render `<html>` with the right class before a single byte of CSS is
 * applied, the toggles write them, and both go through the parsers below, so
 * the server and the client cannot disagree about what `"compact"` means or
 * what an unreadable cookie falls back to.
 *
 * Cookies rather than `localStorage`, deliberately. The server renders the
 * first paint, and it cannot read `localStorage` — a preference stored there
 * is applied by script after the page has already painted in the wrong theme,
 * which is the flash every theme toggle on the web is known for. A cookie
 * arrives with the request, so the first paint is already right.
 */

/** The two rendered themes. `system` is a preference, not a theme. */
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * What the reader chose. `system` is the default and follows
 * `prefers-color-scheme` live, including a change made while the page is open
 * — which is why it renders *no* class rather than resolving to one: the
 * stylesheet's `light-dark()` roles follow the operating system on their own,
 * and a class would pin whatever the server guessed.
 */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/**
 * How much conversation fits on a screen. Density changes spacing tokens and
 * nothing else — no type size, no colour — so it cannot clip text or reflow a
 * layout into a different shape (Phase L2 item 8).
 */
export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

export const THEME_COOKIE = "aichatwave-theme";
export const DENSITY_COOKIE = "aichatwave-density";

/** A year. A preference is not a session; it should outlive one. */
const PREFERENCE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
export const DEFAULT_DENSITY: Density = "comfortable";

/**
 * The browser chrome colour — the address bar on mobile — for each theme.
 *
 * The one place a page colour is written outside `app/globals.css`, because a
 * `<meta name="theme-color">` cannot read a custom property. They are the two
 * values `--surface-sunken` resolves to, which is what `<body>` paints, and
 * `tests/appearance.test.ts` holds them to that.
 */
export const THEME_COLOR: Readonly<Record<Theme, string>> = {
  light: "#f4f4f5",
  dark: "#09090b",
};

export function isThemePreference(value: string): value is ThemePreference {
  return THEME_PREFERENCES.some((preference) => preference === value);
}

export function isDensity(value: string): value is Density {
  return DENSITIES.some((density) => density === value);
}

/** A cookie value the reader may have edited, or an old build may have written. */
export function parseThemePreference(raw: string | undefined): ThemePreference {
  return raw !== undefined && isThemePreference(raw) ? raw : DEFAULT_THEME_PREFERENCE;
}

export function parseDensity(raw: string | undefined): Density {
  return raw !== undefined && isDensity(raw) ? raw : DEFAULT_DENSITY;
}

/**
 * The class `<html>` carries for a preference. `system` carries none, so the
 * stylesheet's `color-scheme: light dark` hands the decision to the browser.
 */
export function themeClassName(preference: ThemePreference): Theme | undefined {
  switch (preference) {
    case "system":
      return undefined;
    case "light":
    case "dark":
      return preference;
  }
}

/**
 * The `data-density` attribute `<html>` carries. Comfortable is the default
 * and carries none, so the stylesheet's base values are comfortable ones.
 */
export function densityAttribute(density: Density): "compact" | undefined {
  switch (density) {
    case "comfortable":
      return undefined;
    case "compact":
      return density;
  }
}

/** A `document.cookie` assignment for one preference. */
export function preferenceCookie(
  name: typeof THEME_COOKIE | typeof DENSITY_COOKIE,
  value: ThemePreference | Density,
): string {
  return `${name}=${value}; Path=/; Max-Age=${PREFERENCE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
