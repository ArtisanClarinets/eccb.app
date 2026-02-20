'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  SmartUploadProposal,
  formatConfidence,
} from '@/hooks/use-smart-upload';
import {
  Check,
  Edit3,
  Save,
} from 'lucide-react';

interface ConfidenceBadgeProps {
  value: number | null;
  label: string;
}

function ConfidenceBadge({ value, label }: ConfidenceBadgeProps) {
  const percentage = value !== null ? value * 100 : 0;
  const colorClass =
    percentage >= 80
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : percentage >= 50
        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn('cursor-help', colorClass)}>
            {formatConfidence(value)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label} confidence: {formatConfidence(value)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface SmartUploadReviewFormProps {
  proposal: SmartUploadProposal;
  onSave: (corrections: Record<string, unknown>) => void;
  onApprove: () => void;
  isSaving?: boolean;
  isApproving?: boolean;
  disabled?: boolean;
}

const DIFFICULTY_LEVELS = [
  'GRADE_1',
  'GRADE_2',
  'GRADE_3',
  'GRADE_4',
  'GRADE_5',
  'GRADE_6',
];

const GENRES = [
  'Concert Band',
  'March',
  'Jazz',
  'Broadway',
  'Classical',
  'Pop',
  'Rock',
  'Folk',
  'Spiritual',
  'Holiday',
  'Movie',
  'Other',
];

const STYLES = [
  'Traditional',
  'Contemporary',
  'Swing',
  'Latin',
  'Ballad',
  'March',
  'Overture',
  'Suite',
  'Medley',
  'Arrangement',
  'Original',
  'Transcription',
];

export function SmartUploadReviewForm({
  proposal,
  onSave,
  onApprove,
  isSaving = false,
  isApproving = false,
  disabled = false,
}: SmartUploadReviewFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({
    title: proposal.title || '',
    composer: proposal.composer || '',
    arranger: proposal.arranger || '',
    publisher: proposal.publisher || '',
    difficulty: proposal.difficulty || '',
    genre: proposal.genre || '',
    style: proposal.style || '',
    instrumentation: proposal.instrumentation || '',
    notes: proposal.notes || '',
  });

  const hasChanges = useCallback(() => {
    return (
      formData.title !== (proposal.title || '') ||
      formData.composer !== (proposal.composer || '') ||
      formData.arranger !== (proposal.arranger || '') ||
      formData.publisher !== (proposal.publisher || '') ||
      formData.difficulty !== (proposal.difficulty || '') ||
      formData.genre !== (proposal.genre || '') ||
      formData.style !== (proposal.style || '') ||
      formData.instrumentation !== (proposal.instrumentation || '') ||
      formData.notes !== (proposal.notes || '')
    );
  }, [formData, proposal]);

  const handleSave = useCallback(() => {
    const corrections: Record<string, unknown> = {};

    if (formData.title !== (proposal.title || '')) {
      corrections.title = formData.title;
    }
    if (formData.composer !== (proposal.composer || '')) {
      corrections.composer = formData.composer;
    }
    if (formData.arranger !== (proposal.arranger || '')) {
      corrections.arranger = formData.arranger;
    }
    if (formData.publisher !== (proposal.publisher || '')) {
      corrections.publisher = formData.publisher;
    }
    if (formData.difficulty !== (proposal.difficulty || '')) {
      corrections.difficulty = formData.difficulty;
    }
    if (formData.genre !== (proposal.genre || '')) {
      corrections.genre = formData.genre;
    }
    if (formData.style !== (proposal.style || '')) {
      corrections.style = formData.style;
    }
    if (formData.instrumentation !== (proposal.instrumentation || '')) {
      corrections.instrumentation = formData.instrumentation;
    }
    if (formData.notes !== (proposal.notes || '')) {
      corrections.notes = formData.notes;
    }

    onSave(corrections);
    setIsEditing(false);
  }, [formData, proposal, onSave]);

  const handleCancel = useCallback(() => {
    setFormData({
      title: proposal.title || '',
      composer: proposal.composer || '',
      arranger: proposal.arranger || '',
      publisher: proposal.publisher || '',
      difficulty: proposal.difficulty || '',
      genre: proposal.genre || '',
      style: proposal.style || '',
      instrumentation: proposal.instrumentation || '',
      notes: proposal.notes || '',
    });
    setIsEditing(false);
  }, [proposal]);

  return (
    <Card className={cn(proposal.isApproved && 'border-green-500/50')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Metadata Review</CardTitle>
          <div className="flex items-center gap-2">
            {proposal.isApproved && (
              <Badge className="bg-green-500">
                <Check className="h-3 w-3 mr-1" />
                Approved
              </Badge>
            )}
          </div>
        </div>
        {proposal.isNewPiece ? (
          <p className="text-sm text-muted-foreground">
            New piece to be added to the library
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Matched to existing piece (edits will create a new version)
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Title */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="title">Title</Label>
            <ConfidenceBadge
              value={proposal.titleConfidence}
              label="Title"
            />
          </div>
          {isEditing ? (
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Enter title"
              disabled={disabled}
            />
          ) : (
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
              <span>{proposal.title || 'Not specified'}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                disabled={disabled}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="composer">Composer</Label>
            <ConfidenceBadge
              value={proposal.composerConfidence}
              label="Composer"
            />
          </div>
          {isEditing ? (
            <Input
              id="composer"
              value={formData.composer}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, composer: e.target.value }))
              }
              placeholder="Enter composer name"
              disabled={disabled}
            />
          ) : (
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
              <span>{proposal.composer || 'Not specified'}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                disabled={disabled}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Arranger */}
        <div className="space-y-2">
          <Label htmlFor="arranger">Arranger</Label>
          {isEditing ? (
            <Input
              id="arranger"
              value={formData.arranger}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, arranger: e.target.value }))
              }
              placeholder="Enter arranger name (optional)"
              disabled={disabled}
            />
          ) : (
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
              <span>{proposal.arranger || 'Not specified'}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                disabled={disabled}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Publisher */}
        <div className="space-y-2">
          <Label htmlFor="publisher">Publisher</Label>
          {isEditing ? (
            <Input
              id="publisher"
              value={formData.publisher}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, publisher: e.target.value }))
              }
              placeholder="Enter publisher (optional)"
              disabled={disabled}
            />
          ) : (
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
              <span>{proposal.publisher || 'Not specified'}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                disabled={disabled}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="difficulty">Difficulty</Label>
            <ConfidenceBadge
              value={proposal.difficultyConfidence}
              label="Difficulty"
            />
          </div>
          {isEditing ? (
            <Select
              value={formData.difficulty}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, difficulty: value }))
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select difficulty" />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTY_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level.replace('GRADE_', 'Grade ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
              <span>
                {proposal.difficulty
                  ? proposal.difficulty.replace('GRADE_', 'Grade ')
                  : 'Not specified'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                disabled={disabled}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Genre */}
        <div className="space-y-2">
          <Label htmlFor="genre">Genre</Label>
          {isEditing ? (
            <Select
              value={formData.genre}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, genre: value }))
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select genre" />
              </SelectTrigger>
              <SelectContent>
                {GENRES.map((genre) => (
                  <SelectItem key={genre} value={genre}>
                    {genre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
              <span>{proposal.genre || 'Not specified'}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                disabled={disabled}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Style */}
        <div className="space-y-2">
          <Label htmlFor="style">Style</Label>
          {isEditing ? (
            <Select
              value={formData.style}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, style: value }))
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select style" />
              </SelectTrigger>
              <SelectContent>
                {STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
              <span>{proposal.style || 'Not specified'}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                disabled={disabled}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Instrumentation */}
        <div className="space-y-2">
          <Label htmlFor="instrumentation">Instrumentation</Label>
          {isEditing ? (
            <Input
              id="instrumentation"
              value={formData.instrumentation}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  instrumentation: e.target.value,
                }))
              }
              placeholder="e.g., Concert Band, Jazz Band"
              disabled={disabled}
            />
          ) : (
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
              <span>{proposal.instrumentation || 'Not specified'}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                disabled={disabled}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          {isEditing ? (
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Additional notes (optional)"
              rows={3}
              disabled={disabled}
            />
          ) : (
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
              <span>{proposal.notes || 'No notes'}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                disabled={disabled}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-4 border-t">
          {isEditing ? (
            <>
              <Button
                onClick={handleSave}
                disabled={disabled || isSaving}
                className="flex-1"
              >
                {isSaving ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={disabled || isSaving}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              onClick={onApprove}
              disabled={disabled || isApproving || proposal.isApproved}
              className="flex-1"
            >
              {isApproving ? (
                <>Approving...</>
              ) : proposal.isApproved ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Approved
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Approve
                </>
              )}
            </Button>
          )}
        </div>

        {/* Error Display for Save */}
        {proposal.corrections && Object.keys(proposal.corrections).length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm font-medium mb-1">User Corrections Applied:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(proposal.corrections).map(([key, value]) => (
                <Badge key={key} variant="outline" className="text-xs">
                  {key}: {String(value)}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SmartUploadReviewForm;