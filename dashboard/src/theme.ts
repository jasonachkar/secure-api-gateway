/**
 * Theme-independent design tokens: raw color ramps, typography scale, spacing, radii,
 * breakpoints, transitions, and z-index. These values are the same in light and dark mode
 * by definition - anything that actually changes with the active theme (surfaces, text,
 * borders, status colors, shadows) lives in styles/tokens.css as a CSS custom property
 * instead, since that's the only layer that can react to the `data-theme` attribute
 * without a re-render. Components should read `var(--color-*)` (see tokens.css) rather
 * than reach into `theme.colors` for anything that should adapt to the theme.
 */

export const theme = {
  colors: {
    // Raw color ramps - fixed regardless of theme. Kept here for the rare case a
    // consumer needs a literal palette value (e.g. an SVG data color) rather than a
    // semantic CSS variable. Mirrors the same ramp in styles/tokens.css.
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
    },
    success: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d',
    },
    warning: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
    },
    error: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#ef4444',
      600: '#dc2626',
      700: '#b91c1c',
      800: '#991b1b',
      900: '#7f1d1d',
    },
    neutral: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
    },
  },

  typography: {
    fontFamily: {
      sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    },
    fontSize: {
      xs: '11px',
      sm: '12px',
      base: '14px',
      md: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '28px',
      '4xl': '32px',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
    // Typography presets - sizing/weight only, no color. Pair with a `--color-text-*`
    // CSS variable (or a `.text-*` utility from styles/global.css) for color.
    h1: {
      fontSize: '32px',
      fontWeight: 700,
      lineHeight: 1.25,
    },
    h2: {
      fontSize: '24px',
      fontWeight: 600,
      lineHeight: 1.25,
    },
    h3: {
      fontSize: '20px',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    body: {
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    small: {
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '11px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
  },

  borderRadius: {
    none: '0',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    '2xl': '16px',
    full: '9999px',
  },

  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },

  transitions: {
    fast: '150ms ease-in-out',
    normal: '200ms ease-in-out',
    slow: '300ms ease-in-out',
  },

  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },
} as const;

export type Theme = typeof theme;
