'use client';

import { useState, useCallback } from 'react';
import { AttendanceStatus } from '@prisma/client';

// Types
export interface AttendanceRecord {
  id: string;
  eventId: string;
  memberId: string;
  status: AttendanceStatus;
  notes: string | null;
  markedAt: Date | string;
  markedBy: string | null;
}

export interface AttendanceWithMember extends AttendanceRecord {
  member: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  };
}

export interface AttendanceWithEvent extends AttendanceRecord {
  event: {
    id: string;
    title: string;
    type: string;
    startTime: Date | string;
  };
}

export interface MarkAttendanceParams {
  eventId: string;
  memberId: string;
  status: AttendanceStatus;
  notes?: string;
}

export interface BulkAttendanceParams {
  eventId: string;
  records: Array<{
    memberId: string;
    status: AttendanceStatus;
    notes?: string;
  }>;
}

export interface UseAttendanceReturn {
  // State
  isLoading: boolean;
  error: Error | null;

  // Actions
  markAttendance: (params: MarkAttendanceParams) => Promise<{ success: boolean; attendance?: AttendanceRecord; error?: string }>;
  markBulkAttendance: (params: BulkAttendanceParams) => Promise<{ success: boolean; count?: number; error?: string }>;
  getEventAttendance: (eventId: string) => Promise<AttendanceWithMember[]>;
  getMemberAttendance: (memberId: string) => Promise<AttendanceWithEvent[]>;
  getMemberEventAttendance: (eventId: string, memberId: string) => Promise<AttendanceRecord | null>;
}

/**
 * Hook for attendance operations
 * Provides methods for marking and retrieving attendance records
 */
export function useAttendance(): UseAttendanceReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Mark attendance for a single member at an event
   */
  const markAttendance = useCallback(async (params: MarkAttendanceParams) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/events/rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to mark attendance');
      }

      return { success: true, attendance: data.attendance };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Mark attendance for multiple members at an event (bulk operation)
   */
  const markBulkAttendance = useCallback(async (params: BulkAttendanceParams) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/attendance/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to mark bulk attendance');
      }

      return { success: true, count: data.count };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get all attendance records for an event
   */
  const getEventAttendance = useCallback(async (eventId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/attendance/event/${eventId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch event attendance');
      }

      const data = await response.json();
      return data.attendance as AttendanceWithMember[];
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get all attendance records for a member
   */
  const getMemberAttendance = useCallback(async (memberId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/attendance/member/${memberId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch member attendance');
      }

      const data = await response.json();
      return data.attendance as AttendanceWithEvent[];
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get attendance record for a specific member at a specific event
   */
  const getMemberEventAttendance = useCallback(async (eventId: string, memberId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/attendance/event/${eventId}/member/${memberId}`);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch attendance record');
      }

      const data = await response.json();
      return data.attendance as AttendanceRecord;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    markAttendance,
    markBulkAttendance,
    getEventAttendance,
    getMemberAttendance,
    getMemberEventAttendance,
  };
}

/**
 * Hook for tracking attendance statistics
 */
export function useAttendanceStats(attendance: AttendanceRecord[]) {
  const total = attendance.length;
  const present = attendance.filter((a) => a.status === 'PRESENT').length;
  const absent = attendance.filter((a) => a.status === 'ABSENT').length;
  const excused = attendance.filter((a) => a.status === 'EXCUSED').length;
  const late = attendance.filter((a) => a.status === 'LATE').length;
  const leftEarly = attendance.filter((a) => a.status === 'LEFT_EARLY').length;

  const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;
  const punctualityRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

  return {
    total,
    present,
    absent,
    excused,
    late,
    leftEarly,
    attendanceRate,
    punctualityRate,
  };
}

export default useAttendance;
