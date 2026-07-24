/**
 * World map heatmap of threat activity by country. Country boundary data is bundled
 * locally via the `world-atlas` package (no runtime fetch to a third-party CDN, matching
 * this project's own security posture around external dependencies). Threat geolocation
 * comes back as ISO 3166-1 alpha-2 codes (geoip-lite, see src/modules/admin/threat-intel.
 * service.ts) - `i18n-iso-countries` converts those to the numeric IDs world-atlas'
 * topojson keys geometries by.
 */

import { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { scaleThreshold } from 'd3-scale';
import worldAtlas from 'world-atlas/countries-110m.json';
import iso from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
import type { IPThreatInfo, ThreatLevel } from '../types';

iso.registerLocale(enLocale as any);

interface CountryAggregate {
  count: number;
  topSeverity: ThreatLevel;
}

const SEVERITY_RANK: Record<ThreatLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const colorScale = scaleThreshold<number, string>()
  .domain([1, 6, 21])
  .range(['var(--color-neutral-100)', '#fed7aa', '#fb923c', '#dc2626']);

interface WorldMapHeatmapProps {
  threats: IPThreatInfo[];
}

export function WorldMapHeatmap({ threats }: WorldMapHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; count: number; severity: ThreatLevel } | null>(null);

  const byNumericId = useMemo(() => {
    const aggregates = new Map<string, CountryAggregate>();

    for (const threat of threats) {
      const alpha2 = threat.geo?.country;
      if (!alpha2) continue;
      const numericId = iso.alpha2ToNumeric(alpha2);
      if (!numericId) continue;

      const existing = aggregates.get(numericId);
      if (existing) {
        existing.count += 1;
        if (SEVERITY_RANK[threat.threatLevel] > SEVERITY_RANK[existing.topSeverity]) {
          existing.topSeverity = threat.threatLevel;
        }
      } else {
        aggregates.set(numericId, { count: 1, topSeverity: threat.threatLevel });
      }
    }

    return aggregates;
  }, [threats]);

  return (
    <div className="world-map">
      <ComposableMap projectionConfig={{ scale: 130 }} width={800} height={400} style={{ width: '100%', height: 'auto' }}>
        <Geographies geography={worldAtlas as any}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const aggregate = byNumericId.get(geo.id);
              const fill = aggregate ? colorScale(aggregate.count) : 'var(--color-neutral-100)';
              const name = (geo.properties as any)?.name ?? 'Unknown';

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="var(--color-bg-primary)"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none', fill: aggregate ? '#f59e0b' : 'var(--color-neutral-200)', cursor: aggregate ? 'pointer' : 'default' },
                    pressed: { outline: 'none' },
                  }}
                  onMouseMove={(event) => {
                    if (!aggregate) return;
                    setTooltip({
                      x: event.clientX,
                      y: event.clientY,
                      name,
                      count: aggregate.count,
                      severity: aggregate.topSeverity,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  aria-label={aggregate ? `${name}: ${aggregate.count} threat(s), highest severity ${aggregate.topSeverity}` : name}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      <div className="world-map__legend">
        <span className="world-map__legend-swatch" style={{ backgroundColor: 'var(--color-neutral-100)' }} /> None
        <span className="world-map__legend-swatch" style={{ backgroundColor: '#fed7aa' }} /> 1–5
        <span className="world-map__legend-swatch" style={{ backgroundColor: '#fb923c' }} /> 6–20
        <span className="world-map__legend-swatch" style={{ backgroundColor: '#dc2626' }} /> 21+
      </div>

      {tooltip && (
        <div className="world-map__tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <div className="world-map__tooltip-title">{tooltip.name}</div>
          <div>{tooltip.count} threat{tooltip.count !== 1 ? 's' : ''}</div>
          <div>Highest severity: {tooltip.severity.toUpperCase()}</div>
        </div>
      )}
    </div>
  );
}
