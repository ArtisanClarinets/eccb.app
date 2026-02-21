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
import { Users, UserPlus, Trash2, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/date';
import { unassignMusicFromMember } from '@/app/(admin)/admin/music/assignment-actions';
import { AssignMusicDialog } from './assign-music-dialog';

interface Assignment {
  id: string;
  assignedAt: Date;
  notes: string | null;
  partName: string | null;
  member: {
    id: string;
    firstName: string;
    lastName: string;
    user: {
      name: string | null;
      email: string;
    } | null;
    instruments: Array<{
      isPrimary: boolean;
      instrument: { name: string };
    }>;
  };
}

interface MusicAssignmentsProps {
  pieceId: string;
  assignments: Assignment[];
}

export function MusicAssignments({ pieceId, assignments }: MusicAssignmentsProps) {
  const [unassigningId, setUnassigningId] = useState<string | null>(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);

  const handleUnassign = async (memberId: string) => {
    setUnassigningId(memberId);
    try {
      const result = await unassignMusicFromMember(pieceId, memberId);
      if (result.success) {
        toast.success('Member unassigned');
      } else {
        toast.error('Failed to unassign member');
      }
    } catch (_error) {
      toast.error('Unassign failed');
    } finally {
      setUnassigningId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Assignments</CardTitle>
            <CardDescription>
              Members who have been assigned this music
            </CardDescription>
          </div>
          <AssignMusicDialog
            pieceId={pieceId}
            existingMemberIds={assignments.map(a => a.member.id)}
            open={isAssignDialogOpen}
            onOpenChange={setIsAssignDialogOpen}
          />
        </div>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No members assigned</p>
            <p className="text-sm text-muted-foreground">
              Assign this music to members so they can access it
            </p>
            <Button
              className="mt-4"
              onClick={() => setIsAssignDialogOpen(true)}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Assign Members
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => {
                const memberName = `${assignment.member.firstName} ${assignment.member.lastName}`;
                const memberEmail = assignment.member.user?.email || '';
                const primaryInstrument = assignment.member.instruments.find(i => i.isPrimary);
                
                return (
                  <TableRow key={assignment.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{memberName}</p>
                        <p className="text-sm text-muted-foreground">
                          {memberEmail}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {primaryInstrument?.instrument.name || assignment.partName || 'Not set'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(assignment.assignedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      —
                    </TableCell>
                    <TableCell className="text-right">
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
                            <AlertDialogTitle>Unassign Member</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to unassign {memberName} from
                              this music? They will no longer be able to access it.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleUnassign(assignment.member.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {unassigningId === assignment.member.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Unassign'
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
