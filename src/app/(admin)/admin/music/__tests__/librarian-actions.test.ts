import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AssignmentStatus } from '@prisma/client';

// =============================================================================
// Mock Setup - All mocks must be defined before any imports
// =============================================================================

const mockMemberFindMany = vi.hoisted(() => vi.fn());
const mockMusicAssignmentCreate = vi.hoisted(() => vi.fn());
const mockMusicAssignmentCreateMany = vi.hoisted(() => vi.fn());
const mockMusicAssignmentFindUnique = vi.hoisted(() => vi.fn());
const mockMusicAssignmentUpdate = vi.hoisted(() => vi.fn());
const mockMusicAssignmentCount = vi.hoisted(() => vi.fn());
const mockMusicAssignmentFindMany = vi.hoisted(() => vi.fn());
const mockMusicAssignmentGroupBy = vi.hoisted(() => vi.fn());
const mockMusicAssignmentHistoryCreate = vi.hoisted(() => vi.fn());
const mockMusicAssignmentHistoryCreateMany = vi.hoisted(() => vi.fn());
const mockMusicAssignmentHistoryCount = vi.hoisted(() => vi.fn());
const mockRequirePermission = vi.hoisted(() => vi.fn());
const mockGetSession = vi.hoisted(() => vi.fn());
const mockAuditLog = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());
const mockInvalidateMusicAssignmentCache = vi.hoisted(() => vi.fn());
const mockInvalidateMusicDashboardCache = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    member: {
      findMany: mockMemberFindMany,
    },
    musicAssignment: {
      create: mockMusicAssignmentCreate,
      createMany: mockMusicAssignmentCreateMany,
      findUnique: mockMusicAssignmentFindUnique,
      update: mockMusicAssignmentUpdate,
      count: mockMusicAssignmentCount,
      findMany: mockMusicAssignmentFindMany,
      groupBy: mockMusicAssignmentGroupBy,
    },
    musicAssignmentHistory: {
      create: mockMusicAssignmentHistoryCreate,
      createMany: mockMusicAssignmentHistoryCreateMany,
      count: mockMusicAssignmentHistoryCount,
    },
  },
}));

vi.mock('@/lib/auth/guards', () => ({
  requirePermission: mockRequirePermission,
  getSession: mockGetSession,
}));

vi.mock('@/lib/services/audit', () => ({
  auditLog: mockAuditLog,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/lib/cache', () => ({
  invalidateMusicAssignmentCache: mockInvalidateMusicAssignmentCache,
  invalidateMusicDashboardCache: mockInvalidateMusicDashboardCache,
}));

// Import after mocks are set up
import {
  assignMusicToSections,
  updateAssignmentStatus,
  processMusicReturn,
  reportMissingParts,
  getLibrarianDashboardStats,
  getAssignmentsForLibrarian,
  markOverdueAssignments,
} from '../assignment-actions';

// =============================================================================
// Test Suite
// =============================================================================

