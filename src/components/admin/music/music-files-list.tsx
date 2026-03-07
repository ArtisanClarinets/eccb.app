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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { 
  Download, 
  FileText, 
  Trash2, 
  Upload, 
  Music2, 
  Image, 
  Loader2, 
  MoreHorizontal,
  History,
  Edit,
  Archive,
  Plus,
} from 'lucide-react';
import { 
  deleteMusicFile, 
  uploadMusicFile, 
  updateMusicFile,
  archiveMusicFile,
  getFileVersionHistory,
} from '@/app/(admin)/admin/music/file-actions';

interface MusicFile {
  id: string;
  fileName: string;
  storageKey: string;
  storageUrl: string | null;
  mimeType: string;
  fileSize: number;
  fileType: string;
  version: number;
  description: string | null;
  isPublic: boolean;
  isArchived: boolean;
  uploadedAt: Date;
  parts: Array<{
    id: string;
    partName: string;
    instrument: { id: string; name: string };
  }>;
  versions?: Array<{
    id: string;
    version: number;
    fileName: string;
    fileSize: number;
    uploadedAt: Date;
    changeNote: string | null;
  }>;
}

interface Instrument {
  id: string;
  name: string;
  family: string;
}

interface MusicFilesListProps {
  pieceId: string;
  files: MusicFile[];
  instruments: Instrument[];
}

const FILE_TYPES = [
  { value: 'FULL_SCORE', label: 'Full Score' },
  { value: 'CONDUCTOR_SCORE', label: 'Conductor Score' },
  { value: 'PART', label: 'Part' },
  { value: 'CONDENSED_SCORE', label: 'Condensed Score' },
  { value: 'AUDIO', label: 'Audio' },
  { value: 'LICENSING', label: 'Licensing' },
  { value: 'OTHER', label: 'Other' },
];

const PART_TYPES = [
  'Flute 1', 'Flute 2', 'Piccolo',
  'Oboe 1', 'Oboe 2', 'English Horn',
  'Clarinet 1', 'Clarinet 2', 'Clarinet 3', 'Bass Clarinet',
  'Bassoon 1', 'Bassoon 2',
  'Saxophone 1', 'Saxophone 2', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
  'Trumpet 1', 'Trumpet 2', 'Trumpet 3', 'Trumpet 4',
  'Horn 1', 'Horn 2', 'Horn 3', 'Horn 4',
  'Trombone 1', 'Trombone 2', 'Trombone 3', 'Bass Trombone',
  'Euphonium', 'Baritone',
  'Tuba',
  'Percussion 1', 'Percussion 2', 'Percussion 3', 'Timpani', 'Drum Set',
  'Piano', 'Synthesizer',
  'String Bass', 'Electric Bass',
  'Other',
];

