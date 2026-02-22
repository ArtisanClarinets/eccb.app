'use client';

import { useEffect, useState } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle,
  Check,
  Clock,
  FileText,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

interface ExtractedMetadata {
  title: string;
  composer?: string;
  publisher?: string;
  instrument?: string;
  partNumber?: string;
  confidenceScore: number;
  fileType?: 'FULL_SCORE' | 'CONDUCTOR_SCORE' | 'PART' | 'CONDENSED_SCORE';
  isMultiPart?: boolean;
  parts?: Array<{
    instrument: string;
    partName: string;
  }>;
}

interface SmartUploadSession {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  confidenceScore: number | null;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  uploadedBy: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  extractedMetadata: ExtractedMetadata | null;
}

interface Stats {
  pending: number;
  approved: number;
  rejected: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getConfidenceColor(score: number | null): string {
  if (score === null) return 'bg-gray-100 text-gray-700';
  if (score >= 85) return 'bg-green-100 text-green-700';
  if (score >= 70) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}

// =============================================================================
// Client Component
// =============================================================================

function UploadReviewClient({
  initialSessions,
  initialStats,
}: {
  initialSessions: SmartUploadSession[];
  initialStats: Stats;
}) {
  const [sessions, setSessions] = useState<SmartUploadSession[]>(initialSessions);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [loading, setLoading] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [editingSession, setEditingSession] = useState<SmartUploadSession | null>(null);
  const [editedMetadata, setEditedMetadata] = useState<Partial<ExtractedMetadata>>({});
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectSessionId, setRejectSessionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Fetch sessions from API
  const fetchSessions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/uploads/review?status=PENDING_REVIEW');
      const data = await response.json();
      if (data.sessions) {
        setSessions(data.sessions);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSessions(new Set(sessions.map((s) => s.id)));
    } else {
      setSelectedSessions(new Set());
    }
  };

