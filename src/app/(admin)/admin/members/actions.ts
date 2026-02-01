'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guards';
import { auditLog } from '@/lib/services/audit';
import { z } from 'zod';
import { MemberStatus } from '@prisma/client';

const memberSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional().or(z.literal('')),
  userId: z.string().optional(),
  sectionId: z.string().optional(),
  primaryInstrumentId: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'LEAVE_OF_ABSENCE', 'PENDING', 'ALUMNI', 'AUDITION']),
  joinDate: z.string().optional(),
  phone: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  emergencyEmail: z.string().optional(),
  notes: z.string().optional(),
});

export async function createMember(formData: FormData) {
  const session = await requirePermission('members:create');

  try {
    const data = {
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
      email: formData.get('email') as string || undefined,
      userId: formData.get('userId') as string || undefined,
      sectionId: formData.get('sectionId') as string || undefined,
      primaryInstrumentId: formData.get('primaryInstrumentId') as string || undefined,
      status: formData.get('status') as string || 'PENDING',
      joinDate: formData.get('joinDate') as string || undefined,
      phone: formData.get('phone') as string || undefined,
      emergencyName: formData.get('emergencyName') as string || undefined,
      emergencyPhone: formData.get('emergencyPhone') as string || undefined,
      emergencyEmail: formData.get('emergencyEmail') as string || undefined,
      notes: formData.get('notes') as string || undefined,
    };

    const validated = memberSchema.parse(data);

    // Check if user already has a member profile (if userId provided)
    if (validated.userId) {
      const existingMember = await prisma.member.findUnique({
        where: { userId: validated.userId },
      });

      if (existingMember) {
        return { success: false, error: 'User already has a member profile' };
      }
    }

    const member = await prisma.member.create({
      data: {
        firstName: validated.firstName,
        lastName: validated.lastName,
        email: validated.email || undefined,
        userId: validated.userId || undefined,
        status: validated.status as MemberStatus,
        joinDate: validated.joinDate ? new Date(validated.joinDate) : undefined,
        phone: validated.phone || undefined,
        emergencyName: validated.emergencyName || undefined,
        emergencyPhone: validated.emergencyPhone || undefined,
        emergencyEmail: validated.emergencyEmail || undefined,
        notes: validated.notes || undefined,
      },
    });

    // Create section assignment if sectionId provided
    if (validated.sectionId) {
      await prisma.memberSection.create({
        data: {
          memberId: member.id,
          sectionId: validated.sectionId,
        },
      });
    }

    // Create instrument assignment if primaryInstrumentId provided
    if (validated.primaryInstrumentId) {
      await prisma.memberInstrument.create({
        data: {
          memberId: member.id,
          instrumentId: validated.primaryInstrumentId,
          isPrimary: true,
        },
      });
    }

    await auditLog({
      action: 'member.create',
      entityType: 'Member',
      entityId: member.id,
      newValues: { name: `${member.firstName} ${member.lastName}` },
    });

    revalidatePath('/admin/members');

    return { success: true, memberId: member.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    console.error('Failed to create member:', error);
    return { success: false, error: 'Failed to create member' };
  }
}

export async function updateMember(id: string, formData: FormData) {
  const session = await requirePermission('members:update');

  try {
    const data = {
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
      email: formData.get('email') as string || undefined,
      sectionId: formData.get('sectionId') as string || undefined,
      primaryInstrumentId: formData.get('primaryInstrumentId') as string || undefined,
      status: formData.get('status') as string,
      joinDate: formData.get('joinDate') as string || undefined,
      phone: formData.get('phone') as string || undefined,
      emergencyName: formData.get('emergencyName') as string || undefined,
      emergencyPhone: formData.get('emergencyPhone') as string || undefined,
      emergencyEmail: formData.get('emergencyEmail') as string || undefined,
      notes: formData.get('notes') as string || undefined,
    };

    const member = await prisma.member.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        status: data.status as MemberStatus,
        joinDate: data.joinDate ? new Date(data.joinDate) : undefined,
        phone: data.phone || null,
        emergencyName: data.emergencyName || null,
        emergencyPhone: data.emergencyPhone || null,
        emergencyEmail: data.emergencyEmail || null,
        notes: data.notes || null,
      },
    });

    // Update section assignment if changed
    if (data.sectionId !== undefined) {
      // Remove existing section assignments and create new one
      await prisma.memberSection.deleteMany({
        where: { memberId: id },
      });
      if (data.sectionId) {
        await prisma.memberSection.create({
          data: {
            memberId: id,
            sectionId: data.sectionId,
          },
        });
      }
    }

    // Update primary instrument if changed
    if (data.primaryInstrumentId !== undefined) {
      // Remove existing primary instrument
      await prisma.memberInstrument.deleteMany({
        where: { memberId: id, isPrimary: true },
      });
      if (data.primaryInstrumentId) {
        await prisma.memberInstrument.upsert({
          where: {
            memberId_instrumentId: {
              memberId: id,
              instrumentId: data.primaryInstrumentId,
            },
          },
          update: { isPrimary: true },
          create: {
            memberId: id,
            instrumentId: data.primaryInstrumentId,
            isPrimary: true,
          },
        });
      }
    }

    await auditLog({
      action: 'member.update',
      entityType: 'Member',
      entityId: member.id,
      newValues: { name: `${member.firstName} ${member.lastName}` },
    });

    revalidatePath('/admin/members');
    revalidatePath(`/admin/members/${id}`);

    return { success: true };
  } catch (error) {
    console.error('Failed to update member:', error);
    return { success: false, error: 'Failed to update member' };
  }
}

