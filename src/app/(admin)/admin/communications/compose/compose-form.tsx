'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Send, TestTube, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { sendBulkEmailAction } from '../actions';

const formSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(10, 'Email body must be at least 10 characters'),
  recipientType: z.enum(['ALL', 'ACTIVE', 'SECTION', 'CUSTOM']),
  sectionId: z.string().optional(),
  sendAsTest: z.boolean(),
  testEmail: z.string().email().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

interface ComposeEmailFormProps {
  sections: { id: string; name: string }[];
}

export function ComposeEmailForm({ sections }: ComposeEmailFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailType = searchParams.get('type');

  // Pre-fill based on email type
  const getDefaultSubject = () => {
    switch (emailType) {
      case 'rehearsal':
        return 'Rehearsal Reminder - ';
      case 'announcement':
        return 'Band Announcement: ';
      default:
        return '';
    }
  };

  const getDefaultBody = () => {
    switch (emailType) {
      case 'rehearsal':
        return `Dear {{name}},

This is a reminder about our upcoming rehearsal:

Date: [DATE]
Time: [TIME]
Location: [LOCATION]

Please remember to bring:
- Your music folder
- Your instrument
- A pencil

See you there!

Best regards,
Emerald Coast Community Band`;
      case 'announcement':
        return `Dear {{name}},

[Your announcement here]

Best regards,
Emerald Coast Community Band`;
      default:
        return `Dear {{name}},

[Your message here]

Best regards,
Emerald Coast Community Band`;
    }
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      subject: getDefaultSubject(),
      body: getDefaultBody(),
      recipientType: 'ACTIVE',
      sectionId: '',
      sendAsTest: false,
      testEmail: '',
    },
  });

  const watchRecipientType = form.watch('recipientType');
  const watchSendAsTest = form.watch('sendAsTest');

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('subject', values.subject);
      formData.append('body', values.body);
      formData.append('recipientType', values.recipientType);
      if (values.sectionId) {
        formData.append('sectionId', values.sectionId);
      }
      formData.append('sendAsTest', values.sendAsTest.toString());
      if (values.testEmail) {
        formData.append('testEmail', values.testEmail);
      }

      const result = await sendBulkEmailAction(formData);

      if (result.success) {
        toast.success(result.message);
        if (!values.sendAsTest) {
          router.push('/admin/communications');
        }
      } else {
        toast.error(result.error || 'Failed to send email');
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error('Failed to send email');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Email Details</CardTitle>
            <CardDescription>
              Compose your email message
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter email subject" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter your email message..."
                      className="min-h-[300px] font-mono"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Use {'{{name}}'} to personalize with the recipient&apos;s name.
                    HTML is supported for formatting.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recipients</CardTitle>
            <CardDescription>
              Choose who will receive this email
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="recipientType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient Group</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select recipients" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ALL">All Members</SelectItem>
                      <SelectItem value="ACTIVE">Active Members Only</SelectItem>
                      <SelectItem value="SECTION">Specific Section</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchRecipientType === 'SECTION' && (
              <FormField
                control={form.control}
                name="sectionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select section" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sections.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test Email</CardTitle>
            <CardDescription>
              Send a test before sending to all recipients
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="sendAsTest"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Send as Test</FormLabel>
                    <FormDescription>
                      Send to a single email address for preview
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {watchSendAsTest && (
              <FormField
                control={form.control}
                name="testEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Test Email Address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        <div className="flex items-center gap-4">
          <Button variant="outline" asChild>
            <Link href="/admin/communications">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cancel
            </Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : watchSendAsTest ? (
              <TestTube className="mr-2 h-4 w-4" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {watchSendAsTest ? 'Send Test' : 'Send Email'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
