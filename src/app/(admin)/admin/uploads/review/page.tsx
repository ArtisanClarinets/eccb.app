'use client';

import { useCallback, useEffect, useState } from 'react';
import _Link from 'next/link';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  X,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ParsedPartRecord, ParseStatus, SecondPassStatus, CuttingInstruction } from '@/types/smart-upload';

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
  ensembleType?: string;
  keySignature?: string;
  timeSignature?: string;
  tempo?: string;
  cuttingInstructions?: CuttingInstruction[];
  verificationConfidence?: number;
  corrections?: string | null;
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
  parsedParts: ParsedPartRecord[] | null;
  parseStatus: ParseStatus | null;
  secondPassStatus: SecondPassStatus | null;
  autoApproved: boolean;
  cuttingInstructions: CuttingInstruction[] | null;
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
  if (score >= 60) return 'bg-yellow-100 text-yellow-700 border border-yellow-400';
  return 'bg-red-100 text-red-700 border border-red-400';
}

function getParseStatusBadge(parseStatus: ParseStatus | null): React.ReactNode {
  switch (parseStatus) {
    case 'PARSED':
      return <Badge className="bg-green-100 text-green-700">Parts Split</Badge>;
    case 'PARSE_FAILED':
      return <Badge className="bg-red-100 text-red-700">Split Failed</Badge>;
    case 'PARSING':
      return <Badge className="bg-blue-100 text-blue-700 animate-pulse">Parsing...</Badge>;
    default:
      return <Badge className="bg-yellow-100 text-yellow-700">Not Parsed</Badge>;
  }
}

function getSecondPassStatusBadge(secondPassStatus: SecondPassStatus | null): React.ReactNode {
  switch (secondPassStatus) {
    case 'QUEUED':
      return (
        <Badge className="bg-blue-100 text-blue-700 animate-pulse">
          <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
          2nd Pass Queued
        </Badge>
      );
    case 'IN_PROGRESS':
      return (
        <Badge className="bg-blue-100 text-blue-700 animate-pulse">
          <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
          2nd Pass Running
        </Badge>
      );
    case 'COMPLETE':
      return (
        <Badge className="bg-green-100 text-green-700">
          <Check className="mr-1 h-3 w-3" />
          2nd Pass ✓
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge className="bg-red-100 text-red-700">
          <X className="mr-1 h-3 w-3" />
          2nd Pass ✗
        </Badge>
      );
    default:
      return null;
  }
}

