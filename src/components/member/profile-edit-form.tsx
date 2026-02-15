'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { updateProfile, updateProfileImage, removeProfileImage } from '@/app/(member)/member/profile/actions';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, User, Camera, X, Music, Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  profilePhoto: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyEmail: string | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  } | null;
  instruments: Array<{
    id: string;
    instrumentId: string;
    isPrimary: boolean;
    instrument: {
      id: string;
      name: string;
      family: string;
    };
  }>;
  sections: Array<{
    id: string;
    sectionId: string;
    section: {
      id: string;
      name: string;
    };
  }>;
}

interface Instrument {
  id: string;
  name: string;
  family: string;
}

interface Section {
  id: string;
  name: string;
}

interface ProfileEditFormProps {
  member: Member;
  instruments: Instrument[];
  sections: Section[];
}

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address').optional().nullable(),
  phone: z.string().optional().nullable(),
  emergencyName: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  emergencyEmail: z.string().email('Invalid emergency email').optional().nullable(),
  instrumentIds: z.array(z.string()),
  sectionIds: z.array(z.string()),
  primaryInstrumentId: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof profileSchema>;

export function ProfileEditForm({ member, instruments, sections }: ProfileEditFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>(
    member.instruments.map((i) => i.instrumentId)
  );
  const [selectedSections, setSelectedSections] = useState<string[]>(
    member.sections.map((s) => s.sectionId)
  );
  const [primaryInstrumentId, setPrimaryInstrumentId] = useState<string | null>(
    member.instruments.find((i) => i.isPrimary)?.instrumentId || null
  );
  const [profileImage, setProfileImage] = useState<string | null>(
    member.profilePhoto || member.user?.image || null
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email || '',
      phone: member.phone || '',
      emergencyName: member.emergencyName || '',
      emergencyPhone: member.emergencyPhone || '',
      emergencyEmail: member.emergencyEmail || '',
      instrumentIds: member.instruments.map((i) => i.instrumentId),
      sectionIds: member.sections.map((s) => s.sectionId),
      primaryInstrumentId: member.instruments.find((i) => i.isPrimary)?.instrumentId || null,
    },
  });

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  async function onSubmit(values: FormValues) {
    setIsUpdating(true);
    try {
      await updateProfile({
        ...values,
        instrumentIds: selectedInstruments,
        sectionIds: selectedSections,
        primaryInstrumentId,
      });
      toast.success('Profile updated successfully');
      router.push('/member/profile');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const result = await updateProfileImage(formData);
      setProfileImage(result.imageUrl);
      toast.success('Profile image updated');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload image');
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleRemoveImage() {
    setIsUploadingImage(true);
    try {
      await removeProfileImage();
      setProfileImage(null);
      toast.success('Profile image removed');
    } catch (error) {
      console.error('Error removing image:', error);
      toast.error('Failed to remove image');
    } finally {
      setIsUploadingImage(false);
    }
  }

  const toggleInstrument = (instrumentId: string) => {
    setSelectedInstruments((prev) => {
      if (prev.includes(instrumentId)) {
        // If removing the primary instrument, clear primary
        if (primaryInstrumentId === instrumentId) {
          setPrimaryInstrumentId(null);
        }
        return prev.filter((id) => id !== instrumentId);
      }
      return [...prev, instrumentId];
    });
  };

  const toggleSection = (sectionId: string) => {
    setSelectedSections((prev) => {
      if (prev.includes(sectionId)) {
        return prev.filter((id) => id !== sectionId);
      }
      return [...prev, sectionId];
    });
  };

  // Group instruments by family
  const instrumentsByFamily = instruments.reduce((acc, instrument) => {
    if (!acc[instrument.family]) {
      acc[instrument.family] = [];
    }
    acc[instrument.family].push(instrument);
    return acc;
  }, {} as Record<string, Instrument[]>);

  return (
    <div className="space-y-6">
      {/* Profile Photo Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            <CardTitle>Profile Photo</CardTitle>
          </div>
          <CardDescription>
            Upload a photo to help other members recognize you
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-24 w-24">
                <AvatarImage src={profileImage || undefined} />
                <AvatarFallback className="text-2xl">
                  {getInitials(`${member.firstName} ${member.lastName}`)}
                </AvatarFallback>
              </Avatar>
              {isUploadingImage && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleImageUpload}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImage}
              >
                Upload Photo
              </Button>
              {profileImage && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="ml-2">
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove Profile Photo</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove your profile photo?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRemoveImage}>
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, GIF, or WebP. Max 5MB.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5" />
                <CardTitle>Personal Information</CardTitle>
              </div>
              <CardDescription>
                Your basic contact information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Personal Email</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormDescription>
                        Optional: Your personal email for band communications
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Emergency Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Emergency Contact</CardTitle>
              <CardDescription>
                Someone we can contact in case of emergency
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="emergencyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Name</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emergencyPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Phone</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emergencyEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Instruments */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Music className="h-5 w-5" />
                <CardTitle>Instruments</CardTitle>
              </div>
              <CardDescription>
                Select the instruments you play
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(instrumentsByFamily).map(([family, familyInstruments]) => (
                <div key={family}>
                  <p className="text-sm font-medium mb-2">{family}</p>
                  <div className="flex flex-wrap gap-2">
                    {familyInstruments.map((instrument) => (
                      <Badge
                        key={instrument.id}
                        variant={selectedInstruments.includes(instrument.id) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleInstrument(instrument.id)}
                      >
                        {instrument.name}
                        {primaryInstrumentId === instrument.id && ' (Primary)'}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}

              {selectedInstruments.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <FormLabel>Primary Instrument</FormLabel>
                    <Select
                      value={primaryInstrumentId || ''}
                      onValueChange={setPrimaryInstrumentId}
                    >
                      <SelectTrigger className="w-full mt-2">
                        <SelectValue placeholder="Select primary instrument" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedInstruments.map((id) => {
                          const instrument = instruments.find((i) => i.id === id);
                          return instrument ? (
                            <SelectItem key={id} value={id}>
                              {instrument.name}
                            </SelectItem>
                          ) : null;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Sections */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle>Sections</CardTitle>
              </div>
              <CardDescription>
                Select the sections you belong to
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {sections.map((section) => (
                  <Badge
                    key={section.id}
                    variant={selectedSections.includes(section.id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleSection(section.id)}
                  >
                    {section.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Submit Buttons */}
          <div className="flex gap-4">
            <Button type="submit" disabled={isUpdating}>
              {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/member/profile')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
