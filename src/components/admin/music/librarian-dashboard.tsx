'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  Clock,
  FileX,
  Loader2,
  Package,
  PackageCheck,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {

  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/date';
import {
  getLibrarianDashboardStats,
  getAssignmentsForLibrarian,
  updateAssignmentStatus,
  processMusicReturn,
  reportMissingParts,
} from '@/app/(admin)/admin/music/actions';
import type { AssignmentStatus, MusicAssignment, Member, MusicPiece } from '@prisma/client';

type AssignmentWithRelations = MusicAssignment & {
  piece: Pick<MusicPiece, 'id' | 'title' | 'catalogNumber'>;
  member: Pick<Member, 'id' | 'firstName' | 'lastName'> & {
    user: { email: string } | null;
    instruments: { instrument: { name: string } }[];
  };
};

interface DashboardStats {
  statusCounts: Record<string, number>;
  overdueCount: number;
  recentActivity: number;
  missingCount: number;
  pendingPickups: number;
  pendingReturns: number;
  needsAttention: AssignmentWithRelations[];
}

const statusConfig: Record<AssignmentStatus, { label: string; color: string; icon: React.ReactNode }> = {
  ASSIGNED: { label: 'Assigned', color: 'bg-blue-500', icon: <BookOpen className="h-4 w-4" /> },
  PICKED_UP: { label: 'Picked Up', color: 'bg-yellow-500', icon: <Package className="h-4 w-4" /> },
  RETURNED: { label: 'Returned', color: 'bg-green-500', icon: <PackageCheck className="h-4 w-4" /> },
  OVERDUE: { label: 'Overdue', color: 'bg-red-500', icon: <AlertTriangle className="h-4 w-4" /> },
  LOST: { label: 'Lost', color: 'bg-gray-500', icon: <FileX className="h-4 w-4" /> },
  DAMAGED: { label: 'Damaged', color: 'bg-orange-500', icon: <XCircle className="h-4 w-4" /> },
};

export function LibrarianDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [assignments, setAssignments] = useState<AssignmentWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentWithRelations | null>(null);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  const [isMissingDialogOpen, setIsMissingDialogOpen] = useState(false);
  const [returnCondition, setReturnCondition] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [missingNotes, setMissingNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadAssignments = useCallback(async () => {
    try {
      const result = await getAssignmentsForLibrarian({
        status: statusFilter !== 'all' ? (statusFilter as AssignmentStatus) : undefined,
        search: searchQuery || undefined,
      });

      if (result.success && result.assignments) {
        setAssignments(result.assignments);
      }
    } catch (_error) {
      console.error('Failed to load assignments:', _error);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    if (statusFilter || searchQuery) {
      loadAssignments();
    }
  }, [statusFilter, searchQuery, loadAssignments]);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [statsResult] = await Promise.all([
        getLibrarianDashboardStats(),
      ]);

      if (statsResult.success && statsResult.stats) {
        setStats(statsResult.stats);
      }
    } catch (_error) {
      console.error('Failed to load dashboard:', _error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkPickedUp = async (assignmentId: string) => {
    setIsProcessing(true);
    try {
      const result = await updateAssignmentStatus(assignmentId, 'PICKED_UP');
      if (result.success) {
        toast.success('Marked as picked up');
        loadDashboardData();
        loadAssignments();
      } else {
        toast.error(result.error || 'Failed to update status');
      }
    } catch (_error) {
      toast.error('Failed to update status');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessReturn = async () => {
    if (!selectedAssignment) return;

    setIsProcessing(true);
    try {
      const result = await processMusicReturn(selectedAssignment.id, {
        condition: returnCondition || undefined,
        notes: returnNotes || undefined,
      });

      if (result.success) {
        toast.success('Return processed successfully');
        setIsReturnDialogOpen(false);
        setSelectedAssignment(null);
        setReturnCondition('');
        setReturnNotes('');
        loadDashboardData();
        loadAssignments();
      } else {
        toast.error(result.error || 'Failed to process return');
      }
    } catch (_error) {
      toast.error('Failed to process return');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReportMissing = async () => {
    if (!selectedAssignment || !missingNotes.trim()) {
      toast.error('Please provide notes about the missing parts');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await reportMissingParts(selectedAssignment.id, {
        notes: missingNotes,
      });

      if (result.success) {
        toast.success('Missing parts reported');
        setIsMissingDialogOpen(false);
        setSelectedAssignment(null);
        setMissingNotes('');
        loadDashboardData();
        loadAssignments();
      } else {
        toast.error(result.error || 'Failed to report missing parts');
      }
    } catch (_error) {
      toast.error('Failed to report missing parts');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Pickups</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingPickups || 0}</div>
            <p className="text-xs text-muted-foreground">
              Assigned, awaiting pickup
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingReturns || 0}</div>
            <p className="text-xs text-muted-foreground">
              Picked up, awaiting return
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats?.overdueCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              Past due date
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Missing/Lost</CardTitle>
            <FileX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.missingCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              Reported missing parts
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Needs Attention Section */}
      {stats?.needsAttention && stats.needsAttention.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Needs Attention
            </CardTitle>
            <CardDescription>
              Assignments that are overdue, lost, or damaged
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Piece</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.needsAttention.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {assignment.member.firstName} {assignment.member.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {assignment.member.user?.email}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{assignment.piece.title}</p>
                        {assignment.piece.catalogNumber && (
                          <p className="text-sm text-muted-foreground">
                            {assignment.piece.catalogNumber}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusConfig[assignment.status].color}>
                        {statusConfig[assignment.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {assignment.dueDate ? formatDate(assignment.dueDate) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {assignment.status === 'OVERDUE' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedAssignment(assignment);
                                setIsReturnDialogOpen(true);
                              }}
                            >
                              <RotateCcw className="mr-1 h-3 w-3" />
                              Return
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setSelectedAssignment(assignment);
                                setIsMissingDialogOpen(true);
                              }}
                            >
                              <FileX className="mr-1 h-3 w-3" />
                              Report Lost
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* All Assignments */}
      <Card>
        <CardHeader>
          <CardTitle>All Assignments</CardTitle>
          <CardDescription>
            Manage all music assignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="returned">Returned</TabsTrigger>
                <TabsTrigger value="issues">Issues</TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="ASSIGNED">Assigned</SelectItem>
                    <SelectItem value="PICKED_UP">Picked Up</SelectItem>
                    <SelectItem value="RETURNED">Returned</SelectItem>
                    <SelectItem value="OVERDUE">Overdue</SelectItem>
                    <SelectItem value="LOST">Lost</SelectItem>
                    <SelectItem value="DAMAGED">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TabsContent value="all" className="mt-0">
              <AssignmentsTable
                assignments={assignments}
                onMarkPickedUp={handleMarkPickedUp}
                onReturn={(a) => {
                  setSelectedAssignment(a);
                  setIsReturnDialogOpen(true);
                }}
                onReportMissing={(a) => {
                  setSelectedAssignment(a);
                  setIsMissingDialogOpen(true);
                }}
                isProcessing={isProcessing}
              />
            </TabsContent>

            <TabsContent value="active" className="mt-0">
              <AssignmentsTable
                assignments={assignments.filter(a => 
                  ['ASSIGNED', 'PICKED_UP', 'OVERDUE'].includes(a.status)
                )}
                onMarkPickedUp={handleMarkPickedUp}
                onReturn={(a) => {
                  setSelectedAssignment(a);
                  setIsReturnDialogOpen(true);
                }}
                onReportMissing={(a) => {
                  setSelectedAssignment(a);
                  setIsMissingDialogOpen(true);
                }}
                isProcessing={isProcessing}
              />
            </TabsContent>

            <TabsContent value="returned" className="mt-0">
              <AssignmentsTable
                assignments={assignments.filter(a => 
                  ['RETURNED', 'DAMAGED'].includes(a.status)
                )}
                onMarkPickedUp={handleMarkPickedUp}
                onReturn={() => {}}
                onReportMissing={() => {}}
                isProcessing={isProcessing}
                readOnly
              />
            </TabsContent>

            <TabsContent value="issues" className="mt-0">
              <AssignmentsTable
                assignments={assignments.filter(a => 
                  ['OVERDUE', 'LOST', 'DAMAGED'].includes(a.status)
                )}
                onMarkPickedUp={handleMarkPickedUp}
                onReturn={(a) => {
                  setSelectedAssignment(a);
                  setIsReturnDialogOpen(true);
                }}
                onReportMissing={(a) => {
                  setSelectedAssignment(a);
                  setIsMissingDialogOpen(true);
                }}
                isProcessing={isProcessing}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Return Dialog */}
      <Dialog open={isReturnDialogOpen} onOpenChange={setIsReturnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Music Return</DialogTitle>
            <DialogDescription>
              Mark this music as returned by {selectedAssignment?.member.firstName}{' '}
              {selectedAssignment?.member.lastName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Piece</Label>
              <p className="text-sm">{selectedAssignment?.piece.title}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="condition">Condition</Label>
              <Select value={returnCondition} onValueChange={setReturnCondition}>
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="good">Good - No issues</SelectItem>
                  <SelectItem value="fair">Fair - Minor wear</SelectItem>
                  <SelectItem value="damaged">Damaged - Needs attention</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Any additional notes about the return..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReturnDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleProcessReturn} disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Process Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Missing Parts Dialog */}
      <Dialog open={isMissingDialogOpen} onOpenChange={setIsMissingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Missing Parts</DialogTitle>
            <DialogDescription>
              Report that parts are missing or lost for this assignment
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Piece</Label>
              <p className="text-sm">{selectedAssignment?.piece.title}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="missingNotes">Details *</Label>
              <Textarea
                id="missingNotes"
                value={missingNotes}
                onChange={(e) => setMissingNotes(e.target.value)}
                placeholder="Please provide details about the missing parts (when discovered, circumstances, etc.)..."
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMissingDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReportMissing}
              disabled={isProcessing || !missingNotes.trim()}
            >
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileX className="mr-2 h-4 w-4" />
              )}
              Report Missing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface AssignmentsTableProps {
  assignments: AssignmentWithRelations[];
  onMarkPickedUp: (id: string) => void;
  onReturn: (assignment: AssignmentWithRelations) => void;
  onReportMissing: (assignment: AssignmentWithRelations) => void;
  isProcessing: boolean;
  readOnly?: boolean;
}

function AssignmentsTable({
  assignments,
  onMarkPickedUp,
  onReturn,
  onReportMissing,
  isProcessing,
  readOnly = false,
}: AssignmentsTableProps) {
  if (assignments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No assignments found
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Piece</TableHead>
          <TableHead>Part</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Assigned</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assignments.map((assignment) => (
          <TableRow key={assignment.id}>
            <TableCell>
              <div>
                <p className="font-medium">
                  {assignment.member.firstName} {assignment.member.lastName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {assignment.member.instruments[0]?.instrument.name || 'No instrument'}
                </p>
              </div>
            </TableCell>
            <TableCell>
              <div>
                <p className="font-medium">{assignment.piece.title}</p>
                {assignment.piece.catalogNumber && (
                  <p className="text-sm text-muted-foreground">
                    {assignment.piece.catalogNumber}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell>{assignment.partName || '—'}</TableCell>
            <TableCell>
              <Badge className={statusConfig[assignment.status].color}>
                {statusConfig[assignment.status].label}
              </Badge>
            </TableCell>
            <TableCell>{formatDate(assignment.assignedAt)}</TableCell>
            <TableCell>
              {assignment.dueDate ? formatDate(assignment.dueDate) : '—'}
            </TableCell>
            <TableCell className="text-right">
              {!readOnly && (
                <div className="flex justify-end gap-2">
                  {assignment.status === 'ASSIGNED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onMarkPickedUp(assignment.id)}
                      disabled={isProcessing}
                    >
                      <Package className="mr-1 h-3 w-3" />
                      Pickup
                    </Button>
                  )}
                  {assignment.status === 'PICKED_UP' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onReturn(assignment)}
                      disabled={isProcessing}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Return
                    </Button>
                  )}
                  {['ASSIGNED', 'PICKED_UP', 'OVERDUE'].includes(assignment.status) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => onReportMissing(assignment)}
                      disabled={isProcessing}
                    >
                      <FileX className="mr-1 h-3 w-3" />
                      Missing
                    </Button>
                  )}
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
