/**
 * Test Database Setup
 * 
 * Provides utilities for setting up and tearing down test database state.
 * Uses transactions for isolation between tests.
 */

import { vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

// =============================================================================
// Test Database Configuration
// =============================================================================

// Singleton Prisma client for tests
let prisma: PrismaClient | null = null;

/**
 * Get the Prisma client for testing
 */
export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL,
    });
  }
  return prisma;
}

/**
 * Disconnect the Prisma client
 */
export async function disconnectTestPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

// =============================================================================
// Test Data Seeding
// =============================================================================

export interface TestSeedData {
  users: Array<{
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
  }>;
  members: Array<{
    id: string;
    userId: string;
    firstName: string;
    lastName: string;
    status: string;
  }>;
  roles: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  permissions: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  events: Array<{
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    eventType: string;
    status: string;
  }>;
  musicPieces: Array<{
    id: string;
    title: string;
    composer: string;
    status: string;
  }>;
}

/**
 * Default test seed data
 */
export const defaultTestSeedData: TestSeedData = {
  users: [
    {
      id: 'test-user-admin',
      email: 'admin@test.com',
      name: 'Admin User',
      emailVerified: true,
    },
    {
      id: 'test-user-member',
      email: 'member@test.com',
      name: 'Regular Member',
      emailVerified: true,
    },
    {
      id: 'test-user-librarian',
      email: 'librarian@test.com',
      name: 'Librarian User',
      emailVerified: true,
    },
  ],
  members: [
    {
      id: 'test-member-admin',
      userId: 'test-user-admin',
      firstName: 'Admin',
      lastName: 'User',
      status: 'ACTIVE',
    },
    {
      id: 'test-member-regular',
      userId: 'test-user-member',
      firstName: 'Regular',
      lastName: 'Member',
      status: 'ACTIVE',
    },
    {
      id: 'test-member-librarian',
      userId: 'test-user-librarian',
      firstName: 'Librarian',
      lastName: 'User',
      status: 'ACTIVE',
    },
  ],
  roles: [
    {
      id: 'test-role-admin',
      name: 'ADMIN',
      description: 'Administrator role',
    },
    {
      id: 'test-role-member',
      name: 'MEMBER',
      description: 'Standard member role',
    },
    {
      id: 'test-role-librarian',
      name: 'LIBRARIAN',
      description: 'Librarian role',
    },
  ],
  permissions: [
    {
      id: 'test-perm-music-view-all',
      name: 'music.view.all',
      description: 'View all music',
    },
    {
      id: 'test-perm-music-view-assigned',
      name: 'music.view.assigned',
      description: 'View assigned music',
    },
    {
      id: 'test-perm-music-download-all',
      name: 'music.download.all',
      description: 'Download all music',
    },
    {
      id: 'test-perm-music-download-assigned',
      name: 'music.download.assigned',
      description: 'Download assigned music',
    },
    {
      id: 'test-perm-member-view-all',
      name: 'member.view.all',
      description: 'View all members',
    },
    {
      id: 'test-perm-event-create',
      name: 'event.create',
      description: 'Create events',
    },
  ],
  events: [
    {
      id: 'test-event-rehearsal',
      title: 'Test Rehearsal',
      startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
      eventType: 'REHEARSAL',
      status: 'SCHEDULED',
    },
    {
      id: 'test-event-concert',
      title: 'Test Concert',
      startTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
      eventType: 'CONCERT',
      status: 'SCHEDULED',
    },
  ],
  musicPieces: [
    {
      id: 'test-music-1',
      title: 'Test Symphony',
      composer: 'Test Composer',
      status: 'ACTIVE',
    },
    {
      id: 'test-music-2',
      title: 'Test March',
      composer: 'Another Composer',
      status: 'ACTIVE',
    },
  ],
};

// =============================================================================
// Mock Database for Unit Tests
// =============================================================================

/**
 * Create a fully mocked database for unit tests
 * This avoids needing a real database connection
 */
