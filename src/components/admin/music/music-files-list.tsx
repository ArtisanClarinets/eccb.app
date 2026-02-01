'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { toast } from 'sonner';
import { Download, FileText, Trash2, Upload, Music2, Image, Loader2 } from 'lucide-react';
import { deleteMusicFile, uploadMusicFile } from '@/app/(admin)/admin/music/actions';

interface MusicFile {
  id: string;
  fileName: string;
  storageKey: string;
  storageUrl: string | null;
  mimeType: string;
  fileSize: number;
  fileType: string;
  description: string | null;
  isPublic: boolean;
  uploadedAt: Date;
  parts: Array<{
    id: string;
    partName: string;
    instrument: { id: string; name: string };
  }>;
}

interface MusicFilesListProps {
  pieceId: string;
  files: MusicFile[];
}

export function MusicFilesList({ pieceId, files }: MusicFilesListProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(e.target.files)) {
        const formData = new FormData();
        formData.append('file', file);
        
        const result = await uploadMusicFile(pieceId, formData);
        if (result.success) {
          toast.success(`Uploaded ${file.name}`);
        } else {
          toast.error(`Failed to upload ${file.name}`);
        }
      }
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (fileId: string) => {
    setDeletingId(fileId);
    try {
      const result = await deleteMusicFile(fileId);
      if (result.success) {
        toast.success('File deleted');
      } else {
        toast.error('Failed to delete file');
      }
    } catch (error) {
      toast.error('Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'SCORE':
        return <FileText className="h-4 w-4" />;
      case 'AUDIO':
        return <Music2 className="h-4 w-4" />;
      case 'IMAGE':
        return <Image className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Files</CardTitle>
            <CardDescription>
              Scores, parts, and audio files for this piece
            </CardDescription>
          </div>
          <div>
            <input
              type="file"
              id="file-upload"
              multiple
              accept=".pdf,.mp3,.wav,.jpg,.jpeg,.png"
              onChange={handleUpload}
              className="hidden"
            />
            <label htmlFor="file-upload">
              <Button asChild disabled={isUploading}>
                <span>
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload Files
                </span>
              </Button>
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No files uploaded yet</p>
            <p className="text-sm text-muted-foreground">
              Upload score PDFs, part files, or audio recordings
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Part</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getFileIcon(file.fileType)}
                      <span className="font-medium">{file.fileName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{file.fileType}</Badge>
                  </TableCell>
                  <TableCell>
                    {file.parts.length > 0 
                      ? file.parts.map(p => p.instrument.name).join(', ') 
                      : file.description || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatFileSize(file.fileSize)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" asChild>
                        <a
                          href={`/api/files/${file.storageKey}`}
                          download={file.fileName}
                          target="_blank"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete File</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete &quot;{file.fileName}&quot;? This action
                              cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(file.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {deletingId === file.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Delete'
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
