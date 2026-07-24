/**
 * Pre-login hero widget on the Landing page. Every admin metrics endpoint requires
 * authentication, so there's no real data to show a visitor who hasn't signed in yet -
 * these counters animate with plausible increments client-side, clearly labeled as
 * illustrative rather than presented as a live backend feed (the actual live dashboard
 * is one click away, behind the demo login).
 */

import { useEffect, useState } from 'react';
import { useCountUp } from '../hooks/useCountUp';

const STATS = [
  { key: 'requests', label: 'Requests Proxied', base: 128_400, incrementRange: [8, 40] as [number, number] },
  { key: 'threats', label: 'Threats Blocked', base: 342, incrementRange: [0, 2] as [number, number] },
  { key: 'sessions', label: 'Active Sessions', base: 6, incrementRange: [-1, 1] as [number, number] },
];

export function LiveTrafficPreview() {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(STATS.map((s) => [s.key, s.base]))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setValues((prev) => {
        const next = { ...prev };
        for (const stat of STATS) {
          const [min, max] = stat.incrementRange;
          const delta = Math.round(min + Math.random() * (max - min));
          next[stat.key] = Math.max(0, next[stat.key] + delta);
        }
        return next;
      });
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="traffic-preview">
      <div className="traffic-preview__header">
        <span className="traffic-preview__dot" aria-hidden="true" />
        Live Traffic Preview
      </div>
      <div className="traffic-preview__stats">
        {STATS.map((stat) => (
          <TrafficStat key={stat.key} label={stat.label} value={values[stat.key]} />
        ))}
      </div>
      <p className="traffic-preview__caption">Illustrative — sign in for real-time metrics from the live gateway.</p>
    </div>
  );
}

function TrafficStat({ label, value }: { label: string; value: number }) {
  const animated = useCountUp(value, 500);
  return (
    <div className="traffic-preview__stat">
      <div className="traffic-preview__value">{animated.toLocaleString()}</div>
      <div className="traffic-preview__label">{label}</div>
    </div>
  );
}