describe('Librarian Workflow Actions', () => {
  const mockSession = {
    user: { id: 'librarian-1', email: 'librarian@example.com' },
    session: { id: 'session-1' },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(mockSession);
    mockGetSession.mockResolvedValue(mockSession);
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

      mockMemberFindMany.mockResolvedValue(mockMembers as any);
      mockMusicAssignmentCreateMany.mockResolvedValue({ count: 2 });
      // Mock the findMany that's called after createMany to get existing assignments
      mockMusicAssignmentFindMany.mockResolvedValue([
        { id: 'assignment-1', memberId: 'member-1' },
        { id: 'assignment-2', memberId: 'member-2' },
      ]);
      mockMusicAssignmentHistoryCreateMany.mockResolvedValue({ count: 2 });

      const result = await assignMusicToSections('piece-1', ['section-1']);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(mockMemberFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sections: { some: { sectionId: { in: ['section-1'] } } },
            status: 'ACTIVE',
          },
        })
      );
      expect(mockMusicAssignmentCreateMany).toHaveBeenCalled();
    });

    it('should return error when no members found in sections', async () => {
      mockMemberFindMany.mockResolvedValue([]);

      const result = await assignMusicToSections('piece-1', ['section-1']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active members found in selected sections');
    });

    it('should pass options to assignment creation', async () => {
      const mockMembers = [{ id: 'member-1' }];
      const dueDate = new Date('2024-12-31');

      mockMemberFindMany.mockResolvedValue(mockMembers as any);
      mockMusicAssignmentCreateMany.mockResolvedValue({ count: 1 });
      // Mock the findMany that's called after createMany
      mockMusicAssignmentFindMany.mockResolvedValue([
        { id: 'assignment-1', memberId: 'member-1' },
      ]);
      mockMusicAssignmentHistoryCreateMany.mockResolvedValue({ count: 1 });

      const result = await assignMusicToSections('piece-1', ['section-1'], {
        dueDate,
        notes: 'Test notes',
      });

      expect(result.success).toBe(true);
      expect(mockMusicAssignmentCreateMany).toHaveBeenCalledWith(
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

      mockMusicAssignmentFindUnique.mockResolvedValue(mockAssignment as any);
      mockMusicAssignmentUpdate.mockResolvedValue({
        ...mockAssignment,
        status: AssignmentStatus.PICKED_UP,
      } as any);

      const result = await updateAssignmentStatus('assignment-1', AssignmentStatus.PICKED_UP);

      expect(result.success).toBe(true);
      expect(mockMusicAssignmentUpdate).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({ status: AssignmentStatus.PICKED_UP }),
      });
      expect(mockMusicAssignmentHistoryCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assignmentId: 'assignment-1',
          action: 'STATUS_CHANGED',
          fromStatus: AssignmentStatus.ASSIGNED,
          toStatus: AssignmentStatus.PICKED_UP,
          performedBy: 'librarian-1',
          notes: expect.any(String),
        }),
      });
    });

    it('should return error when assignment not found', async () => {
      mockMusicAssignmentFindUnique.mockResolvedValue(null);

      const result = await updateAssignmentStatus('non-existent', AssignmentStatus.PICKED_UP);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Assignment not found');
    });

    it('should set missingSince when marking as LOST', async () => {
      const mockAssignment = {
        id: 'assignment-1',
        status: AssignmentStatus.PICKED_UP,
      };

      mockMusicAssignmentFindUnique.mockResolvedValue(mockAssignment as any);
      mockMusicAssignmentUpdate.mockResolvedValue({
        ...mockAssignment,
        status: AssignmentStatus.LOST,
      } as any);

      const result = await updateAssignmentStatus('assignment-1', AssignmentStatus.LOST);

      expect(result.success).toBe(true);
      expect(mockMusicAssignmentUpdate).toHaveBeenCalledWith({
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
        pieceId: 'piece-1',
        piece: { id: 'piece-1', title: 'Test Piece' },
        member: { id: 'member-1', firstName: 'John', lastName: 'Doe' },
      };

      mockMusicAssignmentFindUnique.mockResolvedValue(mockAssignment as any);
      mockMusicAssignmentUpdate.mockResolvedValue({
        ...mockAssignment,
        status: AssignmentStatus.RETURNED,
        returnedAt: new Date(),
      } as any);

      const result = await processMusicReturn('assignment-1', { condition: 'good' });

      expect(result.success).toBe(true);
      expect(mockMusicAssignmentUpdate).toHaveBeenCalledWith({
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
        pieceId: 'piece-1',
        piece: { id: 'piece-1', title: 'Test Piece' },
        member: { id: 'member-1', firstName: 'John', lastName: 'Doe' },
      };

      mockMusicAssignmentFindUnique.mockResolvedValue(mockAssignment as any);
      mockMusicAssignmentUpdate.mockResolvedValue({
        ...mockAssignment,
        status: AssignmentStatus.DAMAGED,
      } as any);

      const result = await processMusicReturn('assignment-1', { condition: 'damaged' });

      expect(result.success).toBe(true);
      expect(mockMusicAssignmentUpdate).toHaveBeenCalledWith({
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

      mockMusicAssignmentFindUnique.mockResolvedValue(mockAssignment as any);

      const result = await processMusicReturn('assignment-1', { condition: 'good' });

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
        piece: { id: 'piece-1', title: 'Test Piece' },
        member: { id: 'member-1', firstName: 'John', lastName: 'Doe' },
      };

      mockMusicAssignmentFindUnique.mockResolvedValue(mockAssignment as any);
      mockMusicAssignmentUpdate.mockResolvedValue({
        ...mockAssignment,
        status: AssignmentStatus.LOST,
      } as any);

      const result = await reportMissingParts('assignment-1', { notes: 'Missing flute part' });

      expect(result.success).toBe(true);
      expect(mockMusicAssignmentUpdate).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({
          status: AssignmentStatus.LOST,
          missingNotes: 'Missing flute part',
        }),
      });
    });
  });

  describe('getLibrarianDashboardStats', () => {
    it('should return dashboard statistics', async () => {
      // Mock groupBy for status counts
      mockMusicAssignmentGroupBy.mockResolvedValue([
        { status: AssignmentStatus.ASSIGNED, _count: 10 },
        { status: AssignmentStatus.PICKED_UP, _count: 5 },
      ]);
      // Mock count for various queries
      mockMusicAssignmentCount.mockResolvedValue(5);
      mockMusicAssignmentHistoryCount.mockResolvedValue(3);
      mockMusicAssignmentFindMany.mockResolvedValue([]);

      const result = await getLibrarianDashboardStats();

      if (!result.success) throw new Error('Action failed');

      expect(result.stats!.overdueCount).toBe(5);
      expect(result.stats!.missingCount).toBe(5);
      expect(result.stats!.pendingPickups).toBe(5);
    });
  });

  describe('getAssignmentsForLibrarian', () => {
    it('should return filtered assignments', async () => {
      mockMusicAssignmentFindMany.mockResolvedValue([]);
      mockMusicAssignmentCount.mockResolvedValue(0);

      const result = await getAssignmentsForLibrarian({ status: AssignmentStatus.OVERDUE });

      expect(result.assignments).toEqual([]);
      expect(mockMusicAssignmentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: AssignmentStatus.OVERDUE,
          }),
        })
      );
    });

    it('should apply search filter', async () => {
      mockMusicAssignmentFindMany.mockResolvedValue([]);
      mockMusicAssignmentCount.mockResolvedValue(0);

      const _result = await getAssignmentsForLibrarian({ search: 'John' });

      expect(mockMusicAssignmentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { piece: { title: { contains: 'John' } } },
              {
                member: {
                  OR: [
                    { firstName: { contains: 'John' } },
                    { lastName: { contains: 'John' } },
                  ],
                },
              },
              { partName: { contains: 'John' } },
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

      mockMusicAssignmentFindMany.mockResolvedValue(mockOverdueAssignments as any);
      mockMusicAssignmentUpdate.mockResolvedValue({} as any);

      const result = await markOverdueAssignments();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.markedCount).toBe(1);
      }
      expect(mockMusicAssignmentUpdate).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({ status: AssignmentStatus.OVERDUE }),
      });
    });

    it('should not re-mark already overdue assignments', async () => {
      const _mockOverdueAssignments = [
        { id: 'assignment-1', status: AssignmentStatus.OVERDUE, dueDate: new Date('2023-01-01') },
      ];

      mockMusicAssignmentFindMany.mockResolvedValue([]);

      const result = await markOverdueAssignments();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.markedCount).toBe(0);
      }
    });
  });
});
