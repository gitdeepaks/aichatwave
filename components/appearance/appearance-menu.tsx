"use client";

import { Monitor, Moon, Rows3, Rows4, Sun, SunMoon } from "lucide-react";

import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DENSITIES,
  type Density,
  THEME_PREFERENCES,
  type ThemePreference,
  isDensity,
  isThemePreference,
} from "@/lib/appearance";
import { useAppearanceStore } from "@/store/appearance-store";

export const THEME_LABELS: Readonly<Record<ThemePreference, string>> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export const DENSITY_LABELS: Readonly<Record<Density, string>> = {
  comfortable: "Comfortable",
  compact: "Compact",
};

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;
const DENSITY_ICONS = { comfortable: Rows3, compact: Rows4 } as const;

/**
 * Theme and density, as a submenu of the account menu.
 *
 * Radio items rather than a toggle button: there are three themes, not two,
 * and "System" is the default a reader most needs to be able to get back to.
 * Radix gives the radio group `menuitemradio` semantics and arrow-key
 * movement, so the choice is announced as a choice.
 */
export function AppearanceMenu() {
  const theme = useAppearanceStore((state) => state.theme);
  const density = useAppearanceStore((state) => state.density);
  const setTheme = useAppearanceStore((state) => state.setTheme);
  const setDensity = useAppearanceStore((state) => state.setDensity);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <SunMoon />
        Appearance
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-44">
        <DropdownMenuLabel className="text-xs text-fg-muted">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (isThemePreference(value)) setTheme(value);
          }}
        >
          {THEME_PREFERENCES.map((preference) => {
            const Icon = THEME_ICONS[preference];
            return (
              <DropdownMenuRadioItem key={preference} value={preference}>
                <Icon />
                {THEME_LABELS[preference]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-fg-muted">Density</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={density}
          onValueChange={(value) => {
            if (isDensity(value)) setDensity(value);
          }}
        >
          {DENSITIES.map((option) => {
            const Icon = DENSITY_ICONS[option];
            return (
              <DropdownMenuRadioItem key={option} value={option}>
                <Icon />
                {DENSITY_LABELS[option]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
