import { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Music,
  Calendar,
  FileText,
  TrendingUp,
  ArrowRight,
  Clock,
  AlertTriangle,
  CheckCircle,
  Activity,
} from 'lucide-react';
import { formatDate, formatRelativeTime } from '@/lib/date';

export const metadata: Metadata = {
  title: 'Admin Dashboard',
};

async function getDashboardStats() {
  const [
    memberCount,
    activeMemberCount,
    musicCount,
    eventCount,
    upcomingEvents,
    recentMembers,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.member.count({ where: { deletedAt: null } }),
    prisma.member.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    prisma.musicPiece.count({ where: { deletedAt: null, isArchived: false } }),
    prisma.event.count({ where: { deletedAt: null } }),
    prisma.event.findMany({
      where: {
        startTime: { gte: new Date() },
        deletedAt: null,
        isCancelled: false,
      },
      orderBy: { startTime: 'asc' },
      take: 5,
      include: { venue: true },
    }),
    prisma.member.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        instruments: { include: { instrument: true } },
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10,
      include: { user: true },
    }),
  ]);

  return {
    memberCount,
    activeMemberCount,
    musicCount,
    eventCount,
    upcomingEvents,
    recentMembers,
    recentAuditLogs,
  };
}

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of band operations and recent activity.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.memberCount}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeMemberCount} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Music Library</CardTitle>
            <Music className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.musicCount}</div>
            <p className="text-xs text-muted-foreground">
              pieces in library
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Events</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.upcomingEvents.length}</div>
            <p className="text-xs text-muted-foreground">
              scheduled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.eventCount}</div>
            <p className="text-xs text-muted-foreground">
              all time
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming Events */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Upcoming Events</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/events">
                  View All
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {stats.upcomingEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No upcoming events scheduled.
              </p>
            ) : (
              <div className="space-y-4">
                {stats.upcomingEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/admin/events/${event.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex flex-col items-center justify-center">
                      <span className="text-xs font-medium text-primary">
                        {formatDate(event.startTime, 'MMM')}
                      </span>
                      <span className="text-lg font-bold text-primary">
                        {formatDate(event.startTime, 'd')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{event.title}</h4>
                      <p className="text-sm text-muted-foreground truncate">
                        {event.venue?.name || 'No venue set'}
                      </p>
                    </div>
                    <Badge variant={event.isPublished ? 'default' : 'secondary'}>
                      {event.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Members */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Members</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/members">
                  View All
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {stats.recentMembers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No members yet.
              </p>
            ) : (
              <div className="space-y-4">
                {stats.recentMembers.map((member) => (
                  <Link
                    key={member.id}
                    href={`/admin/members/${member.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">
                        {member.firstName} {member.lastName}
                      </h4>
                      <p className="text-sm text-muted-foreground truncate">
                        {member.instruments.find(i => i.isPrimary)?.instrument.name || 'No instrument'}
                      </p>
                    </div>
                    <Badge variant={member.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {member.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Audit log of recent actions</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recentAuditLogs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No recent activity.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.recentAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 text-sm"
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                    {log.action.includes('create') ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : log.action.includes('delete') ? (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Activity className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground">
                      <span className="font-medium">{log.userName || 'System'}</span>
                      {' '}{log.action}{' '}
                      <span className="text-muted-foreground">{log.entityType}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(log.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
