'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

export type SmartUploadStatus =
  | 'CREATED'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'INGESTING'
  | 'COMPLETE'
  | 'FAILED'
  | 'CANCELLED';

export type SmartUploadStep =
  | 'VALIDATED'
  | 'TEXT_EXTRACTED'
  | 'METADATA_EXTRACTED'
  | 'SPLIT_PLANNED'
  | 'SPLIT_COMPLETE'
  | 'INGESTED';

export interface SmartUploadBatch {
  id: string;
  status: SmartUploadStatus;
  currentStep: SmartUploadStep | null;
  totalFiles: number;
  processedFiles: number;
  successFiles: number;
  failedFiles: number;
  errorSummary: string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
}

export interface SmartUploadItem {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: SmartUploadStatus;
  currentStep: SmartUploadStep | null;
  errorMessage: string | null;
  ocrText: string | null;
  extractedMeta: Record<string, unknown> | null;
  // Split tracking (for packet PDFs)
  isPacket: boolean;
  splitPages: number | null;
  splitFiles: Record<string, unknown> | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
}

export interface SmartUploadProposal {
  id: string;
  itemId: string;
  title: string | null;
  composer: string | null;
  arranger: string | null;
  publisher: string | null;
  difficulty: string | null;
  genre: string | null;
  style: string | null;
  instrumentation: string | null;
  duration: number | null;
  notes: string | null;
  titleConfidence: number | null;
  composerConfidence: number | null;
  difficultyConfidence: number | null;
  isApproved: boolean;
  approvedAt: Date | string | null;
  approvedBy: string | null;
  matchedPieceId: string | null;
  isNewPiece: boolean;
  corrections: Record<string, unknown> | null;
  ocrText: string | null;
  createdAt: Date | string;
}

export interface BatchDetailResponse {
  batch: SmartUploadBatch;
  items: SmartUploadItem[];
  proposals: SmartUploadProposal[];
  progress: number;
}

export interface UploadResult {
  itemId: string;
  fileName: string;
  success: boolean;
  error?: string;
}

export interface UploadSummary {
  total: number;
  succeeded: number;
  failed: number;
}

export interface ProposalApproval {
  id: string;
  corrections?: Record<string, unknown>;
}

// =============================================================================
// Hook Return Types
// =============================================================================

export interface UseSmartUploadReturn {
  // State
  isLoading: boolean;
  error: Error | null;

