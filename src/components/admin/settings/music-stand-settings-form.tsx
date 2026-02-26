'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { updateSettings } from '@/app/(admin)/admin/settings/actions';

const formSchema = z.object({
  'musicStand.accessPolicy': z.enum(['any_member', 'rsvp_only']),
  'musicStand.sectionWritePolicy': z.enum(['own_section', 'any_section']),
  'musicStand.realtimeMode': z.boolean(),
  'musicStand.defaultZoom': z.enum(['fit_width', 'fit_page', '100', '125', '150']),
});

type FormValues = z.infer<typeof formSchema>;

interface MusicStandSettingsFormProps {
  settings: Record<string, string>;
}

export function MusicStandSettingsForm({ settings }: MusicStandSettingsFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      'musicStand.accessPolicy':
        (settings['musicStand.accessPolicy'] as FormValues['musicStand.accessPolicy']) ??
        'any_member',
      'musicStand.sectionWritePolicy':
        (settings[
          'musicStand.sectionWritePolicy'
        ] as FormValues['musicStand.sectionWritePolicy']) ?? 'own_section',
      'musicStand.realtimeMode': settings['musicStand.realtimeMode'] !== 'false',
      'musicStand.defaultZoom':
        (settings['musicStand.defaultZoom'] as FormValues['musicStand.defaultZoom']) ??
        'fit_width',
    },
  });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    try {
      const record: Record<string, string> = {};
      for (const [key, val] of Object.entries(values)) {
        record[key] = String(val);
      }
      const result = await updateSettings(record);
      if (result.success) {
        toast.success('Music Stand settings saved');
      } else {
        toast.error(result.error ?? 'Failed to save settings');
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Access Policy */}
        <FormField
          control={form.control}
          name="musicStand.accessPolicy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Member Access Policy</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="any_member">Any Active Member</SelectItem>
                  <SelectItem value="rsvp_only">RSVP'd Members Only</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Controls who can open the stand for a specific event. &quot;Any Active Member&quot;
                allows all members to practice freely regardless of RSVP.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Section Write Policy */}
        <FormField
          control={form.control}
          name="musicStand.sectionWritePolicy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Annotation Write Policy</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="own_section">Own Section Only</SelectItem>
                  <SelectItem value="any_section">Any Section</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Controls which section layer a member can write annotations to.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Realtime Mode */}
        <FormField
          control={form.control}
          name="musicStand.realtimeMode"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Real-time Sync</FormLabel>
                <FormDescription>
                  Sync page turns and conductor cues in real time across all devices.
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Default Zoom */}
        <FormField
          control={form.control}
          name="musicStand.defaultZoom"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default Zoom Level</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="fit_width">Fit Width</SelectItem>
                  <SelectItem value="fit_page">Fit Page</SelectItem>
                  <SelectItem value="100">100%</SelectItem>
                  <SelectItem value="125">125%</SelectItem>
                  <SelectItem value="150">150%</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>Default zoom when opening a PDF on the stand.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Music Stand Settings
        </Button>
      </form>
    </Form>
  );
}

MusicStandSettingsForm.displayName = 'MusicStandSettingsForm';
