'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn, formatDate } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { SmartUploadProgress } from '@/components/admin/music/smart-upload/smart-upload-progress';
import { SmartUploadReviewForm } from '@/components/admin/music/smart-upload/smart-upload-review-form';
import { PartMappingEditor } from '@/components/admin/music/smart-upload/part-mapping-editor';
import {
  useSmartUpload,
  useSmartUploadPoll,
  SmartUploadBatch,
  SmartUploadItem,
  SmartUploadProposal,
  getStatusLabel,
  getStatusColor,
  formatFileSize,
} from '@/hooks/use-smart-upload';
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  Trash2,
} from 'lucide-react';

interface BatchDetailClientProps {
  batch: SmartUploadBatch;
  items: SmartUploadItem[];
  proposals: SmartUploadProposal[];
  progress: number;
}

export function BatchDetailClient({
  batch: initialBatch,
  items: initialItems,
  proposals: initialProposals,
  progress: initialProgress,
}: BatchDetailClientProps) {
  const _router = useRouter();
  const { getBatch, approveBatch, cancelBatch, isLoading } = useSmartUpload();
  const { startPolling, stopPolling, isPolling } = useSmartUploadPoll();

  const [batch, setBatch] = useState(initialBatch);
  const [items, setItems] = useState(initialItems);
  const [proposals, setProposals] = useState(initialProposals);
  const [progress, setProgress] = useState(initialProgress);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    initialItems[0]?.id || null
  );
  const [partMappings, setPartMappings] = useState<Record<string, Array<{ id: string; instrument: string; pages: number[] }>>>({});

  // Start polling when batch is in progress
  useEffect(() => {
    const activeStatuses = ['UPLOADING', 'PROCESSING', 'INGESTING'];
    if (activeStatuses.includes(batch.status)) {
      startPolling(batch.id);
    }

    return () => {
      stopPolling();
    };
  }, [batch.status, batch.id, startPolling, stopPolling]);

  // Poll for updates
  useEffect(() => {
    if (isPolling) {
      const interval = setInterval(async () => {
        const updated = await getBatch(batch.id);
        if (updated) {
          setBatch(updated.batch);
          setItems(updated.items);
          setProposals(updated.proposals);
          setProgress(updated.progress);
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [isPolling, batch.id, getBatch]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    const updated = await getBatch(batch.id);
    if (updated) {
      setBatch(updated.batch);
      setItems(updated.items);
      setProposals(updated.proposals);
      setProgress(updated.progress);
    }
    setIsRefreshing(false);
  }, [batch.id, getBatch]);

  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    const result = await cancelBatch(batch.id);
    if (result.success) {
      handleRefresh();
    }
    setIsCancelling(false);
  }, [batch.id, cancelBatch, handleRefresh]);

  const handleApprove = useCallback(
    async (proposalId: string, corrections?: Record<string, unknown>) => {
      setIsApproving(true);
      const result = await approveBatch(batch.id, [
        { id: proposalId, corrections },
      ]);
      if (result.success) {
        handleRefresh();
      }
      setIsApproving(false);
    },
    [batch.id, approveBatch, handleRefresh]
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETE':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'FAILED':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'CANCELLED':
        return <XCircle className="h-5 w-5 text-muted-foreground" />;
      case 'PROCESSING':
      case 'UPLOADING':
      case 'INGESTING':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'NEEDS_REVIEW':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      default:
        return <Loader2 className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const selectedItem = items.find((item) => item.id === selectedItemId);
  const selectedProposal = proposals.find(
    (p) => p.itemId === selectedItemId
  );

  const canReview = batch.status === 'NEEDS_REVIEW';
  const canCancel = !['COMPLETE', 'FAILED', 'CANCELLED'].includes(batch.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/music/smart-upload">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Batch Details</h1>
            <p className="text-muted-foreground">
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {batch.id}
              </code>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Refresh'
            )}
          </Button>
          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isCancelling}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Cancel Batch
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Batch</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to cancel this batch? This action
                    cannot be undone. All uploaded files will be deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Batch</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancel}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isCancelling ? 'Cancelling...' : 'Cancel Batch'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Status Banner */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon(batch.status)}
              <div>
                <p className="font-medium">
                  <Badge
                    variant="outline"
                    className={cn(getStatusColor(batch.status as never))}
                  >
                    {getStatusLabel(batch.status as never)}
                  </Badge>
                </p>
                <p className="text-sm text-muted-foreground">
                  Created {formatDate(batch.createdAt)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{progress}%</p>
              <p className="text-sm text-muted-foreground">Complete</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Timeline */}
      <SmartUploadProgress
        currentStep={batch.currentStep}
        status={batch.status as never}
        progress={progress}
        errorSummary={batch.errorSummary}
      />

      {/* Main Content */}
      <Tabs defaultValue="files" className="space-y-4">
        <TabsList>
          <TabsTrigger value="files">
            Files ({items.length})
          </TabsTrigger>
          {canReview && (
            <TabsTrigger value="review">
              Review ({proposals.length})
            </TabsTrigger>
          )}
        </TabsList>

        {/* Files Tab */}
        <TabsContent value="files">
          <Card>
            <CardHeader>
              <CardTitle>Uploaded Files</CardTitle>
              <CardDescription>
                Files in this batch and their processing status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No files uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                        selectedItemId === item.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{item.fileName}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatFileSize(item.fileSize)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.errorMessage ? (
                          <Badge variant="destructive" className="text-xs">
                            {item.errorMessage}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn(
                              getStatusColor(item.status as never)
                            )}
                          >
                            {getStatusLabel(item.status as never)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Review Tab */}
        {canReview && (
          <TabsContent value="review">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* File List */}
              <Card>
                <CardHeader>
                  <CardTitle>Files to Review</CardTitle>
                  <CardDescription>
                    Select a file to review its metadata proposal
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {items.map((item) => {
                      const proposal = proposals.find(
                        (p) => p.itemId === item.id
                      );
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          className={cn(
                            'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                            selectedItemId === item.id
                              ? 'border-primary bg-primary/5'
                              : 'hover:bg-muted/50'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{item.fileName}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.mimeType}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {proposal?.isApproved ? (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Pending
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Review Form */}
              <div>
                {selectedProposal ? (
                  <div className="space-y-6">
                    <SmartUploadReviewForm
                      proposal={selectedProposal}
                      onSave={async (corrections) => {
                        await handleApprove(selectedProposal.id, corrections);
                      }}
                      onApprove={async () => {
                        await handleApprove(selectedProposal.id);
                      }}
                      isApproving={isApproving}
                      disabled={isLoading}
                    />

                    {/* Part Mapping Editor for packet files */}
                    {selectedItem && selectedItem.isPacket && selectedItem.splitFiles && (
                      <PartMappingEditor
                        parts={partMappings[selectedItem.id] || []}
                        totalPages={selectedItem.splitPages || 0}
                        onChange={(parts) => {
                          setPartMappings((prev) => ({
                            ...prev,
                            [selectedItem.id]: parts,
                          }));
                        }}
                        disabled={isLoading}
                      />
                    )}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <p>Select a file to review its metadata</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Approve All Button */}
            <div className="mt-6 flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={
                      proposals.every((p) => p.isApproved) ||
                      isApproving ||
                      isLoading
                    }
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve All Remaining
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve All Proposals</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will approve all remaining proposals and start
                      ingesting them into the music library.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        const unapproved = proposals.filter((p) => !p.isApproved);
                        setIsApproving(true);
                        for (const proposal of unapproved) {
                          await handleApprove(proposal.id);
                        }
                        setIsApproving(false);
                      }}
                    >
                      Approve All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default BatchDetailClient;