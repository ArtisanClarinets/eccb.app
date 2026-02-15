import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/lib/db', () => ({
  prisma: {
    attendance: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    event: {
      findUnique: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/guards', () => ({
  requirePermission: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/auth/permissions', () => ({
  checkUserPermission: vi.fn(),
}));

vi.mock('@/lib/services/audit', () => ({
  auditLog: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requirePermission, requireAuth } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import {
  markAttendance,
  markBulkAttendance,
  getEventAttendance,
  getMemberAttendance,
  getMemberAttendanceStats,
  getEventAttendanceStats,
  initializeEventAttendance,
} from '../actions';

describe('Attendance Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: grant all attendance permissions
    vi.mocked(checkUserPermission).mockResolvedValue(true);
  });

  describe('markAttendance', () => {
    it('should mark attendance for own member', async () => {
      const mockSession = { user: { id: 'user-1' } };
      const mockMember = { id: 'member-1', userId: 'user-1' };
      const mockEvent = { id: 'event-1', title: 'Rehearsal', type: 'REHEARSAL' };
      const mockAttendance = {
        id: 'attendance-1',
        eventId: 'event-1',
        memberId: 'member-1',
        status: 'PRESENT',
        markedAt: new Date(),
      };

      vi.mocked(requireAuth).mockResolvedValue(mockSession as any);
      vi.mocked(prisma.member.findFirst).mockResolvedValue(mockMember as any);
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.attendance.upsert).mockResolvedValue(mockAttendance as any);

      const result = await markAttendance({
        eventId: 'event-1',
        memberId: 'member-1',
        status: 'PRESENT',
      });

      expect(result.success).toBe(true);
      expect(result.attendance).toBeDefined();
    });

    it('should return error for invalid data', async () => {
      const mockSession = { user: { id: 'user-1' } };
      vi.mocked(requireAuth).mockResolvedValue(mockSession as any);

      const result = await markAttendance({
        eventId: '',
        memberId: '',
        status: 'PRESENT' as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when permission denied', async () => {
      const mockSession = { user: { id: 'user-1' } };

      vi.mocked(requireAuth).mockResolvedValue(mockSession as any);
      vi.mocked(checkUserPermission).mockResolvedValue(false);

      const result = await markAttendance({
        eventId: 'event-1',
        memberId: 'member-1',
        status: 'PRESENT',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('should return error when event not found', async () => {
      const mockSession = { user: { id: 'user-1' } };

      vi.mocked(requireAuth).mockResolvedValue(mockSession as any);
      vi.mocked(checkUserPermission).mockResolvedValue(true);
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      const result = await markAttendance({
        eventId: 'non-existent',
        memberId: 'member-1',
        status: 'PRESENT',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Event not found');
    });
  });

  describe('markBulkAttendance', () => {
    it('should mark bulk attendance with ATTENDANCE_MARK_ALL permission', async () => {
      const mockSession = { user: { id: 'user-1' } };
      const mockEvent = { id: 'event-1', title: 'Rehearsal' };

      vi.mocked(requirePermission).mockResolvedValue(mockSession as any);
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.attendance.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.attendance.createMany).mockResolvedValue({ count: 3 });

      const result = await markBulkAttendance({
        eventId: 'event-1',
        records: [
          { memberId: 'member-1', status: 'PRESENT' },
          { memberId: 'member-2', status: 'ABSENT' },
          { memberId: 'member-3', status: 'LATE' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(prisma.attendance.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
      });
      expect(prisma.attendance.createMany).toHaveBeenCalled();
    });

    it('should return error when event not found', async () => {
      const mockSession = { user: { id: 'user-1' } };

      vi.mocked(requirePermission).mockResolvedValue(mockSession as any);
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      const result = await markBulkAttendance({
        eventId: 'non-existent',
        records: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Event not found');
    });
  });

  describe('getEventAttendance', () => {
    it('should get event attendance records', async () => {
      const mockSession = { user: { id: 'user-1' } };
      const mockEvent = {
        id: 'event-1',
        title: 'Rehearsal',
        attendance: [
          {
            id: 'attendance-1',
            eventId: 'event-1',
            memberId: 'member-1',
            status: 'PRESENT',
            member: { id: 'member-1', firstName: 'John', lastName: 'Doe', sections: [] },
          },
        ],
      };

      vi.mocked(requireAuth).mockResolvedValue(mockSession as any);
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);

      const result = await getEventAttendance('event-1');

      expect(result.success).toBe(true);
      expect(result.attendance).toBeDefined();
    });

    it('should return error when event not found', async () => {
      const mockSession = { user: { id: 'user-1' } };

      vi.mocked(requireAuth).mockResolvedValue(mockSession as any);
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      const result = await getEventAttendance('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Event not found');
    });

    it('should return error when permission denied', async () => {
      const mockSession = { user: { id: 'user-1' } };

      vi.mocked(requireAuth).mockResolvedValue(mockSession as any);
      vi.mocked(checkUserPermission).mockResolvedValue(false);

      const result = await getEventAttendance('event-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });
  });

  describe('getMemberAttendance', () => {
    it('should get member attendance records', async () => {
      const mockSession = { user: { id: 'user-1' } };
      const mockAttendance = [
        {
          id: 'attendance-1',
          eventId: 'event-1',
          memberId: 'member-1',
          status: 'PRESENT',
          event: { id: 'event-1', title: 'Rehearsal' },
        },
      ];

      vi.mocked(requireAuth).mockResolvedValue(mockSession as any);
      vi.mocked(prisma.attendance.findMany).mockResolvedValue(mockAttendance as any);

      const result = await getMemberAttendance('member-1');

      expect(result.success).toBe(true);
      expect(result.attendance).toBeDefined();
    });

    it('should return error when permission denied', async () => {
      const mockSession = { user: { id: 'user-1' } };

      vi.mocked(requireAuth).mockResolvedValue(mockSession as any);
      vi.mocked(checkUserPermission).mockResolvedValue(false);

      const result = await getMemberAttendance('member-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });
  });

  describe('getMemberAttendanceStats', () => {
    it('should calculate member attendance statistics', async () => {
      const mockSession = { user: { id: 'user-1' } };
      const mockAttendance = [
        { status: 'PRESENT' },
        { status: 'PRESENT' },
        { status: 'ABSENT' },
        { status: 'LATE' },
      ];

      vi.mocked(requireAuth).mockResolvedValue(mockSession as any);
      vi.mocked(prisma.attendance.findMany).mockResolvedValue(mockAttendance as any);

      const result = await getMemberAttendanceStats('member-1');

      expect(result.success).toBe(true);
      expect(result.stats).toEqual({
        total: 4,
        present: 2,
        absent: 1,
        excused: 0,
        late: 1,
        leftEarly: 0,
        attendanceRate: 50,
        punctualityRate: 75,
      });
    });
  });

  describe('getEventAttendanceStats', () => {
    it('should calculate event attendance statistics', async () => {
      const mockSession = { user: { id: 'user-1' } };
      const mockAttendance = [
        { status: 'PRESENT' },
        { status: 'PRESENT' },
        { status: 'PRESENT' },
        { status: 'ABSENT' },
        { status: 'EXCUSED' },
      ];

      vi.mocked(requireAuth).mockResolvedValue(mockSession as any);
      vi.mocked(prisma.attendance.findMany).mockResolvedValue(mockAttendance as any);

      const result = await getEventAttendanceStats('event-1');

      expect(result.success).toBe(true);
      expect(result.stats).toEqual({
        total: 5,
        present: 3,
        absent: 1,
        excused: 1,
        late: 0,
        leftEarly: 0,
        attendanceRate: 60,
      });
    });
  });

  describe('initializeEventAttendance', () => {
    it('should initialize attendance for active members', async () => {
      const mockSession = { user: { id: 'user-1' } };
      const mockEvent = { id: 'event-1', title: 'Rehearsal' };
      const mockActiveMembers = [
        { id: 'member-1' },
        { id: 'member-2' },
        { id: 'member-3' },
      ];

      vi.mocked(requirePermission).mockResolvedValue(mockSession as any);
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.member.findMany).mockResolvedValue(mockActiveMembers as any);
      vi.mocked(prisma.attendance.findMany).mockResolvedValue([]);
      vi.mocked(prisma.attendance.createMany).mockResolvedValue({ count: 3 });

      const result = await initializeEventAttendance('event-1');

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
    });

    it('should return 0 when all members already have attendance', async () => {
      const mockSession = { user: { id: 'user-1' } };
      const mockEvent = { id: 'event-1', title: 'Rehearsal' };
      const mockActiveMembers = [{ id: 'member-1' }];
      const mockExistingAttendance = [{ memberId: 'member-1' }];

      vi.mocked(requirePermission).mockResolvedValue(mockSession as any);
      vi.mocked(prisma.event.findUnique).mockResolvedValue(mockEvent as any);
      vi.mocked(prisma.member.findMany).mockResolvedValue(mockActiveMembers as any);
      vi.mocked(prisma.attendance.findMany).mockResolvedValue(mockExistingAttendance as any);

      const result = await initializeEventAttendance('event-1');

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('should return error when event not found', async () => {
      const mockSession = { user: { id: 'user-1' } };

      vi.mocked(requirePermission).mockResolvedValue(mockSession as any);
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      const result = await initializeEventAttendance('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Event not found');
    });
  });
});
