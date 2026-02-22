import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { Metadata } from 'next';
import { MessageBoard } from '@/components/member/section/MessageBoard';

export const metadata: Metadata = {
  title: 'Section Board',
};

interface PageProps {
  params: Promise<{ sectionId: string }>;
}

interface Message {
  id: string;
  content: string;
  createdAt: string | Date;
  member: {
    firstName: string;
    lastName: string;
    profilePhoto: string | null;
  };
}

export default async function SectionBoardPage({ params }: PageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) return null;

  const { sectionId } = await params;

  const member = await prisma.member.findFirst({
    where: { userId: session.user.id },
  });

  if (!member) return null;

  const membership = await prisma.memberSection.findFirst({
    where: {
      memberId: member.id,
      sectionId: sectionId,
    },
    include: {
      section: true,
    },
  });

  if (!membership) {
    return (
      <div className="p-8 text-center text-destructive">
        You are not a member of this section.
      </div>
    );
  }

  // Section messages not available - model missing from Prisma schema
  const serializedMessages: Message[] = [];

  return (
    <div className="container mx-auto py-8">
      <MessageBoard
        sectionId={sectionId}
        sectionName={membership.section.name}
        initialMessages={serializedMessages}
      />
    </div>
  );
}
