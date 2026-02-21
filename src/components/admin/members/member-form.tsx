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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, User } from 'lucide-react';

const memberSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional().or(z.literal('')),
  userId: z.string().optional(),
  sectionId: z.string().optional(),
  primaryInstrumentId: z.string().optional(),
  status: z.string(),
  joinDate: z.string().optional(),
  phone: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  notes: z.string().optional(),
});

type MemberFormData = z.infer<typeof memberSchema>;

interface MemberFormProps {
  sections: Array<{ id: string; name: string }>;
  instruments: Array<{ id: string; name: string; family: string }>;
  users?: Array<{ id: string; name: string | null; email: string }>;
  initialData?: Partial<MemberFormData> & { id?: string };
  onSubmit: (formData: FormData) => Promise<{ success: boolean; error?: string; memberId?: string }>;
  isEdit?: boolean;
}

const statuses = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'AUDITION', label: 'Audition' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'LEAVE_OF_ABSENCE', label: 'Leave of Absence' },
  { value: 'ALUMNI', label: 'Alumni' },
];

export function MemberForm({
  sections,
  instruments,
  users,
  initialData,
  onSubmit,
  isEdit = false,
}: MemberFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MemberFormData>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      ...initialData,
      status: initialData?.status || 'PENDING',
    },
  });

  const handleFormSubmit = async (data: MemberFormData) => {
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          formData.append(key, String(value));
        }
      });

      const result = await onSubmit(formData);

      if (result.success) {
        toast.success(isEdit ? 'Member updated successfully!' : 'Member created successfully!');
        if (result.memberId) {
          router.push(`/admin/members/${result.memberId}`);
        } else {
          router.push('/admin/members');
        }
      } else {
        toast.error(result.error || 'Failed to save member');
      }
    } catch (error) {
      toast.error('Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group instruments by family
  const instrumentsByFamily = instruments.reduce(
    (acc, instrument) => {
      const family = instrument.family || 'Other';
      if (!acc[family]) {
        acc[family] = [];
      }
      acc[family].push(instrument);
      return acc;
    },
    {} as Record<string, typeof instruments>
  );

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Member details and section assignment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isEdit && users && (
              <div className="space-y-2">
                <Label htmlFor="userId">User Account *</Label>
                <Select onValueChange={(value) => setValue('userId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                defaultValue={initialData?.status || 'PENDING'}
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

            <div className="space-y-2">
              <Label htmlFor="sectionId">Section</Label>
              <Select
                defaultValue={initialData?.sectionId}
                onValueChange={(value) => setValue('sectionId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="primaryInstrumentId">Primary Instrument</Label>
              <Select
                defaultValue={initialData?.primaryInstrumentId}
                onValueChange={(value) => setValue('primaryInstrumentId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select instrument" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(instrumentsByFamily).map(([family, instruments]) => (
                    <div key={family}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {family}
                      </div>
                      {instruments.map((instrument) => (
                        <SelectItem key={instrument.id} value={instrument.id}>
                          {instrument.name}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="joinDate">Join Date</Label>
              <Input
                id="joinDate"
                type="date"
                {...register('joinDate')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>
              Phone number and email details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  {...register('firstName')}
                />
                {errors.firstName && (
                  <p className="text-sm text-red-500">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  {...register('lastName')}
                />
                {errors.lastName && (
                  <p className="text-sm text-red-500">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john.doe@example.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(555) 123-4567"
                {...register('phone')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Emergency Contact</CardTitle>
            <CardDescription>
              Person to contact in case of emergency
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emergencyName">Contact Name</Label>
              <Input
                id="emergencyName"
                placeholder="Jane Doe"
                {...register('emergencyName')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="emergencyPhone">Contact Phone</Label>
              <Input
                id="emergencyPhone"
                type="tel"
                placeholder="(555) 123-4567"
                {...register('emergencyPhone')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Notes</CardTitle>
            <CardDescription>
              Any other relevant information about this member
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              id="notes"
              placeholder="Enter any additional notes..."
              rows={5}
              {...register('notes')}
            />
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
              <User className="mr-2 h-4 w-4" />
              {isEdit ? 'Update Member' : 'Create Member'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
