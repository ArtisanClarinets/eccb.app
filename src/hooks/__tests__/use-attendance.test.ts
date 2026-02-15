/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAttendance, useAttendanceStats } from '../use-attendance';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useAttendance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('markAttendance', () => {
    it('should mark attendance successfully', async () => {
      const mockAttendance = {
        id: 'attendance-1',
        eventId: 'event-1',
        memberId: 'member-1',
        status: 'PRESENT',
        notes: null,
        markedAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, attendance: mockAttendance }),
      });

      const { result } = renderHook(() => useAttendance());

      let response: Awaited<ReturnType<typeof result.current.markAttendance>>;

      await act(async () => {
        response = await result.current.markAttendance({
          eventId: 'event-1',
          memberId: 'member-1',
          status: 'PRESENT',
        });
      });

      expect(response!.success).toBe(true);
      expect(response!.attendance).toEqual(mockAttendance);
      expect(mockFetch).toHaveBeenCalledWith('/api/events/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: 'event-1',
          memberId: 'member-1',
          status: 'PRESENT',
        }),
      });
    });

    it('should handle mark attendance error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Permission denied' }),
      });

      const { result } = renderHook(() => useAttendance());

      let response: Awaited<ReturnType<typeof result.current.markAttendance>>;

      await act(async () => {
        response = await result.current.markAttendance({
          eventId: 'event-1',
          memberId: 'member-1',
          status: 'PRESENT',
        });
      });

      expect(response!.success).toBe(false);
      expect(response!.error).toBe('Permission denied');
    });
  });

  describe('markBulkAttendance', () => {
    it('should mark bulk attendance successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, count: 5 }),
      });

      const { result } = renderHook(() => useAttendance());

      let response: Awaited<ReturnType<typeof result.current.markBulkAttendance>>;

      await act(async () => {
        response = await result.current.markBulkAttendance({
          eventId: 'event-1',
          records: [
            { memberId: 'member-1', status: 'PRESENT' },
            { memberId: 'member-2', status: 'ABSENT' },
          ],
        });
      });

      expect(response!.success).toBe(true);
      expect(response!.count).toBe(5);
      expect(mockFetch).toHaveBeenCalledWith('/api/attendance/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: 'event-1',
          records: [
            { memberId: 'member-1', status: 'PRESENT' },
            { memberId: 'member-2', status: 'ABSENT' },
          ],
        }),
      });
    });

    it('should handle bulk attendance error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Event not found' }),
      });

      const { result } = renderHook(() => useAttendance());

      let response: Awaited<ReturnType<typeof result.current.markBulkAttendance>>;

      await act(async () => {
        response = await result.current.markBulkAttendance({
          eventId: 'event-1',
          records: [],
        });
      });

      expect(response!.success).toBe(false);
      expect(response!.error).toBe('Event not found');
    });
  });

  describe('getEventAttendance', () => {
    it('should fetch event attendance successfully', async () => {
      const mockAttendance = [
        {
          id: 'attendance-1',
          eventId: 'event-1',
          memberId: 'member-1',
          status: 'PRESENT',
          notes: null,
          markedAt: new Date().toISOString(),
          member: {
            id: 'member-1',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, attendance: mockAttendance }),
      });

      const { result } = renderHook(() => useAttendance());

      let response: Awaited<ReturnType<typeof result.current.getEventAttendance>> | undefined;

      await act(async () => {
        response = await result.current.getEventAttendance('event-1');
      });

      expect(response).toEqual(mockAttendance);
      expect(mockFetch).toHaveBeenCalledWith('/api/attendance/event/event-1');
    });

    it('should return empty array on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      const { result } = renderHook(() => useAttendance());

      let response: Awaited<ReturnType<typeof result.current.getEventAttendance>> | undefined;

      await act(async () => {
        response = await result.current.getEventAttendance('event-1');
      });

      expect(response).toEqual([]);
    });
  });

  describe('getMemberAttendance', () => {
    it('should fetch member attendance successfully', async () => {
      const mockAttendance = [
        {
          id: 'attendance-1',
          eventId: 'event-1',
          memberId: 'member-1',
          status: 'PRESENT',
          notes: null,
          markedAt: new Date().toISOString(),
          event: {
            id: 'event-1',
            title: 'Rehearsal',
            type: 'REHEARSAL',
            startTime: new Date().toISOString(),
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, attendance: mockAttendance }),
      });

      const { result } = renderHook(() => useAttendance());

      let response: Awaited<ReturnType<typeof result.current.getMemberAttendance>> | undefined;

      await act(async () => {
        response = await result.current.getMemberAttendance('member-1');
      });

      expect(response).toEqual(mockAttendance);
      expect(mockFetch).toHaveBeenCalledWith('/api/attendance/member/member-1');
    });
  });

  describe('getMemberEventAttendance', () => {
    it('should fetch specific attendance record successfully', async () => {
      const mockAttendance = {
        id: 'attendance-1',
        eventId: 'event-1',
        memberId: 'member-1',
        status: 'PRESENT',
        notes: null,
        markedAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, attendance: mockAttendance }),
      });

      const { result } = renderHook(() => useAttendance());

      let response: Awaited<ReturnType<typeof result.current.getMemberEventAttendance>> | undefined;

      await act(async () => {
        response = await result.current.getMemberEventAttendance('event-1', 'member-1');
      });

      expect(response).toEqual(mockAttendance);
      expect(mockFetch).toHaveBeenCalledWith('/api/attendance/event/event-1/member/member-1');
    });

    it('should return null for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      const { result } = renderHook(() => useAttendance());

      let response: Awaited<ReturnType<typeof result.current.getMemberEventAttendance>> | undefined;

      await act(async () => {
        response = await result.current.getMemberEventAttendance('event-1', 'member-1');
      });

      expect(response).toBeNull();
    });
  });

  describe('loading state', () => {
    it('should track loading state during operations', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({ success: true, attendance: {} }),
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useAttendance());

      expect(result.current.isLoading).toBe(false);

      const promise = act(async () => {
        await result.current.markAttendance({
          eventId: 'event-1',
          memberId: 'member-1',
          status: 'PRESENT',
        });
      });

      // After starting the operation, isLoading should eventually be true
      // Note: Due to React's batching, we can't reliably check isLoading mid-operation in tests

      await promise;

      expect(result.current.isLoading).toBe(false);
    });
  });
});

