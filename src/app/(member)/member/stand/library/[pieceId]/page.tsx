import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { LibraryStandViewer } from '@/components/member/stand/LibraryStandViewer';
import { fileExists } from '@/lib/services/storage';

export const metadata: Metadata = {
  title: 'Music Stand – Library',
};

interface PageProps {
  params: Promise<{ pieceId: string }>;
}

export default async function LibraryStandPage({ params }: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/login');

  // Any authenticated member can view library pieces
  const member = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!member) redirect('/member/stand');

  const { pieceId } = await params;

  const piece = await prisma.musicPiece.findFirst({
    where: { id: pieceId, isArchived: false },
    include: {
      composer: { select: { fullName: true } },
      files: {
        where: { mimeType: 'application/pdf', isArchived: false },
        select: {
          id: true,
          storageKey: true,
          storageUrl: true,
          pageCount: true,
          partLabel: true,
          instrumentName: true,
        },
      },
      parts: {
        include: {
          instrument: { select: { id: true, name: true } },
          file: {
            select: {
              id: true,
              storageKey: true,
              storageUrl: true,
              pageCount: true,
            },
          },
        },
      },
    },
  });

  if (!piece) notFound();

  // Check which storage keys exist so the viewer can flag unavailable files
  // without the user seeing a confusing raw 404 error.
  const allKeys = [
    ...piece.files.map((f) => f.storageKey),
    ...piece.parts
      .map((p) => p.storageKey ?? p.file?.storageKey)
      .filter((k): k is string => Boolean(k)),
  ];

  const existenceResults = await Promise.all(
    allKeys.map(async (key) => ({ key, exists: await fileExists(key) }))
  );
  const missingStorageKeys = existenceResults
    .filter((r) => !r.exists)
    .map((r) => r.key);

  const allFilesUnavailable =
    piece.files.length === 0 ||
    piece.files.every((f) => missingStorageKeys.includes(f.storageKey));

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Minimal top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-card shrink-0">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/member/stand">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="font-semibold text-sm truncate">{piece.title}</h1>
          {piece.composer && (
            <p className="text-xs text-muted-foreground truncate">{piece.composer.fullName}</p>
          )}
        </div>
        <div className="ml-auto text-xs text-muted-foreground">Library Mode</div>
      </div>

      {allFilesUnavailable ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-6">
          <AlertTriangle className="h-12 w-12 text-amber-500" />
          <div>
            <p className="font-semibold text-lg">Sheet music files are unavailable</p>
            <p className="text-sm text-muted-foreground mt-1">
              The PDF for <span className="font-medium">{piece.title}</span> could not be found in
              storage. Please ask a director to re-upload this piece via Smart Upload.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/member/stand">Back to Library</Link>
          </Button>
        </div>
      ) : (
        <LibraryStandViewer
          piece={{
            id: piece.id,
            title: piece.title,
            composer: piece.composer?.fullName ?? null,
            files: piece.files.map((f) => ({
              id: f.id,
              storageKey: f.storageKey,
              storageUrl: f.storageUrl ?? null,
              pageCount: f.pageCount ?? 1,
              partLabel: f.partLabel ?? null,
              instrumentName: f.instrumentName ?? null,
            })),
            parts: piece.parts.map((p) => ({
              id: p.id,
              partName: p.partName,
              instrumentId: p.instrumentId,
              instrumentName: p.instrument.name,
              storageKey: p.storageKey ?? p.file?.storageKey ?? null,
              pageCount: p.pageCount ?? p.file?.pageCount ?? null,
            })),
          }}
          missingStorageKeys={missingStorageKeys}
          userId={session.user.id}
        />
      )}
    </div>
  );
}
