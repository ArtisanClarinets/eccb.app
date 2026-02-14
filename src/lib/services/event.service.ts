import { prisma } from '@/lib/db';
import { AttendanceStatus } from '@prisma/client';
import { auditLog } from './audit';

export interface CreateEventData {
  title: string;
  type: 'CONCERT' | 'REHEARSAL' | 'SECTIONAL' | 'BOARD_MEETING' | 'SOCIAL' | 'OTHER';
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  isPublished?: boolean;
}

export class EventService {
  /**
   * Create a new event
   */
  static async createEvent(data: CreateEventData) {
    const event = await prisma.event.create({
      data: {
        ...data,
      },
    });

    await auditLog({
      action: 'event.create',
      entityType: 'Event',
      entityId: event.id,
      newValues: event,
    });

    return event;
  }

  /**
   * List upcoming events
   */
  static async listUpcomingEvents(includePublished: boolean = true) {
    return prisma.event.findMany({
      where: {
        startTime: { gte: new Date() },
        ...(includePublished ? {} : { isPublished: false }),
      },
      orderBy: { startTime: 'asc' },
    });
  }

  /**
   * Mark attendance for a member
   */
  static async markAttendance(data: {
    eventId: string;
    memberId: string;
    status: 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE' | 'LEFT_EARLY';
    notes?: string;
  }) {
    const attendance = await prisma.attendance.upsert({
      where: {
        eventId_memberId: {
          eventId: data.eventId,
          memberId: data.memberId,
        },
      },
      update: {
        status: data.status as AttendanceStatus,
        notes: data.notes,
        markedAt: new Date(),
      },
      create: {
        eventId: data.eventId,
        memberId: data.memberId,
        status: data.status as AttendanceStatus,
        notes: data.notes,
        markedAt: new Date(),
      },
    });

    await auditLog({
      action: 'attendance.mark',
      entityType: 'Attendance',
      entityId: attendance.id,
      newValues: attendance,
    });

    return attendance;
  }

  /**
   * Get attendance for an event
   */
  static async getEventAttendance(eventId: string) {
    return prisma.event.findUnique({
      where: { id: eventId },
      include: {
        attendance: {
          include: {
            member: true,
          },
        },
      },
    });
  }
}
