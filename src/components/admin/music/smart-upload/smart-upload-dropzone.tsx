'use client';

import { useCallback, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  File,
  FileAudio,
  FileImage,
  FileText,
  X,
  Check,
  AlertCircle,
} from 'lucide-react';
import { formatFileSize } from '@/hooks/use-smart-upload';

interface SmartUploadDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  maxSize?: number;
  acceptedTypes?: string[];
  disabled?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
}

interface FilePreview {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
  'image/bmp',
];

export function SmartUploadDropzone({
  onFilesSelected,
  maxFiles = 20,
  maxSize = 50 * 1024 * 1024, // 50MB
  acceptedTypes = ALLOWED_MIME_TYPES,
  disabled = false,
  isUploading = false,
  uploadProgress = 0,
}: SmartUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFiles = useCallback(
    (fileList: File[]): { valid: File[]; errors: string[] } => {
      const valid: File[] = [];
      const errors: string[] = [];

      for (const file of fileList) {
        // Check file type
        if (!acceptedTypes.includes(file.type)) {
          errors.push(`${file.name}: Invalid file type`);
          continue;
        }

        // Check file size
        if (file.size > maxSize) {
          errors.push(
            `${file.name}: File too large (max ${formatFileSize(maxSize)})`
          );
          continue;
        }

        valid.push(file);
      }

      return { valid, errors };
    },
    [acceptedTypes, maxSize]
  );

  const handleFiles = useCallback(
    (fileList: FileList | File[]) => {
      const fileArray = Array.from(fileList);

      // Check max files
      if (files.length + fileArray.length > maxFiles) {
        setValidationErrors([
          `Maximum ${maxFiles} files allowed (currently ${files.length})`,
        ]);
        return;
      }

      const { valid, errors } = validateFiles(fileArray);

      if (errors.length > 0) {
        setValidationErrors(errors);
      } else {
        setValidationErrors([]);
      }

      if (valid.length > 0) {
        const newFiles: FilePreview[] = valid.map((file) => ({
          file,
          id: crypto.randomUUID(),
          status: 'pending',
        }));

        setFiles((prev) => [...prev, ...newFiles]);
        onFilesSelected(valid);
      }
    },
    [files.length, maxFiles, validateFiles, onFilesSelected]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && !isUploading) {
        setIsDragging(true);
      }
    },
    [disabled, isUploading]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled || isUploading) return;

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) {
        handleFiles(droppedFiles);
      }
    },
    [disabled, isUploading, handleFiles]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (selectedFiles && selectedFiles.length > 0) {
        handleFiles(selectedFiles);
      }
      // Reset input so same file can be selected again
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [handleFiles]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setValidationErrors([]);
  }, []);

  const updateFileStatus = useCallback(
    (id: string, status: FilePreview['status'], error?: string) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status, error } : f))
      );
    },
    []
  );

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('audio/')) return FileAudio;
    if (mimeType.startsWith('image/')) return FileImage;
    if (mimeType === 'application/pdf') return FileText;
    return File;
  };

  const clearAllFiles = useCallback(() => {
    setFiles([]);
    setValidationErrors([]);
  }, []);

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        onClick={() => !disabled && !isUploading && inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
          'hover:border-primary/50 hover:bg-primary/5',
          isDragging && 'border-primary bg-primary/10',
          (disabled || isUploading) &&
            'opacity-50 cursor-not-allowed pointer-events-none',
          !isDragging && 'border-muted-foreground/25'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled || isUploading}
        />

        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              'p-4 rounded-full',
              isDragging ? 'bg-primary/20' : 'bg-muted'
            )}
          >
            <Upload
              className={cn(
                'h-8 w-8',
                isDragging ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          </div>

          <div>
            <p className="text-lg font-medium">
              {isDragging
                ? 'Drop files here'
                : 'Drag & drop files or click to browse'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              PDF, Audio (MP3, WAV, OGG), Images up to{' '}
              {formatFileSize(maxSize)}
            </p>
            <p className="text-sm text-muted-foreground">
              Maximum {maxFiles} files per batch
            </p>
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              {validationErrors.map((error, index) => (
                <p key={index} className="text-sm text-destructive">
                  {error}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">
              Selected Files ({files.length})
            </h4>
            {!isUploading && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFiles}
                className="text-muted-foreground"
              >
                Clear all
              </Button>
            )}
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {files.map((filePreview) => {
              const Icon = getFileIcon(filePreview.file.type);
              return (
                <div
                  key={filePreview.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border',
                    filePreview.status === 'error'
                      ? 'border-destructive/50 bg-destructive/5'
                      : 'border-muted bg-background'
                  )}
                >
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {filePreview.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(filePreview.file.size)}
                    </p>
                    {filePreview.error && (
                      <p className="text-xs text-destructive mt-1">
                        {filePreview.error}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    {filePreview.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(filePreview.id)}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    {filePreview.status === 'uploading' && (
                      <div className="h-8 w-8 flex items-center justify-center">
                        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                      </div>
                    )}
                    {filePreview.status === 'success' && (
                      <Check className="h-5 w-5 text-green-500" />
                    )}
                    {filePreview.status === 'error' && (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Uploading...</span>
                <span className="font-medium">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SmartUploadDropzone;