import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import {
  assignMusicToSections,
  updateAssignmentStatus,
  processMusicReturn,
  reportMissingParts,
  getLibrarianDashboardStats,
  getAssignmentsForLibrarian,
  markOverdueAssignments,
} from '../actions';
import { getSession, requirePermission } from '@/lib/auth/guards';
import { AssignmentStatus } from '@prisma/client';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    member: {
      findMany: vi.fn(),
    },
    musicAssignment: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    musicAssignmentHistory: {
      createMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    musicPiece: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn()),
  },
}));

vi.mock('@/lib/auth/guards', () => ({
  getSession: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock('@/lib/services/audit', () => ({
  auditLog: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Librarian Workflow Actions', () => {
  const mockSession = {
    user: { id: 'user-1', email: 'librarian@test.com' },
    session: { id: 'session-1' },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePermission).mockResolvedValue(mockSession);
    vi.mocked(getSession).mockResolvedValue(mockSession);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('assignMusicToSections', () => {
    it('should assign music to all active members in selected sections', async () => {
      const mockMembers = [
        { id: 'member-1' },
        { id: 'member-2' },
        { id: 'member-3' },
      ];

      vi.mocked(prisma.member.findMany).mockResolvedValue(mockMembers as any);
      vi.mocked(prisma.musicAssignment.createMany).mockResolvedValue({ count: 3 });
      vi.mocked(prisma.musicAssignment.findMany).mockResolvedValue([
        { id: 'assignment-1', memberId: 'member-1' },
        { id: 'assignment-2', memberId: 'member-2' },
        { id: 'assignment-3', memberId: 'member-3' },
      ] as any);
      vi.mocked(prisma.musicAssignmentHistory.createMany).mockResolvedValue({ count: 3 });

      const result = await assignMusicToSections('piece-1', ['section-1', 'section-2']);

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(prisma.member.findMany).toHaveBeenCalledWith({
        where: {
          status: 'ACTIVE',
          sections: {
            some: {
              sectionId: { in: ['section-1', 'section-2'] },
            },
          },
        },
        select: { id: true },
      });
    });

    it('should return error when no members found in sections', async () => {
      vi.mocked(prisma.member.findMany).mockResolvedValue([]);

      const result = await assignMusicToSections('piece-1', ['section-1']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active members found in selected sections');
    });

    it('should pass options to assignment creation', async () => {
      const mockMembers = [{ id: 'member-1' }];
      const dueDate = new Date('2024-12-31');

      vi.mocked(prisma.member.findMany).mockResolvedValue(mockMembers as any);
      vi.mocked(prisma.musicAssignment.createMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.musicAssignment.findMany).mockResolvedValue([
        { id: 'assignment-1', memberId: 'member-1' },
      ] as any);
      vi.mocked(prisma.musicAssignmentHistory.createMany).mockResolvedValue({ count: 1 });

      await assignMusicToSections('piece-1', ['section-1'], {
        partName: 'Flute 1',
        notes: 'Concert music',
        dueDate,
      });

      expect(prisma.musicAssignment.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            pieceId: 'piece-1',
            memberId: 'member-1',
            partName: 'Flute 1',
            notes: 'Concert music',
            dueDate,
            status: AssignmentStatus.ASSIGNED,
          }),
        ]),
        skipDuplicates: true,
      });
    });
  });

  describe('updateAssignmentStatus', () => {
    it('should update assignment status and create history entry', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.ASSIGNED,
        pieceId: 'piece-1',
        piece: { id: 'piece-1', title: 'Test Piece' },
      };

      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(mockAssignment as any);
      vi.mocked(prisma.musicAssignment.update).mockResolvedValue({} as any);
      vi.mocked(prisma.musicAssignmentHistory.create).mockResolvedValue({} as any);

      const result = await updateAssignmentStatus(
        'assignment-1',
        AssignmentStatus.PICKED_UP,
        'Member picked up music'
      );

      expect(result.success).toBe(true);
      expect(prisma.musicAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({
          status: AssignmentStatus.PICKED_UP,
          pickedUpAt: expect.any(Date),
          pickedUpBy: 'user-1',
        }),
      });
    });

    it('should return error when assignment not found', async () => {
      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(null);

      const result = await updateAssignmentStatus('nonexistent', AssignmentStatus.PICKED_UP);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Assignment not found');
    });

    it('should set missingSince when marking as LOST', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.PICKED_UP,
        pieceId: 'piece-1',
        piece: { id: 'piece-1' },
      };

      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(mockAssignment as any);
      vi.mocked(prisma.musicAssignment.update).mockResolvedValue({} as any);
      vi.mocked(prisma.musicAssignmentHistory.create).mockResolvedValue({} as any);

      await updateAssignmentStatus('assignment-1', AssignmentStatus.LOST, 'Parts missing');

      expect(prisma.musicAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({
          status: AssignmentStatus.LOST,
          missingSince: expect.any(Date),
          missingNotes: 'Parts missing',
        }),
      });
    });
  });

  describe('processMusicReturn', () => {
    it('should process return and set RETURNED status', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.PICKED_UP,
        pieceId: 'piece-1',
        piece: { title: 'Test Piece' },
        member: { firstName: 'John', lastName: 'Doe' },
      };

      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(mockAssignment as any);
      vi.mocked(prisma.musicAssignment.update).mockResolvedValue({} as any);
      vi.mocked(prisma.musicAssignmentHistory.create).mockResolvedValue({} as any);

      const result = await processMusicReturn('assignment-1', {
        condition: 'good',
        notes: 'Returned in good condition',
      });

      expect(result.success).toBe(true);
      expect(prisma.musicAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({
          status: AssignmentStatus.RETURNED,
          returnedAt: expect.any(Date),
          returnedTo: 'user-1',
          condition: 'good',
        }),
      });
    });

    it('should set DAMAGED status when condition is damaged', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.PICKED_UP,
        pieceId: 'piece-1',
        piece: { title: 'Test Piece' },
        member: { firstName: 'John', lastName: 'Doe' },
      };

      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(mockAssignment as any);
      vi.mocked(prisma.musicAssignment.update).mockResolvedValue({} as any);
      vi.mocked(prisma.musicAssignmentHistory.create).mockResolvedValue({} as any);

      await processMusicReturn('assignment-1', {
        condition: 'damaged',
        notes: 'Pages torn',
      });

      expect(prisma.musicAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({
          status: AssignmentStatus.DAMAGED,
        }),
      });
    });

    it('should reject return for non-returnable status', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.RETURNED,
        pieceId: 'piece-1',
        piece: { title: 'Test Piece' },
        member: { firstName: 'John', lastName: 'Doe' },
      };

      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(mockAssignment as any);

      const result = await processMusicReturn('assignment-1', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Assignment is not in a returnable state');
    });
  });

  describe('reportMissingParts', () => {
    it('should mark assignment as LOST with notes', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.PICKED_UP,
        pieceId: 'piece-1',
        piece: { title: 'Test Piece' },
        member: { firstName: 'John', lastName: 'Doe' },
      };

      vi.mocked(prisma.musicAssignment.findUnique).mockResolvedValue(mockAssignment as any);
      vi.mocked(prisma.musicAssignment.update).mockResolvedValue({} as any);
      vi.mocked(prisma.musicAssignmentHistory.create).mockResolvedValue({} as any);

      const result = await reportMissingParts('assignment-1', {
        notes: 'Member lost the music folder',
      });

      expect(result.success).toBe(true);
      expect(prisma.musicAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({
          status: AssignmentStatus.LOST,
          missingSince: expect.any(Date),
          missingNotes: 'Member lost the music folder',
        }),
      });
    });
  });

  describe('getLibrarianDashboardStats', () => {
    it('should return dashboard statistics', async () => {
      vi.mocked(prisma.musicAssignment.groupBy).mockResolvedValue([
        { status: AssignmentStatus.ASSIGNED, _count: 5 },
        { status: AssignmentStatus.PICKED_UP, _count: 3 },
        { status: AssignmentStatus.RETURNED, _count: 10 },
      ] as any);
      vi.mocked(prisma.musicAssignment.count)
        .mockResolvedValueOnce(2) // overdueCount
        .mockResolvedValueOnce(1) // missingCount
        .mockResolvedValueOnce(5) // pendingPickups
        .mockResolvedValueOnce(3); // pendingReturns
      vi.mocked(prisma.musicAssignmentHistory.count).mockResolvedValue(15);
      vi.mocked(prisma.musicAssignment.findMany).mockResolvedValue([]);

      const result = await getLibrarianDashboardStats();

      expect(result.success).toBe(true);
      expect(result.stats).toEqual({
        statusCounts: {
          ASSIGNED: 5,
          PICKED_UP: 3,
          RETURNED: 10,
          OVERDUE: 0,
          LOST: 0,
          DAMAGED: 0,
        },
        overdueCount: 2,
        recentActivity: 15,
        missingCount: 1,
        pendingPickups: 5,
        pendingReturns: 3,
        needsAttention: [],
      });
    });
  });

  describe('getAssignmentsForLibrarian', () => {
    it('should return filtered assignments', async () => {
      const mockAssignments = [
        {
          id: 'assignment-1',
          status: AssignmentStatus.PICKED_UP,
          piece: { id: 'piece-1', title: 'Test Piece', catalogNumber: 'ABC123' },
          member: {
            id: 'member-1',
            firstName: 'John',
            lastName: 'Doe',
            user: { email: 'john@test.com' },
            instruments: [],
          },
        },
      ];

      vi.mocked(prisma.musicAssignment.findMany).mockResolvedValue(mockAssignments as any);

      const result = await getAssignmentsForLibrarian({
        status: AssignmentStatus.PICKED_UP,
      });

      expect(result.success).toBe(true);
      expect(result.assignments).toHaveLength(1);
    });

    it('should apply search filter', async () => {
      vi.mocked(prisma.musicAssignment.findMany).mockResolvedValue([]);

      await getAssignmentsForLibrarian({ search: 'flute' });

      expect(prisma.musicAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { piece: { title: { contains: 'flute' } } },
            ]),
          }),
        })
      );
    });
  });

  describe('markOverdueAssignments', () => {
    it('should mark assignments past due date as OVERDUE', async () => {
      const mockOverdueAssignments = [
        { id: 'assignment-1', status: AssignmentStatus.PICKED_UP, dueDate: new Date('2024-01-01') },
        { id: 'assignment-2', status: AssignmentStatus.ASSIGNED, dueDate: new Date('2024-01-01') },
      ];

      vi.mocked(prisma.musicAssignment.findMany).mockResolvedValue(mockOverdueAssignments as any);
      vi.mocked(prisma.musicAssignment.update).mockResolvedValue({} as any);
      vi.mocked(prisma.musicAssignmentHistory.create).mockResolvedValue({} as any);

      const result = await markOverdueAssignments();

      expect(result.success).toBe(true);
      expect(result.markedCount).toBe(2);
    });

    it('should not re-mark already overdue assignments', async () => {
      const mockOverdueAssignments = [
        { id: 'assignment-1', status: AssignmentStatus.OVERDUE, dueDate: new Date('2024-01-01') },
      ];

      vi.mocked(prisma.musicAssignment.findMany).mockResolvedValue(mockOverdueAssignments as any);

      const result = await markOverdueAssignments();

      expect(result.success).toBe(true);
      expect(result.markedCount).toBe(0);
    });
  });
});