export function MusicFilesList({ pieceId, files, instruments }: MusicFilesListProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [_deletingId, setDeletingId] = useState<string | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const [editingFile, setEditingFile] = useState<MusicFile | null>(null);
  const [versionHistory, setVersionHistory] = useState<MusicFile['versions']>([]);
  
  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFileType, setUploadFileType] = useState<string>('PART');
  const [uploadInstrumentId, setUploadInstrumentId] = useState<string>('');
  const [uploadPartType, setUploadPartType] = useState<string>('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadChangeNote, setUploadChangeNote] = useState('');
  const [isVersionUpdate, setIsVersionUpdate] = useState(false);
  const [existingFileId, setExistingFileId] = useState<string>('');

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error('Please select a file');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('fileType', uploadFileType);
      formData.append('description', uploadDescription);
      
      if (isVersionUpdate && existingFileId) {
        formData.append('existingFileId', existingFileId);
        formData.append('changeNote', uploadChangeNote);
      } else {
        if (uploadInstrumentId) {
          formData.append('instrumentId', uploadInstrumentId);
        }
        if (uploadPartType) {
          formData.append('partType', uploadPartType);
        }
      }

      const result = await uploadMusicFile(pieceId, formData);
      if (result.success) {
        toast.success(isVersionUpdate ? 'File version updated' : 'File uploaded');
        setShowUploadDialog(false);
        resetUploadForm();
      } else {
        toast.error(result.error || 'Failed to upload file');
      }
    } catch (_error) {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
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
    } catch (_error) {
      toast.error('Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleArchive = async (fileId: string) => {
    try {
      const result = await archiveMusicFile(fileId);
      if (result.success) {
        toast.success('File archived');
      } else {
        toast.error('Failed to archive file');
      }
    } catch (_error) {
      toast.error('Archive failed');
    }
  };

  const handleEdit = async () => {
    if (!editingFile) return;

    try {
      const result = await updateMusicFile(editingFile.id, {
        description: editingFile.description || undefined,
        fileType: editingFile.fileType as any,
        isPublic: editingFile.isPublic,
      });
      
      if (result.success) {
        toast.success('File updated');
        setShowEditDialog(false);
        setEditingFile(null);
      } else {
        toast.error('Failed to update file');
      }
    } catch (_error) {
      toast.error('Update failed');
    }
  };

  const handleViewHistory = async (fileId: string) => {
    try {
      const result = await getFileVersionHistory(fileId);
      if (result.success && result.versions) {
        setVersionHistory(result.versions);
        setShowVersionDialog(true);
      } else {
        toast.error('Failed to load version history');
      }
    } catch (_error) {
      toast.error('Failed to load version history');
    }
  };

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadFileType('PART');
    setUploadInstrumentId('');
    setUploadPartType('');
    setUploadDescription('');
    setUploadChangeNote('');
    setIsVersionUpdate(false);
    setExistingFileId('');
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'FULL_SCORE':
      case 'CONDUCTOR_SCORE':
      case 'CONDENSED_SCORE':
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

  const activeFiles = files.filter(f => !f.isArchived);
  const archivedFiles = files.filter(f => f.isArchived);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Files</CardTitle>
              <CardDescription>
                Scores, parts, and audio files for this piece
              </CardDescription>
            </div>
            <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => resetUploadForm()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Upload File
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Upload File</DialogTitle>
                  <DialogDescription>
                    Upload a new file or update an existing file version
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="version-update"
                      checked={isVersionUpdate}
                      onChange={(e) => setIsVersionUpdate(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="version-update">Update existing file (new version)</Label>
                  </div>

                  {isVersionUpdate ? (
                    <div className="space-y-2">
                      <Label>File to Update</Label>
                      <Select value={existingFileId} onValueChange={setExistingFileId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select file to update" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeFiles.map((file) => (
                            <SelectItem key={file.id} value={file.id}>
                              {file.fileName} (v{file.version})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label>File Type</Label>
                        <Select value={uploadFileType} onValueChange={setUploadFileType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FILE_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {uploadFileType === 'PART' && (
                        <>
                          <div className="space-y-2">
                            <Label>Instrument</Label>
                            <Select value={uploadInstrumentId} onValueChange={setUploadInstrumentId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select instrument" />
                              </SelectTrigger>
                              <SelectContent>
                                {instruments.map((inst) => (
                                  <SelectItem key={inst.id} value={inst.id}>
                                    {inst.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Part Type</Label>
                            <Select value={uploadPartType} onValueChange={setUploadPartType}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select part type" />
                              </SelectTrigger>
                              <SelectContent>
                                {PART_TYPES.map((part) => (
                                  <SelectItem key={part} value={part}>
                                    {part}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="uploadFile">File</Label>
                    <Input
                      id="uploadFile"
                      name="uploadFile"
                      type="file"
                      accept=".pdf,.mp3,.wav,.mxl,.musicxml"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Textarea
                      value={uploadDescription}
                      onChange={(e) => setUploadDescription(e.target.value)}
                      placeholder="Add notes about this file..."
                    />
                  </div>

                  {isVersionUpdate && (
                    <div className="space-y-2">
                      <Label>Change Note (optional)</Label>
                      <Textarea
                        value={uploadChangeNote}
                        onChange={(e) => setUploadChangeNote(e.target.value)}
                        placeholder="What changed in this version?"
                      />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpload} disabled={isUploading}>
                    {isUploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Upload
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {activeFiles.length === 0 ? (
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
                  <TableHead>Version</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeFiles.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getFileIcon(file.fileType)}
                        <div>
                          <span className="font-medium">{file.fileName}</span>
                          {file.description && (
                            <p className="text-xs text-muted-foreground">{file.description}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {FILE_TYPES.find(t => t.value === file.fileType)?.label || file.fileType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {file.parts.length > 0 
                        ? file.parts.map(p => `${p.instrument.name} - ${p.partName}`).join(', ') 
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">v{file.version}</Badge>
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setEditingFile(file);
                              setShowEditDialog(true);
                            }}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleViewHistory(file.id)}>
                              <History className="mr-2 h-4 w-4" />
                              Version History
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleArchive(file.id)}>
                              <Archive className="mr-2 h-4 w-4" />
                              Archive
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => handleDelete(file.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Archived Files */}
      {archivedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground">Archived Files</CardTitle>
            <CardDescription>
              Previously archived files with version history preserved
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archivedFiles.map((file) => (
                  <TableRow key={file.id} className="opacity-60">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getFileIcon(file.fileType)}
                        <span className="font-medium">{file.fileName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {FILE_TYPES.find(t => t.value === file.fileType)?.label || file.fileType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">v{file.version}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatFileSize(file.fileSize)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild>
                        <a
                          href={`/api/files/${file.storageKey}`}
                          download={file.fileName}
                          target="_blank"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit File Details</DialogTitle>
            <DialogDescription>
              Update file metadata and settings
            </DialogDescription>
          </DialogHeader>
          {editingFile && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>File Type</Label>
                <Select 
                  value={editingFile.fileType} 
                  onValueChange={(value) => setEditingFile({ ...editingFile, fileType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingFile.description || ''}
                  onChange={(e) => setEditingFile({ ...editingFile, description: e.target.value })}
                  placeholder="Add notes about this file..."
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is-public"
                  checked={editingFile.isPublic}
                  onChange={(e) => setEditingFile({ ...editingFile, isPublic: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="is-public">Publicly accessible</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={showVersionDialog} onOpenChange={setShowVersionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              Previous versions of this file
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {versionHistory && versionHistory.length > 0 ? (
              <div className="space-y-4">
                {versionHistory.map((version) => (
                  <div key={version.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <p className="font-medium">Version {version.version}</p>
                      <p className="text-sm text-muted-foreground">{version.fileName}</p>
                      {version.changeNote && (
                        <p className="text-sm italic">{version.changeNote}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(version.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline">{formatFileSize(version.fileSize)}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground">No previous versions</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVersionDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
