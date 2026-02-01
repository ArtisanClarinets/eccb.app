'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Calendar } from 'lucide-react';

const eventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  eventType: z.string(),
  status: z.string(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional(),
  venueId: z.string().optional(),
  isPublic: z.boolean().optional(),
  requiresRSVP: z.boolean().optional(),
  maxAttendees: z.number().optional(),
  notes: z.string().optional(),
  dressCode: z.string().optional(),
  callTime: z.string().optional(),
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventFormProps {
  venues: Array<{ id: string; name: string }>;
  initialData?: Partial<EventFormData> & { id?: string };
  onSubmit: (formData: FormData) => Promise<{ success: boolean; error?: string; eventId?: string }>;
  isEdit?: boolean;
}

const eventTypes = [
  { value: 'REHEARSAL', label: 'Rehearsal' },
  { value: 'CONCERT', label: 'Concert' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'SOCIAL', label: 'Social Event' },
  { value: 'OTHER', label: 'Other' },
];

const statuses = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'POSTPONED', label: 'Postponed' },
];

const dressCodes = [
  { value: '', label: 'Not specified' },
  { value: 'FORMAL', label: 'Formal (Black & White)' },
  { value: 'SEMI_FORMAL', label: 'Semi-Formal' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'BAND_POLO', label: 'Band Polo Shirt' },
  { value: 'BAND_TSHIRT', label: 'Band T-Shirt' },
];

export function EventForm({
  venues,
  initialData,
  onSubmit,
  isEdit = false,
}: EventFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPublic, setIsPublic] = useState(initialData?.isPublic ?? true);
  const [requiresRSVP, setRequiresRSVP] = useState(initialData?.requiresRSVP ?? false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      ...initialData,
      eventType: initialData?.eventType || 'REHEARSAL',
      status: initialData?.status || 'SCHEDULED',
      isPublic: initialData?.isPublic ?? true,
      requiresRSVP: initialData?.requiresRSVP ?? false,
    },
  });

  const handleFormSubmit = async (data: EventFormData) => {
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          formData.append(key, String(value));
        }
      });
      formData.set('isPublic', String(isPublic));
      formData.set('requiresRSVP', String(requiresRSVP));

      const result = await onSubmit(formData);

      if (result.success) {
        toast.success(isEdit ? 'Event updated successfully!' : 'Event created successfully!');
        if (result.eventId) {
          router.push(`/admin/events/${result.eventId}`);
        } else {
          router.push('/admin/events');
        }
      } else {
        toast.error(result.error || 'Failed to save event');
      }
    } catch (error) {
      toast.error('Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Event title, type, and description
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Weekly Rehearsal"
                {...register('title')}
                aria-invalid={!!errors.title}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="eventType">Event Type</Label>
                <Select
                  defaultValue={initialData?.eventType || 'REHEARSAL'}
                  onValueChange={(value) => setValue('eventType', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  defaultValue={initialData?.status || 'SCHEDULED'}
                  onValueChange={(value) => setValue('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the event..."
                rows={3}
                {...register('description')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Date & Time */}
        <Card>
          <CardHeader>
            <CardTitle>Date & Time</CardTitle>
            <CardDescription>
              When does this event take place?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date & Time *</Label>
              <Input
                id="startDate"
                type="datetime-local"
                {...register('startDate')}
                aria-invalid={!!errors.startDate}
              />
              {errors.startDate && (
                <p className="text-sm text-destructive">{errors.startDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date & Time</Label>
              <Input
                id="endDate"
                type="datetime-local"
                {...register('endDate')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="callTime">Call Time</Label>
              <Input
                id="callTime"
                type="time"
                {...register('callTime')}
              />
              <p className="text-xs text-muted-foreground">
                Time members should arrive (for concerts)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Venue & Dress */}
        <Card>
          <CardHeader>
            <CardTitle>Venue & Dress Code</CardTitle>
            <CardDescription>
              Location and attire requirements
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="venueId">Venue</Label>
              <Select
                defaultValue={initialData?.venueId}
                onValueChange={(value) => setValue('venueId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select venue" />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id}>
                      {venue.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dressCode">Dress Code</Label>
              <Select
                defaultValue={initialData?.dressCode || ''}
                onValueChange={(value) => setValue('dressCode', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select dress code" />
                </SelectTrigger>
                <SelectContent>
                  {dressCodes.map((code) => (
                    <SelectItem key={code.value} value={code.value}>
                      {code.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Event Settings</CardTitle>
            <CardDescription>
              Visibility and attendance options
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Public Event</Label>
                <p className="text-sm text-muted-foreground">
                  Show this event on the public website
                </p>
              </div>
              <Switch
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Requires RSVP</Label>
                <p className="text-sm text-muted-foreground">
                  Members must confirm attendance
                </p>
              </div>
              <Switch
                checked={requiresRSVP}
                onCheckedChange={setRequiresRSVP}
              />
            </div>

            {requiresRSVP && (
              <div className="space-y-2">
                <Label htmlFor="maxAttendees">Max Attendees</Label>
                <Input
                  id="maxAttendees"
                  type="number"
                  placeholder="Leave blank for unlimited"
                  {...register('maxAttendees', { valueAsNumber: true })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Internal Notes</Label>
              <Textarea
                id="notes"
                placeholder="Notes for admin/directors only..."
                rows={3}
                {...register('notes')}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Calendar className="mr-2 h-4 w-4" />
              {isEdit ? 'Update Event' : 'Create Event'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