export async function deleteMember(id: string) {
  const session = await requirePermission('members:delete');

  try {
    const member = await prisma.member.delete({
      where: { id },
    });

    await auditLog({
      action: 'member.delete',
      entityType: 'Member',
      entityId: id,
      newValues: { name: `${member.firstName} ${member.lastName}` },
    });

    revalidatePath('/admin/members');

    return { success: true };
  } catch (error) {
    console.error('Failed to delete member:', error);
    return { success: false, error: 'Failed to delete member' };
  }
}

export async function updateMemberStatus(id: string, status: string) {
  const session = await requirePermission('members:update');

  try {
    const member = await prisma.member.update({
      where: { id },
      data: { status: status as MemberStatus },
    });

    await auditLog({
      action: 'member.status_change',
      entityType: 'Member',
      entityId: id,
      newValues: { name: `${member.firstName} ${member.lastName}`, status },
    });

    revalidatePath('/admin/members');
    revalidatePath(`/admin/members/${id}`);

    return { success: true };
  } catch (error) {
    console.error('Failed to update member status:', error);
    return { success: false, error: 'Failed to update status' };
  }
}

export async function assignMemberToSection(memberId: string, sectionId: string | null) {
  const session = await requirePermission('members:update');

  try {
    // Remove existing section assignments
    await prisma.memberSection.deleteMany({
      where: { memberId },
    });

    // Create new assignment if sectionId provided
    if (sectionId) {
      await prisma.memberSection.create({
        data: {
          memberId,
          sectionId,
        },
      });
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: {
        sections: {
          include: { section: true },
        },
      },
    });

    await auditLog({
      action: 'member.section_change',
      entityType: 'Member',
      entityId: memberId,
      newValues: {
        name: member ? `${member.firstName} ${member.lastName}` : 'Unknown',
        section: member?.sections[0]?.section.name || 'None',
      },
    });

    revalidatePath('/admin/members');
    revalidatePath(`/admin/members/${memberId}`);

    return { success: true };
  } catch (error) {
    console.error('Failed to assign section:', error);
    return { success: false, error: 'Failed to assign section' };
  }
}
