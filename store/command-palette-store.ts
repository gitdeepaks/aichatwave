"use client";

import { create } from "zustand";

/**
 * Whether the command palette is showing.
 *
 * A store rather than React context because the two things that open it are on
 * opposite sides of the tree — the sidebar's Search button and the ⌘K listener
 * inside the palette itself — and a provider wrapping both would have to sit
 * above the sidebar, which is where the workspace layout's server/client
 * boundary is. One `create` call is cheaper than pushing that boundary up.
 *
 * `toggle` exists separately from `setOpen` because the keyboard chord is a
 * toggle: pressing ⌘K with the palette open should close it, and expressing
 * that at the call site would mean the listener reading state it does not
 * otherwise need.
 */
export type CommandPaletteState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setOpen: (isOpen: boolean) => void;
};

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setOpen: (isOpen: boolean) => set({ isOpen }),
}));
