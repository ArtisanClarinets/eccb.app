import { prisma } from '@/lib/db';
import { requireAuth, getUserWithProfile } from '@/lib/auth/guards';
import { formatDate } from '@/lib/date';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import {
  User,
  Music,
  Calendar,
  Phone,
  Mail,
  Edit,
  Shield,
} from 'lucide-react';

export default async function MemberProfilePage() {
  const session = await requireAuth();
  
  const member = await prisma.member.findUnique({
    where: { userId: session.user.id },
    include: {
      user: {
        include: {
          roles: {
            include: { role: true },
          },
        },
      },
      sections: {
        include: { section: true },
      },
      instruments: {
        include: { instrument: true },
      },
      musicAssignments: {
        include: {
          piece: {
            include: { composer: true },
          },
        },
        take: 5,
        orderBy: { assignedAt: 'desc' },
      },
      attendance: {
        include: {
          event: true,
        },
        take: 10,
        orderBy: { event: { startTime: 'desc' } },
      },
    },
  });

  if (!member) {
    return (
      <div className="text-center py-12">
        <User className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Profile Not Found</h2>
        <p className="text-muted-foreground">
          Your member profile hasn&apos;t been set up yet.
        </p>
      </div>
    );
  }

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    ACTIVE: 'default',
    INACTIVE: 'secondary',
    LEAVE: 'outline',
    PENDING: 'outline',
    ALUMNI: 'secondary',
  };

  // Calculate attendance stats
  const attendanceStats = member.attendance.reduce(
    (acc, record) => {
      acc[record.status] = (acc[record.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalAttendance = member.attendance.length;
  const presentCount = attendanceStats.PRESENT || 0;
  const attendanceRate = totalAttendance > 0 
    ? Math.round((presentCount / totalAttendance) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
        <Link href="/member/profile/edit">
          <Button variant="outline">
            <Edit className="mr-2 h-4 w-4" />
            Edit Profile
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <Avatar className="h-24 w-24">
                <AvatarImage src={member.user?.image || undefined} />
                <AvatarFallback className="text-2xl">
                  {getInitials(member.user?.name || `${member.firstName} ${member.lastName}`)}
                </AvatarFallback>
              </Avatar>
              <h2 className="mt-4 text-xl font-semibold">
                {member.user?.name || `${member.firstName} ${member.lastName}`}
              </h2>
              <p className="text-muted-foreground">
                {member.sections[0]?.section.name || 'No Section'}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <Badge variant={statusColors[member.status]}>
                  {member.status}
                </Badge>
              </div>
              <div className="mt-6 w-full space-y-3 text-sm">
                {member.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{member.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{member.email || member.user?.email}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Details */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Member Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Primary Instrument</p>
              <p className="font-medium">
                {member.instruments[0]?.instrument.name || 'Not set'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Section</p>
              <p className="font-medium">{member.sections[0]?.section.name || 'Not assigned'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Join Date</p>
              <p className="font-medium">
                {member.joinDate ? formatDate(member.joinDate) : 'Not set'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Attendance Rate</p>
              <p className="font-medium">{attendanceRate}%</p>
            </div>
            {member.instruments.length > 1 && (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">Other Instruments</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {member.instruments.slice(1).map((mi) => (
                    <Badge key={mi.id} variant="outline">
                      {mi.instrument.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Music className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{member.musicAssignments.length}</p>
                <p className="text-sm text-muted-foreground">Assigned Music</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{presentCount}</p>
                <p className="text-sm text-muted-foreground">Events Attended</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Shield className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold capitalize">
                  {member.user?.roles?.[0]?.role?.name?.toLowerCase().replace('_', ' ') || 'member'}
                </p>
                <p className="text-sm text-muted-foreground">Role</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Tabs */}
      <Tabs defaultValue="music" className="space-y-4">
        <TabsList>
          <TabsTrigger value="music">
            <Music className="mr-2 h-4 w-4" />
            Recent Music
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <Calendar className="mr-2 h-4 w-4" />
            Attendance History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="music">
          <Card>
            <CardHeader>
              <CardTitle>Recently Assigned Music</CardTitle>
              <CardDescription>
                Your most recently assigned pieces
              </CardDescription>
            </CardHeader>
            <CardContent>
              {member.musicAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No music assigned to you yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {member.musicAssignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0"
                    >
                      <div>
                        <Link
                          href={`/member/music/${assignment.piece.id}`}
                          className="font-medium hover:underline"
                        >
                          {assignment.piece.title}
                        </Link>
                        {assignment.piece.composer && (
                          <p className="text-sm text-muted-foreground">
                            {assignment.piece.composer.fullName}
                          </p>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(assignment.assignedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {member.musicAssignments.length > 0 && (
                <Link href="/member/music">
                  <Button variant="outline" className="w-full mt-4">
                    View All Music
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card>
            <CardHeader>
              <CardTitle>Recent Attendance</CardTitle>
              <CardDescription>
                Your attendance at recent events
              </CardDescription>
            </CardHeader>
            <CardContent>
              {member.attendance.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No attendance records found.
                </p>
              ) : (
                <div className="space-y-4">
                  {member.attendance.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0"
                    >
                      <div>
                        <p className="font-medium">{record.event.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(record.event.startTime)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          record.status === 'PRESENT'
                            ? 'default'
                            : record.status === 'ABSENT'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {record.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
