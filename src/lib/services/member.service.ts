import { prisma } from '@/lib/db';
import { MemberStatus, Prisma } from '@prisma/client';
import { auditLog } from './audit';

export interface UpdateMemberData {
  firstName?: string;
  lastName?: string;
  email?: string;
  instrumentId?: string;
  sectionId?: string;
  status?: MemberStatus;
  notes?: string;
  phoneNumber?: string;
}

export class MemberService {
  /**
   * Get member profile by user ID
   */
  static async getMemberByUserId(userId: string) {
    return prisma.member.findUnique({
      where: { userId },
      include: {
        user: true,
        instruments: {
          include: {
            instrument: true,
          },
        },
        sections: {
          include: {
            section: true,
          },
        },
        musicAssignments: {
          include: {
            piece: true,
          },
        },
      },
    });
  }

  /**
   * Update member profile
   */
  static async updateMember(userId: string, data: UpdateMemberData) {
    const oldMember = await prisma.member.findUnique({ where: { userId } });
    
    const { instrumentId, sectionId, phoneNumber, ...rest } = data;

    const member = await prisma.member.update({
      where: { userId },
      data: {
        ...rest,
        phone: phoneNumber,
      },
    });

    // Handle instrument update if provided
    if (instrumentId) {
      // Remove existing instruments and add new one as primary
      await prisma.memberInstrument.deleteMany({ where: { memberId: member.id } });
      await prisma.memberInstrument.create({
        data: {
          memberId: member.id,
          instrumentId,
          isPrimary: true,
        },
      });
    }

    // Handle section update if provided
    if (sectionId) {
      // Remove existing sections and add new one
      await prisma.memberSection.deleteMany({ where: { memberId: member.id } });
      await prisma.memberSection.create({
        data: {
          memberId: member.id,
          sectionId,
        },
      });
    }

    await auditLog({
      action: 'member.update',
      entityType: 'Member',
      entityId: member.id,
      oldValues: oldMember,
      newValues: member,
    });

    return member;
  }

  /**
   * List members with filters
   */
  static async listMembers(filters?: {
    instrumentId?: string;
    sectionId?: string;
    status?: string;
  }) {
    const where: Prisma.MemberWhereInput = {};
    
    if (filters?.instrumentId) {
      where.instruments = {
        some: {
          instrumentId: filters.instrumentId,
        },
      };
    }

    if (filters?.sectionId) {
      where.sections = {
        some: {
          sectionId: filters.sectionId,
        },
      };
    }

    if (filters?.status) {
      where.status = filters.status as MemberStatus;
    }

    return prisma.member.findMany({
      where,
      include: {
        instruments: {
          include: {
            instrument: true,
          },
        },
        sections: {
          include: {
            section: true,
          },
        },
      },
      orderBy: {
        lastName: 'asc',
      },
    });
  }
}
