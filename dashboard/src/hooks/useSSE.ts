import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../auth/tokenStore';
import { refreshAccessToken } from '../api/client';

interface UseSSEOptions<T> {
  url: string;
  enabled?: boolean;
  onMessage?: (data: T) => void;
  onError?: (error: Error) => void;
}

async function openAuthenticatedStream(url: string, signal: AbortSignal, retried = false): Promise<Response> {
  const token = getAccessToken();
  if (!token) throw new Error('Authentication required');

  const response = await fetch(url, {
    headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
    signal,
  });

  if (response.status === 401 && !retried) {
    await refreshAccessToken();
    return openAuthenticatedStream(url, signal, true);
  }
  if (!response.ok || !response.body) throw new Error(`Event stream failed (${response.status})`);
  return response;
}

export function useSSE<T = unknown>({ url, enabled = true, onMessage, onError }: UseSSEOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const callbacks = useRef({ onMessage, onError });
  callbacks.current = { onMessage, onError };

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    const consume = async () => {
      try {
        const response = await openAuthenticatedStream(url, controller.signal);
        setIsConnected(true);
        setError(null);
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';
          for (const event of events) {
            const payload = event
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trimStart())
              .join('\n');
            if (!payload) continue;
            const parsed = JSON.parse(payload) as T & { type?: string };
            if (parsed.type === 'connected') continue;
            setData(parsed);
            callbacks.current.onMessage?.(parsed);
          }
        }
      } catch (streamError) {
        if (controller.signal.aborted) return;
        const safeError = streamError instanceof Error ? streamError : new Error('Connection lost');
        setIsConnected(false);
        setError('Connection lost');
        callbacks.current.onError?.(safeError);
      }
    };

    void consume();
    return () => controller.abort();
  }, [url, enabled, generation]);

  const reconnect = useCallback(() => {
    setIsConnected(false);
    setGeneration((value) => value + 1);
  }, []);

  return { data, isConnected, error, reconnect };
}
