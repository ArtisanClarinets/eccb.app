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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, TestTube } from 'lucide-react';
import { updateSettings } from '@/app/(admin)/admin/settings/actions';

const formSchema = z.object({
  smtp_host: z.string().optional(),
  smtp_port: z.string().optional(),
  smtp_user: z.string().optional(),
  smtp_from: z.string().email('Invalid email address').optional().or(z.literal('')),
  smtp_from_name: z.string().optional(),
  email_notifications_enabled: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface EmailSettingsFormProps {
  settings: Record<string, string>;
}

export function EmailSettingsForm({ settings }: EmailSettingsFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      smtp_host: settings['smtp_host'] || '',
      smtp_port: settings['smtp_port'] || '587',
      smtp_user: settings['smtp_user'] || '',
      smtp_from: settings['smtp_from'] || '',
      smtp_from_name: settings['smtp_from_name'] || '',
      email_notifications_enabled: settings['email_notifications_enabled'] === 'true',
    },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      const settingsToSave: Record<string, string> = {
        smtp_host: values.smtp_host || '',
        smtp_port: values.smtp_port || '',
        smtp_user: values.smtp_user || '',
        smtp_from: values.smtp_from || '',
        smtp_from_name: values.smtp_from_name || '',
        email_notifications_enabled: values.email_notifications_enabled.toString(),
      };

      const result = await updateSettings(settingsToSave);
      if (result.success) {
        toast.success('Email settings updated successfully');
      } else {
        toast.error(result.error || 'Failed to update settings');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('Failed to update settings');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function testEmailConnection() {
    setIsTesting(true);
    try {
      const response = await fetch('/api/email/test', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        toast.success('Email connection test successful');
      } else {
        toast.error(data.error || 'Email connection test failed');
      }
    } catch (error) {
      console.error('Error testing email:', error);
      toast.error('Failed to test email connection');
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email_notifications_enabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Email Notifications</FormLabel>
                <FormDescription>
                  Enable or disable all email notifications
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="smtp_host"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SMTP Host</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="smtp.example.com" />
                </FormControl>
                <FormDescription>
                  Your SMTP server hostname
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="smtp_port"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SMTP Port</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="587" />
                </FormControl>
                <FormDescription>
                  Usually 587 for TLS or 465 for SSL
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="smtp_user"
          render={({ field }) => (
            <FormItem>
              <FormLabel>SMTP Username</FormLabel>
              <FormControl>
                <Input {...field} placeholder="username@example.com" />
              </FormControl>
              <FormDescription>
                Leave blank if no authentication required
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="smtp_from"
            render={({ field }) => (
              <FormItem>
                <FormLabel>From Email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} placeholder="noreply@example.com" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="smtp_from_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>From Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Emerald Coast Community Band" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={testEmailConnection}
            disabled={isTesting}
          >
            {isTesting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <TestTube className="mr-2 h-4 w-4" />
            )}
            Test Connection
          </Button>
        </div>
      </form>
    </Form>
  );
}