const _ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
  // State for PDF preview images keyed by session id
  const [previewImages, setPreviewImages] = useState<Record<string, { imageBase64: string; totalPages: number } | null>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  // PDF preview pagination and zoom state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Part preview state
  const [selectedPart, setSelectedPart] = useState<ParsedPartRecord | null>(null);
  const [partPreviewImages, setPartPreviewImages] = useState<Record<string, { imageBase64: string; totalPages: number } | null>>({});
  const [partCurrentPage, setPartCurrentPage] = useState(0);
  const [partTotalPages, setPartTotalPages] = useState(0);
  const [partZoomLevel, setPartZoomLevel] = useState(1);
  const [isPartFullscreen, setIsPartFullscreen] = useState(false);
  const [triggeringSecondPass, setTriggeringSecondPass] = useState<Set<string>>(new Set());

  // Auto-fetch sessions when the component mounts
  useEffect(() => {
    fetchSessions();
     
  }, []);

  // Fetch sessions from API
  const fetchSessions = async () => {
    setLoading(true);
    try {
      console.log('[REVIEW] Fetching sessions...');
      const response = await fetch('/api/admin/uploads/review?status=PENDING_REVIEW');
      console.log('[REVIEW] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[REVIEW] API error:', errorData);
        return;
      }

      const data = await response.json();
      console.log('[REVIEW] Response data:', data);
      console.log('[REVIEW] Sessions count:', data.sessions?.length);

      if (data.sessions) {
        setSessions(data.sessions);
        setStats(data.stats);
        console.log('[REVIEW] Sessions set:', data.sessions.length);
      } else if (data.error) {
        console.error('[REVIEW] API returned error:', data.error);
      }
    } catch (error) {
      console.error('[REVIEW] Fetch failed:', error);
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
          ensembleType: metadata.ensembleType,
          keySignature: metadata.keySignature,
          timeSignature: metadata.timeSignature,
          tempo: metadata.tempo,
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

  // Handle trigger second pass
  const handleTriggerSecondPass = async (sessionId: string) => {
    setTriggeringSecondPass((prev) => new Set(prev).add(sessionId));
    try {
      const response = await fetch('/api/admin/uploads/second-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (response.ok) {
        await fetchSessions();
      }
    } catch (error) {
      console.error('Failed to trigger second pass:', error);
    } finally {
      setTriggeringSecondPass((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  };

  // Load PDF preview image for a session (with pagination)
  const loadPreviewImage = useCallback(async (sessionId: string, page: number = 0) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/uploads/review/${sessionId}/preview?page=${page}`);
      if (res.ok) {
        const data = await res.json() as { imageBase64?: string; totalPages?: number };
        setPreviewImages((prev) => ({
          ...prev,
          [sessionId]: data.imageBase64 && data.totalPages
            ? { imageBase64: data.imageBase64, totalPages: data.totalPages }
            : null,
        }));
        if (data.totalPages) {
          setTotalPages(data.totalPages);
        }
      } else {
        setPreviewImages((prev) => ({ ...prev, [sessionId]: null }));
      }
    } catch {
      setPreviewImages((prev) => ({ ...prev, [sessionId]: null }));
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // Load part preview image
  const loadPartPreviewImage = useCallback(async (
    sessionId: string,
    partStorageKey: string,
    page: number = 0
  ) => {
    setPreviewLoading(true);
    try {
      const encodedKey = encodeURIComponent(partStorageKey);
      const res = await fetch(
        `/api/admin/uploads/review/${sessionId}/part-preview?partStorageKey=${encodedKey}&page=${page}`
      );
      if (res.ok) {
        const data = await res.json() as { imageBase64?: string; totalPages?: number };
        setPartPreviewImages((prev) => ({
          ...prev,
          [partStorageKey]: data.imageBase64 && data.totalPages
            ? { imageBase64: data.imageBase64, totalPages: data.totalPages }
            : null,
        }));
        if (data.totalPages) {
          setPartTotalPages(data.totalPages);
        }
      } else {
        setPartPreviewImages((prev) => ({ ...prev, [partStorageKey]: null }));
      }
    } catch {
      setPartPreviewImages((prev) => ({ ...prev, [partStorageKey]: null }));
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // Open edit dialog
  const openEditDialog = (session: SmartUploadSession) => {
    setEditingSession(session);
    setEditedMetadata(session.extractedMetadata || {});
    setSelectedPart(null);
    setCurrentPage(0);
    setTotalPages(0);
    setZoomLevel(1);
    setIsFullscreen(false);
    setPartCurrentPage(0);
    setPartTotalPages(0);
    setPartZoomLevel(1);
    setIsPartFullscreen(false);
    // Kick off preview image load asynchronously
    loadPreviewImage(session.id, 0);
  };

  // Close edit dialog
  const closeEditDialog = () => {
    setEditingSession(null);
    setEditedMetadata({});
    setSelectedPart(null);
  };

  // Open reject dialog
  const openRejectDialog = (sessionId: string) => {
    setRejectSessionId(sessionId);
    setRejectDialogOpen(true);
  };

  // Handle page change for original PDF
  const handlePageChange = (newPage: number) => {
    if (editingSession && newPage >= 0 && newPage < totalPages) {
      setCurrentPage(newPage);
      loadPreviewImage(editingSession.id, newPage);
    }
  };

  // Handle zoom change
  const handleZoomChange = (newZoom: number) => {
    if (newZoom >= 0.5 && newZoom <= 2) {
      setZoomLevel(newZoom);
    }
  };

  // Handle part selection
  const handlePartSelect = (part: ParsedPartRecord) => {
    setSelectedPart(part);
    setPartCurrentPage(0);
    setPartZoomLevel(1);
    if (editingSession) {
      loadPartPreviewImage(editingSession.id, part.storageKey, 0);
    }
  };

  // Handle part page change
  const handlePartPageChange = (newPage: number) => {
    if (selectedPart && newPage >= 0 && newPage < partTotalPages) {
      setPartCurrentPage(newPage);
      if (editingSession) {
        loadPartPreviewImage(editingSession.id, selectedPart.storageKey, newPage);
      }
    }
  };

  // Handle part zoom change
  const handlePartZoomChange = (newZoom: number) => {
    if (newZoom >= 0.5 && newZoom <= 2) {
      setPartZoomLevel(newZoom);
    }
  };

  const canTriggerSecondPass = (session: SmartUploadSession) => {
    return (
      session.secondPassStatus === 'QUEUED' ||
      session.secondPassStatus === 'FAILED'
    );
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
                  <TableHead>Processing Status</TableHead>
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
                        )}
                      >
                        {session.confidenceScore !== null
                          ? `${session.confidenceScore}%`
                          : 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {getParseStatusBadge(session.parseStatus)}
                        {getSecondPassStatusBadge(session.secondPassStatus)}
                        {session.autoApproved && (
                          <Badge className="bg-green-50 text-green-600 text-xs">
                            <Check className="mr-1 h-3 w-3" />
                            Auto ✓
                          </Badge>
                        )}
                      </div>
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
                        {canTriggerSecondPass(session) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTriggerSecondPass(session.id)}
                            disabled={triggeringSecondPass.has(session.id)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            {triggeringSecondPass.has(session.id) ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                          </Button>
                        )}
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
        <DialogContent className={cn('max-w-4xl', isFullscreen && 'max-w-none h-screen m-0 rounded-none')}>
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

              {/* PDF Preview with Tabs */}
              <Tabs defaultValue="original" className="w-full">
                <TabsList>
                  <TabsTrigger value="original">Original PDF</TabsTrigger>
                  {editingSession.parsedParts && editingSession.parsedParts.length > 0 && (
                    <TabsTrigger value="parts">
                      Parts Preview ({editingSession.parsedParts.length})
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* Original PDF Tab */}
                <TabsContent value="original" className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">PDF Preview</h4>
                    <div className="flex items-center gap-2">
                      {/* Page Navigation */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 0 || totalPages === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Page {totalPages > 0 ? currentPage + 1 : 0} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages - 1 || totalPages === 0}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      {/* Zoom Controls */}
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleZoomChange(zoomLevel - 0.25)}
                          disabled={zoomLevel <= 0.5}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="text-sm w-12 text-center">{zoomLevel}×</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleZoomChange(zoomLevel + 0.25)}
                          disabled={zoomLevel >= 2}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {/* Fullscreen Toggle */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="ml-2"
                      >
                        {isFullscreen ? (
                          <Minimize2 className="h-4 w-4" />
                        ) : (
                          <Maximize2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  {previewLoading || previewImages[editingSession.id] === undefined ? (
                    <div className="w-full h-64 bg-muted rounded-lg flex items-center justify-center">
                      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : previewImages[editingSession.id] ? (
                    <div
                      className={cn(
                        'overflow-auto bg-gray-100 rounded-lg flex items-center justify-center',
                        isFullscreen ? 'h-[calc(100vh-300px)]' : 'h-64'
                      )}
                    >
                      <img
                        src={`data:image/png;base64,${previewImages[editingSession.id]?.imageBase64}`}
                        alt={`PDF page ${currentPage + 1}`}
                        className="object-contain"
                        style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center' }}
                      />
                    </div>
                  ) : (
                    <div className="w-full h-20 bg-muted rounded-lg flex items-center justify-center border border-dashed">
                      <span className="text-xs text-muted-foreground">Preview unavailable</span>
                    </div>
                  )}
                </TabsContent>

                {/* Parts Preview Tab */}
                {editingSession.parsedParts && editingSession.parsedParts.length > 0 && (
                  <TabsContent value="parts" className="space-y-2">
                    {/* Parts Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
                      {editingSession.parsedParts.map((part, index) => (
                        <Button
                          key={index}
                          variant={selectedPart === part ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handlePartSelect(part)}
                          className="h-auto py-2 flex flex-col items-start"
                        >
                          <span className="font-medium text-xs">{part.partName}</span>
                          <span className="text-xs opacity-70">{part.instrument}</span>
                          <span className="text-xs opacity-50">
                            {part.pageRange[0]}-{part.pageRange[1]} ({part.pageCount} pages)
                          </span>
                        </Button>
                      ))}
                    </div>

                    {/* Selected Part Preview */}
                    {selectedPart && (
                      <>
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold">
                            Part: {selectedPart.partName} ({selectedPart.instrument})
                          </h4>
                          <div className="flex items-center gap-2">
                            {/* Page Navigation */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePartPageChange(partCurrentPage - 1)}
                              disabled={partCurrentPage === 0 || partTotalPages === 0}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm">
                              Page {partTotalPages > 0 ? partCurrentPage + 1 : 0} / {partTotalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePartPageChange(partCurrentPage + 1)}
                              disabled={partCurrentPage >= partTotalPages - 1 || partTotalPages === 0}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                            {/* Zoom Controls */}
                            <div className="flex items-center gap-1 ml-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePartZoomChange(partZoomLevel - 0.25)}
                                disabled={partZoomLevel <= 0.5}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="text-sm w-12 text-center">{partZoomLevel}×</span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePartZoomChange(partZoomLevel + 0.25)}
                                disabled={partZoomLevel >= 2}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            {/* Fullscreen Toggle */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setIsPartFullscreen(!isPartFullscreen)}
                              className="ml-2"
                            >
                              {isPartFullscreen ? (
                                <Minimize2 className="h-4 w-4" />
                              ) : (
                                <Maximize2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        {previewLoading || partPreviewImages[selectedPart.storageKey] === undefined ? (
                          <div className="w-full h-64 bg-muted rounded-lg flex items-center justify-center">
                            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : partPreviewImages[selectedPart.storageKey] ? (
                          <div
                            className={cn(
                              'overflow-auto bg-gray-100 rounded-lg flex items-center justify-center',
                              isPartFullscreen ? 'h-[calc(100vh-400px)]' : 'h-64'
                            )}
                          >
                            <img
                              src={`data:image/png;base64,${partPreviewImages[selectedPart.storageKey]?.imageBase64}`}
                              alt={`Part ${selectedPart.partName} page ${partCurrentPage + 1}`}
                              className="object-contain"
                              style={{
                                transform: `scale(${partZoomLevel})`,
                                transformOrigin: 'center',
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-full h-20 bg-muted rounded-lg flex items-center justify-center border border-dashed">
                            <span className="text-xs text-muted-foreground">Preview unavailable</span>
                          </div>
                        )}
                      </>
                    )}
                  </TabsContent>
                )}
              </Tabs>

              {/* Confidence Score */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Confidence Score:</span>
                <Badge
                  className={cn(
                    'text-lg px-3 py-1',
                    getConfidenceColor(editingSession.confidenceScore)
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

              {/* Gap Warning */}
              {editingSession.cuttingInstructions?.some(inst => (inst.partNumber ?? 0) >= 9900) && (
                <div className="flex items-start gap-3 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600" />
                  <div>
                    <p className="font-medium">Uncovered page gaps detected</p>
                    <p className="text-xs mt-0.5">
                      The following page ranges were not assigned to any part:
                      {' '}
                      {editingSession.cuttingInstructions
                        .filter(inst => (inst.partNumber ?? 0) >= 9900)
                        .map(inst => `pages ${inst.pageRange[0]}–${inst.pageRange[1]}`)
                        .join(', ')}
                      . Review the cutting instructions or re-run AI analysis.
                    </p>
                  </div>
                </div>
              )}

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

              {/* New Metadata Fields */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ensembleType">Ensemble Type</Label>
                  <Input
                    id="ensembleType"
                    value={editedMetadata.ensembleType || ''}
                    onChange={(e) =>
                      setEditedMetadata({ ...editedMetadata, ensembleType: e.target.value })
                    }
                    placeholder="e.g., Concert Band, Jazz Band"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="keySignature">Key Signature</Label>
                  <Input
                    id="keySignature"
                    value={editedMetadata.keySignature || ''}
                    onChange={(e) =>
                      setEditedMetadata({ ...editedMetadata, keySignature: e.target.value })
                    }
                    placeholder="e.g., C Major, Bb Major"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeSignature">Time Signature</Label>
                  <Input
                    id="timeSignature"
                    value={editedMetadata.timeSignature || ''}
                    onChange={(e) =>
                      setEditedMetadata({ ...editedMetadata, timeSignature: e.target.value })
                    }
                    placeholder="e.g., 4/4, 3/4"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tempo">Tempo</Label>
                  <Input
                    id="tempo"
                    value={editedMetadata.tempo || ''}
                    onChange={(e) =>
                      setEditedMetadata({ ...editedMetadata, tempo: e.target.value })
                    }
                    placeholder="e.g., 120 BPM, Andante"
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
                    <div className="space-y-2">
                      <Label>ParsedParts</Label>
                      {editingSession.parsedParts && editingSession.parsedParts.length > 0 ? (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Part Name</TableHead>
                                <TableHead>Instrument</TableHead>
                                <TableHead>Section</TableHead>
                                <TableHead>Transposition</TableHead>
                                <TableHead>Pages</TableHead>
                                <TableHead>Page Range</TableHead>
                                <TableHead>Size</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {editingSession.parsedParts.map((part, index) => (
                                <TableRow key={index}>
                                  <TableCell>{part.partName}</TableCell>
                                  <TableCell>{part.instrument}</TableCell>
                                  <TableCell>{part.section}</TableCell>
                                  <TableCell>{part.transposition || '-'}</TableCell>
                                  <TableCell>{part.pageCount}</TableCell>
                                  <TableCell>
                                    {part.pageRange[0]} - {part.pageRange[1]}
                                  </TableCell>
                                  <TableCell>{formatFileSize(part.fileSize)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="inline h-4 w-4 text-yellow-600 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-yellow-800">
                                No parts were automatically split from this PDF.
                              </p>
                              <p className="text-sm text-yellow-700 mt-1">
                                On approval, the original PDF will be stored as a single file. You can
                                manually trigger splitting after running the second-pass analysis.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {/* ParsedParts Section */}
              <div className="space-y-2">
                <Label>Parsed Parts</Label>
                {editingSession.parsedParts && editingSession.parsedParts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Part Name</TableHead>
                          <TableHead>Instrument</TableHead>
                          <TableHead>Section</TableHead>
                          <TableHead>Transposition</TableHead>
                          <TableHead>Pages</TableHead>
                          <TableHead>Page Range</TableHead>
                          <TableHead>Size</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editingSession.parsedParts.map((part, index) => (
                          <TableRow key={index}>
                            <TableCell>{part.partName}</TableCell>
                            <TableCell>{part.instrument}</TableCell>
                            <TableCell>{part.section}</TableCell>
                            <TableCell>{part.transposition || '-'}</TableCell>
                            <TableCell>{part.pageCount}</TableCell>
                            <TableCell>
                              {part.pageRange[0]} - {part.pageRange[1]}
                            </TableCell>
                            <TableCell>{formatFileSize(part.fileSize)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800">
                          No parts were automatically split from this PDF.
                        </p>
                        <p className="text-sm text-yellow-700 mt-1">
                          On approval, the original PDF will be stored as a single file. You can
                          manually trigger splitting after running the second-pass analysis.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
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

// Note: This page uses client-side fetching for sessions to ensure
// proper authentication state. The initial data is empty and the
// client fetches from the API on mount.

export default function UploadReviewPage() {
  return (
    <UploadReviewClient initialSessions={[]} initialStats={{ pending: 0, approved: 0, rejected: 0 }} />
  );
}
