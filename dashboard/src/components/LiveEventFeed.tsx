/**
 * Enhanced Live Event Feed Component
 * Shows real-time security events with improved design and animations
 */

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { theme } from '../styles/theme';

interface SecurityEvent {
  timestamp: number;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  userId?: string;
  username?: string;
}

interface LiveEventFeedProps {
  events: SecurityEvent[];
  maxEvents?: number;
}

const severityStyles = {
  info: {
    backgroundColor: theme.colors.primary[50],
    color: theme.colors.primary[800],
    borderColor: theme.colors.primary[200],
    icon: 'ℹ️',
  },
  warning: {
    backgroundColor: theme.colors.warning[50],
    color: theme.colors.warning[800],
    borderColor: theme.colors.warning[200],
    icon: '⚠️',
  },
  critical: {
    backgroundColor: theme.colors.error[50],
    color: theme.colors.error[800],
    borderColor: theme.colors.error[200],
    icon: '🚨',
  },
};

export function LiveEventFeed({ events, maxEvents = 10 }: LiveEventFeedProps) {
  const [displayEvents, setDisplayEvents] = useState<SecurityEvent[]>([]);

  useEffect(() => {
    // Keep only the most recent events
    const recent = events.slice(-maxEvents).reverse();
    setDisplayEvents(recent);
  }, [events, maxEvents]);

  return (
    <div style={{
      backgroundColor: theme.colors.background.primary,
      padding: theme.spacing.lg,
      borderRadius: theme.borderRadius.lg,
      boxShadow: theme.shadows.md,
      height: '640px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: theme.spacing.lg 
      }}>
        <h3 style={{ 
          fontSize: theme.typography.fontSize.lg, 
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}>
          Live Security Events
        </h3>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: theme.colors.primary[100],
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          color: theme.colors.primary[800],
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            backgroundColor: theme.colors.success[500],
            borderRadius: '50%',
            animation: 'pulse 2s infinite',
          }} />
          LIVE
        </div>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
        paddingRight: theme.spacing.xs,
      }}>
        {displayEvents.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: theme.colors.text.tertiary,
            fontSize: theme.typography.fontSize.base,
          }}>
            Waiting for events...
          </div>
        ) : (
          displayEvents.map((event, index) => {
            const style = severityStyles[event.severity];
            return (
              <div
                key={`${event.timestamp}-${index}`}
                style={{
                  padding: theme.spacing.md,
                  backgroundColor: style.backgroundColor,
                  borderRadius: theme.borderRadius.md,
                  borderLeft: `4px solid ${style.borderColor}`,
                  boxShadow: theme.shadows.sm,
                  animation: index === 0 ? 'slideIn 0.3s ease-out' : undefined,
                  transition: theme.transitions.normal,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = theme.shadows.md;
                  e.currentTarget.style.transform = 'translateX(2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = theme.shadows.sm;
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'start', gap: theme.spacing.sm }}>
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>{style.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'start', 
                      marginBottom: theme.spacing.xs 
                    }}>
                      <span style={{
                        fontSize: theme.typography.fontSize.sm,
                        fontWeight: theme.typography.fontWeight.semibold,
                        color: style.color,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {event.type}
                      </span>
                      <span style={{ 
                        fontSize: theme.typography.fontSize.xs, 
                        color: theme.colors.text.tertiary, 
                        whiteSpace: 'nowrap', 
                        marginLeft: theme.spacing.sm 
                      }}>
                        {format(new Date(event.timestamp), 'HH:mm:ss')}
                      </span>
                    </div>
                    <div style={{ 
                      fontSize: theme.typography.fontSize.base, 
                      color: style.color, 
                      marginBottom: event.username ? theme.spacing.xs : 0,
                      lineHeight: theme.typography.lineHeight.relaxed,
                    }}>
                      {event.message}
                    </div>
                    {event.username && (
                      <div style={{ 
                        fontSize: theme.typography.fontSize.xs, 
                        color: theme.colors.text.tertiary, 
                        fontFamily: theme.typography.fontFamily.mono,
                        marginTop: theme.spacing.xs,
                      }}>
                        User: {event.username} ({event.userId})
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          @keyframes slideIn {
            from {
              transform: translateX(-10px);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  );
}
