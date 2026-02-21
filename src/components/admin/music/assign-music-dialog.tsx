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
import { toast } from 'sonner';
import { UserPlus, Search, Loader2 } from 'lucide-react';
import { assignMusicToMembers } from '@/app/(admin)/admin/music/assignment-actions';

interface AssignMusicDialogProps {
  pieceId: string;
  existingMemberIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Member {
  id: string;
  user: {
    name: string;
    email: string;
  };
  primaryInstrument: { name: string } | null;
  section: { name: string } | null;
}

export function AssignMusicDialog({
  pieceId,
  existingMemberIds,
  open,
  onOpenChange,
}: AssignMusicDialogProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      loadMembers();
    }
  }, [open]);

  const loadMembers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/members?status=ACTIVE');
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
      }
    } catch (error) {
      console.error('Failed to load members:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMembers = members.filter((member) => {
    const query = searchQuery.toLowerCase();
    return (
      !existingMemberIds.includes(member.id) &&
      (member.user.name.toLowerCase().includes(query) ||
        member.user.email.toLowerCase().includes(query) ||
        member.primaryInstrument?.name.toLowerCase().includes(query) ||
        member.section?.name.toLowerCase().includes(query))
    );
  });

  const handleToggle = (memberId: string) => {
    setSelectedIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredMembers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredMembers.map((m) => m.id));
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      toast.error('Please select at least one member');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await assignMusicToMembers(pieceId, selectedIds);
      if (result.success) {
        toast.success(`Assigned ${selectedIds.length} member(s)`);
        setSelectedIds([]);
        onOpenChange(false);
      } else {
        toast.error(result.error || 'Failed to assign members');
      }
    } catch (error) {
      toast.error('Assignment failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Assign Members
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Music to Members</DialogTitle>
          <DialogDescription>
            Select members who should have access to this music piece.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {searchQuery
                ? 'No members match your search'
                : 'All members are already assigned'}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox
                  id="select-all"
                  checked={
                    selectedIds.length === filteredMembers.length &&
                    filteredMembers.length > 0
                  }
                  onCheckedChange={handleSelectAll}
                />
                <Label htmlFor="select-all" className="text-sm font-medium">
                  Select all ({filteredMembers.length})
                </Label>
              </div>

              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {filteredMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                      onClick={() => handleToggle(member.id)}
                    >
                      <Checkbox
                        checked={selectedIds.includes(member.id)}
                        onCheckedChange={() => handleToggle(member.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{member.user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.primaryInstrument?.name || 'No instrument'} •{' '}
                          {member.section?.name || 'No section'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || selectedIds.length === 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Assigning...
              </>
            ) : (
              `Assign ${selectedIds.length} Member${selectedIds.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
