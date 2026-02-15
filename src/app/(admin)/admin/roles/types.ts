// =============================================================================
// TYPES FOR ROLE MANAGEMENT
// =============================================================================

export interface UserWithRoles {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
  createdAt: Date;
  roles: {
    id: string;
    roleId: string;
    assignedAt: Date;
    role: {
      id: string;
      name: string;
      displayName: string;
      description: string | null;
      type: string;
    };
  }[];
  member: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  type: string;
  permissions: {
    id: string;
    permission: {
      id: string;
      name: string;
      resource: string;
      action: string;
      description: string | null;
    };
  }[];
  _count?: {
    users: number;
  };
}

// Permission constant for user management
export const ADMIN_USERS_MANAGE = 'admin.users.manage';
