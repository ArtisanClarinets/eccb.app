import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAuditLogs,
  getAuditLogDetails,
  getAuditLogStats,
  getUniqueActions,
  getUniqueEntityTypes,
  exportAuditLogsCsv,
  exportAuditLogsJson,
  getEntityAuditLogs,
  getMyAuditLogs,
} from '../actions';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/guards', () => ({
  requirePermission: vi.fn().mockResolvedValue({
    user: { id: 'admin-id', email: 'admin@test.com' },
  }),
  getSession: vi.fn().mockResolvedValue({
    user: { id: 'admin-id', email: 'admin@test.com' },
  }),
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as unknown as {
  auditLog: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
};

describe('Audit Log Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuditLogs', () => {
    it('should return audit logs with pagination', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          userId: 'user-1',
          userName: 'Test User',
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
          action: 'user.update',
          entityType: 'User',
          entityId: 'user-2',
          oldValues: { name: 'Old' },
          newValues: { name: 'New' },
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await getAuditLogs({}, 1, 50);

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should filter logs by userId', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await getAuditLogs({ userId: 'user-1' }, 1, 50);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
          }),
        })
      );
    });

    it('should filter logs by action', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await getAuditLogs({ action: 'user.delete' }, 1, 50);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: { contains: 'user.delete' },
          }),
        })
      );
    });

    it('should filter logs by entityType', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await getAuditLogs({ entityType: 'Member' }, 1, 50);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: 'Member',
          }),
        })
      );
    });

    it('should filter logs by date range', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await getAuditLogs(
        {
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31',
        },
        1,
        50
      );

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        })
      );
    });

    it('should calculate correct pagination', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(150);

      const result = await getAuditLogs({}, 1, 50);

      expect(result.totalPages).toBe(3);
    });
  });

  describe('getAuditLogDetails', () => {
    it('should return audit log details', async () => {
      const mockLog = {
        id: 'log-1',
        userId: 'user-1',
        userName: 'Test User',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent',
        action: 'user.update',
        entityType: 'User',
        entityId: 'user-2',
        oldValues: { name: 'Old' },
        newValues: { name: 'New' },
        timestamp: new Date(),
      };

      mockPrisma.auditLog.findUnique.mockResolvedValue(mockLog);

      const result = await getAuditLogDetails('log-1');

      expect(result).not.toBeNull();
      expect(result?.action).toBe('user.update');
    });

    it('should return null for non-existent log', async () => {
      mockPrisma.auditLog.findUnique.mockResolvedValue(null);

      const result = await getAuditLogDetails('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getAuditLogStats', () => {
    it('should return audit log statistics', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(100);
      mockPrisma.auditLog.groupBy
        .mockResolvedValueOnce([
          { action: 'user.update', _count: { action: 50 } },
          { action: 'user.create', _count: { action: 30 } },
        ])
        .mockResolvedValueOnce([
          { entityType: 'User', _count: { entityType: 60 } },
          { entityType: 'Member', _count: { entityType: 40 } },
        ])
        .mockResolvedValueOnce([
          { userName: 'Admin User', _count: { userName: 70 } },
          { userName: 'Test User', _count: { userName: 30 } },
        ]);

      const stats = await getAuditLogStats(30);

      expect(stats.total).toBe(100);
      expect(stats.byAction).toHaveLength(2);
      expect(stats.byAction[0].action).toBe('user.update');
      expect(stats.byAction[0].count).toBe(50);
      expect(stats.byEntityType).toHaveLength(2);
      expect(stats.byUser).toHaveLength(2);
    });
  });

  describe('getUniqueActions', () => {
    it('should return unique action types', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { action: 'user.create' },
        { action: 'user.update' },
        { action: 'user.delete' },
      ]);

      const actions = await getUniqueActions();

      expect(actions).toEqual(['user.create', 'user.update', 'user.delete']);
    });
  });

  describe('getUniqueEntityTypes', () => {
    it('should return unique entity types', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { entityType: 'User' },
        { entityType: 'Member' },
        { entityType: 'Event' },
      ]);

      const types = await getUniqueEntityTypes();

      expect(types).toEqual(['User', 'Member', 'Event']);
    });
  });

  describe('exportAuditLogsCsv', () => {
    it('should generate CSV content', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          userId: 'user-1',
          userName: 'Test User',
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
          action: 'user.update',
          entityType: 'User',
          entityId: 'user-2',
          oldValues: { name: 'Old' },
          newValues: { name: 'New' },
          timestamp: new Date('2024-01-15T10:30:00Z'),
        },
      ];

      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const csv = await exportAuditLogsCsv({});

      expect(csv).toContain('ID,Timestamp,User ID,User Name');
      expect(csv).toContain('log-1');
      expect(csv).toContain('Test User');
      expect(csv).toContain('user.update');
    });
  });

  describe('exportAuditLogsJson', () => {
    it('should generate JSON content', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          userId: 'user-1',
          userName: 'Test User',
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
          action: 'user.update',
          entityType: 'User',
          entityId: 'user-2',
          oldValues: { name: 'Old' },
          newValues: { name: 'New' },
          timestamp: new Date('2024-01-15T10:30:00Z'),
        },
      ];

      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const json = await exportAuditLogsJson({});
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].action).toBe('user.update');
    });
  });

  describe('getEntityAuditLogs', () => {
    it('should return audit logs for a specific entity', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          userId: 'user-1',
          userName: 'Test User',
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
          action: 'member.update',
          entityType: 'Member',
          entityId: 'member-1',
          oldValues: null,
          newValues: { status: 'ACTIVE' },
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);

      const logs = await getEntityAuditLogs('Member', 'member-1');

      expect(logs).toHaveLength(1);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          entityType: 'Member',
          entityId: 'member-1',
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
      });
    });
  });

  describe('getMyAuditLogs', () => {
    it('should return audit logs for the current user', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          userId: 'admin-id',
          userName: 'Admin User',
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
          action: 'user.login',
          entityType: 'User',
          entityId: null,
          oldValues: null,
          newValues: null,
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);

      const logs = await getMyAuditLogs();

      expect(logs).toHaveLength(1);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'admin-id',
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
      });
    });
  });
});
