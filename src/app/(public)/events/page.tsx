import { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatDate, formatTime } from '@/lib/date';

import { Badge } from '@/components/ui/badge';
import { CalendarDays, MapPin, Clock, Music } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Events',
  description: 'View upcoming concerts and events from the Emerald Coast Community Band.',
};

async function getEvents() {
  return prisma.event.findMany({
    where: {
      isPublished: true,
      deletedAt: null,
    },
    orderBy: { startTime: 'asc' },
    include: {
      venue: true,
      music: {
        include: {
          piece: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
}

function EventTypeLabel({ type }: { type: string }) {
  const colors: Record<string, string> = {
    CONCERT: 'bg-primary text-primary-foreground',
    REHEARSAL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    SECTIONAL: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    SOCIAL: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
  };

  return (
    <Badge className={colors[type] || colors.OTHER}>
      {type.replace('_', ' ')}
    </Badge>
  );
}

export default async function EventsPage() {
  const events = await getEvents();
  const now = new Date();

  const upcomingEvents = events.filter((e) => new Date(e.startTime) >= now && !e.isCancelled);
  const pastEvents = events.filter((e) => new Date(e.startTime) < now || e.isCancelled);

  return (
    <div className="w-full py-12 md:py-16">
      {/* Hero */}
      <section className="py-16 bg-gradient-to-b from-primary/10 to-transparent">
        <div className="mx-auto w-full max-w-4xl px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Events & Concerts
            </h1>
            <p className="mt-6 text-xl text-muted-foreground">
              Join us for upcoming performances and community events. 
              All concerts are free and open to the public.
            </p>
          </div>
        </div>
      </section>

      {/* Upcoming Events */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight mb-8">
            Upcoming Events
          </h2>

          {upcomingEvents.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 dark:bg-slate-900 rounded-2xl">
              <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No Upcoming Events</h3>
              <p className="mt-2 text-muted-foreground">
                Check back soon for our next performance!
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {upcomingEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="block group"
                >
                  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
                    <div className="p-6 md:p-8">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <EventTypeLabel type={event.type} />
                            {event.isCancelled && (
                              <Badge variant="destructive">Cancelled</Badge>
                            )}
                          </div>
                          <h3 className="text-2xl font-semibold group-hover:text-primary transition-colors">
                            {event.title}
                          </h3>
                          {event.description && (
                            <p className="mt-2 text-muted-foreground line-clamp-2">
                              {event.description}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-bold text-primary">
                            {formatDate(event.startTime, 'MMM d')}
                          </div>
                          <div className="text-muted-foreground">
                            {formatDate(event.startTime, 'yyyy')}
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-wrap gap-6 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {formatTime(event.startTime)} - {formatTime(event.endTime)}
                        </div>
                        {event.venue && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {event.venue.name}
                            {event.venue.city && `, ${event.venue.city}`}
                          </div>
                        )}
                        {event.music.length > 0 && (
                          <div className="flex items-center gap-2">
                            <Music className="h-4 w-4" />
                            {event.music.length} pieces
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Past Events */}
      {pastEvents.length > 0 && (
        <section className="py-16 bg-slate-50 dark:bg-slate-900">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight mb-8">
              Past Events
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pastEvents.slice(0, 6).map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="block group"
                >
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow opacity-75 hover:opacity-100">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <CalendarDays className="h-4 w-4" />
                      {formatDate(event.startTime)}
                    </div>
                    <h3 className="font-semibold group-hover:text-primary transition-colors">
                      {event.title}
                    </h3>
                    {event.venue && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {event.venue.name}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
