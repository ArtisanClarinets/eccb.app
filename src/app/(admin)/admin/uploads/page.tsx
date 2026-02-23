'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Settings,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

type UploadPhase =
  | 'idle'
  | 'uploading'
  | 'extracting'
  | 'verifying'
  | 'done'
  | 'error';

interface UploadResult {
  sessionId: string;
  fileName: string;
  confidenceScore: number;
  title: string;
  composer?: string;
  instrument?: string;
}

interface UploadItem {
  id: string;
  file: File;
  phase: UploadPhase;
  progress: number;
  error?: string;
  result?: UploadResult;
}

// =============================================================================
// Helpers
// =============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function phaseLabel(phase: UploadPhase): string {
  switch (phase) {
    case 'idle':
      return 'Queued';
    case 'uploading':
      return 'Uploading…';
    case 'extracting':
      return 'AI Extracting Metadata…';
    case 'verifying':
      return 'AI Verifying…';
    case 'done':
      return 'Complete';
    case 'error':
      return 'Failed';
  }
}

function phaseColor(phase: UploadPhase): string {
  switch (phase) {
    case 'idle':
      return 'bg-gray-100 text-gray-700';
    case 'uploading':
    case 'extracting':
    case 'verifying':
      return 'bg-blue-100 text-blue-700';
    case 'done':
      return 'bg-green-100 text-green-700';
    case 'error':
      return 'bg-red-100 text-red-700';
  }
}

function phaseProgress(phase: UploadPhase): number {
  switch (phase) {
    case 'idle':
      return 0;
    case 'uploading':
      return 30;
    case 'extracting':
      return 60;
    case 'verifying':
      return 85;
    case 'done':
      return 100;
    case 'error':
      return 0;
  }
}

// =============================================================================
// Upload logic
// =============================================================================

async function processUpload(
  item: UploadItem,
  onProgress: (id: string, update: Partial<UploadItem>) => void
): Promise<void> {
  const { id, file } = item;

  onProgress(id, { phase: 'uploading', progress: 10 });

  const formData = new FormData();
  formData.append('file', file);

  let response: Response;
  try {
    response = await fetch('/api/files/smart-upload', {
      method: 'POST',
      body: formData,
    });
  } catch {
    onProgress(id, {
      phase: 'error',
      progress: 0,
      error: 'Network error — check your connection.',
    });
    return;
  }

  onProgress(id, { phase: 'extracting', progress: 60 });

  if (!response.ok) {
    let errMsg = `Server error ${response.status}`;
    try {
      const errBody = await response.json();
      if (typeof errBody?.error === 'string') errMsg = errBody.error;
    } catch {
      // ignore parse errors
    }
    onProgress(id, { phase: 'error', progress: 0, error: errMsg });
    return;
  }

  onProgress(id, { phase: 'verifying', progress: 85 });

  let body: {
    success: boolean;
    session?: { id: string; fileName: string; confidenceScore: number };
    extractedMetadata?: { title: string; composer?: string; instrument?: string };
    error?: string;
  };

  try {
    body = await response.json();
  } catch {
    onProgress(id, { phase: 'error', progress: 0, error: 'Invalid JSON response from server.' });
    return;
  }

  if (!body.success || !body.session || !body.extractedMetadata) {
    onProgress(id, {
      phase: 'error',
      progress: 0,
      error: body.error ?? 'Unexpected response format.',
    });
    return;
  }

  onProgress(id, {
    phase: 'done',
    progress: 100,
    result: {
      sessionId: body.session.id,
      fileName: body.session.fileName,
      confidenceScore: body.session.confidenceScore,
      title: body.extractedMetadata.title,
      composer: body.extractedMetadata.composer,
      instrument: body.extractedMetadata.instrument,
    },
  });
}

// =============================================================================
// Component
// =============================================================================