export function createMockDatabase() {
  const data = {
    users: new Map<string, TestSeedData['users'][0]>(),
    members: new Map<string, TestSeedData['members'][0]>(),
    roles: new Map<string, TestSeedData['roles'][0]>(),
    permissions: new Map<string, TestSeedData['permissions'][0]>(),
    userRoles: new Map<string, { userId: string; roleId: string }>(),
    rolePermissions: new Map<string, { roleId: string; permissionId: string }>(),
    events: new Map<string, TestSeedData['events'][0]>(),
    musicPieces: new Map<string, TestSeedData['musicPieces'][0]>(),
    musicFiles: new Map<string, { id: string; pieceId: string; storageKey: string }>(),
    musicAssignments: new Map<string, { pieceId: string; memberId: string }>(),
    attendance: new Map<string, { eventId: string; memberId: string; status: string }>(),
  };

  return {
    data,
    
    // User operations
    user: {
      findUnique: vi.fn(({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) {
          return Promise.resolve(data.users.get(where.id) || null);
        }
        if (where.email) {
          for (const user of data.users.values()) {
            if (user.email === where.email) {
              return Promise.resolve(user);
            }
          }
        }
        return Promise.resolve(null);
      }),
      create: vi.fn(({ data: userData }: { data: TestSeedData['users'][0] }) => {
        data.users.set(userData.id, userData);
        return Promise.resolve(userData);
      }),
    },
    
    // Member operations
    member: {
      findUnique: vi.fn(({ where }: { where: { id?: string; userId?: string } }) => {
        if (where.id) {
          return Promise.resolve(data.members.get(where.id) || null);
        }
        if (where.userId) {
          for (const member of data.members.values()) {
            if (member.userId === where.userId) {
              return Promise.resolve(member);
            }
          }
        }
        return Promise.resolve(null);
      }),
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        for (const member of data.members.values()) {
          let matches = true;
          for (const [key, value] of Object.entries(where)) {
            if (member[key as keyof typeof member] !== value) {
              matches = false;
              break;
            }
          }
          if (matches) return Promise.resolve(member);
        }
        return Promise.resolve(null);
      }),
    },
    
    // Role operations
    role: {
      findUnique: vi.fn(({ where }: { where: { id?: string; name?: string } }) => {
        if (where.id) {
          return Promise.resolve(data.roles.get(where.id) || null);
        }
        if (where.name) {
          for (const role of data.roles.values()) {
            if (role.name === where.name) {
              return Promise.resolve(role);
            }
          }
        }
        return Promise.resolve(null);
      }),
    },
    
    // User-Role operations
    userRole: {
      findMany: vi.fn(({ where, include }: { where?: { userId?: string }; include?: Record<string, boolean> }) => {
        const results: Array<Record<string, unknown>> = [];
        
        for (const [id, ur] of data.userRoles.entries()) {
          if (!where || !where.userId || ur.userId === where.userId) {
            const role = data.roles.get(ur.roleId);
            const rolePerms = include?.role?.include?.permissions
              ? Array.from(data.rolePermissions.values())
                  .filter(rp => rp.roleId === ur.roleId)
                  .map(rp => ({
                    permission: data.permissions.get(rp.permissionId),
                  }))
              : [];
            
            results.push({
              id,
              userId: ur.userId,
              roleId: ur.roleId,
              role: include?.role
                ? {
                    ...role,
                    permissions: rolePerms,
                  }
                : undefined,
            });
          }
        }
        
        return Promise.resolve(results);
      }),
    },
    
    // Permission operations
    permission: {
      findUnique: vi.fn(({ where }: { where: { id?: string; name?: string } }) => {
        if (where.id) {
          return Promise.resolve(data.permissions.get(where.id) || null);
        }
        if (where.name) {
          for (const perm of data.permissions.values()) {
            if (perm.name === where.name) {
              return Promise.resolve(perm);
            }
          }
        }
        return Promise.resolve(null);
      }),
    },
    
    // Event operations
    event: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) => {
        return Promise.resolve(data.events.get(where.id) || null);
      }),
      findMany: vi.fn(() => {
        return Promise.resolve(Array.from(data.events.values()));
      }),
    },
    
    // Attendance operations
    attendance: {
      upsert: vi.fn(({ where, create, update }: { 
        where: { eventId_memberId: { eventId: string; memberId: string } };
        create: { eventId: string; memberId: string; status: string };
        update: { status: string };
      }) => {
        const key = `${where.eventId_memberId.eventId}_${where.eventId_memberId.memberId}`;
        const existing = data.attendance.get(key);
        const result = existing
          ? { ...existing, ...update }
          : { ...create, id: key };
        data.attendance.set(key, result);
        return Promise.resolve(result);
      }),
    },
    
    // Music operations
    musicPiece: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) => {
        return Promise.resolve(data.musicPieces.get(where.id) || null);
      }),
    },
    
    musicFile: {
      findFirst: vi.fn(({ where, include }: { 
        where?: { storageKey?: string };
        include?: { piece?: { include?: { assignments?: boolean } } };
      }) => {
        for (const file of data.musicFiles.values()) {
          if (!where || !where.storageKey || file.storageKey === where.storageKey) {
            if (include?.piece) {
              const piece = data.musicPieces.get(file.pieceId);
              const assignments = include.piece.include?.assignments
                ? Array.from(data.musicAssignments.values())
                    .filter(a => a.pieceId === file.pieceId)
                : [];
              return Promise.resolve({
                ...file,
                piece: { ...piece, assignments },
              });
            }
            return Promise.resolve(file);
          }
        }
        return Promise.resolve(null);
      }),
    },
    
    // Transaction support
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    $disconnect: vi.fn(() => Promise.resolve()),
    
    // Helper to seed data
    _seedData(seedData: Partial<TestSeedData>) {
      if (seedData.users) {
        for (const user of seedData.users) {
          data.users.set(user.id, user);
        }
      }
      if (seedData.members) {
        for (const member of seedData.members) {
          data.members.set(member.id, member);
        }
      }
      if (seedData.roles) {
        for (const role of seedData.roles) {
          data.roles.set(role.id, role);
        }
      }
      if (seedData.permissions) {
        for (const perm of seedData.permissions) {
          data.permissions.set(perm.id, perm);
        }
      }
      if (seedData.events) {
        for (const event of seedData.events) {
          data.events.set(event.id, event);
        }
      }
      if (seedData.musicPieces) {
        for (const piece of seedData.musicPieces) {
          data.musicPieces.set(piece.id, piece);
        }
      }
    },
    
    // Helper to assign role to user
    _assignRole(userId: string, roleId: string) {
      const id = `${userId}_${roleId}`;
      data.userRoles.set(id, { userId, roleId });
    },
    
    // Helper to assign permission to role
    _assignPermission(roleId: string, permissionId: string) {
      const id = `${roleId}_${permissionId}`;
      data.rolePermissions.set(id, { roleId, permissionId });
    },
    
    // Helper to add music file
    _addMusicFile(file: { id: string; pieceId: string; storageKey: string }) {
      data.musicFiles.set(file.id, file);
    },
    
    // Helper to assign music to member
    _assignMusic(pieceId: string, memberId: string) {
      const id = `${pieceId}_${memberId}`;
      data.musicAssignments.set(id, { pieceId, memberId });
    },
    
    // Clear all data
    _clear() {
      data.users.clear();
      data.members.clear();
      data.roles.clear();
      data.permissions.clear();
      data.userRoles.clear();
      data.rolePermissions.clear();
      data.events.clear();
      data.musicPieces.clear();
      data.musicFiles.clear();
      data.musicAssignments.clear();
      data.attendance.clear();
    },
  };
}

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Set up a test with seeded data
 */
export function setupTestDatabase() {
  const db = createMockDatabase();
  
  // Seed with default data
  db._seedData(defaultTestSeedData);
  
  // Set up default role-permission assignments
  // Admin gets all permissions
  for (const perm of defaultTestSeedData.permissions) {
    db._assignPermission('test-role-admin', perm.id);
  }
  
  // Member gets basic permissions
  db._assignPermission('test-role-member', 'test-perm-music-view-assigned');
  db._assignPermission('test-role-member', 'test-perm-music-download-assigned');
  
  // Librarian gets music permissions
  db._assignPermission('test-role-librarian', 'test-perm-music-view-all');
  db._assignPermission('test-role-librarian', 'test-perm-music-download-all');
  
  // Assign roles to users
  db._assignRole('test-user-admin', 'test-role-admin');
  db._assignRole('test-user-member', 'test-role-member');
  db._assignRole('test-user-librarian', 'test-role-librarian');
  
  return db;
}
