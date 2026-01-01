/**
 * Server-Sent Events hook for real-time metrics
 */

import { useEffect, useState, useRef } from 'react';

interface UseSSEOptions {
  url: string;
  enabled?: boolean;
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
}

export function useSSE<T = any>({ url, enabled = true, onMessage, onError }: UseSSEOptions) {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Get token from localStorage
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setError('No access token found');
      return;
    }

    // Create SSE connection with token in query params
    // (EventSource doesn't support custom headers)
    const urlWithToken = `${url}?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(urlWithToken);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        // Skip heartbeat messages
        if (event.data.trim() === ': heartbeat' || event.data.startsWith(':')) {
          return;
        }

        const parsedData = JSON.parse(event.data);
        
        // Skip connection messages, only process actual metrics
        if (parsedData.type === 'connected') {
          setIsConnected(true);
          return;
        }

        // Only set data if it has actual metrics (not just connection messages)
        if (parsedData.requestsPerSecond !== undefined || parsedData.timestamp) {
          setData(parsedData);
          onMessage?.(parsedData);
        }
      } catch (err) {
        console.error('Failed to parse SSE data:', err, event.data);
      }
    };

    eventSource.onerror = (event) => {
      // Only set error if connection is actually closed
      if (eventSource.readyState === EventSource.CLOSED) {
        setIsConnected(false);
        setError('Connection lost');
        onError?.(event);
        eventSource.close();
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        // Still connecting, don't show error yet
        setIsConnected(false);
      } else {
        // Connection open, might be temporary network issue
        // EventSource will auto-reconnect
      }
    };

    // Cleanup on unmount
    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [url, enabled, onMessage, onError]);

  const reconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    // Force re-render to trigger useEffect
    setIsConnected(false);
  };

  return {
    data,
    isConnected,
    error,
    reconnect
  };
}
