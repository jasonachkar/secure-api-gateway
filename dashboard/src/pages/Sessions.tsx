/**
 * Active sessions page
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { format } from 'date-fns';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { adminApi } from '../api/admin';
import { useAuth } from '../contexts/AuthContext';
import type { SessionInfo } from '../types';

export function Sessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const data = await adminApi.getActiveSessions();
      setSessions(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (jti: string) => {
    const token = localStorage.getItem('accessToken');
    let isOwnSession = false;

    if (token) {
      try {
        const decoded = jwtDecode<{ jti: string }>(token);
        isOwnSession = decoded.jti === jti;
      } catch {
        // Ignore decode errors
      }
    }

    const confirmMessage = isOwnSession
      ? 'WARNING: You are about to revoke your own session. You will be logged out. Continue?'
      : 'Are you sure you want to revoke this session?';

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      await adminApi.revokeSession(jti);

      if (isOwnSession) {
        logout();
        navigate('/login', { replace: true });
      } else {
        await fetchSessions();
        alert('Session revoked successfully');
      }
    } catch (err: any) {
      alert('Failed to revoke session: ' + err.message);
    }
  };

  return (
    <Layout>
      <div className="page-stack">
        <SectionHeader
          title="Active Sessions"
          subtitle={`${sessions.length} active session${sessions.length !== 1 ? 's' : ''}`}
          actions={<Button onClick={fetchSessions}>Refresh</Button>}
        />

        {loading && <div className="empty-state">Loading sessions...</div>}

        {error && <div className="alert alert--danger">{error}</div>}

        {!loading && !error && (
          <div className="page-stack">
            {sessions.length === 0 && <Card className="empty-state">No active sessions</Card>}

            {sessions.map((session) => (
              <Card key={session.jti} className="session-card">
                <div className="session-card__meta-grid">
                  <div>
                    <div className="threat-card__meta-label">User</div>
                    <div className="section-title">{session.username}</div>
                    <div className="text-xs text-muted">ID: {session.userId}</div>
                  </div>

                  <div>
                    <div className="threat-card__meta-label">Roles</div>
                    <div className="tag-group">
                      {session.roles.map((role) => (
                        <Badge key={role} variant="info">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="threat-card__meta-label">Created</div>
                    <div className="text-sm">{format(new Date(session.createdAt), 'MMM dd, HH:mm:ss')}</div>
                  </div>

                  <div>
                    <div className="threat-card__meta-label">Expires</div>
                    <div className="text-sm">{format(new Date(session.expiresAt), 'MMM dd, HH:mm:ss')}</div>
                  </div>

                  <div>
                    <div className="threat-card__meta-label">Session ID</div>
                    <div className="text-xs text-mono text-muted">{session.jti.substring(0, 16)}...</div>
                  </div>
                </div>

                <Button
                  variant="danger"
                  size="sm"
                  className="button-nowrap"
                  onClick={() => handleRevoke(session.jti)}
                >
                  Revoke
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
