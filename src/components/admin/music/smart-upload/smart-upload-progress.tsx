'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SmartUploadStatus, SmartUploadStep, getStepLabel } from '@/hooks/use-smart-upload';
import {
  Check,
  Circle,
  AlertCircle,
  Loader2,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';

interface SmartUploadProgressProps {
  currentStep?: SmartUploadStep | null;
  status: SmartUploadStatus;
  progress: number;
  onRetry?: () => void;
  errorSummary?: string | null;
}

// Processing steps in order
const STEPS: SmartUploadStep[] = [
  'VALIDATED',
  'TEXT_EXTRACTED',
  'METADATA_EXTRACTED',
  'SPLIT_PLANNED',
  'SPLIT_COMPLETE',
  'INGESTED',
];

// Status to step mapping
const STATUS_STEP_MAP: Partial<Record<SmartUploadStatus, SmartUploadStep>> = {
  CREATED: 'VALIDATED',
  UPLOADING: 'VALIDATED',
  PROCESSING: 'TEXT_EXTRACTED',
  NEEDS_REVIEW: 'METADATA_EXTRACTED',
  INGESTING: 'SPLIT_COMPLETE',
  COMPLETE: 'INGESTED',
  FAILED: 'VALIDATED',
  CANCELLED: 'VALIDATED',
};

export function SmartUploadProgress({
  currentStep,
  status,
  progress,
  onRetry,
  errorSummary,
}: SmartUploadProgressProps) {
  const activeStep = currentStep || STATUS_STEP_MAP[status] || 'VALIDATED';
  const stepIndex = STEPS.indexOf(activeStep);

  const isPending = (step: SmartUploadStep) => {
    const index = STEPS.indexOf(step);
    return index > stepIndex;
  };

  const isComplete = (step: SmartUploadStep) => {
    const index = STEPS.indexOf(step);
    return index < stepIndex;
  };

  const isActive = (step: SmartUploadStep) => {
    return step === activeStep;
  };

  const isProcessing =
    status === 'UPLOADING' ||
    status === 'PROCESSING' ||
    status === 'INGESTING';

  const isTerminal =
    status === 'COMPLETE' ||
    status === 'FAILED' ||
    status === 'CANCELLED';

  const getStepIcon = (step: SmartUploadStep) => {
    if (isComplete(step)) {
      return <Check className="h-4 w-4" />;
    }
    if (isActive(step)) {
      if (isProcessing) {
        return <Loader2 className="h-4 w-4 animate-spin" />;
      }
      return <Circle className="h-4 w-4 fill-current" />;
    }
    return <Circle className="h-4 w-4 text-muted" />;
  };

  const getStepColor = (step: SmartUploadStep) => {
    if (isComplete(step)) {
      return 'text-green-600 dark:text-green-400';
    }
    if (isActive(step)) {
      if (status === 'FAILED') {
        return 'text-destructive';
      }
      if (isProcessing) {
        return 'text-primary';
      }
      return 'text-primary';
    }
    return 'text-muted';
  };

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Overall Progress</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500',
              status === 'FAILED'
                ? 'bg-destructive'
                : status === 'COMPLETE'
                  ? 'bg-green-500'
                  : 'bg-primary'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Status:</span>
        <Badge
          variant={
            status === 'COMPLETE'
              ? 'default'
              : status === 'FAILED'
                ? 'destructive'
                : status === 'CANCELLED'
                  ? 'secondary'
                  : 'outline'
          }
          className={cn(
            status === 'PROCESSING' && 'animate-pulse',
            status === 'UPLOADING' && 'animate-pulse'
          )}
        >
          {status === 'PROCESSING' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          {status === 'UPLOADING' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          {status === 'INGESTING' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          {status === 'FAILED' && <AlertCircle className="h-3 w-3 mr-1" />}
          {status}
        </Badge>
      </div>

      {/* Step Timeline */}
      <div className="space-y-4">
        <h4 className="font-medium">Processing Steps</h4>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[15px] top-6 bottom-6 w-0.5 bg-muted" />

          <div className="space-y-1">
            {STEPS.map((step, index) => (
              <div
                key={step}
                className={cn(
                  'relative flex items-center gap-4 py-2',
                  isActive(step) && 'bg-primary/5 rounded-lg px-2 -mx-2'
                )}
              >
                {/* Step icon */}
                <div
                  className={cn(
                    'relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 bg-background',
                    isComplete(step) &&
                      'border-green-500 bg-green-500 text-white',
                    isActive(step) &&
                      status !== 'FAILED' &&
                      'border-primary bg-primary text-primary-foreground',
                    isActive(step) &&
                      status === 'FAILED' &&
                      'border-destructive bg-destructive text-white',
                    !isComplete(step) &&
                      !isActive(step) &&
                      'border-muted bg-background text-muted'
                  )}
                >
                  {getStepIcon(step)}
                </div>

                {/* Step content */}
                <div className={cn('flex-1', getStepColor(step))}>
                  <p className="font-medium text-sm">{getStepLabel(step)}</p>
                  {isActive(step) && isProcessing && (
                    <p className="text-xs text-muted-foreground">
                      {status === 'UPLOADING' && 'Uploading files...'}
                      {status === 'PROCESSING' && 'Analyzing and extracting metadata...'}
                      {status === 'INGESTING' && 'Adding to music library...'}
                    </p>
                  )}
                </div>

                {/* Arrow connector */}
                {index < STEPS.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted/50" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {status === 'FAILED' && errorSummary && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="font-medium text-destructive">Processing Failed</p>
              <p className="text-sm text-destructive/80">{errorSummary}</p>
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  className="mt-2"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancelled State */}
      {status === 'CANCELLED' && (
        <div className="bg-muted border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              This upload batch was cancelled.
            </p>
          </div>
        </div>
      )}

      {/* Completed State */}
      {status === 'COMPLETE' && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-green-600" />
            <p className="text-sm text-green-700 dark:text-green-400">
              All files have been successfully processed and added to the music
              library.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default SmartUploadProgress;