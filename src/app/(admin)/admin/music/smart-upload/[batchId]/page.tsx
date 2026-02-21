import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guards';
import { env } from '@/lib/env';
import { isSmartUploadEnabled } from '@/lib/services/smart-upload-settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, ArrowLeft } from 'lucide-react';
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

  // Check feature flag from database (with fallback to env)
  // Note: We allow access to existing batches even when feature is disabled
  const dbEnabled = await isSmartUploadEnabled();
  const isFeatureEnabled = dbEnabled ?? env.SMART_UPLOAD_ENABLED;

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
    isPacket: item.isPacket,
    splitPages: item.splitPages,
    splitFiles: item.splitFiles as Record<string, unknown> | null,
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
    ocrText: null, // Proposals don't have ocrText directly, it's on the item
    createdAt: proposal.createdAt.toISOString(),
  }));

  const progress =
    batch.totalFiles > 0
      ? Math.round((batch.processedFiles / batch.totalFiles) * 100)
      : 0;

  return (
    <>
      {/* Back link and settings link */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/music/smart-upload">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Smart Upload
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/music/smart-upload/settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Link>
        </Button>
      </div>

      {/* Feature disabled warning for existing batches */}
      {!isFeatureEnabled && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-amber-800">
              <Settings className="h-4 w-4" />
              <span className="text-sm">
                Smart Upload is currently disabled. You can view and review existing batches,
                but cannot create new uploads.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <BatchDetailClient
        batch={transformedBatch}
        items={transformedItems}
        proposals={transformedProposals}
        progress={progress}
      />
    </>
  );
}