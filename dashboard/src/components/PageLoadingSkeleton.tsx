/**
 * Shaped loading skeleton for card-list pages (Threats, Investigations, Sessions, Users,
 * Compliance) - replaces plain "Loading..." text with placeholders matching the actual
 * content shape. Respects prefers-reduced-motion via the shared .skeleton class
 * (src/styles/global.css).
 */

interface PageLoadingSkeletonProps {
  cardCount?: number;
  showMetrics?: boolean;
}

export function PageLoadingSkeleton({ cardCount = 3, showMetrics = true }: PageLoadingSkeletonProps) {
  return (
    <div className="page-stack" aria-busy="true" aria-label="Loading content">
      {showMetrics && (
        <div className="page-grid page-grid--cards">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="metric-card">
              <div className="skeleton skeleton--title" />
              <div className="skeleton skeleton--value" />
            </div>
          ))}
        </div>
      )}

      <div className="page-stack">
        {Array.from({ length: cardCount }).map((_, i) => (
          <div key={i} className="ui-card">
            <div className="skeleton" style={{ height: 18, width: '40%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 12, width: '80%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 12, width: '60%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
