'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SmartUploadDropzone } from '@/components/admin/music/smart-upload/smart-upload-dropzone';
import {
  useSmartUpload,
  getStatusLabel,
  getStatusColor,
  formatFileSize,
} from '@/hooks/use-smart-upload';
import {
  Upload,
  FileText,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface BatchSummary {
  id: string;
  status: string;
  totalFiles: number;
  processedFiles: number;
  successFiles: number;
  failedFiles: number;
  createdAt: Date | string;
  completedAt: Date | string | null;
  errorSummary: string | null;
}

interface SmartUploadClientProps {
  batches: BatchSummary[];
  total: number;
  page: number;
  totalPages: number;
  isEnabled: boolean;
  maxFiles: number;
  maxSize: number;
  aiProvider: string;
}

export function SmartUploadClient({
  batches,
  total,
  page,
  totalPages,
  isEnabled,
  maxFiles,
  maxSize,
  aiProvider,
}: SmartUploadClientProps) {
  const router = useRouter();
  const { createBatch, uploadFiles, isLoading: _isLoading, error: _error } = useSmartUpload();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFilesSelected = useCallback((files: File[]) => {
    setSelectedFiles(files);
    setUploadError(null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // Create a new batch
      const { batchId, error: createError } = await createBatch();

      if (createError || !batchId) {
        setUploadError(createError || 'Failed to create batch');
        setIsUploading(false);
        return;
      }

      // Upload files to the batch
      const result = await uploadFiles(batchId, selectedFiles);

      if (result.errors.length > 0) {
        setUploadError(
          `Some files failed to upload: ${result.errors.map((e) => e.error).join(', ')}`
        );
      }

      // Navigate to the batch detail page
      router.push(`/admin/music/smart-upload/${batchId}`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [selectedFiles, createBatch, uploadFiles, router]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETE':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'CANCELLED':
        return <XCircle className="h-4 w-4 text-muted-foreground" />;
      case 'PROCESSING':
      case 'UPLOADING':
      case 'INGESTING':
        return <Clock className="h-4 w-4 text-primary animate-pulse" />;
      case 'NEEDS_REVIEW':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Smart Upload</h1>
          <p className="text-muted-foreground">
            AI-powered music upload and metadata extraction
          </p>
        </div>
      </div>

      {/* Feature Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              File Limits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Max files:</span>{' '}
                <span className="font-medium">{maxFiles}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Max size:</span>{' '}
                <span className="font-medium">{formatFileSize(maxSize)}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Supported Files
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">PDF</Badge>
              <Badge variant="outline">MP3</Badge>
              <Badge variant="outline">WAV</Badge>
              <Badge variant="outline">OGG</Badge>
              <Badge variant="outline">JPEG</Badge>
              <Badge variant="outline">PNG</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Provider
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium capitalize">{aiProvider}</p>
            <p className="text-sm text-muted-foreground">
              Used for metadata extraction
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Files</CardTitle>
          <CardDescription>
            Drag and drop PDF scores, audio files, or images to automatically
            extract metadata and add to your music library.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SmartUploadDropzone
            onFilesSelected={handleFilesSelected}
            maxFiles={maxFiles}
            maxSize={maxSize}
            disabled={!isEnabled || isUploading}
            isUploading={isUploading}
          />

          {uploadError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p>{uploadError}</p>
              </div>
            </div>
          )}

          {selectedFiles.length > 0 && (
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setSelectedFiles([])}
                disabled={isUploading}
              >
                Clear Selection
              </Button>
              <Button
                onClick={handleUpload}
                disabled={isUploading || selectedFiles.length === 0}
              >
                {isUploading ? (
                  <>Processing...</>
                ) : (
                  <>
                    Start Upload
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Batches */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Batches</CardTitle>
          <CardDescription>
            View and manage your recent upload batches
          </CardDescription>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No batches yet</h3>
              <p className="text-muted-foreground">
                Upload your first batch to get started
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {batch.id.slice(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(batch.status)}
                          <Badge
                            variant="outline"
                            className={cn(getStatusColor(batch.status as never))}
                          >
                            {getStatusLabel(batch.status as never)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="font-medium">{batch.totalFiles}</span>
                          <span className="text-muted-foreground"> files</span>
                        </div>
                        {batch.successFiles > 0 && (
                          <div className="text-xs text-green-600">
                            {batch.successFiles} successful
                          </div>
                        )}
                        {batch.failedFiles > 0 && (
                          <div className="text-xs text-destructive">
                            {batch.failedFiles} failed
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(batch.createdAt).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(batch.createdAt).toLocaleTimeString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/music/smart-upload/${batch.id}`}>
                            View
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, total)} of{' '}
                    {total} batches
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() =>
                        router.push(`/admin/music/smart-upload?page=${page - 1}`)
                      }
                    >
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() =>
                        router.push(`/admin/music/smart-upload?page=${page + 1}`)
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SmartUploadClient;