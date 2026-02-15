import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/db';
import {
  getSectionLeaderSection,
  isSectionLeader,
  canAccessMember,
  getMemberSectionFilter,
} from '../guards';

// Mock the auth module
vi.mock('@/lib/auth/config', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock the db module
vi.mock('@/lib/db', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
    },
    userRole: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock headers
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

describe('Section Leader Scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSectionLeaderSection', () => {
    it('should return null if user has no member record', async () => {
      (prisma.member.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getSectionLeaderSection('user-123');
      expect(result).toBeNull();
    });

    it('should return null if member is not a section leader', async () => {
      (prisma.member.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'member-123',
        userId: 'user-123',
        sections: [],
      });

      const result = await getSectionLeaderSection('user-123');
      expect(result).toBeNull();
    });

    it('should return section info if member is a section leader', async () => {
      (prisma.member.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'member-123',
        userId: 'user-123',
        sections: [
          {
            isLeader: true,
            section: {
              id: 'section-123',
              name: 'Flutes',
            },
          },
        ],
      });

      const result = await getSectionLeaderSection('user-123');
      expect(result).toEqual({
        id: 'section-123',
        name: 'Flutes',
      });
    });
  });

  describe('isSectionLeader', () => {
    it('should return false if no session exists', async () => {
      // Mock getSession to return null
      const { auth } = await import('@/lib/auth/config');
      (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await isSectionLeader();
      expect(result).toBe(false);
    });

    it('should return false if user does not have SECTION_LEADER role', async () => {
      const { auth } = await import('@/lib/auth/config');
      (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'user-123' },
      });
      (prisma.userRole.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await isSectionLeader();
      expect(result).toBe(false);
    });

    it('should return true if user has SECTION_LEADER role and leads a section', async () => {
      const { auth } = await import('@/lib/auth/config');
      (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'user-123' },
      });
      (prisma.userRole.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-role-123',
        role: { type: 'SECTION_LEADER' },
      });
      (prisma.member.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'member-123',
        userId: 'user-123',
        sections: [
          {
            isLeader: true,
            section: { id: 'section-123', name: 'Flutes' },
          },
        ],
      });

      const result = await isSectionLeader();
      expect(result).toBe(true);
    });
  });

  describe('canAccessMember', () => {
    it('should return none if no session exists', async () => {
      const { auth } = await import('@/lib/auth/config');
      (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await canAccessMember('member-456');
      expect(result).toEqual({ canAccess: false, scope: 'none' });
    });

    it('should return all for admin users', async () => {
      const { auth } = await import('@/lib/auth/config');
      (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'admin-123' },
      });
      // isAdmin check
      (prisma.userRole.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        role: { type: 'ADMIN' },
      });

      const result = await canAccessMember('member-456');
      expect(result).toEqual({ canAccess: true, scope: 'all' });
    });

    it('should return section for section leader accessing member in their section', async () => {
      const { auth } = await import('@/lib/auth/config');
      (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'user-123' },
      });
      
      // Not admin (isAdmin returns false)
      (prisma.userRole.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Mock member.findUnique for getSectionLeaderSection and target member check
      const memberMock = prisma.member.findUnique as unknown as ReturnType<typeof vi.fn>;
      // First call: getSectionLeaderSection - returns a section
      memberMock.mockResolvedValueOnce({
        id: 'leader-123',
        userId: 'user-123',
        sections: [{ isLeader: true, section: { id: 'section-123', name: 'Flutes' } }],
      });
      // Second call: target member check - in same section
      memberMock.mockResolvedValueOnce({
        id: 'member-456',
        sections: [{ sectionId: 'section-123' }],
      });

      const result = await canAccessMember('member-456');
      expect(result).toEqual({ canAccess: true, scope: 'section' });
    });

    it('should return none for section leader accessing member outside their section', async () => {
      const { auth } = await import('@/lib/auth/config');
      (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'user-123' },
      });
      
      // Not admin (isAdmin returns false)
      (prisma.userRole.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const memberMock = prisma.member.findUnique as unknown as ReturnType<typeof vi.fn>;
      // First call: getSectionLeaderSection - returns a section
      memberMock.mockResolvedValueOnce({
        id: 'leader-123',
        userId: 'user-123',
        sections: [{ isLeader: true, section: { id: 'section-123', name: 'Flutes' } }],
      });
      // Second call: target member check - in different section (empty array means not in section)
      memberMock.mockResolvedValueOnce({
        id: 'member-456',
        sections: [], // Empty means not in the section leader's section
      });
      // Third call: own member check
      memberMock.mockResolvedValueOnce({
        id: 'leader-123',
        userId: 'user-123',
      });

      const result = await canAccessMember('member-456');
      expect(result).toEqual({ canAccess: false, scope: 'none' });
    });

    it('should return own when accessing own member record', async () => {
      const { auth } = await import('@/lib/auth/config');
      (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'user-123' },
      });
      
      // Not admin (isAdmin returns false)
      (prisma.userRole.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const memberMock = prisma.member.findUnique as unknown as ReturnType<typeof vi.fn>;
      // First call: getSectionLeaderSection - not a section leader (empty sections array)
      memberMock.mockResolvedValueOnce({
        id: 'member-123',
        userId: 'user-123',
        sections: [], // Not a section leader
      });
      // Second call: own member check - same member ID
      memberMock.mockResolvedValueOnce({
        id: 'member-123',
        userId: 'user-123',
      });

      const result = await canAccessMember('member-123', { allowOwn: true });
      expect(result).toEqual({ canAccess: true, scope: 'own' });
    });
  });

  describe('getMemberSectionFilter', () => {
    it('should return null for admin users', async () => {
      const { auth } = await import('@/lib/auth/config');
      (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'admin-123' },
      });
      // isAdmin check returns true
      (prisma.userRole.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        role: { type: 'ADMIN' },
      });

      const result = await getMemberSectionFilter();
      expect(result).toBeNull();
    });

    it('should return section ID for section leaders', async () => {
      const { auth } = await import('@/lib/auth/config');
      (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'user-123' },
      });
      
      // Not admin (isAdmin returns false)
      const roleMock = prisma.userRole.findFirst as unknown as ReturnType<typeof vi.fn>;
      roleMock.mockResolvedValueOnce(null);
      // Not staff (isStaff returns false)  
      roleMock.mockResolvedValueOnce(null);

      // Is section leader (getSectionLeaderSection)
      (prisma.member.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'member-123',
        userId: 'user-123',
        sections: [{ isLeader: true, section: { id: 'section-123', name: 'Flutes' } }],
      });

      const result = await getMemberSectionFilter();
      expect(result).toBe('section-123');
    });

    it('should return null for regular members', async () => {
      const { auth } = await import('@/lib/auth/config');
      (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'user-123' },
      });
      
      // Not admin (isAdmin returns false)
      const roleMock = prisma.userRole.findFirst as unknown as ReturnType<typeof vi.fn>;
      roleMock.mockResolvedValueOnce(null);
      // Not staff (isStaff returns false)
      roleMock.mockResolvedValueOnce(null);

      // Not a section leader (getSectionLeaderSection returns null - no sections with isLeader: true)
      (prisma.member.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'member-123',
        userId: 'user-123',
        sections: [], // Empty sections means not a section leader
      });

      const result = await getMemberSectionFilter();
      expect(result).toBeNull();
    });
  });
});
