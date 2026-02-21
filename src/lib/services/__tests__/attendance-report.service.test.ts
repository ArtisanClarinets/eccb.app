import { vi, describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { getSectionAttendanceStats } from '../attendance-report.service';

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    section: {
      findMany: vi.fn(),
    },
    attendance: {
      findMany: vi.fn(),
    },
  },
}));

describe('Attendance Report Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSectionAttendanceStats', () => {
    it('should aggregate attendance correctly', async () => {
      // Setup mock data
      const mockSections = [
        { id: 'section-1', name: 'Trumpets', _count: { members: 5 } },
        { id: 'section-2', name: 'Flutes', _count: { members: 3 } },
      ];

      const mockAttendance = [
        // Member in Trumpets (section-1) - PRESENT
        {
          status: 'PRESENT',
          member: {
            sections: [{ sectionId: 'section-1' }]
          }
        },
        // Member in Trumpets (section-1) - ABSENT
        {
          status: 'ABSENT',
          member: {
            sections: [{ sectionId: 'section-1' }]
          }
        },
        // Member in Flutes (section-2) - PRESENT
        {
          status: 'PRESENT',
          member: {
            sections: [{ sectionId: 'section-2' }]
          }
        },
        // Member in BOTH (section-1 and section-2) - LATE
        // This tests that one attendance record counts for multiple sections
        {
          status: 'LATE',
          member: {
            sections: [{ sectionId: 'section-1' }, { sectionId: 'section-2' }]
          }
        }
      ];

      vi.mocked(prisma.section.findMany).mockResolvedValue(mockSections as any);
      vi.mocked(prisma.attendance.findMany).mockResolvedValue(mockAttendance as any);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await getSectionAttendanceStats(startDate, endDate);

      // Verify Prisma calls
      expect(prisma.section.findMany).toHaveBeenCalled();
      expect(prisma.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          event: expect.objectContaining({
            startTime: { gte: startDate, lte: endDate },
            isCancelled: false
          })
        })
      }));

      // Verify Trumpets (section-1)
      // Total: 3 records relevant to Trumpets (1 PRESENT, 1 ABSENT, 1 LATE)
      // Present: 1 (PRESENT) -> LATE is not counted as PRESENT in logic
      const trumpets = result.find(s => s.id === 'section-1');
      expect(trumpets).toBeDefined();
      expect(trumpets?.total).toBe(3);
      expect(trumpets?.present).toBe(1);
      // Rate: 1/3 * 100 = 33.33 -> 33
      expect(trumpets?.rate).toBe(33);

      // Verify Flutes (section-2)
      // Total: 2 records relevant to Flutes (1 PRESENT, 1 LATE)
      // Present: 1
      const flutes = result.find(s => s.id === 'section-2');
      expect(flutes).toBeDefined();
      expect(flutes?.total).toBe(2);
      expect(flutes?.present).toBe(1);
      // Rate: 1/2 * 100 = 50
      expect(flutes?.rate).toBe(50);
    });

    it('should handle sections with no attendance', async () => {
       const mockSections = [
        { id: 'section-1', name: 'Trumpets', _count: { members: 5 } },
      ];
      vi.mocked(prisma.section.findMany).mockResolvedValue(mockSections as any);
      vi.mocked(prisma.attendance.findMany).mockResolvedValue([]);

      const result = await getSectionAttendanceStats(new Date(), new Date());

      expect(result[0].total).toBe(0);
      expect(result[0].present).toBe(0);
      expect(result[0].rate).toBe(0);
    });

    it('should filter by event type if provided', async () => {
      const mockSections = [{ id: 's1', name: 'S1', _count: { members: 1 } }];
      vi.mocked(prisma.section.findMany).mockResolvedValue(mockSections as any);
      vi.mocked(prisma.attendance.findMany).mockResolvedValue([]);

      const startDate = new Date();
      const endDate = new Date();
      const eventType = 'REHEARSAL';

      await getSectionAttendanceStats(startDate, endDate, eventType);

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          event: expect.objectContaining({
            type: eventType
          })
        })
      }));
    });
  });
});
