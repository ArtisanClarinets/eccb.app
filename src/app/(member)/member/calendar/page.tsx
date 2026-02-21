import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth/guards';
import { MemberCalendarClient } from '@/components/events/member-calendar-client';
import { Suspense } from 'react';

export default async function MemberCalendarPage() {
  const _session = await requireAuth();

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

  // Transform events for the calendar component
  const calendarEvents = events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    type: event.type,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    isCancelled: event.isCancelled,
    venue: event.venue,
  }));

  // Calculate stats
  const stats = {
    total: events.length,
    rehearsals: events.filter((e) => e.type === 'REHEARSAL').length,
    concerts: events.filter((e) => e.type === 'CONCERT').length,
  };

  return (
    <Suspense fallback={<CalendarLoadingSkeleton />}>
      <MemberCalendarClient events={calendarEvents} stats={stats} />
    </Suspense>
  );
}

function CalendarLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="h-96 bg-muted rounded-lg animate-pulse" />
    </div>
  );
}
