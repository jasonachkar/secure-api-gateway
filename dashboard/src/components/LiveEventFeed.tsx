/**
 * Enhanced Live Event Feed Component
 * Shows real-time security events with improved design and animations
 */

import { useState, useEffect, type CSSProperties } from 'react';
import { format } from 'date-fns';

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
    backgroundColor: 'var(--color-primary-50)',
    color: 'var(--color-primary-800)',
    borderColor: 'var(--color-primary-200)',
    icon: 'ℹ️',
  },
  warning: {
    backgroundColor: 'var(--color-warning-50)',
    color: 'var(--color-warning-800)',
    borderColor: 'var(--color-warning-200)',
    icon: '⚠️',
  },
  critical: {
    backgroundColor: 'var(--color-error-50)',
    color: 'var(--color-error-800)',
    borderColor: 'var(--color-error-100)',
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
    <div className="live-feed">
      <div className="live-feed__header">
        <h3 className="live-feed__title">Live Security Events</h3>
        <div className="live-feed__status">
          <span className="live-feed__status-dot" />
          LIVE
        </div>
      </div>

      <div className="live-feed__list">
        {displayEvents.length === 0 ? (
          <div className="live-feed__empty">
            Waiting for events...
          </div>
        ) : (
          displayEvents.map((event, index) => {
            const style = severityStyles[event.severity];
            const itemClassName = ['live-feed__item', index === 0 ? 'live-feed__item--new' : '']
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={`${event.timestamp}-${index}`}
                className={itemClassName}
                style={{
                  '--event-bg': style.backgroundColor,
                  '--event-color': style.color,
                  '--event-border': style.borderColor,
                } as CSSProperties}
              >
                <div className="live-feed__item-body">
                  <span className="live-feed__icon" aria-hidden="true">
                    {style.icon}
                  </span>
                  <div className="live-feed__content">
                    <div className="live-feed__meta">
                      <span className="live-feed__type">{event.type}</span>
                      <span className="live-feed__time">{format(new Date(event.timestamp), 'HH:mm:ss')}</span>
                    </div>
                    <div className="live-feed__message">{event.message}</div>
                    {event.username && (
                      <div className="live-feed__user">
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
    </div>
  );
}
