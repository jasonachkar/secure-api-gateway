/**
 * Active sessions page
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { Layout } from '../components/Layout';
import { adminApi } from '../api/admin';
import { useAuth } from '../contexts/AuthContext';
import type { SessionInfo } from '../types';
import { format } from 'date-fns';

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
    // Detect if revoking own session
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
        // Logout and redirect to login page
        logout();
        navigate('/login', { replace: true });
      } else {
        // Just refresh the sessions list
        await fetchSessions();
        alert('Session revoked successfully');
      }
    } catch (err: any) {
      alert('Failed to revoke session: ' + err.message);
    }
  };

  return (
    <Layout>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '10px' }}>
              Active Sessions
            </h1>
            <p style={{ color: '#64748b' }}>
              {sessions.length} active session{sessions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={fetchSessions}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Refresh
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            Loading sessions...
          </div>
        )}

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <div style={{ display: 'grid', gap: '15px' }}>
            {sessions.map((session) => (
              <div
                key={session.jti}
                style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '20px',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                      User
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '600' }}>
                      {session.username}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                      ID: {session.userId}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                      Roles
                    </div>
                    <div>
                      {session.roles.map(role => (
                        <span
                          key={role}
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            marginRight: '4px',
                            backgroundColor: '#dbeafe',
                            color: '#1e40af',
                            fontSize: '12px',
                            borderRadius: '4px',
                            fontWeight: '500'
                          }}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                      Created
                    </div>
                    <div style={{ fontSize: '14px' }}>
                      {format(new Date(session.createdAt), 'MMM dd, HH:mm:ss')}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                      Expires
                    </div>
                    <div style={{ fontSize: '14px' }}>
                      {format(new Date(session.expiresAt), 'MMM dd, HH:mm:ss')}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                      Session ID
                    </div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#64748b' }}>
                      {session.jti.substring(0, 16)}...
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleRevoke(session.jti)}
                  style={{
                    backgroundColor: '#ef4444',
                    color: 'white',
                    padding: '10px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Revoke
                </button>
              </div>
            ))}

            {sessions.length === 0 && (
              <div style={{
                backgroundColor: 'white',
                padding: '40px',
                borderRadius: '8px',
                textAlign: 'center',
                color: '#94a3b8'
              }}>
                No active sessions
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
