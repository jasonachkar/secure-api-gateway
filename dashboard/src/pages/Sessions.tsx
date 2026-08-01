/**
 * Active sessions page
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { TokenLifecycleDiagram } from '../components/TokenLifecycleDiagram';
import { PageLoadingSkeleton } from '../components/PageLoadingSkeleton';
import { useCountdown } from '../hooks/useCountdown';
import { useToast } from '../contexts/ToastContext';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import { useAuth } from '../contexts/AuthContext';
import type { SessionInfo } from '../types';

export function Sessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<SessionInfo | null>(null);
  const [bulkRevokeUser, setBulkRevokeUser] = useState('');
  const [confirmBulkRevoke, setConfirmBulkRevoke] = useState(false);
  const { logout } = useAuth();
  const { showToast } = useToast();
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
      setError(getErrorMessage(err, 'Failed to fetch sessions'));
    } finally {
      setLoading(false);
    }
  };

  const sessionsByUser = useMemo(() => {
    const map = new Map<string, SessionInfo[]>();
    for (const session of sessions) {
      const list = map.get(session.username) ?? [];
      list.push(session);
      map.set(session.username, list);
    }
    return map;
  }, [sessions]);

  const concurrentUsers = useMemo(
    () => Array.from(sessionsByUser.entries()).filter(([, list]) => list.length > 1),
    [sessionsByUser]
  );

  const usernames = useMemo(() => Array.from(sessionsByUser.keys()).sort(), [sessionsByUser]);

  const isOwnSession = (jti: string): boolean => {
    const token = localStorage.getItem('accessToken');
    if (!token) return false;
    try {
      const decoded = jwtDecode<{ jti: string }>(token);
      return decoded.jti === jti;
    } catch {
      return false;
    }
  };

  const performRevoke = async (jti: string) => {
    const ownSession = isOwnSession(jti);
    await adminApi.revokeSession(jti);
    if (ownSession) {
      logout();
      navigate('/login', { replace: true });
    } else {
      await fetchSessions();
      showToast('Session revoked successfully', 'success');
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const jti = revokeTarget.jti;
    setRevokeTarget(null);
    try {
      await performRevoke(jti);
    } catch (err: any) {
      showToast('Failed to revoke session: ' + getErrorMessage(err, 'unknown error'), 'error');
    }
  };

  const handleBulkRevoke = async () => {
    setConfirmBulkRevoke(false);
    const targets = sessionsByUser.get(bulkRevokeUser) ?? [];
    if (targets.length === 0) return;

    const includesOwnSession = targets.some((s) => isOwnSession(s.jti));

    try {
      await Promise.all(targets.map((s) => adminApi.revokeSession(s.jti)));
      if (includesOwnSession) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      await fetchSessions();
      showToast(`Revoked all ${targets.length} session(s) for ${bulkRevokeUser}`, 'success');
    } catch (err: any) {
      showToast('Failed to revoke all sessions: ' + getErrorMessage(err, 'unknown error'), 'error');
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

        <Card>
          <div className="section-title">Token Lifecycle</div>
          <p className="section-subtitle" style={{ marginBottom: 'var(--space-md)' }}>
            How every session on this page came to exist, and how it ends.
          </p>
          <TokenLifecycleDiagram />
        </Card>

        {loading && <PageLoadingSkeleton cardCount={2} showMetrics={false} />}

        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && concurrentUsers.length > 0 && (
          <div className="alert alert--warning" role="alert">
            <strong>Concurrent sessions detected:</strong>{' '}
            {concurrentUsers.map(([username, list]) => `${username} (${list.length})`).join(', ')}. Multiple active
            sessions for the same account are highlighted below.
          </div>
        )}

        {!loading && !error && usernames.length > 0 && (
          <Card>
            <div className="card-header">
              <div>
                <div className="section-title">Bulk Session Management</div>
                <div className="section-subtitle">Revoke every active session belonging to one user at once.</div>
              </div>
            </div>
            <div className="action-row">
              <select
                className="form-control"
                value={bulkRevokeUser}
                onChange={(e) => setBulkRevokeUser(e.target.value)}
                aria-label="Select a user to bulk-revoke sessions for"
                style={{ maxWidth: '240px' }}
              >
                <option value="">Select a user…</option>
                {usernames.map((username) => (
                  <option key={username} value={username}>
                    {username} ({sessionsByUser.get(username)?.length} session
                    {(sessionsByUser.get(username)?.length ?? 0) !== 1 ? 's' : ''})
                  </option>
                ))}
              </select>
              <Button
                variant="danger"
                disabled={!bulkRevokeUser}
                onClick={() => setConfirmBulkRevoke(true)}
              >
                Revoke All Sessions
              </Button>
            </div>
          </Card>
        )}

        {!loading && !error && (
          <div className="page-stack">
            {sessions.length === 0 && <Card className="empty-state">No active sessions</Card>}

            {sessions.map((session) => (
              <SessionCard
                key={session.jti}
                session={session}
                isConcurrent={(sessionsByUser.get(session.username)?.length ?? 0) > 1}
                onRevoke={() => setRevokeTarget(session)}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={revokeTarget !== null}
        title="Revoke session"
        message={
          revokeTarget && isOwnSession(revokeTarget.jti)
            ? 'WARNING: You are about to revoke your own session. You will be logged out. Continue?'
            : 'Are you sure you want to revoke this session?'
        }
        confirmLabel="Revoke"
        confirmVariant="danger"
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />

      <ConfirmModal
        isOpen={confirmBulkRevoke}
        title="Revoke all sessions"
        message={`Revoke all ${sessionsByUser.get(bulkRevokeUser)?.length ?? 0} active session(s) for ${bulkRevokeUser}? This cannot be undone.`}
        confirmLabel="Revoke All"
        confirmVariant="danger"
        onConfirm={handleBulkRevoke}
        onCancel={() => setConfirmBulkRevoke(false)}
      />
    </Layout>
  );
}

function SessionCard({
  session,
  isConcurrent,
  onRevoke,
}: {
  session: SessionInfo;
  isConcurrent: boolean;
  onRevoke: () => void;
}) {
  const countdown = useCountdown(session.expiresAt);
  const cardClass = ['session-card', isConcurrent ? 'session-card--concurrent' : null].filter(Boolean).join(' ');

  return (
    <Card className={cardClass}>
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
          <div className="threat-card__meta-label">Issued</div>
          <div className="text-sm">{format(new Date(session.createdAt), 'MMM dd, HH:mm:ss')}</div>
        </div>

        <div>
          <div className="threat-card__meta-label">Expires In</div>
          <div className={`text-sm text-mono ${countdown.expired ? 'text-danger' : ''}`}>{countdown.label}</div>
        </div>

        <div>
          <div className="threat-card__meta-label">Token Rotations</div>
          <div className="text-sm text-mono">{session.rotationCount}</div>
        </div>

        <div>
          <div className="threat-card__meta-label">Session ID</div>
          <div className="text-xs text-mono text-muted">{session.jti.substring(0, 16)}...</div>
        </div>
      </div>

      <div className="session-card__flags">
        {isConcurrent && (
          <Badge className="badge-medium">
            <AlertTriangle size={11} aria-hidden="true" /> Concurrent session
          </Badge>
        )}
        {session.ipChangedAtLastRotation && (
          <Badge className="badge-critical">
            <AlertTriangle size={11} aria-hidden="true" /> IP Change Detected
          </Badge>
        )}
      </div>

      <Button variant="danger" size="sm" className="button-nowrap" onClick={onRevoke}>
        Revoke
      </Button>
    </Card>
  );
}
