import React from 'react';
import { EventService } from '@/lib/services/event.service';
import { format } from 'date-fns';
import { Calendar, MapPin, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export async function UpcomingEvents() {
  const events = await EventService.listUpcomingEvents(true);
  const featuredEvents = events.slice(0, 3);

  if (featuredEvents.length === 0) {
    return null;
  }

  return (
    <section className="bg-background py-12 md:py-24">
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="mb-16 flex items-end justify-between">
          <div>
            <h2 className="mb-4 text-primary text-sm font-bold tracking-widest">
              STAY TUNED
            </h2>
            <h3 className="text-4xl font-display font-black text-foreground md:text-5xl">
              UPCOMING PERFORMANCES
            </h3>
          </div>
          <Button asChild variant="ghost" className="hidden text-primary md:flex">
            <Link href="/events">
              View All Events <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {featuredEvents.map((event: any) => (
            <div
              key={event.id}
              className="group relative overflow-hidden rounded-2xl border bg-card p-8 transition-all hover:shadow-2xl hover:-translate-y-1"
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="flex flex-col items-center justify-center rounded-lg bg-primary/10 p-3 text-primary">
                  <span className="text-sm font-bold leading-none">
                    {format(new Date(event.startTime), 'MMM')}
                  </span>
                  <span className="text-2xl font-black leading-none">
                    {format(new Date(event.startTime), 'dd')}
                  </span>
                </div>
                <div className="rounded-full bg-primary/20 px-3 py-1 text-xs font-bold text-primary">
                  {event.type}
                </div>
              </div>

              <h4 className="mb-4 font-display text-2xl font-bold leading-tight text-foreground group-hover:text-primary">
                {event.title}
              </h4>

              <div className="mb-8 space-y-3">
                <div className="flex items-center gap-2 text-sm text-foreground/60">
                  <Calendar size={16} className="text-primary" />
                  {format(new Date(event.startTime), 'eeee, h:mm a')}
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground/60">
                  <MapPin size={16} className="text-primary" />
                  {event.location || 'Announced Soon'}
                </div>
              </div>

              <Button asChild variant="outline" className="w-full border-primary/20 hover:bg-primary hover:text-white">
                <Link href={`/events/${event.id}`}>Event Details</Link>
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-12 flex justify-center md:hidden">
          <Button asChild variant="outline" className="border-primary text-primary">
            <Link href="/events">View All Events</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
