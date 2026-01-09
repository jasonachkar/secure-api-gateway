/**
 * Reusable Button Component
 * Provides consistent button styling with variants, sizes, and states
 */

import React from 'react';
import { theme } from '../styles/theme';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.sans,
    fontWeight: theme.typography.fontWeight.medium,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    transition: theme.transitions.normal,
    outline: 'none',
    ...style,
  };

  // Size styles
  const sizeStyles: Record<'sm' | 'md' | 'lg', React.CSSProperties> = {
    sm: {
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      fontSize: theme.typography.fontSize.sm,
      lineHeight: theme.typography.lineHeight.tight,
    },
    md: {
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      fontSize: theme.typography.fontSize.base,
      lineHeight: theme.typography.lineHeight.normal,
    },
    lg: {
      padding: `${theme.spacing.md} ${theme.spacing.lg}`,
      fontSize: theme.typography.fontSize.md,
      lineHeight: theme.typography.lineHeight.normal,
    },
  };

  // Variant styles
  const variantStyles: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
    primary: {
      backgroundColor: theme.colors.primary[500],
      color: theme.colors.text.inverse,
      boxShadow: theme.shadows.sm,
    },
    secondary: {
      backgroundColor: theme.colors.neutral[200],
      color: theme.colors.text.primary,
      boxShadow: theme.shadows.sm,
    },
    danger: {
      backgroundColor: theme.colors.error[500],
      color: theme.colors.text.inverse,
      boxShadow: theme.shadows.sm,
    },
    success: {
      backgroundColor: theme.colors.success[500],
      color: theme.colors.text.inverse,
      boxShadow: theme.shadows.sm,
    },
    ghost: {
      backgroundColor: 'transparent',
      color: theme.colors.text.primary,
      border: `1px solid ${theme.colors.border.medium}`,
    },
  };

  const hoverStyles: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
    primary: {
      backgroundColor: theme.colors.primary[600],
      boxShadow: theme.shadows.md,
    },
    secondary: {
      backgroundColor: theme.colors.neutral[300],
      boxShadow: theme.shadows.md,
    },
    danger: {
      backgroundColor: theme.colors.error[600],
      boxShadow: theme.shadows.md,
    },
    success: {
      backgroundColor: theme.colors.success[600],
      boxShadow: theme.shadows.md,
    },
    ghost: {
      backgroundColor: theme.colors.neutral[100],
      border: `1px solid ${theme.colors.border.dark}`,
    },
  };

  const [isHovered, setIsHovered] = React.useState(false);

  const combinedStyle: React.CSSProperties = {
    ...baseStyle,
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...(isHovered && !disabled && !isLoading && variant ? hoverStyles[variant] : {}),
    opacity: disabled || isLoading ? 0.6 : 1,
  };

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      style={combinedStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 3px ${theme.colors.primary[200]}`;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        const shadow = variantStyles[variant]?.boxShadow;
        if (shadow) {
          e.currentTarget.style.boxShadow = shadow;
        }
        props.onBlur?.(e);
      }}
    >
      {isLoading ? (
        <>
          <span
            style={{
              width: '14px',
              height: '14px',
              border: `2px solid ${variant === 'ghost' ? theme.colors.text.primary : 'currentColor'}`,
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
            }}
          />
          Loading...
        </>
      ) : (
        <>
          {leftIcon && <span>{leftIcon}</span>}
          {children}
          {rightIcon && <span>{rightIcon}</span>}
        </>
      )}
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </button>
  );
}

