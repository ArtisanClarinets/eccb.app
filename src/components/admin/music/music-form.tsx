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
import { Loader2, Upload, X, FileText, Music } from 'lucide-react';
import { createMusicPiece } from '@/app/(admin)/admin/music/actions';

const musicSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  composerId: z.string().optional(),
  arrangerId: z.string().optional(),
  publisherId: z.string().optional(),
  difficulty: z.string().optional(),
  duration: z.coerce.number().optional(),
  genre: z.string().optional(),
  style: z.string().optional(),
  catalogNumber: z.string().optional(),
  notes: z.string().optional(),
});

type MusicFormData = z.infer<typeof musicSchema>;

interface MusicFormProps {
  composers: Array<{ id: string; firstName: string; lastName: string; fullName: string }>;
  arrangers: Array<{ id: string; firstName: string; lastName: string; fullName: string }>;
  publishers: Array<{ id: string; name: string }>;
  instruments: Array<{ id: string; name: string; family: string }>;
  initialData?: Partial<MusicFormData> & { id?: string };
}

const difficulties = [
  { value: 'GRADE_1', label: 'Grade 1 (Very Easy)' },
  { value: 'GRADE_2', label: 'Grade 2 (Easy)' },
  { value: 'GRADE_3', label: 'Grade 3 (Medium)' },
  { value: 'GRADE_4', label: 'Grade 4 (Medium Advanced)' },
  { value: 'GRADE_5', label: 'Grade 5 (Advanced)' },
  { value: 'GRADE_6', label: 'Grade 6 (Professional)' },
];

const genres = [
  'March',
  'Overture',
  'Suite',
  'Waltz',
  'Fanfare',
  'Concert Piece',
  'Transcription',
  'Original',
  'Film Music',
  'Holiday',
  'Patriotic',
  'Pop/Rock',
  'Jazz',
  'World Music',
  'Educational',
  'Other',
];

export function MusicForm({
  composers,
  arrangers,
  publishers,
  instruments: _instruments,
  initialData,
}: MusicFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const form = useForm<MusicFormData>({
    resolver: zodResolver(musicSchema) as any,
    defaultValues: initialData,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch: _watch,
    formState: { errors },
  } = form;

  const onSubmit = async (data: MusicFormData) => {
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          formData.append(key, String(value));
        }
      });

      // Add files
      files.forEach((file) => {
        formData.append('files', file);
      });

      const result = await createMusicPiece(formData);

      if (result.success) {
        toast.success('Music piece created successfully!');
        router.push(`/admin/music/${result.pieceId}`);
      } else {
        toast.error(result.error || 'Failed to create music piece');
      }
    } catch (_error) {
      toast.error('Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Enter the basic details about this piece.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Stars and Stripes Forever"
                {...register('title')}
                aria-invalid={!!errors.title}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input
                id="subtitle"
                placeholder="e.g., Concert March"
                {...register('subtitle')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalogNumber">Catalog Number</Label>
              <Input
                id="catalogNumber"
                placeholder="e.g., CB-001"
                {...register('catalogNumber')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select onValueChange={(value) => setValue('difficulty', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {difficulties.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  step="0.5"
                  placeholder="e.g., 5.5"
                  {...register('duration')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="genre">Genre</Label>
              <Select onValueChange={(value) => setValue('genre', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select genre" />
                </SelectTrigger>
                <SelectContent>
                  {genres.map((genre) => (
                    <SelectItem key={genre} value={genre}>
                      {genre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* People */}
        <Card>
          <CardHeader>
            <CardTitle>Composer & Arranger</CardTitle>
            <CardDescription>
              Select or add the composer and arranger.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="composerId">Composer</Label>
              <Select onValueChange={(value) => setValue('composerId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select composer" />
                </SelectTrigger>
                <SelectContent>
                  {composers.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="arrangerId">Arranger</Label>
              <Select onValueChange={(value) => setValue('arrangerId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select arranger" />
                </SelectTrigger>
                <SelectContent>
                  {arrangers.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="publisherId">Publisher</Label>
              <Select onValueChange={(value) => setValue('publisherId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select publisher" />
                </SelectTrigger>
                <SelectContent>
                  {publishers.map((publisher) => (
                    <SelectItem key={publisher.id} value={publisher.id}>
                      {publisher.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes about this piece..."
                rows={4}
                {...register('notes')}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Files */}
      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>
            Upload score and part files (PDF format recommended).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <input
              type="file"
              id="files"
              multiple
              accept=".pdf,.mp3,.wav,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor="files"
              className="flex flex-col items-center cursor-pointer"
            >
              <Upload className="h-10 w-10 text-muted-foreground mb-4" />
              <span className="text-sm font-medium">Click to upload files</span>
              <span className="text-xs text-muted-foreground mt-1">
                PDF, MP3, WAV, JPG, PNG (max 50MB each)
              </span>
            </label>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Music className="mr-2 h-4 w-4" />
              Create Music
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
