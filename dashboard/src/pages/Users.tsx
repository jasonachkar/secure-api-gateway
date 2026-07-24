/**
 * Users management page
 */

import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { PageLoadingSkeleton } from '../components/PageLoadingSkeleton';
import { useToast } from '../contexts/ToastContext';
import { adminApi } from '../api/admin';
import type { UserInfo } from '../types';

export function Users() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingUnlock, setPendingUnlock] = useState<{ userId: string; username: string } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await adminApi.getUsers();
      setUsers(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!pendingUnlock) return;
    const { userId, username } = pendingUnlock;
    setPendingUnlock(null);

    try {
      await adminApi.unlockUser(userId);
      await fetchUsers();
      showToast(`${username}'s account has been unlocked`, 'success');
    } catch (err: any) {
      showToast('Failed to unlock user: ' + err.message, 'error');
    }
  };

  return (
    <Layout>
      <div className="page-stack">
        <SectionHeader
          title="User Management"
          subtitle={`${users.length} user${users.length !== 1 ? 's' : ''}`}
          actions={<Button onClick={fetchUsers}>Refresh</Button>}
        />

        {loading && <PageLoadingSkeleton cardCount={2} showMetrics={false} />}

        {error && <div className="alert alert--danger">{error}</div>}

        {!loading && !error && (
          <div className="page-stack">
            {users.map((user) => {
              const cardClass = ['user-card', user.lockout?.isLocked ? 'user-card--locked' : null]
                .filter(Boolean)
                .join(' ');

              return (
                <Card key={user.userId} className={cardClass}>
                  <div className="threat-card__header">
                    <div className="threat-card__identity">
                      <div className="section-title">{user.username}</div>
                      {user.lockout?.isLocked && <Badge className="badge-critical">🔒 LOCKED</Badge>}
                    </div>
                    {user.lockout?.isLocked && (
                      <Button
                        variant="success"
                        size="sm"
                        className="button-nowrap"
                        onClick={() => setPendingUnlock({ userId: user.userId, username: user.username })}
                      >
                        Unlock Account
                      </Button>
                    )}
                  </div>

                  <div className="user-card__meta-grid">
                    <div>
                      <div className="threat-card__meta-label">User ID</div>
                      <div className="text-mono">{user.userId}</div>
                    </div>

                    <div>
                      <div className="threat-card__meta-label">Roles</div>
                      <div className="tag-group">
                        {user.roles.map((role) => (
                          <Badge key={role} variant="info">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {user.lockout && (
                      <div>
                        <div className="threat-card__meta-label">Failed Login Attempts</div>
                        <div className={`threat-card__meta-value ${user.lockout.attempts > 0 ? 'text-danger' : 'text-success'}`}>
                          {user.lockout.attempts}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="threat-card__meta-label">Permissions</div>
                    <div className="tag-group">
                      {user.permissions.map((perm) => (
                        <Badge key={perm} variant="neutral" className="text-mono">
                          {perm}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={pendingUnlock !== null}
        title="Unlock account"
        message={pendingUnlock ? `Unlock account for ${pendingUnlock.username}?` : ''}
        confirmLabel="Unlock"
        confirmVariant="success"
        onConfirm={handleUnlock}
        onCancel={() => setPendingUnlock(null)}
      />
    </Layout>
  );
}
