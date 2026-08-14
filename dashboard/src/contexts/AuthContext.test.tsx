import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { adminApi } from '../api/admin';
import { refreshAccessToken } from '../api/client';
import { clearAccessToken, getAccessToken } from '../auth/tokenStore';

vi.mock('../api/admin', () => ({ adminApi: { logout: vi.fn() } }));
vi.mock('../api/client', () => ({ refreshAccessToken: vi.fn() }));

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="state">{auth.isLoading ? 'loading' : auth.isAuthenticated ? 'authenticated' : 'anonymous'}</span>
      <button onClick={() => auth.login('new-login-token')}>Login</button>
      <button onClick={() => void auth.logout()}>Logout</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <MemoryRouter>
      <AuthProvider><Probe /></AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  act(() => clearAccessToken());
  vi.mocked(adminApi.logout).mockReset();
  vi.mocked(refreshAccessToken).mockReset();
});

describe('AuthProvider session bootstrap', () => {
  it('starts loading and restores authentication from refresh', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValue('restored');
    renderProvider();
    expect(screen.getByTestId('state')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated'));
  });

  it('resolves stale/missing refresh state to anonymous', async () => {
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error('no session'));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('anonymous'));
  });

  it('keeps a new login in memory and asynchronously revokes logout', async () => {
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error('no session'));
    vi.mocked(adminApi.logout).mockResolvedValue();
    const user = userEvent.setup();
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('anonymous'));

    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(getAccessToken()).toBe('new-login-token');
    expect(screen.getByTestId('state')).toHaveTextContent('authenticated');

    await user.click(screen.getByRole('button', { name: 'Logout' }));
    await waitFor(() => expect(adminApi.logout).toHaveBeenCalledOnce());
    expect(getAccessToken()).toBeNull();
    expect(screen.getByTestId('state')).toHaveTextContent('anonymous');
  });
});
