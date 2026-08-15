import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
}

const STORAGE_KEY = 'dashboard-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);
  const [systemPreference, setSystemPreference] = useState<ResolvedTheme>(systemTheme);
  const resolvedTheme = theme === 'system' ? systemPreference : theme;

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const update = () => setSystemPreference(media.matches ? 'dark' : 'light');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-theme-mode', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [resolvedTheme, theme]);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
