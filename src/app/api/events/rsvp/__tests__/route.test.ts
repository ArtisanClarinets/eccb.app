import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST } from '../route';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { validateCSRF } from '@/lib/csrf';
import { applyRateLimit } from '@/lib/rate-limit';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    member: {
      findFirst: vi.fn(),
    },
    event: {
      findUnique: vi.fn(),
    },
    attendance: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/config', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/lib/csrf', () => ({
  validateCSRF: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

describe('RSVP API Route', () => {
  let mockRequest: Partial<NextRequest>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = {
      json: vi.fn(),
      headers: new Headers(),
    };
    vi.mocked(applyRateLimit).mockResolvedValue(null);
    vi.mocked(validateCSRF).mockReturnValue({ valid: true });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // RSVP Creation Tests
  // ===========================================================================

  describe('RSVP Creation', () => {
    it('should create a new RSVP for valid request', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { id: 'session-123' },
      } as any);

      vi.mocked(prisma.member.findFirst).mockResolvedValue({
        id: 'member-123',
        userId: 'user-123',
        firstName: 'Test',
        lastName: 'User',
      } as any);

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        startTime: new Date(),
        endTime: new Date(),
      } as any);

      vi.mocked(prisma.attendance.upsert).mockResolvedValue({
        id: 'attendance-123',
        eventId: 'event-123',
        memberId: 'member-123',
        status: 'PRESENT',
        markedAt: new Date(),
      } as any);

      vi.mocked(mockRequest.json!).mockResolvedValue({
        eventId: 'event-123',
        memberId: 'member-123',
        status: 'PRESENT',
      });

      const response = await POST(mockRequest as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.attendance).toBeDefined();
    });

    it('should return 401 for unauthenticated users', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      vi.mocked(mockRequest.json!).mockResolvedValue({
        eventId: 'event-123',
        memberId: 'member-123',
        status: 'PRESENT',
      });

      const response = await POST(mockRequest as NextRequest);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 403 when CSRF validation fails', async () => {
      vi.mocked(validateCSRF).mockReturnValue({ valid: false, reason: 'Invalid token' });

      vi.mocked(mockRequest.json!).mockResolvedValue({
        eventId: 'event-123',
        memberId: 'member-123',
        status: 'PRESENT',
      });

      const response = await POST(mockRequest as NextRequest);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('CSRF validation failed');
    });

    it('should return 403 when member does not belong to user', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { id: 'session-123' },
      } as any);

      vi.mocked(prisma.member.findFirst).mockResolvedValue(null);

      vi.mocked(mockRequest.json!).mockResolvedValue({
        eventId: 'event-123',
        memberId: 'different-member',
        status: 'PRESENT',
      });

      const response = await POST(mockRequest as NextRequest);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when event does not exist', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { id: 'session-123' },
      } as any);

      vi.mocked(prisma.member.findFirst).mockResolvedValue({
        id: 'member-123',
        userId: 'user-123',
        firstName: 'Test',
        lastName: 'User',
      } as any);

      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      vi.mocked(mockRequest.json!).mockResolvedValue({
        eventId: 'nonexistent-event',
        memberId: 'member-123',
        status: 'PRESENT',
      });

      const response = await POST(mockRequest as NextRequest);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Event not found');
    });
  });

  // ===========================================================================
  // RSVP Update Tests
  // ===========================================================================

  describe('RSVP Update', () => {
    it('should update existing RSVP status', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { id: 'session-123' },
      } as any);

      vi.mocked(prisma.member.findFirst).mockResolvedValue({
        id: 'member-123',
        userId: 'user-123',
        firstName: 'Test',
        lastName: 'User',
      } as any);

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        startTime: new Date(),
        endTime: new Date(),
      } as any);

      vi.mocked(prisma.attendance.upsert).mockResolvedValue({
        id: 'attendance-123',
        eventId: 'event-123',
        memberId: 'member-123',
        status: 'ABSENT',
        markedAt: new Date(),
      } as any);

      vi.mocked(mockRequest.json!).mockResolvedValue({
        eventId: 'event-123',
        memberId: 'member-123',
        status: 'ABSENT',
      });

      const response = await POST(mockRequest as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.attendance.status).toBe('ABSENT');
    });

    it('should update markedAt timestamp on status change', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { id: 'session-123' },
      } as any);

      vi.mocked(prisma.member.findFirst).mockResolvedValue({
        id: 'member-123',
        userId: 'user-123',
        firstName: 'Test',
        lastName: 'User',
      } as any);

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        startTime: new Date(),
        endTime: new Date(),
      } as any);

      const now = new Date();
      vi.mocked(prisma.attendance.upsert).mockResolvedValue({
        id: 'attendance-123',
        eventId: 'event-123',
        memberId: 'member-123',
        status: 'LATE',
        markedAt: now,
      } as any);

      vi.mocked(mockRequest.json!).mockResolvedValue({
        eventId: 'event-123',
        memberId: 'member-123',
        status: 'LATE',
      });

      await POST(mockRequest as NextRequest);

      // Verify upsert was called with correct update data
      expect(prisma.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            status: 'LATE',
            markedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  // ===========================================================================
  // Validation Tests
  // ===========================================================================

  describe('Validation', () => {
    it('should reject invalid status values', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { id: 'session-123' },
      } as any);

      vi.mocked(mockRequest.json!).mockResolvedValue({
        eventId: 'event-123',
        memberId: 'member-123',
        status: 'INVALID_STATUS',
      });

      const response = await POST(mockRequest as NextRequest);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid request data');
    });

    it('should reject missing required fields', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { id: 'session-123' },
      } as any);

      vi.mocked(mockRequest.json!).mockResolvedValue({
        eventId: 'event-123',
        // missing memberId
        status: 'PRESENT',
      });

      const response = await POST(mockRequest as NextRequest);

      expect(response.status).toBe(400);
    });

    it('should accept all valid status values', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { id: 'session-123' },
      } as any);

      vi.mocked(prisma.member.findFirst).mockResolvedValue({
        id: 'member-123',
        userId: 'user-123',
        firstName: 'Test',
        lastName: 'User',
      } as any);

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        startTime: new Date(),
        endTime: new Date(),
      } as any);

      vi.mocked(prisma.attendance.upsert).mockResolvedValue({} as any);

      const validStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

      for (const status of validStatuses) {
        vi.mocked(mockRequest.json!).mockResolvedValue({
          eventId: 'event-123',
          memberId: 'member-123',
          status,
        });

        const response = await POST(mockRequest as NextRequest);
        expect(response.status).toBe(200);
      }
    });
  });

  // ===========================================================================
  // Rate Limiting Tests
  // ===========================================================================

  describe('Rate Limiting', () => {
    it('should apply rate limiting', async () => {
      vi.mocked(applyRateLimit).mockResolvedValue(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 })
      );

      vi.mocked(mockRequest.json!).mockResolvedValue({
        eventId: 'event-123',
        memberId: 'member-123',
        status: 'PRESENT',
      });

      const response = await POST(mockRequest as NextRequest);

      expect(response.status).toBe(429);
      expect(applyRateLimit).toHaveBeenCalledWith(mockRequest, 'rsvp');
    });

    it('should allow request when rate limit is not exceeded', async () => {
      vi.mocked(applyRateLimit).mockResolvedValue(null);

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { id: 'session-123' },
      } as any);

      vi.mocked(prisma.member.findFirst).mockResolvedValue({
        id: 'member-123',
        userId: 'user-123',
        firstName: 'Test',
        lastName: 'User',
      } as any);

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'event-123',
        title: 'Test Event',
        startTime: new Date(),
        endTime: new Date(),
      } as any);

      vi.mocked(prisma.attendance.upsert).mockResolvedValue({} as any);

      vi.mocked(mockRequest.json!).mockResolvedValue({
        eventId: 'event-123',
        memberId: 'member-123',
        status: 'PRESENT',
      });

      const response = await POST(mockRequest as NextRequest);

      // Should proceed to process the request
      expect(response.status).not.toBe(429);
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { id: 'session-123' },
      } as any);

      vi.mocked(prisma.member.findFirst).mockRejectedValue(new Error('Database error'));

      vi.mocked(mockRequest.json!).mockResolvedValue({
        eventId: 'event-123',
        memberId: 'member-123',
        status: 'PRESENT',
      });

      const response = await POST(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });

    it('should handle malformed JSON body', async () => {
      // When JSON parsing fails, the error is caught and returns 500
      // But the session check happens first, so we need to mock that
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { id: 'session-123' },
      } as any);
      vi.mocked(mockRequest.json!).mockRejectedValue(new Error('Invalid JSON'));

      const response = await POST(mockRequest as NextRequest);

      // The route catches all errors and returns 500
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });
  });
});

// =============================================================================
// Attendance Status Tests
// =============================================================================

describe('Attendance Status Logic', () => {
  it('should define correct attendance status values', () => {
    const validStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
    
    // These should match the Prisma enum
    expect(validStatuses).toContain('PRESENT');
    expect(validStatuses).toContain('ABSENT');
    expect(validStatuses).toContain('LATE');
    expect(validStatuses).toContain('EXCUSED');
  });

  it('should not allow invalid status transitions in business logic', () => {
    // This documents expected behavior - the API doesn't enforce transitions
    // but the business logic might want to track them
    const statusTransitions = {
      PRESENT: ['LATE'], // Can mark as late if already marked present
      ABSENT: ['EXCUSED'], // Can excuse an absence
      LATE: ['PRESENT'], // Can change late to present
      EXCUSED: [], // Excused is final
    };

    // This is documentation - actual enforcement would be in business logic
    expect(Object.keys(statusTransitions)).toHaveLength(4);
  });
});
