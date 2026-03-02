'use server';

import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth/guards';
import { auditLog } from '@/lib/services/audit';
import { saveProfilePhoto, deleteProfilePhoto } from '@/lib/services/file-upload';
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

/**
 * Ensures a member profile exists for the current user
 */
export async function ensureMemberExists() {
  const session = await requireAuth();

  const existingMember = await prisma.member.findUnique({
    where: { userId: session.user.id },
  });

  if (existingMember) {
    return existingMember;
  }

  // Create new member profile
  const newMember = await prisma.member.create({
    data: {
      userId: session.user.id,
      firstName: session.user.name?.split(' ')[0] || 'Member',
      lastName: session.user.name?.split(' ')[1] || '',
      email: session.user.email,
    },
  });

  await auditLog({
    action: 'CREATE',
    entityType: 'Member',
    entityId: newMember.id,
    newValues: newMember,
  });

  return newMember;
}

/**
 * Get the current user's member profile
 */
export async function getMemberProfile() {
  const session = await requireAuth();

  const member = await prisma.member.findUnique({
    where: { userId: session.user.id },
    include: {
      user: true,
      instruments: {
        include: { instrument: true },
      },
      sections: {
        include: { section: true },
      },
    },
  });

  return member;
}

/**
 * Delete member profile (with user confirmation)
 */
export async function deleteMemberProfile() {
  const session = await requireAuth();

  const currentMember = await prisma.member.findUnique({
    where: { userId: session.user.id },
  });

  if (!currentMember) {
    throw new Error('Member profile not found');
  }

  // Delete profile photo file if it exists
  if (currentMember.profilePhoto) {
    await deleteProfilePhoto(currentMember.profilePhoto);
  }

  // Delete member profile
  await prisma.member.delete({
    where: { userId: session.user.id },
  });

  await auditLog({
    action: 'DELETE',
    entityType: 'Member',
    entityId: currentMember.id,
    oldValues: currentMember,
  });

  revalidatePath('/member/profile');

  return { success: true };
}

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

  // Get current member to retrieve old photo
  const currentMember = await prisma.member.findUnique({
    where: { userId: session.user.id },
  });

  if (!currentMember) {
    throw new Error('Member profile not found');
  }

  // Save the new file
  const photoPath = await saveProfilePhoto(imageFile);

  // Delete old photo if it exists
  if (currentMember.profilePhoto) {
    await deleteProfilePhoto(currentMember.profilePhoto);
  }

  // Update member with new profile photo path
  const updatedMember = await prisma.member.update({
    where: { userId: session.user.id },
    data: {
      profilePhoto: photoPath,
    },
  });

  // Also update user image if available
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      image: photoPath,
    },
  });

  await auditLog({
    action: 'UPDATE',
    entityType: 'Member',
    entityId: updatedMember.id,
    oldValues: { profilePhoto: currentMember.profilePhoto },
    newValues: { profilePhoto: photoPath },
  });

  revalidatePath('/member/profile');
  revalidatePath('/member/profile/edit');

  return { success: true, imageUrl: photoPath };
}

export async function removeProfileImage() {
  const session = await requireAuth();

  const currentMember = await prisma.member.findUnique({
    where: { userId: session.user.id },
  });

  if (!currentMember) {
    throw new Error('Member profile not found');
  }

  // Delete the file from storage
  if (currentMember.profilePhoto) {
    await deleteProfilePhoto(currentMember.profilePhoto);
  }

  // Remove profile photo reference from database
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
