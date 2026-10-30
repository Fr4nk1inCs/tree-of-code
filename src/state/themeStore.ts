import { create } from 'zustand';
import type { MonacoThemeName } from '../features/code/themes';

const STORAGE_KEY = 'tree-of-code:monaco-theme';
const THEME_NAMES: MonacoThemeName[] = ['vs-dark', 'vs', 'hc-black', 'hc-light'];

function initialTheme(): MonacoThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (THEME_NAMES.includes(stored as MonacoThemeName)) return stored as MonacoThemeName;
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
  return 'vs-dark';
}

interface ThemeState {
  themeName: MonacoThemeName;
  setThemeName: (themeName: MonacoThemeName) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  themeName: initialTheme(),
  setThemeName: (themeName) => {
    try {
      localStorage.setItem(STORAGE_KEY, themeName);
    } catch {
      // Theme switching still works when persistence is unavailable.
    }
    set({ themeName });
  },
}));