export default function SmartMusicUploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateItem = useCallback((id: string, update: Partial<UploadItem>) => {
    setItems(prev =>
      prev.map(it => (it.id === id ? { ...it, ...update } : it))
    );
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const pdfs = fileArray.filter(f => f.type === 'application/pdf');
      if (pdfs.length === 0) return;

      const newItems: UploadItem[] = pdfs.map(file => ({
        id: crypto.randomUUID(),
        file,
        phase: 'idle',
        progress: 0,
      }));

      setItems(prev => [...prev, ...newItems]);
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
        // reset so same file can be re-added
        e.target.value = '';
      }
    },
    [addFiles]
  );

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const startProcessing = async () => {
    const pending = items.filter(it => it.phase === 'idle' || it.phase === 'error');
    if (pending.length === 0) return;

    setIsProcessing(true);
    // Reset any errored items
    pending.forEach(it => {
      if (it.phase === 'error') updateItem(it.id, { phase: 'idle', error: undefined });
    });

    // Process concurrently (max 3 at a time)
    const concurrency = 3;
    for (let i = 0; i < pending.length; i += concurrency) {
      const batch = pending.slice(i, i + concurrency);
      await Promise.all(batch.map(it => processUpload(it, updateItem)));
    }

    setIsProcessing(false);
  };

  const pendingCount = items.filter(it => it.phase === 'idle').length;
  const doneCount = items.filter(it => it.phase === 'done').length;
  const errorCount = items.filter(it => it.phase === 'error').length;
  const activeCount = items.filter(
    it => it.phase === 'uploading' || it.phase === 'extracting' || it.phase === 'verifying'
  ).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-primary" />
            Smart Music Upload
          </h1>
          <p className="text-muted-foreground mt-1">
            Drop PDF sheet music files and let AI automatically extract metadata.
            Extracted data goes to the{' '}
            <Link href="/admin/uploads/review" className="text-primary underline-offset-2 hover:underline">
              review queue
            </Link>{' '}
            before entering the music library.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/uploads/settings">
              <Settings className="mr-2 h-4 w-4" />
              LLM Settings
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/uploads/review">
              Review Queue
              {doneCount > 0 && (
                <Badge className="ml-2 bg-primary text-primary-foreground">{doneCount}</Badge>
              )}
            </Link>
          </Button>
        </div>
      </div>

      {/* Drop Zone */}
      <Card
        className={cn(
          'border-2 border-dashed transition-colors cursor-pointer',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
        )}
        onDragOver={e => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <div
            className={cn(
              'rounded-full p-4 transition-colors',
              isDragging ? 'bg-primary/10' : 'bg-muted'
            )}
          >
            <Upload
              className={cn(
                'h-10 w-10 transition-colors',
                isDragging ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium">
              {isDragging ? 'Drop PDF files here' : 'Drag & drop PDF files'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse — only PDF files are accepted (max 50 MB each)
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={e => e.stopPropagation()}>
            Browse Files
          </Button>
        </CardContent>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      {/* File List */}
      {items.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle>Upload Queue</CardTitle>
              <CardDescription>
                {pendingCount} pending · {activeCount} processing · {doneCount} done
                {errorCount > 0 && ` · ${errorCount} failed`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {items.some(it => it.phase === 'done' || it.phase === 'error') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setItems(prev => prev.filter(it => it.phase !== 'done' && it.phase !== 'error'))
                  }
                >
                  Clear Finished
                </Button>
              )}
              <Button
                onClick={startProcessing}
                disabled={
                  isProcessing ||
                  !items.some(it => it.phase === 'idle' || it.phase === 'error')
                }
                size="sm"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Start AI Processing
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map(item => (
              <UploadItemRow
                key={item.id}
                item={item}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* How it works */}
      {items.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How Smart Upload Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm text-muted-foreground">
              {[
                {
                  icon: Upload,
                  label: 'Upload',
                  desc: 'Drop one or more sheet music PDF files into the zone above.',
                },
                {
                  icon: Sparkles,
                  label: 'AI Extraction',
                  desc: 'A vision-enabled LLM reads the first page and extracts metadata: title, composer, instrument, file type, and more.',
                },
                {
                  icon: Clock,
                  label: 'Verification',
                  desc: 'A second AI pass verifies the extracted data when confidence is below 90%.',
                },
                {
                  icon: CheckCircle2,
                  label: 'Review & Approve',
                  desc: 'Admins review the proposal in the Upload Review queue, edit if needed, and approve — creating the music library entry.',
                },
              ].map(({ icon: Icon, label, desc }) => (
                <li key={label} className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5 rounded-full bg-primary/10 p-1.5">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <span className="font-medium text-foreground">{label}: </span>
                    {desc}
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Configure the AI model and endpoint in
              </span>
              <Button variant="link" size="sm" asChild className="p-0 h-auto">
                <Link href="/admin/uploads/settings">
                  LLM Settings <ChevronRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// Sub-component: UploadItemRow
// =============================================================================

function UploadItemRow({
  item,
  onRemove,
}: {
  item: UploadItem;
  onRemove: () => void;
}) {
  const isActive =
    item.phase === 'uploading' ||
    item.phase === 'extracting' ||
    item.phase === 'verifying';

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">
        {item.phase === 'done' ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : item.phase === 'error' ? (
          <AlertCircle className="h-5 w-5 text-red-500" />
        ) : isActive ? (
          <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm truncate">{item.file.name}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge className={cn('text-xs', phaseColor(item.phase))}>
              {phaseLabel(item.phase)}
            </Badge>
            {!isActive && (
              <button
                onClick={onRemove}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-0.5">
          {formatFileSize(item.file.size)}
        </p>

        {isActive && (
          <Progress
            value={phaseProgress(item.phase)}
            className="mt-2 h-1.5"
          />
        )}

        {item.phase === 'error' && item.error && (
          <p className="text-xs text-red-600 mt-1">{item.error}</p>
        )}

        {item.phase === 'done' && item.result && (
          <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
            <p>
              <span className="font-medium text-foreground">
                {item.result.title}
              </span>
              {item.result.composer && ` — ${item.result.composer}`}
            </p>
            {item.result.instrument && (
              <p>Instrument: {item.result.instrument}</p>
            )}
            <p className="flex items-center gap-1.5">
              Confidence:{' '}
              <Badge
                className={cn(
                  'text-xs',
                  item.result.confidenceScore >= 85
                    ? 'bg-green-100 text-green-700'
                    : item.result.confidenceScore >= 70
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                )}
              >
                {item.result.confidenceScore}%
              </Badge>
              <Link
                href="/admin/uploads/review"
                className="text-primary underline-offset-2 hover:underline"
              >
                Review →
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
