import { Laptop, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  variant?: 'default' | 'inverse';
  className?: string;
  compact?: boolean;
}

const ICONS = { system: Laptop, light: Sun, dark: Moon } as const;

export function ThemeToggle({ variant = 'default', className, compact = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const Icon = ICONS[theme];
  const classes = [
    'theme-select',
    variant === 'inverse' ? 'theme-select--inverse' : '',
    compact ? 'theme-select--compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={classes} title={`Theme: ${theme}`}>
      <Icon size={15} aria-hidden="true" />
      <span className="sr-only">Color theme</span>
      <select
        value={theme}
        onChange={(event) => setTheme(event.target.value as ThemeMode)}
        aria-label="Color theme"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
