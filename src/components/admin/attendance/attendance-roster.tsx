'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AttendanceStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ArrowRightLeft,
  Save,
  Users,
  ChevronDown,
  Loader2,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAttendance, useAttendanceStats } from '@/hooks/use-attendance';
import { markBulkAttendance, initializeEventAttendance } from '@/app/(admin)/admin/attendance/actions';
import { toast } from 'sonner';

// Types
interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
  instruments: Array<{
    isPrimary: boolean;
    instrument: {
      id: string;
      name: string;
    };
  }>;
  sections: Array<{
    section: {
      id: string;
      name: string;
    };
  }>;
}

interface AttendanceRecord {
  id: string;
  memberId: string;
  status: AttendanceStatus;
  notes: string | null;
  markedAt: Date | string;
}

interface AttendanceRosterProps {
  eventId: string;
  eventTitle: string;
  eventType: string;
  members: Member[];
  existingAttendance: AttendanceRecord[];
}

type StatusFilter = 'all' | 'marked' | 'unmarked';

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  PRESENT: {
    label: 'Present',
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-green-600',
    bgColor: 'bg-green-100 text-green-800 hover:bg-green-200',
  },
  ABSENT: {
    label: 'Absent',
    icon: <XCircle className="h-4 w-4" />,
    color: 'text-red-600',
    bgColor: 'bg-red-100 text-red-800 hover:bg-red-200',
  },
  EXCUSED: {
    label: 'Excused',
    icon: <AlertCircle className="h-4 w-4" />,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
  },
  LATE: {
    label: 'Late',
    icon: <Clock className="h-4 w-4" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  },
  LEFT_EARLY: {
    label: 'Left Early',
    icon: <ArrowRightLeft className="h-4 w-4" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
  },
};

