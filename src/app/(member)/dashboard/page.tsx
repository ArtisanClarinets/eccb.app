import React from 'react';
import { requireAuth } from '@/lib/auth/guards';
import { MemberService } from '@/lib/services/member.service';
import { EventService } from '@/lib/services/event.service';
import { MusicLibraryService } from '@/lib/services/music.service';
import { format } from 'date-fns';
import { 
  Music, 
  Calendar, 
  MapPin, 
  Clock, 
  ChevronRight,
  Download,
  Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default async function DashboardPage() {
  const session = await requireAuth();
  const member = await MemberService.getMemberByUserId(session.user.id);
  const upcomingEvents = await EventService.listUpcomingEvents(false);
  const recentEvents = upcomingEvents.slice(0, 2);
  
  const assignments = (member as any)?.musicAssignments || [];
  const recentAssignments = assignments.slice(0, 4);

  return (
    <div className="space-y-10">
      {/* Header / Greeting */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-4xl font-black text-foreground uppercase tracking-tight">
            Welcome, {session.user.name?.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground">
            {format(new Date(), 'EEEE, MMMM do, yyyy')}
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild size="sm" variant="outline" className="h-10">
            <Link href="/dashboard/settings">Edit Profile</Link>
          </Button>
          <Button asChild size="sm" className="h-10 bg-primary">
            <Link href="/dashboard/music">View All Music</Link>
          </Button>
        </div>
      </div>

      {/* Quick Stats / Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Music size={20} />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Assigned Pieces</p>
          <h4 className="text-2xl font-bold">{assignments.length}</h4>
        </div>
        
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Calendar size={20} />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Upcoming Events</p>
          <h4 className="text-2xl font-bold">{upcomingEvents.length}</h4>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
            <Bell size={20} />
          </div>
          <p className="text-sm font-medium text-muted-foreground">New Announcements</p>
          <h4 className="text-2xl font-bold">2</h4>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Recent Music */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold uppercase tracking-wider">
              Recent Music Assignments
            </h3>
            <Link 
              href="/dashboard/music" 
              className="text-sm font-medium text-primary hover:underline flex items-center"
            >
              View All <ChevronRight size={14} />
            </Link>
          </div>
          
          <div className="space-y-3">
            {recentAssignments.length > 0 ? (
              recentAssignments.map((assignment: any) => (
                <div 
                  key={assignment.id}
                  className="flex items-center justify-between rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Music size={18} />
                    </div>
                    <div>
                      <h5 className="font-bold text-foreground">
                        {assignment.piece.title}
                      </h5>
                      <p className="text-xs text-muted-foreground">
                        {assignment.partName || 'Assigned Part'}
                      </p>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="text-primary hover:bg-primary/10">
                    <Download size={18} />
                  </Button>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed text-center">
                <Music className="mb-3 text-muted-foreground/30" size={32} />
                <p className="text-sm text-muted-foreground">No music assigned yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Schedule */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold uppercase tracking-wider">
              Upcoming Schedule
            </h3>
            <Link 
              href="/dashboard/events" 
              className="text-sm font-medium text-primary hover:underline flex items-center"
            >
              Full Calendar <ChevronRight size={14} />
            </Link>
          </div>
          
          <div className="space-y-3">
            {recentEvents.length > 0 ? (
              recentEvents.map((event: any) => (
                <div 
                  key={event.id}
                  className="rounded-xl border bg-card p-5 group relative overflow-hidden transition-all hover:shadow-md"
                >
                  <div className={cn(
                    "absolute left-0 top-0 h-full w-1",
                    event.type === 'PERFORMANCE' ? "bg-amber-500" : "bg-primary"
                  )} />
                  
                  <div className="mb-3 flex items-center justify-between">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                      event.type === 'PERFORMANCE' ? "bg-amber-100 text-amber-600" : "bg-primary/10 text-primary"
                    )}>
                      {event.type}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {format(new Date(event.startTime), 'MMM dd')}
                    </span>
                  </div>
                  
                  <h5 className="font-bold text-foreground mb-3">{event.title}</h5>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock size={14} className="text-primary" />
                      {format(new Date(event.startTime), 'h:mm a')} - {format(new Date(event.endTime), 'h:mm a')}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin size={14} className="text-primary" />
                      {event.location || 'Announced Soon'}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed text-center">
                <Calendar className="mb-3 text-muted-foreground/30" size={32} />
                <p className="text-sm text-muted-foreground">No upcoming events found.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
