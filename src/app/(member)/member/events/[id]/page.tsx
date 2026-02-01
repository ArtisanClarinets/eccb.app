import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth/guards';
import { formatDate, formatTime, formatEventDateRange } from '@/lib/date';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CalendarDays,
  Clock,
  MapPin,
  Music,
  Users,
  ArrowLeft,
  FileMusic,
  Info,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { RSVPButtons } from '@/components/member/rsvp-buttons';

interface EventDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MemberEventDetailPage({ params }: EventDetailPageProps) {
  const resolvedParams = await params;
  const session = await requireAuth();

  const event = await prisma.event.findUnique({
    where: { id: resolvedParams.id },
    include: {
      venue: true,
      music: {
        include: {
          piece: {
            include: {
              composer: true,
              arranger: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      attendance: {
        where: {
          member: { userId: session.user.id },
        },
      },
    },
  });

  if (!event) {
    notFound();
  }

  // Get member record
  const member = await prisma.member.findFirst({
    where: { userId: session.user.id },
  });

  const userAttendance = event.attendance[0];
  const eventTypeColors: Record<string, 'default' | 'secondary' | 'outline'> = {
    REHEARSAL: 'secondary',
    CONCERT: 'default',
    MEETING: 'outline',
    SOCIAL: 'outline',
    OTHER: 'outline',
  };

  const isUpcoming = event.startTime > new Date();
  const isPast = event.endTime < new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/member/calendar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{event.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={eventTypeColors[event.type]}>
              {event.type}
            </Badge>
            {event.isCancelled && (
              <Badge variant="destructive">Cancelled</Badge>
            )}
            {isPast && <Badge variant="outline">Past Event</Badge>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Event Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Event Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{formatDate(event.startTime, 'EEEE, MMMM d, yyyy')}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {formatTime(event.startTime)} - {formatTime(event.endTime)}
                  </p>
                  {event.callTime && (
                    <p className="text-sm text-muted-foreground">
                      Call time: {formatTime(event.callTime)}
                    </p>
                  )}
                </div>
              </div>

              {event.venue && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{event.venue.name}</p>
                    {event.venue.address && (
                      <p className="text-sm text-muted-foreground">
                        {event.venue.address}, {event.venue.city}, {event.venue.state} {event.venue.zipCode}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {event.description && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {event.description}
                    </p>
                  </div>
                </>
              )}

              {event.dressCode && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2">Dress Code</h4>
                    <p className="text-muted-foreground">{event.dressCode}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Music Program */}
          {event.music.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Music className="h-5 w-5" />
                  Music Program
                </CardTitle>
                <CardDescription>
                  {event.music.length} piece{event.music.length !== 1 ? 's' : ''} scheduled
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Composer</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {event.music.map((em, index) => (
                      <TableRow key={em.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <Link
                            href={`/member/music/${em.piece.id}`}
                            className="hover:underline font-medium"
                          >
                            {em.piece.title}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {em.piece.composer?.fullName || 'Unknown'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {em.piece.duration
                            ? `${Math.floor(em.piece.duration / 60)}:${String(em.piece.duration % 60).padStart(2, '0')}`
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* RSVP Card */}
          {isUpcoming && member && (
            <Card>
              <CardHeader>
                <CardTitle>Your RSVP</CardTitle>
                <CardDescription>
                  Let us know if you can attend
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RSVPButtons
                  eventId={event.id}
                  memberId={member.id}
                  currentStatus={userAttendance?.status || null}
                />
              </CardContent>
            </Card>
          )}

          {/* Attendance Status */}
          {isPast && userAttendance && (
            <Card>
              <CardHeader>
                <CardTitle>Attendance Record</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  {userAttendance.status === 'PRESENT' ? (
                    <>
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="font-medium">Present</p>
                        <p className="text-sm text-muted-foreground">
                          You attended this event
                        </p>
                      </div>
                    </>
                  ) : userAttendance.status === 'ABSENT' ? (
                    <>
                      <XCircle className="h-8 w-8 text-red-500" />
                      <div>
                        <p className="font-medium">Absent</p>
                        <p className="text-sm text-muted-foreground">
                          {userAttendance.notes || 'No notes recorded'}
                        </p>
                      </div>
                    </>
                  ) : userAttendance.status === 'EXCUSED' ? (
                    <>
                      <AlertCircle className="h-8 w-8 text-amber-500" />
                      <div>
                        <p className="font-medium">Excused</p>
                        <p className="text-sm text-muted-foreground">
                          {userAttendance.notes || 'Excused absence'}
                        </p>
                      </div>
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {event.venue && (
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${event.venue.address || ''}, ${event.venue.city || ''}, ${event.venue.state || ''}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    Get Directions
                  </a>
                </Button>
              )}
              
              {event.music.length > 0 && (
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href="/member/music">
                    <FileMusic className="mr-2 h-4 w-4" />
                    View All Music
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
