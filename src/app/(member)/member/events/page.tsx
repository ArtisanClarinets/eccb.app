import Link from 'next/link';
import { requireAuth } from '@/lib/auth/guards';
import { EventService } from '@/lib/services/event.service';
import { formatDate, formatTime } from '@/lib/date';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  Clock,
  MapPin,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';

export default async function MemberEventsPage() {
  const _session = await requireAuth();
  const events = await EventService.listUpcomingEvents(false);

  const eventTypeColors: Record<string, 'default' | 'secondary' | 'outline'> = {
    REHEARSAL: 'secondary',
    CONCERT: 'default',
    MEETING: 'outline',
    SOCIAL: 'outline',
    OTHER: 'outline',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Events</h1>
          <p className="text-muted-foreground">
            View upcoming events and manage your RSVPs
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/member/calendar">
            <CalendarDays className="mr-2 h-4 w-4" />
            Calendar View
          </Link>
        </Button>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">No Upcoming Events</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Check back later for new events
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/member/events/${event.id}`}
              className="block"
            >
              <Card className="transition-all hover:shadow-md hover:border-primary/50">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={eventTypeColors[event.type]}>
                          {event.type}
                        </Badge>
                        {event.isCancelled && (
                          <Badge variant="destructive">Cancelled</Badge>
                        )}
                      </div>
                      
                      <h3 className="text-xl font-semibold">{event.title}</h3>
                      
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-primary" />
                          {formatDate(event.startTime, 'EEEE, MMMM d, yyyy')}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary" />
                          {formatTime(event.startTime)} - {formatTime(event.endTime)}
                        </div>
                        {event.location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primary" />
                            {event.location}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