  // Handle select single
  const handleSelect = (sessionId: string, checked: boolean) => {
    const newSelected = new Set(selectedSessions);
    if (checked) {
      newSelected.add(sessionId);
    } else {
      newSelected.delete(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  // Handle approve
  const handleApprove = async (session: SmartUploadSession) => {
    setLoading(true);
    try {
      const metadata = editedMetadata.title
        ? editedMetadata
        : session.extractedMetadata || {};

      const response = await fetch(`/api/admin/uploads/review/${session.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: metadata.title || session.fileName,
          composer: metadata.composer,
          publisher: metadata.publisher,
          instrument: metadata.instrument,
          partNumber: metadata.partNumber,
        }),
      });

      if (response.ok) {
        await fetchSessions();
        setEditingSession(null);
        setEditedMetadata({});
      }
    } catch (error) {
      console.error('Failed to approve:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle reject
  const handleReject = async () => {
    if (!rejectSessionId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/uploads/review/${rejectSessionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });

      if (response.ok) {
        await fetchSessions();
        setRejectDialogOpen(false);
        setRejectSessionId(null);
        setRejectReason('');
      }
    } catch (error) {
      console.error('Failed to reject:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle bulk approve
  const handleBulkApprove = async () => {
    if (selectedSessions.size === 0) return;

    setLoading(true);
    try {
      const response = await fetch('/api/admin/uploads/review/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: Array.from(selectedSessions) }),
      });

      if (response.ok) {
        await fetchSessions();
        setSelectedSessions(new Set());
      }
    } catch (error) {
      console.error('Failed to bulk approve:', error);
    } finally {
      setLoading(false);
    }
  };

  // Open edit dialog
  const openEditDialog = (session: SmartUploadSession) => {
    setEditingSession(session);
    setEditedMetadata(session.extractedMetadata || {});
  };

  // Close edit dialog
  const closeEditDialog = () => {
    setEditingSession(null);
    setEditedMetadata({});
  };

  // Open reject dialog
  const openRejectDialog = (sessionId: string) => {
    setRejectSessionId(sessionId);
    setRejectDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Smart Upload Review</h1>
          <p className="text-muted-foreground">
            Review and approve AI-extracted metadata from uploaded music files.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={fetchSessions}
            disabled={loading}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          {selectedSessions.size > 0 && (
            <Button
              variant="default"
              onClick={handleBulkApprove}
              disabled={loading}
              className="bg-primary hover:bg-primary/90"
            >
              <Check className="mr-2 h-4 w-4" />
              Approve Selected ({selectedSessions.size})
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <X className="h-4 w-4 text-red-500" />
              Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Uploads</CardTitle>
          <CardDescription>
            Review extracted metadata and approve or reject uploads.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No pending uploads</h3>
              <p className="text-muted-foreground">
                All uploads have been reviewed or there are no uploads yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedSessions.size === sessions.length && sessions.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Extracted Metadata</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedSessions.has(session.id)}
                        onCheckedChange={(checked) =>
                          handleSelect(session.id, checked as boolean)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{session.fileName}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatFileSize(session.fileSize)}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {session.extractedMetadata?.title || 'Untitled'}
                        </div>
                        {session.extractedMetadata?.composer && (
                          <div className="text-sm text-muted-foreground">
                            {session.extractedMetadata.composer}
                          </div>
                        )}
                        {session.extractedMetadata?.instrument && (
                          <div className="text-xs text-muted-foreground">
                            {session.extractedMetadata.instrument}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          getConfidenceColor(session.confidenceScore),
                          session.confidenceScore !== null &&
                            session.confidenceScore < 85 &&
                            'bg-yellow-100 text-yellow-700 border-2 border-yellow-400'
                        )}
                      >
                        {session.confidenceScore !== null
                          ? `${session.confidenceScore}%`
                          : 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(session.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(session)}
                        >
                          <FileText className="mr-1 h-3 w-3" />
                          Review
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openRejectDialog(session.id)}
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit/Approve Dialog */}
      <Dialog open={!!editingSession} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Extracted Metadata</DialogTitle>
            <DialogDescription>
              Verify and edit the extracted metadata before approving.
            </DialogDescription>
          </DialogHeader>

          {editingSession && (
            <div className="space-y-6">
              {/* File Info */}
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">{editingSession.fileName}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Size: {formatFileSize(editingSession.fileSize)} | Uploaded:{' '}
                  {formatDate(editingSession.createdAt)}
                </div>
              </div>

              {/* Confidence Score */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Confidence Score:</span>
                <Badge
                  className={cn(
                    'text-lg px-3 py-1',
                    editingSession.confidenceScore !== null &&
                      editingSession.confidenceScore < 85
                      ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-400'
                      : 'bg-green-100 text-green-700'
                  )}
                >
                  {editingSession.confidenceScore !== null
                    ? `${editingSession.confidenceScore}%`
                    : 'N/A'}
                </Badge>
                {editingSession.confidenceScore !== null &&
                  editingSession.confidenceScore < 85 && (
                    <span className="text-sm text-yellow-600">
                      <AlertCircle className="inline h-4 w-4 mr-1" />
                      Below threshold - requires careful review
                    </span>
                  )}
              </div>

              {/* Metadata Form */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={editedMetadata.title || ''}
                    onChange={(e) =>
                      setEditedMetadata({ ...editedMetadata, title: e.target.value })
                    }
                    placeholder="Enter title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="composer">Composer</Label>
                  <Input
                    id="composer"
                    value={editedMetadata.composer || ''}
                    onChange={(e) =>
                      setEditedMetadata({ ...editedMetadata, composer: e.target.value })
                    }
                    placeholder="Enter composer name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="publisher">Publisher</Label>
                  <Input
                    id="publisher"
                    value={editedMetadata.publisher || ''}
                    onChange={(e) =>
                      setEditedMetadata({ ...editedMetadata, publisher: e.target.value })
                    }
                    placeholder="Enter publisher name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instrument">Instrument</Label>
                  <Input
                    id="instrument"
                    value={editedMetadata.instrument || ''}
                    onChange={(e) =>
                      setEditedMetadata({ ...editedMetadata, instrument: e.target.value })
                    }
                    placeholder="Enter instrument/ensemble"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partNumber">Part Number</Label>
                  <Input
                    id="partNumber"
                    value={editedMetadata.partNumber || ''}
                    onChange={(e) =>
                      setEditedMetadata({ ...editedMetadata, partNumber: e.target.value })
                    }
                    placeholder="Enter part number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fileType">File Type</Label>
                  <Input
                    id="fileType"
                    value={editedMetadata.fileType || ''}
                    onChange={(e) =>
                      setEditedMetadata({
                        ...editedMetadata,
                        fileType: e.target.value as ExtractedMetadata['fileType'],
                      })
                    }
                    placeholder="e.g., FULL_SCORE, PART"
                    disabled
                  />
                </div>
              </div>

              {/* Multi-part info */}
              {editingSession.extractedMetadata?.isMultiPart &&
                editingSession.extractedMetadata.parts && (
                  <div className="space-y-2">
                    <Label>Parts Detected</Label>
                    <div className="bg-muted p-3 rounded-lg">
                      {editingSession.extractedMetadata.parts.map((part, index) => (
                        <div key={index} className="text-sm">
                          <span className="font-medium">{part.instrument}</span>
                          {part.partName && <span> - {part.partName}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (editingSession) {
                  openRejectDialog(editingSession.id);
                  closeEditDialog();
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button
              onClick={() => editingSession && handleApprove(editingSession)}
              disabled={!editedMetadata.title}
              className="bg-primary hover:bg-primary/90"
            >
              <Check className="mr-2 h-4 w-4" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Upload</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this upload? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rejectReason">Reason (optional)</Label>
            <Input
              id="rejectReason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={loading}>
              <Trash2 className="mr-2 h-4 w-4" />
              Reject Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// Server Component (Page)
// =============================================================================

export default function UploadReviewPage() {
  // In a real implementation, this would fetch from the database directly
  // For now, we'll pass empty data and let the client fetch
  return (
    <UploadReviewClient initialSessions={[]} initialStats={{ pending: 0, approved: 0, rejected: 0 }} />
  );
}