  // Batch operations
  createBatch: () => Promise<{ batchId: string; error?: string }>;
  uploadFiles: (
    batchId: string,
    files: File[]
  ) => Promise<{
    items: UploadResult[];
    errors: Array<{ fileName: string; error: string }>;
    summary: UploadSummary;
  }>;
  getBatch: (
    batchId: string
  ) => Promise<BatchDetailResponse | null>;
  approveBatch: (
    batchId: string,
    proposals: ProposalApproval[]
  ) => Promise<{ success: boolean; message: string; error?: string }>;
  cancelBatch: (
    batchId: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export interface UseSmartUploadBatchesReturn {
  // State
  batches: SmartUploadBatch[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  error: Error | null;

  // Actions
  refetch: () => Promise<void>;
}

export interface UseSmartUploadPollReturn {
  // State
  batch: SmartUploadBatch | null;
  isLoading: boolean;
  error: Error | null;
  isPolling: boolean;

  // Actions
  startPolling: (batchId: string, interval?: number) => void;
  stopPolling: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_POLL_INTERVAL = 5000; // 5 seconds
const POLLING_STATUSES: SmartUploadStatus[] = [
  'CREATED',
  'UPLOADING',
  'PROCESSING',
  'INGESTING',
];

// =============================================================================
// Main Hook
// =============================================================================

/**
 * Hook for Smart Upload operations
 * Provides methods for creating batches, uploading files, and managing batch lifecycle
 */
export function useSmartUpload(): UseSmartUploadReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Create a new Smart Upload batch
   */
  const createBatch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/music/smart-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        const err = new Error(data.error || 'Failed to create batch');
        setError(err);
        return { batchId: '', error: err.message };
      }

      return { batchId: data.batchId };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      return { batchId: '', error: error.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Upload files to an existing batch
   */
  const uploadFiles = useCallback(
    async (batchId: string, files: File[]) => {
      setIsLoading(true);
      setError(null);

      try {
        const formData = new FormData();
        files.forEach((file) => {
          formData.append('files', file);
        });

        const response = await fetch(
          `/api/music/smart-upload/${batchId}/upload`,
          {
            method: 'POST',
            body: formData,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          const err = new Error(data.error || 'Failed to upload files');
          setError(err);
          throw err;
        }

        return {
          items: data.items || [],
          errors: data.errors || [],
          summary: data.summary || {
            total: files.length,
            succeeded: 0,
            failed: files.length,
          },
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        return {
          items: [],
          errors: files.map((f) => ({
            fileName: f.name,
            error: error.message,
          })),
          summary: { total: files.length, succeeded: 0, failed: files.length },
        };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Get batch details including items and proposals
   */
  const getBatch = useCallback(
    async (batchId: string): Promise<BatchDetailResponse | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/music/smart-upload/${batchId}`);

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          const data = await response.json();
          const err = new Error(data.error || 'Failed to fetch batch');
          setError(err);
          return null;
        }

        const data = await response.json();
        return data as BatchDetailResponse;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Approve proposals and trigger ingestion
   */
  const approveBatch = useCallback(
    async (batchId: string, proposals: ProposalApproval[]) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/music/smart-upload/${batchId}/approve`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ proposals }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          const err = new Error(data.error || 'Failed to approve batch');
          setError(err);
          return { success: false, message: '', error: err.message };
        }

        return { success: true, message: data.message };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        return { success: false, message: '', error: error.message };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Cancel a batch
   */
  const cancelBatch = useCallback(async (batchId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/music/smart-upload/${batchId}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const err = new Error(data.error || 'Failed to cancel batch');
        setError(err);
        return { success: false, error: err.message };
      }

      return { success: true };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    createBatch,
    uploadFiles,
    getBatch,
    approveBatch,
    cancelBatch,
  };
}

// =============================================================================
// List Batches Hook
// =============================================================================

/**
 * Hook for listing Smart Upload batches with pagination
 */
export function useSmartUploadBatches(
  options?: { limit?: number; status?: string }
): UseSmartUploadBatchesReturn {
  const [batches, setBatches] = useState<SmartUploadBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const limit = options?.limit || 20;
  const status = options?.status;

  const fetchBatches = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      if (status) {
        params.set('status', status);
      }

      const response = await fetch(
        `/api/music/smart-upload?${params.toString()}`
      );

      if (!response.ok) {
        const data = await response.json();
        const err = new Error(data.error || 'Failed to fetch batches');
        setError(err);
        return;
      }

      const data = await response.json();
      setBatches(data.batches || []);
      setTotal(data.total || 0);
      setHasMore(data.hasMore || false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, [limit, status]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  return {
    batches,
    total,
    hasMore,
    isLoading,
    error,
    refetch: fetchBatches,
  };
}

// =============================================================================
// Poll Batch Status Hook
// =============================================================================

/**
 * Hook for polling batch status until completion
 */
export function useSmartUploadPoll(): UseSmartUploadPollReturn {
  const [batch, setBatch] = useState<SmartUploadBatch | null>(null);
  const [isLoading, _setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const batchIdRef = useRef<string>('');

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const fetchBatch = useCallback(async (batchId: string) => {
    try {
      const response = await fetch(`/api/music/smart-upload/${batchId}`);

      if (!response.ok) {
        if (response.status === 404) {
          stopPolling();
          return;
        }
        const data = await response.json();
        const err = new Error(data.error || 'Failed to fetch batch');
        setError(err);
        stopPolling();
        return;
      }

      const data = await response.json();
      setBatch(data.batch);

      // Stop polling if batch is in terminal state
      if (!POLLING_STATUSES.includes(data.batch.status)) {
        stopPolling();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      stopPolling();
    }
  }, [stopPolling]);

  const startPolling = useCallback(
    (batchId: string, interval: number = DEFAULT_POLL_INTERVAL) => {
      batchIdRef.current = batchId;
      setIsPolling(true);

      // Fetch immediately
      fetchBatch(batchId);

      // Set up interval
      pollRef.current = setInterval(() => {
        fetchBatch(batchIdRef.current);
      }, interval);
    },
    [fetchBatch]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  return {
    batch,
    isLoading,
    error,
    isPolling,
    startPolling,
    stopPolling,
  };
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Hook for checking if feature is enabled
 */
export function useSmartUploadConfig() {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check feature flag by attempting to create a batch
    // If it fails with FEATURE_DISABLED, feature is not enabled
    const checkFeature = async () => {
      try {
        const response = await fetch('/api/music/smart-upload', {
          method: 'POST',
        });

        if (response.ok) {
          setIsEnabled(true);
        } else {
          const data = await response.json();
          setIsEnabled(data.code !== 'FEATURE_DISABLED');
        }
      } catch {
        setIsEnabled(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkFeature();
  }, []);

  return { isEnabled, isLoading };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get status display label
 */
export function getStatusLabel(status: SmartUploadStatus): string {
  const labels: Record<SmartUploadStatus, string> = {
    CREATED: 'Created',
    UPLOADING: 'Uploading',
    PROCESSING: 'Processing',
    NEEDS_REVIEW: 'Needs Review',
    APPROVED: 'Approved',
    INGESTING: 'Ingesting',
    COMPLETE: 'Complete',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Get status color class
 */
export function getStatusColor(status: SmartUploadStatus): string {
  const colors: Record<SmartUploadStatus, string> = {
    CREATED: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
    UPLOADING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    PROCESSING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    NEEDS_REVIEW: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    APPROVED: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    INGESTING: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    COMPLETE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-gray-900/30 dark:text-gray-400',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

/**
 * Get step display label
 */
export function getStepLabel(step: SmartUploadStep): string {
  const labels: Record<SmartUploadStep, string> = {
    VALIDATED: 'Validated',
    TEXT_EXTRACTED: 'Text Extracted',
    METADATA_EXTRACTED: 'Metadata Extracted',
    SPLIT_PLANNED: 'Split Planned',
    SPLIT_COMPLETE: 'Split Complete',
    INGESTED: 'Ingested',
  };
  return labels[step] || step;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Calculate confidence percentage
 */
export function formatConfidence(value: number | null): string {
  if (value === null) return 'N/A';
  return Math.round(value * 100) + '%';
}

export default useSmartUpload;