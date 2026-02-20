import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import {
  assignMusicToSections,
  updateAssignmentStatus,
  processMusicReturn,
  reportMissingParts,
  getLibrarianDashboardStats,
  getAssignments,
  markOverdueAssignments,
} from '../actions';
import * as authGuards from '@/lib/auth/guards';
import { AssignmentStatus } from '@prisma/client';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    member: {
      findMany: vi.fn(),
    },
    musicAssignment: {
      create: vi.fn(),
      createMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    musicAssignmentHistory: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/guards', () => ({
  requirePermission: vi.fn(),
  getSession: vi.fn(),
}));

// Mock audit log
vi.mock('@/lib/services/audit', () => ({
  auditLog: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Librarian Workflow Actions', () => {
  const mockSession = {
    user: { id: 'librarian-1', email: 'librarian@example.com' },
    session: { id: 'session-1' },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authGuards.requirePermission).mockResolvedValue(mockSession);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('assignMusicToSections', () => {
    it('should assign music to all active members in selected sections', async () => {
      const mockMembers = [
        { id: 'member-1' },
        { id: 'member-2' },
      ];

      vi.mocked(prisma.member.findMany).mockResolvedValue(mockMembers as any);
      vi.mocked(prisma.musicAssignment.createMany).mockResolvedValue({ count: 2 });

      const result = await assignMusicToSections({
        pieceId: 'piece-1',
        sectionIds: ['section-1'],
        dueDate: undefined,
        notes: undefined,
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(prisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sections: { some: { sectionId: { in: ['section-1'] } } },
            status: 'ACTIVE',
          },
        })
      );
      expect(prisma.musicAssignment.createMany).toHaveBeenCalled();
    });

    it('should return error when no members found in sections', async () => {
      vi.mocked(prisma.member.findMany).mockResolvedValue([]);

      const result = await assignMusicToSections({
        pieceId: 'piece-1',
        sectionIds: ['section-1'],
        dueDate: undefined,
        notes: undefined,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active members found in selected sections');
    });

    it('should pass options to assignment creation', async () => {
      const mockMembers = [{ id: 'member-1' }];
      const dueDate = new Date('2024-12-31');

      vi.mocked(prisma.member.findMany).mockResolvedValue(mockMembers as any);
      vi.mocked(prisma.musicAssignment.createMany).mockResolvedValue({ count: 1 });

      const result = await assignMusicToSections({
        pieceId: 'piece-1',
        sectionIds: ['section-1'],
        dueDate,
        notes: 'Test notes',
      });

      expect(result.success).toBe(true);
      expect(prisma.musicAssignment.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              dueDate,
              notes: 'Test notes',
            }),
          ]),
        })
      );
    });
  });

  describe('updateAssignmentStatus', () => {
    it('should update assignment status and create history entry', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.ASSIGNED,
      };

      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(mockAssignment as any);
      vi.mocked(prisma.musicAssignment.update).mockResolvedValue({
        ...mockAssignment,
        status: AssignmentStatus.PICKED_UP,
      } as any);

      const result = await updateAssignmentStatus('assignment-1', AssignmentStatus.PICKED_UP);

      expect(result.success).toBe(true);
      expect(prisma.musicAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({ status: AssignmentStatus.PICKED_UP }),
      });
      expect(prisma.musicAssignmentHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assignmentId: 'assignment-1',
          action: 'STATUS_CHANGE',
          fromStatus: AssignmentStatus.ASSIGNED,
          toStatus: AssignmentStatus.PICKED_UP,
          performedBy: 'librarian-1',
        }),
      });
    });

    it('should return error when assignment not found', async () => {
      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(null);

      const result = await updateAssignmentStatus('non-existent', AssignmentStatus.PICKED_UP);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Assignment not found');
    });

    it('should set missingSince when marking as LOST', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.PICKED_UP,
      };

      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(mockAssignment as any);
      vi.mocked(prisma.musicAssignment.update).mockResolvedValue({
        ...mockAssignment,
        status: AssignmentStatus.LOST,
      } as any);

      const result = await updateAssignmentStatus('assignment-1', AssignmentStatus.LOST);

      expect(result.success).toBe(true);
      expect(prisma.musicAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({
          status: AssignmentStatus.LOST,
          missingSince: expect.any(Date),
        }),
      });
    });
  });

  describe('processMusicReturn', () => {
    it('should process return and set RETURNED status', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.PICKED_UP,
      };

      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(mockAssignment as any);
      vi.mocked(prisma.musicAssignment.update).mockResolvedValue({
        ...mockAssignment,
        status: AssignmentStatus.RETURNED,
        returnedAt: new Date(),
      } as any);

      const result = await processMusicReturn('assignment-1', 'good');

      expect(result.success).toBe(true);
      expect(prisma.musicAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({
          status: AssignmentStatus.RETURNED,
          returnedAt: expect.any(Date),
          condition: 'good',
        }),
      });
    });

    it('should set DAMAGED status when condition is damaged', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.PICKED_UP,
      };

      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(mockAssignment as any);
      vi.mocked(prisma.musicAssignment.update).mockResolvedValue({
        ...mockAssignment,
        status: AssignmentStatus.DAMAGED,
      } as any);

      const result = await processMusicReturn('assignment-1', 'damaged');

      expect(result.success).toBe(true);
      expect(prisma.musicAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({
          status: AssignmentStatus.DAMAGED,
          condition: 'damaged',
        }),
      });
    });

    it('should reject return for non-returnable status', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.LOST,
      };

      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(mockAssignment as any);

      const result = await processMusicReturn('assignment-1', 'good');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Assignment cannot be returned');
    });
  });

  describe('reportMissingParts', () => {
    it('should mark assignment as LOST with notes', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.PICKED_UP,
      };

      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(mockAssignment as any);
      vi.mocked(prisma.musicAssignment.update).mockResolvedValue({
        ...mockAssignment,
        status: AssignmentStatus.LOST,
      } as any);

      const result = await reportMissingParts('assignment-1', 'Missing flute part');

      expect(result.success).toBe(true);
      expect(prisma.musicAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({
          status: AssignmentStatus.LOST,
          notes: 'Missing flute part',
        }),
      });
    });
  });

  describe('getLibrarianDashboardStats', () => {
    it('should return dashboard statistics', async () => {
      vi.mocked(prisma.musicAssignment.count).mockImplementation(async (args) => {
        const where = args?.where || {};
        if (where.status === AssignmentStatus.OVERDUE) return 5;
        if (where.status === AssignmentStatus.LOST) return 2;
        if (where.status === AssignmentStatus.ASSIGNED) return 10;
        return 0;
      });

      const result = await getLibrarianDashboardStats();

      expect(result.overdueCount).toBe(5);
      expect(result.lostCount).toBe(2);
      expect(result.pendingPickupCount).toBe(10);
    });
  });

  describe('getAssignments', () => {
    it('should return filtered assignments', async () => {
      vi.mocked(prisma.musicAssignment.findMany).mockResolvedValue([]);
      vi.mocked(prisma.musicAssignment.count).mockResolvedValue(0);

      const result = await getAssignments({ status: AssignmentStatus.OVERDUE });

      expect(result.assignments).toEqual([]);
      expect(prisma.musicAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: AssignmentStatus.OVERDUE,
          }),
        })
      );
    });

    it('should apply search filter', async () => {
      vi.mocked(prisma.musicAssignment.findMany).mockResolvedValue([]);
      vi.mocked(prisma.musicAssignment.count).mockResolvedValue(0);

      const result = await getAssignments({ search: 'John' });

      expect(prisma.musicAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { member: { firstName: { contains: 'John' } } },
              { member: { lastName: { contains: 'John' } } },
              { piece: { title: { contains: 'John' } } },
            ]),
          }),
        })
      );
    });
  });

  describe('markOverdueAssignments', () => {
    it('should mark assignments past due date as OVERDUE', async () => {
      const mockOverdueAssignments = [
        { id: 'assignment-1', status: AssignmentStatus.PICKED_UP, dueDate: new Date('2023-01-01') },
      ];

      vi.mocked(prisma.musicAssignment.findMany).mockResolvedValue(mockOverdueAssignments as any);
      vi.mocked(prisma.musicAssignment.update).mockResolvedValue({} as any);

      const result = await markOverdueAssignments();

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(prisma.musicAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({ status: AssignmentStatus.OVERDUE }),
      });
    });

    it('should not re-mark already overdue assignments', async () => {
      const mockOverdueAssignments = [
        { id: 'assignment-1', status: AssignmentStatus.OVERDUE, dueDate: new Date('2023-01-01') },
      ];

      vi.mocked(prisma.musicAssignment.findMany).mockResolvedValue([]);

      const result = await markOverdueAssignments();

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });
  });
});
