'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  Calendar,
  Clock,
  Info,
  AlertTriangle,
  Megaphone,
  Loader2,
} from 'lucide-react';
import type { AnnouncementType, AnnouncementAudience, ContentStatus } from '@prisma/client';

const announcementFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  content: z.string().min(1, 'Content is required'),
  type: z.enum(['INFO', 'WARNING', 'URGENT', 'EVENT']),
  audience: z.enum(['ALL', 'MEMBERS', 'ADMINS']),
  isUrgent: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']),
  publishAt: z.string().optional(),
  expiresAt: z.string().optional(),
});

type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;

interface AnnouncementFormProps {
  initialData?: {
    id: string;
    title: string;
    content: string;
    type: AnnouncementType;
    audience: AnnouncementAudience;
    isUrgent: boolean;
    isPinned: boolean;
    status: ContentStatus;
    publishAt: Date | null;
    expiresAt: Date | null;
  };
  onSubmit: (data: AnnouncementFormValues) => Promise<{ success: boolean; error?: string }>;
}

const typeIcons: Record<AnnouncementType, React.ReactNode> = {
  INFO: <Info className="h-4 w-4 text-blue-500" />,
  WARNING: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  URGENT: <AlertCircle className="h-4 w-4 text-red-500" />,
  EVENT: <Calendar className="h-4 w-4 text-green-500" />,
};

const typeColors: Record<AnnouncementType, string> = {
  INFO: 'bg-blue-500/10 text-blue-700 border-blue-200',
  WARNING: 'bg-amber-500/10 text-amber-700 border-amber-200',
  URGENT: 'bg-red-500/10 text-red-700 border-red-200',
  EVENT: 'bg-green-500/10 text-green-700 border-green-200',
};

const audienceLabels: Record<AnnouncementAudience, string> = {
  ALL: 'Everyone (Public)',
  MEMBERS: 'Members Only',
  ADMINS: 'Administrators Only',
};

export function AnnouncementForm({ initialData, onSubmit }: AnnouncementFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: {
      title: initialData?.title ?? '',
      content: initialData?.content ?? '',
      type: initialData?.type ?? 'INFO',
      audience: initialData?.audience ?? 'ALL',
      isUrgent: initialData?.isUrgent ?? false,
      isPinned: initialData?.isPinned ?? false,
      status: initialData?.status ?? 'DRAFT',
      publishAt: initialData?.publishAt
        ? new Date(initialData.publishAt).toISOString().slice(0, 16)
        : '',
      expiresAt: initialData?.expiresAt
        ? new Date(initialData.expiresAt).toISOString().slice(0, 16)
        : '',
    },
  });

  const watchedType = watch('type');
  const watchedStatus = watch('status');
  const watchedIsUrgent = watch('isUrgent');
  const watchedIsPinned = watch('isPinned');

  const handleFormSubmit = async (data: AnnouncementFormValues) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await onSubmit(data);
      if (result.success) {
        router.push('/admin/announcements');
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to save announcement');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Announcement Details</CardTitle>
              <CardDescription>
                Create and configure your announcement
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Enter announcement title"
                  {...register('title')}
                  className={errors.title ? 'border-destructive' : ''}
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>

              {/* Content */}
              <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  placeholder="Enter announcement content..."
                  rows={8}
                  {...register('content')}
                  className={errors.content ? 'border-destructive' : ''}
                />
                {errors.content && (
                  <p className="text-sm text-destructive">{errors.content.message}</p>
                )}
              </div>

              {/* Type */}
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex gap-2 flex-wrap">
                  {(['INFO', 'WARNING', 'URGENT', 'EVENT'] as const).map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant={watchedType === type ? 'default' : 'outline'}
                      onClick={() => setValue('type', type)}
                      className="flex items-center gap-2"
                    >
                      {typeIcons[type]}
                      {type}
                    </Button>
                  ))}
                </div>
                <input type="hidden" {...register('type')} />
              </div>

              {/* Audience */}
              <div className="space-y-2">
                <Label htmlFor="audience">Target Audience</Label>
                <Select
                  value={watch('audience')}
                  onValueChange={(value: AnnouncementAudience) => setValue('audience', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select audience" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(audienceLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Options */}
        <div className="space-y-6">
          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                value={watchedStatus}
                onValueChange={(value: ContentStatus) => setValue('status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                  <SelectItem value="PUBLISHED">Published</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>

              {/* Preview Badge */}
              <div className="flex items-center gap-2 pt-2">
                <span className="text-sm text-muted-foreground">Preview:</span>
                <Badge className={typeColors[watchedType]}>
                  {typeIcons[watchedType]}
                  <span className="ml-1">{watchedType}</span>
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Urgent */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isUrgent">Mark as Urgent</Label>
                  <p className="text-xs text-muted-foreground">
                    Send email notifications to recipients
                  </p>
                </div>
                <Switch
                  id="isUrgent"
                  checked={watchedIsUrgent}
                  onCheckedChange={(checked) => setValue('isUrgent', checked)}
                />
              </div>

              {/* Pinned */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isPinned">Pin Announcement</Label>
                  <p className="text-xs text-muted-foreground">
                    Keep at top of announcements list
                  </p>
                </div>
                <Switch
                  id="isPinned"
                  checked={watchedIsPinned}
                  onCheckedChange={(checked) => setValue('isPinned', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Scheduling */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Scheduling
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Publish Date */}
              <div className="space-y-2">
                <Label htmlFor="publishAt">Publish Date</Label>
                <Input
                  id="publishAt"
                  type="datetime-local"
                  {...register('publishAt')}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to publish immediately
                </p>
              </div>

              {/* Expiration Date */}
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expiration Date</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  {...register('expiresAt')}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty for no expiration
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardContent className="pt-6 space-y-2">
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : initialData ? (
                  'Update Announcement'
                ) : (
                  <>
                    <Megaphone className="mr-2 h-4 w-4" />
                    Create Announcement
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => router.back()}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
