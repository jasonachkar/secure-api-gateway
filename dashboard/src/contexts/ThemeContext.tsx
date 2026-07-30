/**
 * Dark mode is the default, unconditionally, for every first-time visitor. This
 * deliberately does NOT fall back to `prefers-color-scheme` the way many apps do:
 * most operating systems ship with a light theme out of the box, so `prefers-color-scheme:
 * light` matches by default for the large majority of visitors who have never touched
 * their OS appearance setting at all - honoring that as a signal would make the app
 * default to light for almost everyone, which defeats the point. Persists the user's
 * explicit toggle choice in localStorage, and stamps `data-theme` on <html> - every color
 * in styles/ui.css and styles/tokens.css is a CSS custom property, so this alone re-themes
 * the whole app without page-by-page changes.
 */

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'dashboard-theme';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getInitialTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