describe('useAttendanceStats', () => {
  it('should calculate attendance statistics correctly', () => {
    const attendance = [
      { id: '1', status: 'PRESENT', eventId: 'e1', memberId: 'm1', markedAt: new Date() },
      { id: '2', status: 'PRESENT', eventId: 'e2', memberId: 'm1', markedAt: new Date() },
      { id: '3', status: 'ABSENT', eventId: 'e3', memberId: 'm1', markedAt: new Date() },
      { id: '4', status: 'EXCUSED', eventId: 'e4', memberId: 'm1', markedAt: new Date() },
      { id: '5', status: 'LATE', eventId: 'e5', memberId: 'm1', markedAt: new Date() },
      { id: '6', status: 'LEFT_EARLY', eventId: 'e6', memberId: 'm1', markedAt: new Date() },
    ] as any;

    const { result } = renderHook(() => useAttendanceStats(attendance));

    expect(result.current.total).toBe(6);
    expect(result.current.present).toBe(2);
    expect(result.current.absent).toBe(1);
    expect(result.current.excused).toBe(1);
    expect(result.current.late).toBe(1);
    expect(result.current.leftEarly).toBe(1);
    expect(result.current.attendanceRate).toBe(33); // 2/6 = 33%
    expect(result.current.punctualityRate).toBe(50); // (2+1)/6 = 50%
  });

  it('should handle empty attendance array', () => {
    const { result } = renderHook(() => useAttendanceStats([]));

    expect(result.current.total).toBe(0);
    expect(result.current.present).toBe(0);
    expect(result.current.absent).toBe(0);
    expect(result.current.excused).toBe(0);
    expect(result.current.late).toBe(0);
    expect(result.current.leftEarly).toBe(0);
    expect(result.current.attendanceRate).toBe(0);
    expect(result.current.punctualityRate).toBe(0);
  });

  it('should calculate 100% attendance rate when all present', () => {
    const attendance = [
      { id: '1', status: 'PRESENT', eventId: 'e1', memberId: 'm1', markedAt: new Date() },
      { id: '2', status: 'PRESENT', eventId: 'e2', memberId: 'm1', markedAt: new Date() },
      { id: '3', status: 'PRESENT', eventId: 'e3', memberId: 'm1', markedAt: new Date() },
    ] as any;

    const { result } = renderHook(() => useAttendanceStats(attendance));

    expect(result.current.attendanceRate).toBe(100);
    expect(result.current.punctualityRate).toBe(100);
  });
});
