'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface PartMapping {
  id: string;
  instrument: string;
  pages: number[];
  fileName?: string;
}

// Common band instruments
const COMMON_INSTRUMENTS = [
  'Flute',
  'Oboe',
  'Bassoon',
  'Clarinet',
  'Bass Clarinet',
  'Alto Saxophone',
  'Tenor Saxophone',
  'Baritone Saxophone',
  'Trumpet',
  'Horn',
  'Trombone',
  'Bass Trombone',
  'Euphonium',
  'Tuba',
  'Percussion',
  'Timpani',
  'Piano',
  'Guitar',
];

interface PartMappingEditorProps {
  parts: PartMapping[];
  totalPages: number;
  onChange: (parts: PartMapping[]) => void;
  disabled?: boolean;
}

export function PartMappingEditor({
  parts,
  totalPages,
  onChange,
  disabled = false,
}: PartMappingEditorProps) {
  const [expandedPart, setExpandedPart] = useState<string | null>(null);

  const addPart = useCallback(() => {
    const newPart: PartMapping = {
      id: crypto.randomUUID(),
      instrument: '',
      pages: [],
    };
    onChange([...parts, newPart]);
    setExpandedPart(newPart.id);
  }, [parts, onChange]);

  const removePart = useCallback(
    (id: string) => {
      onChange(parts.filter((p) => p.id !== id));
    },
    [parts, onChange]
  );

  const updatePart = useCallback(
    (id: string, updates: Partial<PartMapping>) => {
      onChange(
        parts.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    [parts, onChange]
  );

  const togglePage = useCallback(
    (partId: string, page: number) => {
      const part = parts.find((p) => p.id === partId);
      if (!part) return;

      const pages = part.pages.includes(page)
        ? part.pages.filter((p) => p !== page)
        : [...part.pages, page].sort((a, b) => a - b);

      updatePart(partId, { pages });
    },
    [parts, updatePart]
  );

  const selectAllPages = useCallback(
    (partId: string) => {
      const part = parts.find((p) => p.id === partId);
      if (!part) return;

      // Find unassigned pages
      const assignedPages = new Set(
        parts.flatMap((p) => (p.id !== partId ? p.pages : []))
      );
      const unassignedPages = Array.from(
        { length: totalPages },
        (_, i) => i + 1
      ).filter((p) => !assignedPages.has(p));

      updatePart(partId, { pages: unassignedPages });
    },
    [parts, totalPages, updatePart]
  );

  const clearPages = useCallback(
    (partId: string) => {
      updatePart(partId, { pages: [] });
    },
    [updatePart]
  );

  // Find unassigned pages
  const getUnassignedPages = useCallback(() => {
    const assignedPages = new Set(parts.flatMap((p) => p.pages));
    return Array.from({ length: totalPages }, (_, i) => i + 1).filter(
      (p) => !assignedPages.has(p)
    );
  }, [parts, totalPages]);

  const formatPageRange = (pages: number[]) => {
    if (pages.length === 0) return 'No pages';
    if (pages.length === 1) return `Page ${pages[0]}`;
    if (pages.length === totalPages) return 'All pages';

    // Group consecutive pages
    const sorted = [...pages].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);

    return `Pages ${ranges.join(', ')}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Part Mapping</CardTitle>
          <Badge variant="outline">
            {parts.length} part{parts.length !== 1 ? 's' : ''} / {totalPages} pages
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Map extracted parts to instruments. Unassigned pages:{' '}
          {getUnassignedPages().length}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Parts List */}
        {parts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No parts defined yet</p>
            <p className="text-sm">Add parts to map instrument sections</p>
          </div>
        ) : (
          <div className="space-y-3">
            {parts.map((part) => (
              <div
                key={part.id}
                className={cn(
                  'border rounded-lg',
                  expandedPart === part.id && 'border-primary'
                )}
              >
                {/* Part Header */}
                <div
                  className={cn(
                    'flex items-center justify-between p-3 cursor-pointer',
                    'hover:bg-muted/50',
                    disabled && 'pointer-events-none'
                  )}
                  onClick={() =>
                    !disabled &&
                    setExpandedPart(
                      expandedPart === part.id ? null : part.id
                    )
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {expandedPart === part.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {part.instrument || 'Unnamed Part'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatPageRange(part.pages)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePart(part.id);
                    }}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                {/* Expanded Part Editor */}
                {expandedPart === part.id && (
                  <div className="p-3 border-t bg-muted/30 space-y-4">
                    {/* Instrument Select */}
                    <div className="space-y-2">
                      <Label>Instrument</Label>
                      <Select
                        value={part.instrument}
                        onValueChange={(value) =>
                          updatePart(part.id, { instrument: value })
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select instrument" />
                        </SelectTrigger>
                        <SelectContent>
                          {COMMON_INSTRUMENTS.map((inst) => (
                            <SelectItem key={inst} value={inst}>
                              {inst}
                            </SelectItem>
                          ))}
                          <SelectItem value="OTHER">Other...</SelectItem>
                        </SelectContent>
                      </Select>
                      {!COMMON_INSTRUMENTS.includes(part.instrument) &&
                        part.instrument && (
                        <Input
                          value={part.instrument}
                          onChange={(e) =>
                            updatePart(part.id, { instrument: e.target.value })
                          }
                          placeholder="Enter instrument name"
                          disabled={disabled}
                          className="mt-2"
                        />
                      )}
                    </div>

                    {/* Page Range */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Pages</Label>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => selectAllPages(part.id)}
                            disabled={disabled}
                          >
                            Select All Unassigned
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => clearPages(part.id)}
                            disabled={disabled}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                          (page) => {
                            const isAssigned = parts.some(
                              (p) => p.id !== part.id && p.pages.includes(page)
                            );
                            const isSelected = part.pages.includes(page);

                            return (
                              <button
                                key={page}
                                type="button"
                                onClick={() => !isAssigned && togglePage(part.id, page)}
                                disabled={isAssigned || disabled}
                                className={cn(
                                  'w-8 h-8 text-xs font-medium rounded transition-colors',
                                  isSelected
                                    ? 'bg-primary text-primary-foreground'
                                    : isAssigned
                                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                      : 'bg-muted/50 hover:bg-muted'
                                )}
                              >
                                {page}
                              </button>
                            );
                          }
                        )}
                      </div>
                      {getUnassignedPages().length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Unassigned pages can be added to this part
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Part Button */}
        <Button
          variant="outline"
          onClick={addPart}
          disabled={disabled}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Part
        </Button>
      </CardContent>
    </Card>
  );
}

export default PartMappingEditor;