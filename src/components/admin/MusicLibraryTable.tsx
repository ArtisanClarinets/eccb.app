'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
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
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FileText, MoreHorizontal, Edit, Download, Eye, Trash2, Archive, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MusicPieceWithRelations {
  id: string;
  title: string;
  subtitle: string | null;
  catalogNumber: string | null;
  difficulty: string | null;
  isArchived: boolean;
  deletedAt: Date | null;
  composer: { fullName: string } | null;
  arranger: { fullName: string } | null;
  files: { id: string }[];
  _count: { assignments: number };
}

interface MusicLibraryTableProps {
  pieces: MusicPieceWithRelations[];
  difficultyColors: Record<string, string>;
  difficultyLabels: Record<string, string>;
  onPiecesChange?: () => void;
}

const actionLabels = {
  archive: 'Archive',
  unarchive: 'Restore from Archive',
  delete: 'Move to Trash',
  restore: 'Restore from Trash',
};

type ActionType = keyof typeof actionLabels;

export function MusicLibraryTable({
  pieces: initialPieces,
  difficultyColors,
  difficultyLabels,
  onPiecesChange,
}: MusicLibraryTableProps) {
  const [pieces, setPieces] = useState<MusicPieceWithRelations[]>(initialPieces);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: ActionType | null;
    count: number;
  }>({ open: false, action: null, count: 0 });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(pieces.map((p) => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const performBulkAction = async (action: ActionType) => {
    if (selectedIds.size === 0) return;

    setIsLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const payload =
        action === 'archive'
          ? { ids, archived: true }
          : action === 'unarchive'
            ? { ids, archived: false }
            : { ids };

      const endpoint =
        action === 'archive' || action === 'unarchive'
          ? '/api/admin/music/bulk-archive'
          : action === 'delete'
            ? '/api/admin/music/bulk-delete'
            : '/api/admin/music/bulk-restore';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        // Update local state by removing/updating affected pieces
        const newPieces = pieces.filter((p) => !selectedIds.has(p.id));
        setPieces(newPieces);
        setSelectedIds(new Set());
        setConfirmDialog({ open: false, action: null, count: 0 });
        onPiecesChange?.();
      } else {
        const error = await response.json();
        console.error('Action failed:', error);
        alert(`Failed to ${action}: ${error.error}`);
      }
    } catch (error) {
      console.error('Error performing action:', error);
      alert(`An error occurred while performing the action: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const performSingleAction = async (pieceId: string, action: ActionType) => {
    setIsLoading(true);
    try {
      const endpoint =
        action === 'archive'
          ? `/api/admin/music/${pieceId}/archive`
          : action === 'unarchive'
            ? `/api/admin/music/${pieceId}/archive`
            : action === 'delete'
              ? `/api/admin/music/${pieceId}/delete`
              : `/api/admin/music/${pieceId}/restore`;

      const payload =
        action === 'archive' || action === 'unarchive'
          ? { archived: action === 'archive' }
          : {};

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const newPieces = pieces.filter((p) => p.id !== pieceId);
        setPieces(newPieces);
        onPiecesChange?.();
      } else {
        const error = await response.json();
        console.error('Action failed:', error);
        alert(`Failed to ${action}: ${error.error}`);
      }
    } catch (error) {
      console.error('Error performing action:', error);
      alert(`An error occurred while performing the action: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const isAllSelected = pieces.length > 0 && selectedIds.size === pieces.length;

  return (
    <>
      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-2 p-4 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmDialog({ open: true, action: 'archive', count: selectedIds.size })}
              disabled={isLoading}
            >
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmDialog({ open: true, action: 'delete', count: selectedIds.size })}
              disabled={isLoading}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            {pieces.some((p) => selectedIds.has(p.id) && p.deletedAt) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmDialog({ open: true, action: 'restore', count: selectedIds.size })}
                disabled={isLoading}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restore
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              disabled={isLoading}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={isAllSelected}
                onCheckedChange={handleSelectAll}
                disabled={pieces.length === 0}
              />
            </TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Composer / Arranger</TableHead>
            <TableHead>Difficulty</TableHead>
            <TableHead>Files</TableHead>
            <TableHead>Assignments</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pieces.map((piece) => (
            <TableRow
              key={piece.id}
              className={cn(
                piece.deletedAt && 'opacity-50 bg-muted/50',
                piece.isArchived && 'opacity-75'
              )}
            >
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(piece.id)}
                  onCheckedChange={(checked) => handleSelectOne(piece.id, checked as boolean)}
                />
              </TableCell>
              <TableCell>
                <div>
                  <Link
                    href={`/admin/music/${piece.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {piece.title}
                  </Link>
                  {piece.subtitle && (
                    <p className="text-sm text-muted-foreground">{piece.subtitle}</p>
                  )}
                  {piece.catalogNumber && (
                    <p className="text-xs text-muted-foreground">#{piece.catalogNumber}</p>
                  )}
                  <div className="flex gap-1 mt-1">
                    {piece.isArchived && (
                      <Badge variant="secondary" className="text-xs">
                        Archived
                      </Badge>
                    )}
                    {piece.deletedAt && (
                      <Badge variant="destructive" className="text-xs">
                        In Trash
                      </Badge>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {piece.composer && <div>{piece.composer.fullName}</div>}
                  {piece.arranger && (
                    <div className="text-muted-foreground">arr. {piece.arranger.fullName}</div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {piece.difficulty && (
                  <Badge className={difficultyColors[piece.difficulty]}>
                    {difficultyLabels[piece.difficulty]}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>{piece.files.length}</span>
                </div>
              </TableCell>
              <TableCell>{piece._count.assignments}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/music/${piece.id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/music/${piece.id}/edit`}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/music/${piece.id}/assign`}>
                        <Download className="mr-2 h-4 w-4" />
                        Assign to Members
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {!piece.deletedAt && (
                      <>
                        <DropdownMenuItem
                          onClick={() => performSingleAction(piece.id, 'archive')}
                          disabled={isLoading}
                        >
                          <Archive className="mr-2 h-4 w-4" />
                          {piece.isArchived ? 'Unarchive' : 'Archive'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => performSingleAction(piece.id, 'delete')}
                          disabled={isLoading}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Move to Trash
                        </DropdownMenuItem>
                      </>
                    )}
                    {piece.deletedAt && (
                      <DropdownMenuItem
                        onClick={() => performSingleAction(piece.id, 'restore')}
                        disabled={isLoading}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Restore from Trash
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {confirmDialog.action ? actionLabels[confirmDialog.action] : 'Action'}</DialogTitle>
            <DialogDescription>
              Are you sure you want to {confirmDialog.action ? actionLabels[confirmDialog.action].toLowerCase() : 'proceed'}{' '}
              {confirmDialog.count} piece(s)? This action can be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog({ open: false, action: null, count: 0 })}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant={confirmDialog.action === 'delete' ? 'destructive' : 'default'}
              onClick={() => confirmDialog.action && performBulkAction(confirmDialog.action)}
              disabled={isLoading}
            >
              {confirmDialog.action ? actionLabels[confirmDialog.action] : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
