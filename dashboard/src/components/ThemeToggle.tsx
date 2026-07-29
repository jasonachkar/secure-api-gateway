/**
 * Shared light/dark toggle - the single place this logic lives. Used in the authenticated
 * sidebar (Layout), the public landing header, and the login card, so a visitor can switch
 * themes whether or not they're signed in.
 */

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  /** 'inverse' is for placement on a surface that's intentionally dark in both themes
   * (the sidebar) - it keeps a fixed light icon/border instead of following the page theme. */
  variant?: 'default' | 'inverse';
  className?: string;
}

export function ThemeToggle({ variant = 'default', className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const classes = ['theme-toggle', variant === 'inverse' ? 'theme-toggle--inverse' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
