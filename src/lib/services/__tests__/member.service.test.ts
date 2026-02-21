import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemberService } from '../member.service';
import { MemberStatus } from '@prisma/client';

// Mock the prisma module
vi.mock('@/lib/db', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    memberInstrument: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    memberSection: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock the audit module
vi.mock('../audit', () => ({
  auditLog: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { auditLog } from '../audit';

describe('MemberService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getMemberByUserId', () => {
    it('should return member with relations when found', async () => {
      const mockMember = {
        id: 'member-123',
        userId: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
        user: { id: 'user-123', email: 'john@example.com' },
        instruments: [{ instrument: { name: 'Trumpet' } }],
        sections: [{ section: { name: 'Trumpets' } }],
        musicAssignments: [],
      };

      vi.mocked(prisma.member.findUnique).mockResolvedValue(mockMember as any);

      const result = await MemberService.getMemberByUserId('user-123');

      expect(prisma.member.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        include: {
          user: true,
          instruments: { include: { instrument: true } },
          sections: { include: { section: true } },
          musicAssignments: { include: { piece: true } },
        },
      });
      expect(result).toEqual(mockMember);
    });

    it('should return null when member not found', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue(null);

      const result = await MemberService.getMemberByUserId('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateMember', () => {
    const mockOldMember = {
      id: 'member-123',
      userId: 'user-123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      status: MemberStatus.ACTIVE,
    };

    it('should update basic fields and call auditLog', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue(mockOldMember as any);

      const updateData = {
        firstName: 'Johnny',
        phoneNumber: '123-456-7890',
        status: MemberStatus.INACTIVE,
      };

      const mockUpdatedMember = { ...mockOldMember, firstName: 'Johnny', phone: '123-456-7890', status: MemberStatus.INACTIVE };
      vi.mocked(prisma.member.update).mockResolvedValue(mockUpdatedMember as any);

      const result = await MemberService.updateMember('user-123', updateData);

      expect(prisma.member.update).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        data: {
          firstName: 'Johnny',
          status: MemberStatus.INACTIVE,
          phone: '123-456-7890',
        },
      });

      expect(auditLog).toHaveBeenCalledWith({
        action: 'member.update',
        entityType: 'Member',
        entityId: 'member-123',
        oldValues: mockOldMember,
        newValues: mockUpdatedMember,
      });

      expect(result).toEqual(mockUpdatedMember);
    });

    it('should handle instrument update', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue(mockOldMember as any);
      vi.mocked(prisma.member.update).mockResolvedValue(mockOldMember as any);

      await MemberService.updateMember('user-123', { instrumentId: 'instr-1' });

      expect(prisma.memberInstrument.deleteMany).toHaveBeenCalledWith({
        where: { memberId: 'member-123' },
      });

      expect(prisma.memberInstrument.create).toHaveBeenCalledWith({
        data: {
          memberId: 'member-123',
          instrumentId: 'instr-1',
          isPrimary: true,
        },
      });
    });

    it('should handle section update', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue(mockOldMember as any);
      vi.mocked(prisma.member.update).mockResolvedValue(mockOldMember as any);

      await MemberService.updateMember('user-123', { sectionId: 'sect-1' });

      expect(prisma.memberSection.deleteMany).toHaveBeenCalledWith({
        where: { memberId: 'member-123' },
      });

      expect(prisma.memberSection.create).toHaveBeenCalledWith({
        data: {
          memberId: 'member-123',
          sectionId: 'sect-1',
        },
      });
    });
  });

  describe('listMembers', () => {
    it('should list members with correct include and order', async () => {
      const mockMembers = [{ id: '1', lastName: 'A' }, { id: '2', lastName: 'B' }];
      vi.mocked(prisma.member.findMany).mockResolvedValue(mockMembers as any);

      const result = await MemberService.listMembers();

      expect(prisma.member.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          instruments: { include: { instrument: true } },
          sections: { include: { section: true } },
        },
        orderBy: { lastName: 'asc' },
      });
      expect(result).toEqual(mockMembers);
    });

    it('should filter by instrumentId', async () => {
      await MemberService.listMembers({ instrumentId: 'instr-1' });

      expect(prisma.member.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          instruments: {
            some: { instrumentId: 'instr-1' },
          },
        },
      }));
    });

    it('should filter by sectionId', async () => {
      await MemberService.listMembers({ sectionId: 'sect-1' });

      expect(prisma.member.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          sections: {
            some: { sectionId: 'sect-1' },
          },
        },
      }));
    });

    it('should filter by status', async () => {
      await MemberService.listMembers({ status: MemberStatus.ACTIVE });

      expect(prisma.member.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          status: MemberStatus.ACTIVE,
        },
      }));
    });

    it('should combine filters', async () => {
      await MemberService.listMembers({
        instrumentId: 'instr-1',
        sectionId: 'sect-1',
        status: MemberStatus.ACTIVE,
      });

      expect(prisma.member.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          instruments: { some: { instrumentId: 'instr-1' } },
          sections: { some: { sectionId: 'sect-1' } },
          status: MemberStatus.ACTIVE,
        },
      }));
    });
  });
});
