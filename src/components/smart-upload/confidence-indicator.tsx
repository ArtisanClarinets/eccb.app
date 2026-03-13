'use client';

import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ConfidenceIndicatorProps {
  score: number | null;
  threshold?: number;
  autoApproveThreshold?: number;
  showIcon?: boolean;
  className?: string;
  detailed?: boolean;
}

/**
 * Confidence indicator with visual warnings for low-confidence sessions.
 * Used in review UI to highlight sessions needing attention.
 */
export function ConfidenceIndicator({
  score,
  threshold = 70,
  autoApproveThreshold = 90,
  showIcon = true,
  className,
  detailed = false,
}: ConfidenceIndicatorProps) {
  if (score === null) {
    return (
      <Badge className={cn('bg-gray-100 text-gray-700', className)}>
        {showIcon && <AlertCircle className="mr-1 h-3 w-3" />}
        N/A
      </Badge>
    );
  }

  // Determine risk level
  const isAutoApproved = score >= autoApproveThreshold;
  const isConfident = score >= threshold;
  const isLowConfidence = score < threshold;

  if (isAutoApproved) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Badge className="bg-green-100 text-green-700">
          {showIcon && <CheckCircle className="mr-1 h-3 w-3" />}
          {score}%
        </Badge>
        {detailed && <span className="text-xs text-green-600">Auto-approved</span>}
      </div>
    );
  }

  if (isConfident) {
    return (
      <Badge className={cn('bg-yellow-100 text-yellow-700 border border-yellow-400', className)}>
        {showIcon && <AlertCircle className="mr-1 h-3 w-3" />}
        {score}%
      </Badge>
    );
  }

  // Low confidence
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Badge className={cn('bg-red-100 text-red-700 border border-red-400', className)}>
        {showIcon && <AlertTriangle className="mr-1 h-3 w-3" />}
        {score}%
      </Badge>
      {detailed && <span className="text-xs text-red-600 font-medium">Review needed</span>}
    </div>
  );
}

/**
 * Warning banner for low-confidence sessions displayed in review dialog.
 */
export function ConfidenceWarningBanner({
  score,
  threshold = 70,
  provenance,
}: {
  score: number | null;
  threshold?: number;
  provenance?: {
    rawOcrTextAvailable?: boolean;
    ocrEngineUsed?: string | null;
    llmFallbackReasons?: string[];
  };
}) {
  if (!score || score >= threshold) {
    return null;
  }

  const fallbackReasons = provenance?.llmFallbackReasons || [];
  const hasRawOcr = provenance?.rawOcrTextAvailable;
  const ocrEngine = provenance?.ocrEngineUsed;

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="font-semibold text-red-900">Low Confidence Score ({score}%)</h3>
          <p className="text-sm text-red-700 mt-1">
            This session has confidence below the approval threshold. Manual review and correction is recommended.
          </p>
        </div>
      </div>

      {(fallbackReasons.length > 0 || hasRawOcr || ocrEngine) && (
        <div className="ml-8 space-y-1 pt-2 border-t border-red-200">
          {ocrEngine && (
            <p className="text-xs text-red-600">
              <span className="font-medium">OCR Engine:</span> {ocrEngine}
            </p>
          )}
          {hasRawOcr && (
            <p className="text-xs text-red-600">
              <span className="font-medium">Note:</span> Raw OCR text is available for debugging.
            </p>
          )}
          {fallbackReasons.length > 0 && (
            <div className="text-xs text-red-600">
              <span className="font-medium">Fallback Reasons:</span>
              <ul className="list-disc list-inside mt-0.5 ml-2">
                {fallbackReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
