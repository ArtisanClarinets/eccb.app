import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { AudioPlayer } from '@/components/member/practice/AudioPlayer';

export const metadata: Metadata = {
  title: 'Practice Session',
};

interface PageProps {
  params: Promise<{ assignmentId: string }>;
}

export default async function PracticeSessionPage({ params }: PageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) return null;

  const { assignmentId } = await params;

  const assignment = await prisma.musicAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      piece: {
        include: {
          files: true,
        },
      },
    },
  });

  if (!assignment) notFound();

  const audioFiles = assignment.piece.files.filter(f => f.fileType === 'AUDIO' || f.mimeType.startsWith('audio/'));
  const pdfFiles = assignment.piece.files.filter(f => f.fileType === 'PART' || f.mimeType === 'application/pdf');

  const audioFile = audioFiles[0];
  const pdfFile = pdfFiles[0];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-4 border-b flex justify-between items-center bg-background gap-4">
         <h1 className="text-xl font-bold">{assignment.piece.title}</h1>
         {audioFile && (
           <div className="flex-1 max-w-xl">
             <AudioPlayer
               src={audioFile.storageUrl || `/api/files/download/${audioFile.storageKey}`}
               title={audioFile.fileName}
             />
           </div>
         )}
      </div>

      <div className="flex-1 bg-muted/20 relative">
        {pdfFile ? (
          <iframe
            src={pdfFile.storageUrl || `/api/files/download/${pdfFile.storageKey}`}
            className="w-full h-full border-none"
            title={pdfFile.fileName}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No PDF part available.
          </div>
        )}
      </div>
    </div>
  );
}
