'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Image as ImageIcon,
  FileText,
  Upload,
  Search,
  MoreHorizontal,
  Trash2,
  Edit,
  Copy,
  Download,
  Loader2,
  Grid,
  List,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

interface Asset {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  title: string | null;
  altText: string | null;
  caption: string | null;
  tags: string[] | null;
  width: number | null;
  height: number | null;
  uploadedAt: string;
  uploadedBy: string | null;
  url: string;
  isImage: boolean;
}

interface AssetsClientProps {
  initialAssets: Asset[];
  stats: {
    total: number;
    images: number;
    documents: number;
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) {
    return ImageIcon;
  }
  return FileText;
}

// =============================================================================
// Components
// =============================================================================

export function AssetsClient({ initialAssets, stats }: AssetsClientProps) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'image' | 'document'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isUploading, setIsUploading] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    altText: '',
    caption: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Filter assets
  const filteredAssets = assets.filter(asset => {
    const matchesSearch =
      asset.fileName.toLowerCase().includes(search.toLowerCase()) ||
      (asset.title?.toLowerCase().includes(search.toLowerCase())) ||
      (asset.altText?.toLowerCase().includes(search.toLowerCase()));

    const matchesFilter =
      filter === 'all' ||
      (filter === 'image' && asset.isImage) ||
      (filter === 'document' && !asset.isImage);

    return matchesSearch && matchesFilter;
  });

  // Handle file upload
  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/assets/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Upload failed');
        }

        return response.json();
      });

      const results = await Promise.all(uploadPromises);

      // Add new assets to the list
      const newAssets = results.map(r => ({
        id: r.asset.id,
        fileName: r.asset.fileName,
        fileSize: r.asset.fileSize,
        mimeType: r.asset.mimeType,
        title: r.asset.title,
        altText: r.asset.altText,
        caption: r.asset.caption,
        tags: r.asset.tags,
        width: r.asset.width,
        height: r.asset.height,
        uploadedAt: r.asset.uploadedAt,
        uploadedBy: r.asset.uploadedBy,
        url: r.asset.url,
        isImage: r.asset.mimeType.startsWith('image/'),
      }));

      setAssets(prev => [...newAssets, ...prev]);
      toast.success(`Uploaded ${results.length} file(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, []);

  // Handle drag and drop
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  // Handle delete
  const handleDelete = async () => {
    if (!deletingAsset) return;

    try {
      const response = await fetch(`/api/assets/${deletingAsset.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delete failed');
      }

      setAssets(prev => prev.filter(a => a.id !== deletingAsset.id));
      toast.success('Asset deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setIsDeleteDialogOpen(false);
      setDeletingAsset(null);
    }
  };

  // Handle edit
  const handleEdit = async () => {
    if (!editingAsset) return;

    try {
      const response = await fetch(`/api/assets/${editingAsset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Update failed');
      }

      const result = await response.json();

      setAssets(prev =>
        prev.map(a =>
          a.id === editingAsset.id
            ? {
                ...a,
                title: result.asset.title,
                altText: result.asset.altText,
                caption: result.asset.caption,
                tags: result.asset.tags,
              }
            : a
        )
      );

      toast.success('Asset updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setIsEditDialogOpen(false);
      setEditingAsset(null);
    }
  };

  // Copy URL to clipboard
  const copyUrl = (asset: Asset) => {
    const fullUrl = `${window.location.origin}${asset.url}`;
    navigator.clipboard.writeText(fullUrl);
    toast.success('URL copied to clipboard');
  };

  // Open edit dialog
  const openEditDialog = (asset: Asset) => {
    setEditingAsset(asset);
    setEditForm({
      title: asset.title || '',
      altText: asset.altText || '',
      caption: asset.caption || '',
    });
    setIsEditDialogOpen(true);
  };

  // Open delete dialog
  const openDeleteDialog = (asset: Asset) => {
    setDeletingAsset(asset);
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Media Assets</h1>
          <p className="text-muted-foreground">
            Upload and manage images and documents for your website
          </p>
        </div>
        <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={e => handleUpload(e.target.files)}
        />
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Images</CardTitle>
            <ImageIcon className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.images}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.documents}</div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Area */}
      <Card>
        <CardContent className="p-6">
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Drop files here</h3>
            <p className="text-muted-foreground">
              or click the Upload button to browse
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Supports: JPEG, PNG, GIF, WebP, SVG, PDF, Word, Excel
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border">
            <Button
              variant={filter === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilter('all')}
              className="rounded-r-none"
            >
              All
            </Button>
            <Button
              variant={filter === 'image' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilter('image')}
              className="rounded-none border-x"
            >
              Images
            </Button>
            <Button
              variant={filter === 'document' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilter('document')}
              className="rounded-l-none"
            >
              Documents
            </Button>
          </div>
          <div className="flex items-center rounded-md border">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none"
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('list')}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Assets Grid/List */}
      {filteredAssets.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No assets found</h3>
            <p className="text-muted-foreground">
              {search || filter !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Upload your first asset to get started'}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredAssets.map(asset => (
            <Card key={asset.id} className="overflow-hidden group">
              <div className="aspect-square relative bg-muted">
                {asset.isImage ? (
                  <img
                    src={asset.url}
                    alt={asset.altText || asset.fileName}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <FileText className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="icon" variant="secondary" onClick={() => copyUrl(asset)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="secondary" onClick={() => openEditDialog(asset)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="destructive" onClick={() => openDeleteDialog(asset)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-3">
                <p className="font-medium truncate text-sm">{asset.title || asset.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(asset.fileSize)} • {formatDate(asset.uploadedAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredAssets.map(asset => {
                const Icon = getFileIcon(asset.mimeType);
                return (
                  <div
                    key={asset.id}
                    className="flex items-center gap-4 p-4 hover:bg-muted/50"
                  >
                    <div className="h-12 w-12 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {asset.isImage ? (
                        <img
                          src={asset.url}
                          alt={asset.altText || asset.fileName}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <Icon className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{asset.title || asset.fileName}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(asset.fileSize)} • {asset.mimeType} • {formatDate(asset.uploadedAt)}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => copyUrl(asset)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy URL
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={asset.url} target="_blank" rel="noopener noreferrer">
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditDialog(asset)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => openDeleteDialog(asset)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Asset Details</DialogTitle>
            <DialogDescription>
              Update the title, alt text, and caption for this asset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={editForm.title}
                onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter a title"
              />
            </div>
            <div>
              <Label htmlFor="altText">Alt Text</Label>
              <Textarea
                id="altText"
                value={editForm.altText}
                onChange={e => setEditForm(prev => ({ ...prev, altText: e.target.value }))}
                placeholder="Describe this image for accessibility"
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Important for screen readers and SEO
              </p>
            </div>
            <div>
              <Label htmlFor="caption">Caption</Label>
              <Textarea
                id="caption"
                value={editForm.caption}
                onChange={e => setEditForm(prev => ({ ...prev, caption: e.target.value }))}
                placeholder="Enter a caption"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Asset</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingAsset?.fileName}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
