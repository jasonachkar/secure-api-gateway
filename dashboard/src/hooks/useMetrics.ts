/**
 * Metrics polling hook
 */

import { useState, useEffect } from 'react';
import { adminApi } from '../api/admin';
import type { MetricsSummary } from '../types';

export function useMetrics(refreshInterval = 5000) {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchMetrics = async () => {
      try {
        const data = await adminApi.getMetricsSummary();
        if (mounted) {
          setMetrics(data);
          setError(null);
          setLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Failed to fetch metrics');
          setLoading(false);
        }
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, refreshInterval);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [refreshInterval]);

  return { metrics, error, loading };
}
