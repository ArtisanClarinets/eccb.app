'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const offerSchema = z.object({
  eventId: z.string(),
  type: z.enum(['OFFER', 'REQUEST']),
  seats: z.coerce.number().min(1).optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

export async function createCarpoolEntry(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const member = await prisma.member.findFirst({
    where: { userId: session.user.id },
  });

  if (!member) {
    throw new Error('Member not found');
  }

  const validated = offerSchema.parse({
    eventId: formData.get('eventId'),
    type: formData.get('type'),
    seats: formData.get('seats'),
    location: formData.get('location'),
    notes: formData.get('notes'),
  });

  await prisma.carpoolEntry.create({
    data: {
      eventId: validated.eventId,
      memberId: member.id,
      type: validated.type,
      seats: validated.seats,
      location: validated.location,
      notes: validated.notes,
    },
  });

  revalidatePath(`/member/events/${validated.eventId}`);
}

export async function deleteCarpoolEntry(entryId: string, eventId: string) {
    const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const member = await prisma.member.findFirst({
    where: { userId: session.user.id },
  });

  if (!member) throw new Error('Member not found');

  const entry = await prisma.carpoolEntry.findUnique({
    where: { id: entryId }
  });

  if (!entry || entry.memberId !== member.id) {
    throw new Error('Unauthorized or not found');
  }

  await prisma.carpoolEntry.delete({
    where: { id: entryId }
  });

  revalidatePath(`/member/events/${eventId}`);
}
