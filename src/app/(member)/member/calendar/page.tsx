import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth/guards';
import { formatDate, formatTime } from '@/lib/date';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  Calendar,
  MapPin,
  Clock,
  Users,
  Music,
  ChevronRight,
} from 'lucide-react';

export default async function MemberCalendarPage() {
  const session = await requireAuth();
  
  const now = new Date();
  const endOfYear = new Date(now.getFullYear(), 11, 31);

  const events = await prisma.event.findMany({
    where: {
      startTime: {
        gte: now,
        lte: endOfYear,
      },
      isCancelled: false,
      isPublished: true,
    },
    include: {
      venue: {
        select: { name: true },
      },
      _count: {
        select: { music: true },
      },
    },
    orderBy: { startTime: 'asc' },
  });

  // Group events by month
  const eventsByMonth = events.reduce(
    (acc, event) => {
      const monthKey = new Date(event.startTime).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
      });
      if (!acc[monthKey]) {
        acc[monthKey] = [];
      }
      acc[monthKey].push(event);
      return acc;
    },
    {} as Record<string, typeof events>
  );

  const typeColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    REHEARSAL: 'secondary',
    CONCERT: 'default',
    MEETING: 'outline',
    SOCIAL: 'outline',
    OTHER: 'secondary',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
        <p className="text-muted-foreground">
          Upcoming rehearsals, concerts, and events
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{events.length}</p>
                <p className="text-sm text-muted-foreground">Upcoming Events</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Music className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {events.filter((e) => e.type === 'REHEARSAL').length}
                </p>
                <p className="text-sm text-muted-foreground">Rehearsals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Users className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {events.filter((e) => e.type === 'CONCERT').length}
                </p>
                <p className="text-sm text-muted-foreground">Concerts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Events by Month */}
      {Object.keys(eventsByMonth).length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No upcoming events</h3>
              <p className="text-muted-foreground">
                Check back later for new events
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(eventsByMonth).map(([month, monthEvents]) => (
            <Card key={month}>
              <CardHeader>
                <CardTitle>{month}</CardTitle>
                <CardDescription>
                  {monthEvents.length} event{monthEvents.length !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {monthEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/member/events/${event.id}`}
                    className="block"
                  >
                    <div className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                      {/* Date */}
                      <div className="flex-shrink-0 w-16 text-center">
                        <div className="text-2xl font-bold">
                          {new Date(event.startTime).getDate()}
                        </div>
                        <div className="text-xs text-muted-foreground uppercase">
                          {new Date(event.startTime).toLocaleDateString('en-US', {
                            weekday: 'short',
                          })}
                        </div>
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{event.title}</span>
                          <Badge variant={typeColors[event.type]}>
                            {event.type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(event.startTime)}
                            {event.endTime && ` - ${formatTime(event.endTime)}`}
                          </div>
                          {event.venue && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {event.venue.name}
                            </div>
                          )}
                          {event._count.music > 0 && (
                            <div className="flex items-center gap-1">
                              <Music className="h-3 w-3" />
                              {event._count.music} piece
                              {event._count.music !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
