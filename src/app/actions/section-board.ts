'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const messageSchema = z.object({
  sectionId: z.string(),
  content: z.string().min(1),
});

export async function postSectionMessage(formData: FormData) {
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

  const sectionId = formData.get('sectionId') as string;
  const content = formData.get('content') as string;

  const validated = messageSchema.parse({ sectionId, content });

  // Verify member belongs to section
  const membership = await prisma.memberSection.findFirst({
    where: {
      memberId: member.id,
      sectionId: validated.sectionId,
    },
  });

  if (!membership) {
    throw new Error('Not a member of this section');
  }

  await prisma.sectionMessage.create({
    data: {
      sectionId: validated.sectionId,
      memberId: member.id,
      content: validated.content,
    },
  });

  revalidatePath(`/member/sections/${validated.sectionId}`);
}
