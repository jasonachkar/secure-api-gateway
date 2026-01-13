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

const severityIcons = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
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
          <div className="empty-state">Waiting for events...</div>
        ) : (
          displayEvents.map((event, index) => {
            const icon = severityIcons[event.severity];
            const itemClasses = [
              'live-feed__item',
              `live-feed__item--${event.severity}`,
              index === 0 ? 'animate-slideIn' : null,
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={`${event.timestamp}-${index}`}
                className={itemClasses}
              >
                <div className="live-feed__item-header">
                  <span className="live-feed__item-icon">{icon}</span>
                  <div className="live-feed__item-body">
                    <div className="live-feed__item-meta">
                      <span className="live-feed__item-type">
                        {event.type}
                      </span>
                      <span className="live-feed__item-time">
                        {format(new Date(event.timestamp), 'HH:mm:ss')}
                      </span>
                    </div>
                    <div className="live-feed__item-text">
                      {event.message}
                    </div>
                    <div className="live-feed__message">{event.message}</div>
                    {event.username && (
                      <div className="live-feed__item-detail">
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
