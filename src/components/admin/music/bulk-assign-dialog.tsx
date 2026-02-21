'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { CalendarIcon, Loader2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { assignMusicToSections } from '@/app/(admin)/admin/music/actions';

interface Section {
  id: string;
  name: string;
  _count?: {
    members: number;
  };
}

interface BulkAssignDialogProps {
  pieceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkAssignDialog({
  pieceId,
  open,
  onOpenChange,
}: BulkAssignDialogProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [partName, setPartName] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      loadSections();
    }
  }, [open]);

  const loadSections = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/sections');
      if (response.ok) {
        const data = await response.json();
        setSections(data.sections || []);
      }
    } catch (error) {
      console.error('Failed to load sections:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSection = (sectionId: string) => {
    setSelectedSectionIds((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const handleSelectAll = () => {
    if (selectedSectionIds.length === sections.length) {
      setSelectedSectionIds([]);
    } else {
      setSelectedSectionIds(sections.map((s) => s.id));
    }
  };

  const handleSubmit = async () => {
    if (selectedSectionIds.length === 0) {
      toast.error('Please select at least one section');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await assignMusicToSections(pieceId, selectedSectionIds, {
        partName: partName || undefined,
        notes: notes || undefined,
        dueDate: dueDate,
      });

      if (result.success) {
        toast.success(`Assigned music to ${result.count} members`);
        setSelectedSectionIds([]);
        setPartName('');
        setNotes('');
        setDueDate(undefined);
        onOpenChange(false);
      } else {
        toast.error(result.error || 'Failed to assign music');
      }
    } catch (error) {
      toast.error('Assignment failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalMembers = sections
    .filter((s) => selectedSectionIds.includes(s.id))
    .reduce((sum, s) => sum + (s._count?.members || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users className="mr-2 h-4 w-4" />
          Assign by Section
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Music by Section</DialogTitle>
          <DialogDescription>
            Assign this music to all active members of selected sections.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sections.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No sections available
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox
                  id="select-all-sections"
                  checked={
                    selectedSectionIds.length === sections.length &&
                    sections.length > 0
                  }
                  onCheckedChange={handleSelectAll}
                />
                <Label htmlFor="select-all-sections" className="text-sm font-medium">
                  Select all sections ({sections.length})
                </Label>
              </div>

              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {sections.map((section) => (
                    <div
                      key={section.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                      onClick={() => handleToggleSection(section.id)}
                    >
                      <Checkbox
                        checked={selectedSectionIds.includes(section.id)}
                        onCheckedChange={() => handleToggleSection(section.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{section.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {section._count?.members || 0} active members
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {selectedSectionIds.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {totalMembers} total member{totalMembers !== 1 ? 's' : ''} will be assigned
                </p>
              )}
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="partName">Part Name (Optional)</Label>
            <Input
              id="partName"
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              placeholder="e.g., Flute 1, Trumpet 2"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDate">Due Date (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !dueDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(dueDate, 'PPP') : 'Select due date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes for this assignment"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || selectedSectionIds.length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Assigning...
              </>
            ) : (
              `Assign to ${totalMembers} Member${totalMembers !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
