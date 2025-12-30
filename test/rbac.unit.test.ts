/**
 * RBAC Unit Tests
 * Tests role and permission checking logic
 */

import { describe, it, expect } from '@jest/globals';
import {
  hasRole,
  hasAnyRole,
  hasAllRoles,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from '../src/middleware/rbac.js';
import { AuthUser } from '../src/types/index.js';

describe('RBAC - Role Checks', () => {
  // Arrange: Create test user
  const user: AuthUser = {
    userId: 'user-1',
    username: 'testuser',
    roles: ['admin', 'user'],
    permissions: ['read:reports', 'write:reports', 'manage:users'],
  };

  describe('hasRole', () => {
    it('should return true when user has the role', () => {
      // Act & Assert
      expect(hasRole(user, 'admin')).toBe(true);
      expect(hasRole(user, 'user')).toBe(true);
    });

    it('should return false when user does not have the role', () => {
      // Act & Assert
      expect(hasRole(user, 'superadmin')).toBe(false);
      expect(hasRole(user, 'guest')).toBe(false);
    });
  });

  describe('hasAnyRole', () => {
    it('should return true when user has at least one role', () => {
      // Act & Assert
      expect(hasAnyRole(user, ['admin', 'superadmin'])).toBe(true);
      expect(hasAnyRole(user, ['guest', 'user'])).toBe(true);
    });

    it('should return false when user has none of the roles', () => {
      // Act & Assert
      expect(hasAnyRole(user, ['superadmin', 'guest'])).toBe(false);
    });
  });

  describe('hasAllRoles', () => {
    it('should return true when user has all required roles', () => {
      // Act & Assert
      expect(hasAllRoles(user, ['admin', 'user'])).toBe(true);
      expect(hasAllRoles(user, ['admin'])).toBe(true);
    });

    it('should return false when user is missing any role', () => {
      // Act & Assert
      expect(hasAllRoles(user, ['admin', 'user', 'superadmin'])).toBe(false);
    });
  });
});

describe('RBAC - Permission Checks', () => {
  const user: AuthUser = {
    userId: 'user-1',
    username: 'testuser',
    roles: ['user'],
    permissions: ['read:reports', 'write:reports', 'manage:users'],
  };

  describe('hasPermission', () => {
    it('should return true when user has the permission', () => {
      // Act & Assert
      expect(hasPermission(user, 'read:reports')).toBe(true);
      expect(hasPermission(user, 'write:reports')).toBe(true);
      expect(hasPermission(user, 'manage:users')).toBe(true);
    });

    it('should return false when user does not have the permission', () => {
      // Act & Assert
      expect(hasPermission(user, 'delete:reports')).toBe(false);
      expect(hasPermission(user, 'read:admin')).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true when user has at least one permission', () => {
      // Act & Assert
      expect(hasAnyPermission(user, ['read:reports', 'read:admin'])).toBe(true);
      expect(hasAnyPermission(user, ['delete:reports', 'write:reports'])).toBe(true);
    });

    it('should return false when user has none of the permissions', () => {
      // Act & Assert
      expect(hasAnyPermission(user, ['delete:reports', 'read:admin'])).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true when user has all required permissions', () => {
      // Act & Assert
      expect(hasAllPermissions(user, ['read:reports', 'write:reports'])).toBe(true);
      expect(hasAllPermissions(user, ['read:reports'])).toBe(true);
    });

    it('should return false when user is missing any permission', () => {
      // Act & Assert
      expect(hasAllPermissions(user, ['read:reports', 'delete:reports'])).toBe(false);
    });
  });
});