export function AttendanceRoster({
  eventId,
  eventTitle,
  eventType,
  members,
  existingAttendance,
}: AttendanceRosterProps) {
  const router = useRouter();
  const { isLoading, markBulkAttendance: markBulk } = useAttendance();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [attendanceData, setAttendanceData] = useState<Record<string, { status: AttendanceStatus; notes: string }>>(() => {
    const data: Record<string, { status: AttendanceStatus; notes: string }> = {};
    
    // Initialize from existing attendance
    existingAttendance.forEach((record) => {
      data[record.memberId] = {
        status: record.status,
        notes: record.notes || '',
      };
    });
    
    // Set default status for members without attendance
    members.forEach((member) => {
      if (!data[member.id]) {
        data[member.id] = { status: 'ABSENT' as AttendanceStatus, notes: '' };
      }
    });
    
    return data;
  });
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesMemberId, setNotesMemberId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  // Computed values
  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = searchQuery === '' ||
        member.firstName.toLowerCase().includes(searchLower) ||
        member.lastName.toLowerCase().includes(searchLower) ||
        member.email?.toLowerCase().includes(searchLower);

      // Status filter
      const attendance = attendanceData[member.id];
      const isMarked = attendance && attendance.status !== 'ABSENT';
      
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'marked' && isMarked) ||
        (statusFilter === 'unmarked' && !isMarked);

      return matchesSearch && matchesStatus;
    });
  }, [members, searchQuery, statusFilter, attendanceData]);

  const attendanceStats = useAttendanceStats(
    Object.values(attendanceData).map((a, i) => ({
      id: String(i),
      eventId,
      memberId: '',
      status: a.status,
      notes: a.notes || null,
      markedAt: new Date(),
      markedBy: null,
    }))
  );

  const markedCount = useMemo(() => {
    return Object.values(attendanceData).filter((a) => a.status !== 'ABSENT').length;
  }, [attendanceData]);

  // Handlers
  const handleStatusChange = useCallback((memberId: string, status: AttendanceStatus) => {
    setAttendanceData((prev) => ({
      ...prev,
      [memberId]: { ...prev[memberId], status },
    }));
  }, []);

  const handleNotesChange = useCallback((memberId: string, notes: string) => {
    setAttendanceData((prev) => ({
      ...prev,
      [memberId]: { ...prev[memberId], notes },
    }));
  }, []);

  const openNotesDialog = useCallback((memberId: string) => {
    setNotesMemberId(memberId);
    setNotesDialogOpen(true);
  }, []);

  const handleSelectMember = useCallback((memberId: string, checked: boolean) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(memberId);
      } else {
        next.delete(memberId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedMembers(new Set(filteredMembers.map((m) => m.id)));
    } else {
      setSelectedMembers(new Set());
    }
  }, [filteredMembers]);

  const handleBulkStatusChange = useCallback((status: AttendanceStatus) => {
    const updates: Record<string, { status: AttendanceStatus; notes: string }> = {};
    selectedMembers.forEach((memberId) => {
      updates[memberId] = { ...attendanceData[memberId], status };
    });
    setAttendanceData((prev) => ({ ...prev, ...updates }));
    setSelectedMembers(new Set());
  }, [selectedMembers, attendanceData]);

  const handleInitializeAttendance = useCallback(async () => {
    setIsInitializing(true);
    try {
      const result = await initializeEventAttendance(eventId);
      if (result.success) {
        toast.success(`Initialized attendance for ${result.count} members`);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to initialize attendance');
      }
    } catch (error) {
      toast.error('Failed to initialize attendance');
    } finally {
      setIsInitializing(false);
    }
  }, [eventId, router]);

  const handleSaveAttendance = useCallback(async () => {
    setIsSaving(true);
    try {
      const records = Object.entries(attendanceData).map(([memberId, data]) => ({
        memberId,
        status: data.status,
        notes: data.notes || undefined,
      }));

      const result = await markBulkAttendance({
        eventId,
        records,
      });

      if (result.success) {
        toast.success(`Saved attendance for ${result.count} members`);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to save attendance');
      }
    } catch (error) {
      toast.error('Failed to save attendance');
    } finally {
      setIsSaving(false);
    }
  }, [attendanceData, eventId, router]);

  const getMemberPrimaryInstrument = (member: Member) => {
    const primary = member.instruments.find((i) => i.isPrimary);
    return primary?.instrument.name || null;
  };

  const getMemberSection = (member: Member) => {
    return member.sections[0]?.section.name || null;
  };

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Present</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{attendanceStats.present}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Absent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{attendanceStats.absent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600">Excused</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{attendanceStats.excused}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Late</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{attendanceStats.late}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-600">Left Early</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{attendanceStats.leftEarly}</div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Rate Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Attendance Rate</span>
            <span className="text-sm text-muted-foreground">{attendanceStats.attendanceRate}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${attendanceStats.attendanceRate}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[150px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Members</SelectItem>
              <SelectItem value="marked">Marked</SelectItem>
              <SelectItem value="unmarked">Unmarked</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          {members.length === 0 && (
            <Button variant="outline" onClick={handleInitializeAttendance} disabled={isInitializing}>
              {isInitializing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Users className="mr-2 h-4 w-4" />
              )}
              Initialize Roster
            </Button>
          )}
          <Button onClick={handleSaveAttendance} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Attendance
          </Button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedMembers.size > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">
                {selectedMembers.size} member{selectedMembers.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                  <Button
                    key={status}
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkStatusChange(status as AttendanceStatus)}
                  >
                    {config.icon}
                    <span className="ml-1">{config.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attendance Roster Table */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance Roster</CardTitle>
          <CardDescription>
            Mark attendance for {members.length} member{members.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredMembers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No members found</h3>
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Add members to the system to take attendance'}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedMembers.size === filteredMembers.length && filteredMembers.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.map((member) => {
                    const attendance = attendanceData[member.id] || { status: 'ABSENT' as AttendanceStatus, notes: '' };
                    const statusConfig = STATUS_CONFIG[attendance.status];

                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedMembers.has(member.id)}
                            onCheckedChange={(checked) => handleSelectMember(member.id, !!checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {member.firstName} {member.lastName}
                            </p>
                            {member.email && (
                              <p className="text-sm text-muted-foreground">{member.email}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getMemberPrimaryInstrument(member) && (
                            <Badge variant="outline">{getMemberPrimaryInstrument(member)}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {getMemberSection(member) && (
                            <span className="text-sm">{getMemberSection(member)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={attendance.status}
                            onValueChange={(value) => handleStatusChange(member.id, value as AttendanceStatus)}
                          >
                            <SelectTrigger className={cn('w-[130px]', statusConfig.bgColor)}>
                              <SelectValue>
                                <div className="flex items-center gap-2">
                                  {statusConfig.icon}
                                  <span>{statusConfig.label}</span>
                                </div>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                                <SelectItem key={status} value={status}>
                                  <div className="flex items-center gap-2">
                                    {config.icon}
                                    <span>{config.label}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openNotesDialog(member.id)}
                            className="text-muted-foreground"
                          >
                            {attendance.notes ? (
                              <span className="truncate max-w-[100px]">{attendance.notes}</span>
                            ) : (
                              'Add note'
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes Dialog */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attendance Notes</DialogTitle>
            <DialogDescription>
              Add notes for this attendance record
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter notes (e.g., reason for absence, late arrival time, etc.)"
              value={notesMemberId ? attendanceData[notesMemberId]?.notes || '' : ''}
              onChange={(e) => notesMemberId && handleNotesChange(notesMemberId, e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setNotesDialogOpen(false)}>
              Save Notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AttendanceRoster;
