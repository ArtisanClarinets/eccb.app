import { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Music, PlayCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Practice Hub',
};

export default async function PracticeHubPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) return null;

  const member = await prisma.member.findFirst({
    where: { userId: session.user.id },
  });

  if (!member) return null;

  const assignments = await prisma.musicAssignment.findMany({
    where: {
      memberId: member.id,
      status: { not: 'RETURNED' },
    },
    include: {
      piece: {
        include: {
          files: true,
          composer: true, // Assuming composer is related
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Practice Hub</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {assignments.map((assignment) => (
          <Card key={assignment.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5" />
                {assignment.piece.title}
              </CardTitle>
              <CardDescription>
                {assignment.piece.composer?.fullName || 'Unknown Composer'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center">
                 <span className="text-sm text-muted-foreground">
                    Due: {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No due date'}
                 </span>
                 <Button asChild size="sm">
                    <Link href={`/member/practice/${assignment.id}`}>
                      <PlayCircle className="mr-2 h-4 w-4" />
                      Practice
                    </Link>
                 </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {assignments.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-10">
                No music assigned currently.
            </div>
        )}
      </div>
    </div>
  );
}
