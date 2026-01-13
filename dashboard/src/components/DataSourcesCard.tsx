/**
 * Data Sources status card
 */

import { formatDistanceToNowStrict } from 'date-fns';
import { theme } from '../styles/theme';
import type { IngestionSourceStatus } from '../types';

interface DataSourcesCardProps {
  sources: IngestionSourceStatus[];
  isLoading?: boolean;
  error?: string | null;
}

const statusColors: Record<IngestionSourceStatus['status'], { background: string; text: string; dot: string }> = {
  connected: {
    background: theme.colors.success[100],
    text: theme.colors.success[800],
    dot: theme.colors.success[500],
  },
  delayed: {
    background: theme.colors.warning[100],
    text: theme.colors.warning[800],
    dot: theme.colors.warning[500],
  },
  disconnected: {
    background: theme.colors.error[100],
    text: theme.colors.error[800],
    dot: theme.colors.error[500],
  },
};

function formatLastEvent(lastEventAt: number | null) {
  if (!lastEventAt) {
    return 'No events received yet';
  }

  const relative = formatDistanceToNowStrict(lastEventAt, { addSuffix: true });
  const absolute = new Date(lastEventAt).toLocaleString();
  return `${relative} (${absolute})`;
}

export function DataSourcesCard({ sources, isLoading, error }: DataSourcesCardProps) {
  return (
    <section
      style={{
        backgroundColor: theme.colors.background.primary,
        padding: theme.spacing.lg,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.md,
      }}
    >
      <div style={{ marginBottom: theme.spacing.md }}>
        <h2
          style={{
            ...theme.typography.h3,
            marginBottom: theme.spacing.xs,
          }}
        >
          Connected Data Sources
        </h2>
        <p
          style={{
            ...theme.typography.body,
            color: theme.colors.text.tertiary,
            margin: 0,
          }}
        >
          Monitor ingestion health and last event received per integration.
        </p>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`source-skeleton-${index}`}
              className="skeleton"
              style={{ height: '48px', borderRadius: theme.borderRadius.md }}
            />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div
          style={{
            padding: theme.spacing.md,
            borderRadius: theme.borderRadius.md,
            backgroundColor: theme.colors.error[50],
            color: theme.colors.error[800],
            border: `1px solid ${theme.colors.error[200]}`,
          }}
        >
          {error}
        </div>
      )}

      {!isLoading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {sources.map(source => {
            const colors = statusColors[source.status];
            return (
              <div
                key={source.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.md,
                padding: theme.spacing.md,
                borderRadius: theme.borderRadius.md,
                backgroundColor: theme.colors.background.secondary,
                border: `1px solid ${theme.colors.border.light}`,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: theme.typography.fontSize.base,
                      fontWeight: theme.typography.fontWeight.semibold,
                      color: theme.colors.text.primary,
                      marginBottom: theme.spacing.xs,
                    }}
                  >
                    {source.name}
                  </div>
                  <div
                    style={{
                      fontSize: theme.typography.fontSize.sm,
                      color: theme.colors.text.tertiary,
                      marginBottom: theme.spacing.xs,
                    }}
                  >
                    {source.description}
                  </div>
                  <div
                    style={{
                      fontSize: theme.typography.fontSize.sm,
                      color: theme.colors.text.secondary,
                    }}
                  >
                    Last event received: {formatLastEvent(source.lastEventAt)}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.spacing.xs,
                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                    borderRadius: theme.borderRadius.full,
                    backgroundColor: colors.background,
                    color: colors.text,
                    fontSize: theme.typography.fontSize.sm,
                    fontWeight: theme.typography.fontWeight.medium,
                    textTransform: 'capitalize',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: colors.dot,
                    }}
                  />
                  {source.status}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
