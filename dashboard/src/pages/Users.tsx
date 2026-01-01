/**
 * Users management page
 */

import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { adminApi } from '../api/admin';
import type { UserInfo } from '../types';

export function Users() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const handleUnlock = async (userId: string, username: string) => {
    if (!confirm(`Unlock account for ${username}?`)) {
      return;
    }

    try {
      await adminApi.unlockUser(userId);
      await fetchUsers();
      alert('User unlocked successfully');
    } catch (err: any) {
      alert('Failed to unlock user: ' + err.message);
    }
  };

  return (
    <Layout>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '10px' }}>
              User Management
            </h1>
            <p style={{ color: '#64748b' }}>
              {users.length} user{users.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={fetchUsers}
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
            Loading users...
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
            {users.map((user) => (
              <div
                key={user.userId}
                style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  border: user.lockout?.isLocked ? '2px solid #ef4444' : '1px solid #e2e8f0'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', alignItems: 'start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '600' }}>
                        {user.username}
                      </h3>
                      {user.lockout?.isLocked && (
                        <span style={{
                          padding: '4px 8px',
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          fontSize: '12px',
                          borderRadius: '4px',
                          fontWeight: '600'
                        }}>
                          🔒 LOCKED
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                          User ID
                        </div>
                        <div style={{ fontSize: '14px', fontFamily: 'monospace' }}>
                          {user.userId}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                          Roles
                        </div>
                        <div>
                          {user.roles.map(role => (
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

                      {user.lockout && (
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                            Failed Login Attempts
                          </div>
                          <div style={{
                            fontSize: '18px',
                            fontWeight: '600',
                            color: user.lockout.attempts > 0 ? '#ef4444' : '#22c55e'
                          }}>
                            {user.lockout.attempts}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                        Permissions
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {user.permissions.map(perm => (
                          <span
                            key={perm}
                            style={{
                              padding: '3px 8px',
                              backgroundColor: '#f1f5f9',
                              color: '#475569',
                              fontSize: '12px',
                              borderRadius: '4px',
                              fontFamily: 'monospace'
                            }}
                          >
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    {user.lockout?.isLocked && (
                      <button
                        onClick={() => handleUnlock(user.userId, user.username)}
                        style={{
                          backgroundColor: '#22c55e',
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
                        Unlock Account
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
