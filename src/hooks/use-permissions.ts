'use client';

import { useEffect, useState, useCallback } from 'react';
import { authClient } from '@/lib/auth/client';

interface PermissionsData {
  permissions: string[];
  roles: string[];
}

interface UsePermissionsReturn {
  permissions: string[];
  roles: string[];
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  hasRole: (role: string) => boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to access and check user permissions
 * Fetches permissions from /api/me/permissions
 */
export function usePermissions(): UsePermissionsReturn {
  const { data: session } = authClient.useSession();
  const [permissionsData, setPermissionsData] = useState<PermissionsData>({
    permissions: [],
    roles: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPermissions = useCallback(async () => {
    if (!session?.user) {
      setPermissionsData({ permissions: [], roles: [] });
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/me/permissions');

      if (!response.ok) {
        if (response.status === 401) {
          // User is not authenticated
          setPermissionsData({ permissions: [], roles: [] });
          return;
        }
        throw new Error(`Failed to fetch permissions: ${response.statusText}`);
      }

      const data: PermissionsData = await response.json();
      setPermissionsData(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      console.error('Error fetching permissions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  /**
   * Check if the user has a specific permission
   */
  const hasPermission = useCallback(
    (permission: string): boolean => {
      return permissionsData.permissions.includes(permission);
    },
    [permissionsData.permissions]
  );

  /**
   * Check if the user has any of the specified permissions
   */
  const hasAnyPermission = useCallback(
    (permissions: string[]): boolean => {
      return permissions.some((permission) =>
        permissionsData.permissions.includes(permission)
      );
    },
    [permissionsData.permissions]
  );

  /**
   * Check if the user has all of the specified permissions
   */
  const hasAllPermissions = useCallback(
    (permissions: string[]): boolean => {
      return permissions.every((permission) =>
        permissionsData.permissions.includes(permission)
      );
    },
    [permissionsData.permissions]
  );

  /**
   * Check if the user has a specific role
   */
  const hasRole = useCallback(
    (role: string): boolean => {
      return permissionsData.roles.includes(role);
    },
    [permissionsData.roles]
  );

  return {
    permissions: permissionsData.permissions,
    roles: permissionsData.roles,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    isLoading,
    error,
    refetch: fetchPermissions,
  };
}
