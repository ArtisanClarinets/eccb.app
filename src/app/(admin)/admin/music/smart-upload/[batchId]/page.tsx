import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guards';
import { env } from '@/lib/env';
import { BatchDetailClient } from './batch-detail-client';

export const metadata: Metadata = {
  title: 'Smart Upload - Batch Details',
};

interface PageProps {
  params: Promise<{ batchId: string }>;
}

export default async function BatchDetailPage({ params }: PageProps) {
  // Check permission
  await requirePermission('music:smart_upload:read');

  // Check feature flag
  if (!env.SMART_UPLOAD_ENABLED) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Batch Details</h1>
          <p className="text-muted-foreground">
            Smart Upload is currently disabled
          </p>
        </div>
      </div>
    );
  }

  const { batchId } = await params;

  // Fetch batch with items and proposals
  const batch = await prisma.smartUploadBatch.findUnique({
    where: { id: batchId },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
      },
      proposals: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!batch) {
    notFound();
  }

  // Transform to match expected format
  const transformedBatch = {
    id: batch.id,
    status: batch.status,
    currentStep: batch.currentStep,
    totalFiles: batch.totalFiles,
    processedFiles: batch.processedFiles,
    successFiles: batch.successFiles,
    failedFiles: batch.failedFiles,
    errorSummary: batch.errorSummary,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() || null,
  };

  const transformedItems = batch.items.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    fileSize: item.fileSize,
    mimeType: item.mimeType,
    status: item.status,
    currentStep: item.currentStep,
    errorMessage: item.errorMessage,
    ocrText: item.ocrText,
    extractedMeta: item.extractedMeta as Record<string, unknown> | null,
    createdAt: item.createdAt.toISOString(),
    completedAt: item.completedAt?.toISOString() || null,
  }));

  const transformedProposals = batch.proposals.map((proposal) => ({
    id: proposal.id,
    itemId: proposal.itemId,
    title: proposal.title,
    composer: proposal.composer,
    arranger: proposal.arranger,
    publisher: proposal.publisher,
    difficulty: proposal.difficulty,
    genre: proposal.genre,
    style: proposal.style,
    instrumentation: proposal.instrumentation,
    duration: proposal.duration,
    notes: proposal.notes,
    titleConfidence: proposal.titleConfidence,
    composerConfidence: proposal.composerConfidence,
    difficultyConfidence: proposal.difficultyConfidence,
    isApproved: proposal.isApproved,
    approvedAt: proposal.approvedAt?.toISOString() || null,
    approvedBy: proposal.approvedBy,
    matchedPieceId: proposal.matchedPieceId,
    isNewPiece: proposal.isNewPiece,
    corrections: proposal.corrections as Record<string, unknown> | null,
    createdAt: proposal.createdAt.toISOString(),
  }));

  const progress =
    batch.totalFiles > 0
      ? Math.round((batch.processedFiles / batch.totalFiles) * 100)
      : 0;

  return (
    <BatchDetailClient
      batch={transformedBatch}
      items={transformedItems}
      proposals={transformedProposals}
      progress={progress}
    />
  );
}