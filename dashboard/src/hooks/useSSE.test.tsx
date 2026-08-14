import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSSE } from './useSSE';
import { setAccessToken } from '../auth/tokenStore';
import { refreshAccessToken } from '../api/client';

vi.mock('../api/client', () => ({ refreshAccessToken: vi.fn() }));

function Probe() {
  const { data, isConnected } = useSSE<{ timestamp: number }>({ url: 'https://api.example.com/events' });
  return <div>{isConnected ? data?.timestamp ?? 'connected' : 'disconnected'}</div>;
}

beforeEach(() => {
  setAccessToken('memory-sse-token');
  vi.mocked(refreshAccessToken).mockReset();
  vi.restoreAllMocks();
});

describe('authenticated SSE transport', () => {
  it('uses an Authorization header and never puts the token in the URL', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"timestamp":123}\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    );

    render(<Probe />);
    await waitFor(() => expect(screen.getByText('123')).toBeVisible());
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/events',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer memory-sse-token' }),
      })
    );
    expect(fetchMock.mock.calls[0][0]).not.toContain('token=');
  });

  it('performs one shared refresh after a stream 401 and retries once', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValue('renewed');
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"timestamp":456}\n\n'));
        controller.close();
      },
    });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(stream, { status: 200 }));

    render(<Probe />);
    await waitFor(() => expect(screen.getByText('456')).toBeVisible());
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
