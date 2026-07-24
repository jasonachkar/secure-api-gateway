/**
 * Live countdown to a target timestamp, ticking every second.
 */

import { useEffect, useState } from 'react';

export function useCountdown(targetMs: number): { label: string; expired: boolean } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = targetMs - now;
  if (remainingMs <= 0) {
    return { label: 'Expired', expired: true };
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);

  const label = hours > 0
    ? `${hours}h ${minutes % 60}m ${seconds}s`
    : `${minutes}m ${seconds}s`;

  return { label, expired: false };
}
