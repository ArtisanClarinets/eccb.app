'use server';

import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth/guards';
import { auditLog } from '@/lib/services/audit';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const profileUpdateSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address').optional().nullable(),
  phone: z.string().optional().nullable(),
  emergencyName: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  emergencyEmail: z.string().email('Invalid emergency email').optional().nullable(),
  instrumentIds: z.array(z.string()).optional(),
  sectionIds: z.array(z.string()).optional(),
  primaryInstrumentId: z.string().optional().nullable(),
});

export type ProfileUpdateData = z.infer<typeof profileUpdateSchema>;

export async function updateProfile(data: ProfileUpdateData) {
  const session = await requireAuth();

  const validated = profileUpdateSchema.parse(data);

  // Get current member data for audit log
  const currentMember = await prisma.member.findUnique({
    where: { userId: session.user.id },
    include: {
      instruments: true,
      sections: true,
    },
  });

  if (!currentMember) {
    throw new Error('Member profile not found');
  }

  // Update member in a transaction
  const updatedMember = await prisma.$transaction(async (tx) => {
    // Update basic member info
    const member = await tx.member.update({
      where: { userId: session.user.id },
      data: {
        firstName: validated.firstName,
        lastName: validated.lastName,
        email: validated.email,
        phone: validated.phone,
        emergencyName: validated.emergencyName,
        emergencyPhone: validated.emergencyPhone,
        emergencyEmail: validated.emergencyEmail,
      },
    });

    // Update instruments if provided
    if (validated.instrumentIds !== undefined) {
      // Delete existing instrument associations
      await tx.memberInstrument.deleteMany({
        where: { memberId: member.id },
      });

      // Create new instrument associations
      if (validated.instrumentIds.length > 0) {
        await tx.memberInstrument.createMany({
          data: validated.instrumentIds.map((id, index) => ({
            memberId: member.id,
            instrumentId: id,
            isPrimary: id === validated.primaryInstrumentId || 
              (index === 0 && !validated.primaryInstrumentId),
          })),
        });
      }
    }

    // Update sections if provided
    if (validated.sectionIds !== undefined) {
      // Delete existing section associations
      await tx.memberSection.deleteMany({
        where: { memberId: member.id },
      });

      // Create new section associations
      if (validated.sectionIds.length > 0) {
        await tx.memberSection.createMany({
          data: validated.sectionIds.map((id) => ({
            memberId: member.id,
            sectionId: id,
          })),
        });
      }
    }

    return member;
  });

  await auditLog({
    action: 'UPDATE',
    entityType: 'Member',
    entityId: updatedMember.id,
    oldValues: currentMember,
    newValues: updatedMember,
  });

  revalidatePath('/member/profile');
  revalidatePath('/member/profile/edit');

  return updatedMember;
}

export async function updateProfileImage(formData: FormData) {
  const session = await requireAuth();

  const imageFile = formData.get('image') as File | null;
  
  if (!imageFile) {
    throw new Error('No image file provided');
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(imageFile.type)) {
    throw new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.');
  }

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024;
  if (imageFile.size > maxSize) {
    throw new Error('File size too large. Maximum size is 5MB.');
  }

  // Get current member
  const currentMember = await prisma.member.findUnique({
    where: { userId: session.user.id },
  });

  if (!currentMember) {
    throw new Error('Member profile not found');
  }

  // For now, we'll convert to base64 data URL for storage
  // In production, this should upload to cloud storage
  const bytes = await imageFile.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${imageFile.type};base64,${base64}`;

  // Update member with new profile photo
  const updatedMember = await prisma.member.update({
    where: { userId: session.user.id },
    data: {
      profilePhoto: dataUrl,
    },
  });

  // Also update user image if available
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      image: dataUrl,
    },
  });

  await auditLog({
    action: 'UPDATE',
    entityType: 'Member',
    entityId: updatedMember.id,
    oldValues: { profilePhoto: currentMember.profilePhoto },
    newValues: { profilePhoto: '[UPDATED]' },
  });

  revalidatePath('/member/profile');
  revalidatePath('/member/profile/edit');

  return { success: true, imageUrl: dataUrl };
}

export async function removeProfileImage() {
  const session = await requireAuth();

  const currentMember = await prisma.member.findUnique({
    where: { userId: session.user.id },
  });

  if (!currentMember) {
    throw new Error('Member profile not found');
  }

  // Remove profile photo
  await prisma.member.update({
    where: { userId: session.user.id },
    data: {
      profilePhoto: null,
    },
  });

  // Also update user image
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      image: null,
    },
  });

  await auditLog({
    action: 'UPDATE',
    entityType: 'Member',
    entityId: currentMember.id,
    oldValues: { profilePhoto: currentMember.profilePhoto },
    newValues: { profilePhoto: null },
  });

  revalidatePath('/member/profile');
  revalidatePath('/member/profile/edit');

  return { success: true };
}
