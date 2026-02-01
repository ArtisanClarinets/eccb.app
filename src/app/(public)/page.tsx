import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CalendarDays, Music, Users, ArrowRight, MapPin, Clock } from 'lucide-react';
import { prisma } from '@/lib/db';
import { formatDate, formatTime } from '@/lib/date';

// Hero Section
function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-primary/20">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-[url('/images/pattern.svg')] opacity-5" />
      
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-slate-900/40" />
      
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-32 text-center lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
          <span className="block">Emerald Coast</span>
          <span className="block text-primary mt-2">Community Band</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300 sm:text-xl">
          Bringing quality concert band music to the Florida Panhandle since 1985.
          Join us for performances that inspire and unite our community.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" asChild className="text-lg px-8 py-6">
            <Link href="/events">
              <CalendarDays className="mr-2 h-5 w-5" />
              Upcoming Concerts
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="text-lg px-8 py-6 border-white/30 hover:bg-white/10 text-white">
            <Link href="/auditions">
              Join the Band
            </Link>
          </Button>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center pt-2">
          <div className="w-1 h-3 bg-white/50 rounded-full" />
        </div>
      </div>
    </section>
  );
}

// Upcoming Events Section
async function UpcomingEventsSection() {
  const events = await prisma.event.findMany({
    where: {
      isPublished: true,
      isCancelled: false,
      startTime: { gte: new Date() },
      deletedAt: null,
    },
    orderBy: { startTime: 'asc' },
    take: 3,
    include: {
      venue: true,
    },
  });

  if (events.length === 0) {
    return null;
  }

  return (
    <section className="py-24 bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Upcoming Performances
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Mark your calendar and join us for an unforgettable musical experience.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-lg transition-all hover:shadow-xl hover:-translate-y-1"
            >
              <div className="p-6">
                <div className="flex items-center gap-2 text-primary text-sm font-medium mb-3">
                  <CalendarDays className="h-4 w-4" />
                  {formatDate(event.startTime)}
                </div>
                <h3 className="text-xl font-semibold group-hover:text-primary transition-colors">
                  {event.title}
                </h3>
                {event.description && (
                  <p className="mt-2 text-muted-foreground line-clamp-2">
                    {event.description}
                  </p>
                )}
                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  {event.venue && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {event.venue.name}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {formatTime(event.startTime)}
                  </div>
                </div>
                <div className="mt-6 flex items-center text-primary text-sm font-medium">
                  Learn more
                  <ArrowRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="/events">
              View All Events
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

// About Section
function AboutSection() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              A Tradition of Musical Excellence
            </h2>
            <p className="mt-6 text-lg text-muted-foreground">
              For nearly four decades, the Emerald Coast Community Band has been a cornerstone 
              of musical culture in Northwest Florida. Our volunteer musicians come from all 
              walks of life, united by a passion for great music and community service.
            </p>
            <p className="mt-4 text-lg text-muted-foreground">
              Under the direction of our dedicated conductors, we perform a diverse repertoire 
              ranging from classical masterworks to contemporary compositions, patriotic favorites 
              to popular standards.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button asChild>
                <Link href="/about">
                  Learn Our Story
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/directors">
                  Meet Our Directors
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="aspect-[4/3] rounded-2xl bg-slate-200 dark:bg-slate-800 overflow-hidden">
                {/* Placeholder for image */}
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <Music className="h-12 w-12" />
                </div>
              </div>
              <div className="aspect-square rounded-2xl bg-primary/10 flex items-center justify-center p-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-primary">39</div>
                  <div className="text-sm text-muted-foreground mt-1">Years of Music</div>
                </div>
              </div>
            </div>
            <div className="space-y-4 pt-8">
              <div className="aspect-square rounded-2xl bg-primary/10 flex items-center justify-center p-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-primary">75+</div>
                  <div className="text-sm text-muted-foreground mt-1">Musicians</div>
                </div>
              </div>
              <div className="aspect-[4/3] rounded-2xl bg-slate-200 dark:bg-slate-800 overflow-hidden">
                {/* Placeholder for image */}
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <Users className="h-12 w-12" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Join Us CTA Section
function JoinUsCTA() {
  return (
    <section className="py-24 bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Share Your Musical Talent
        </h2>
        <p className="mt-6 text-lg max-w-2xl mx-auto opacity-90">
          We welcome musicians of all skill levels who want to continue making music 
          in a supportive, community-focused environment. No audition required for most sections!
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" variant="secondary" asChild className="text-lg px-8 py-6">
            <Link href="/auditions">
              Join the Band
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="text-lg px-8 py-6 border-white/30 hover:bg-white/10">
            <Link href="/contact">
              Contact Us
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

// Latest News Section
async function LatestNewsSection() {
  const announcements = await prisma.announcement.findMany({
    where: {
      status: 'PUBLISHED',
      publishedAt: { lte: new Date() },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { publishedAt: 'desc' },
    take: 3,
  });

  if (announcements.length === 0) {
    return null;
  }

  return (
    <section className="py-24 bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Latest News
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Stay updated with the latest from the band.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {announcements.map((announcement) => (
            <article
              key={announcement.id}
              className="rounded-2xl bg-white dark:bg-slate-800 shadow-lg overflow-hidden"
            >
              <div className="p-6">
                {announcement.isUrgent && (
                  <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300 mb-3">
                    Urgent
                  </span>
                )}
                <time className="text-sm text-muted-foreground">
                  {announcement.publishedAt ? formatDate(announcement.publishedAt) : ''}
                </time>
                <h3 className="mt-2 text-xl font-semibold">
                  {announcement.title}
                </h3>
                <p className="mt-3 text-muted-foreground line-clamp-3">
                  {announcement.content}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="/news">
              View All News
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <Suspense fallback={<div className="py-24 text-center">Loading events...</div>}>
        <UpcomingEventsSection />
      </Suspense>
      <AboutSection />
      <JoinUsCTA />
      <Suspense fallback={<div className="py-24 text-center">Loading news...</div>}>
        <LatestNewsSection />
      </Suspense>
    </>
  );
}
