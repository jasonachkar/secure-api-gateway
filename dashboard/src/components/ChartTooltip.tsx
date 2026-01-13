import type { TooltipProps } from 'recharts';

export function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__label">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="chart-tooltip__item">
          <span>{entry.name ?? entry.dataKey}</span>
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}
