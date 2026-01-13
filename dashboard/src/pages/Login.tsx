/**
 * Login page
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/admin';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/Button';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('Attempting login with:', { username });
      const response = await adminApi.login({ username, password });
      console.log('Login successful, response:', response);
      login(response.accessToken);
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Login error:', err);
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText,
        config: err.config,
      });

      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        'Login failed. Please check your credentials.';

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-card__title">🔒 Security Dashboard</h1>
          <p className="auth-card__subtitle">Sign in to access the admin panel</p>

          <form onSubmit={handleSubmit} className="page-stack">
            <div className="form-field">
              <label className="form-label">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="form-control"
                placeholder="admin"
              />
            </div>

            <div className="form-field">
              <label className="form-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="form-control"
                placeholder="••••••••"
              />
            </div>

            {error && <div className="alert alert--danger">{error}</div>}

            <Button type="submit" disabled={loading} isLoading={loading} className="button-full">
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="auth-help">
            <strong>Demo credentials:</strong>
            <br />
            admin / Admin123!
            <br />
            user / User123!
          </div>
        </div>
      </div>
    </div>
  );
}
