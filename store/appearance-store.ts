"use client";

import { create } from "zustand";

import {
  DENSITY_COOKIE,
  type Density,
  THEME_COOKIE,
  type ThemePreference,
  densityAttribute,
  parseDensity,
  parseThemePreference,
  preferenceCookie,
  themeClassName,
} from "@/lib/appearance";

/**
 * The reader's theme and density, on the client.
 *
 * The server already rendered `<html>` from the cookies (see `app/layout.tsx`),
 * so this store does not decide the first paint — it only has to agree with it
 * and apply a change without a reload. A change writes the cookie, so the next
 * server render agrees too, and sets the class and attribute on `<html>`
 * directly, so the change is visible in the same frame.
 *
 * The initial state is read from `document.cookie` rather than passed down as
 * props: the toggles live in the sidebar footer and the command palette, on
 * opposite sides of the workspace layout's server/client boundary, which is
 * the same reason the command palette's own state is a store.
 */
export type AppearanceState = {
  theme: ThemePreference;
  density: Density;
  setTheme: (theme: ThemePreference) => void;
  setDensity: (density: Density) => void;
};

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const prefix = `${name}=`;
  const entry = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return entry?.slice(prefix.length);
}

function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  const className = themeClassName(theme);
  if (className !== undefined) root.classList.add(className);
}

function applyDensity(density: Density): void {
  const attribute = densityAttribute(density);
  if (attribute === undefined) document.documentElement.removeAttribute("data-density");
  else document.documentElement.setAttribute("data-density", attribute);
}

export const useAppearanceStore = create<AppearanceState>((set) => ({
  theme: parseThemePreference(readCookie(THEME_COOKIE)),
  density: parseDensity(readCookie(DENSITY_COOKIE)),
  setTheme: (theme) => {
    document.cookie = preferenceCookie(THEME_COOKIE, theme);
    applyTheme(theme);
    set({ theme });
  },
  setDensity: (density) => {
    document.cookie = preferenceCookie(DENSITY_COOKIE, density);
    applyDensity(density);
    set({ density });
  },
}));
