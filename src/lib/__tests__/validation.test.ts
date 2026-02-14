import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// =============================================================================
// Member Validation Schemas
// =============================================================================

const memberCreateSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required').max(50, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long'),
  phone: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING']).default('PENDING'),
  joinDate: z.coerce.date().optional(),
  section: z.string().optional(),
  instruments: z.array(z.string()).optional(),
});

const memberUpdateSchema = memberCreateSchema.partial();

// =============================================================================
// Event Validation Schemas
// =============================================================================

// Base schema without refinement for partial updates
const eventBaseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(5000, 'Description too long').optional(),
  startTime: z.coerce.date({ required_error: 'Start time is required' }),
  endTime: z.coerce.date({ required_error: 'End time is required' }),
  location: z.string().max(200, 'Location too long').optional(),
  eventType: z.enum(['REHEARSAL', 'CONCERT', 'MEETING', 'OTHER']),
  status: z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED', 'POSTPONED']).default('SCHEDULED'),
  isPublic: z.boolean().default(true),
  maxAttendees: z.number().int().positive().optional(),
});

// Create schema with refinement for validation
const eventCreateSchema = eventBaseSchema.refine(
  (data) => data.endTime > data.startTime,
  { message: 'End time must be after start time', path: ['endTime'] }
);

// Update schema without refinement (partial updates may not have both times)
const eventUpdateSchema = eventBaseSchema.partial();

// =============================================================================
// Music Piece Validation Schemas
// =============================================================================

const musicPieceCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  composer: z.string().max(200, 'Composer name too long').optional(),
  arranger: z.string().max(200, 'Arranger name too long').optional(),
  genre: z.string().max(100, 'Genre too long').optional(),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'PROFESSIONAL']).optional(),
  duration: z.number().int().positive('Duration must be positive').optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'PENDING']).default('ACTIVE'),
  notes: z.string().max(2000, 'Notes too long').optional(),
});

const musicPieceUpdateSchema = musicPieceCreateSchema.partial();

// =============================================================================
// File Upload Validation Schemas
// =============================================================================

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'audio/mpeg',
  'audio/wav',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const fileUploadSchema = z.object({
  fileName: z.string().min(1, 'File name is required').max(255, 'File name too long'),
  fileType: z.string().refine(
    (type) => ALLOWED_FILE_TYPES.includes(type),
    { message: 'File type not allowed' }
  ),
  fileSize: z.number().int().positive().max(
    MAX_FILE_SIZE,
    { message: `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)} MB` }
  ),
  pieceId: z.string().min(1, 'Piece ID is required'),
  category: z.enum(['SCORE', 'PART', 'AUDIO', 'IMAGE', 'OTHER']).default('OTHER'),
});

// =============================================================================
// Tests
// =============================================================================

describe('Member Validation', () => {
  describe('Create Member', () => {
    it('should validate a valid member', () => {
      const result = memberCreateSchema.safeParse({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '555-1234',
        status: 'ACTIVE',
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = memberCreateSchema.safeParse({
        email: 'invalid-email',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('email');
      }
    });

    it('should reject empty first name', () => {
      const result = memberCreateSchema.safeParse({
        email: 'test@example.com',
        firstName: '',
        lastName: 'Doe',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('required');
      }
    });

    it('should reject first name over 50 characters', () => {
      const result = memberCreateSchema.safeParse({
        email: 'test@example.com',
        firstName: 'a'.repeat(51),
        lastName: 'Doe',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('too long');
      }
    });

    it('should reject invalid status', () => {
      const result = memberCreateSchema.safeParse({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        status: 'INVALID',
      });

      expect(result.success).toBe(false);
    });

    it('should default status to PENDING', () => {
      const result = memberCreateSchema.safeParse({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('PENDING');
      }
    });
  });

  describe('Update Member', () => {
    it('should allow partial updates', () => {
      const result = memberUpdateSchema.safeParse({
        firstName: 'Jane',
      });

      expect(result.success).toBe(true);
    });

    it('should allow empty object', () => {
      const result = memberUpdateSchema.safeParse({});

      expect(result.success).toBe(true);
    });
  });
});

describe('Event Validation', () => {
  describe('Create Event', () => {
    it('should validate a valid event', () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours later

      const result = eventCreateSchema.safeParse({
        title: 'Spring Concert',
        description: 'Annual spring concert',
        startTime,
        endTime,
        location: 'Main Hall',
        eventType: 'CONCERT',
      });

      expect(result.success).toBe(true);
    });

    it('should reject event where end time is before start time', () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() - 60 * 60 * 1000); // 1 hour before

      const result = eventCreateSchema.safeParse({
        title: 'Test Event',
        startTime,
        endTime,
        eventType: 'REHEARSAL',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('after start time');
      }
    });

    it('should reject empty title', () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

      const result = eventCreateSchema.safeParse({
        title: '',
        startTime,
        endTime,
        eventType: 'REHEARSAL',
      });

      expect(result.success).toBe(false);
    });

    it('should reject title over 200 characters', () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

      const result = eventCreateSchema.safeParse({
        title: 'a'.repeat(201),
        startTime,
        endTime,
        eventType: 'REHEARSAL',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid event type', () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

      const result = eventCreateSchema.safeParse({
        title: 'Test Event',
        startTime,
        endTime,
        eventType: 'INVALID',
      });

      expect(result.success).toBe(false);
    });

    it('should default isPublic to true', () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

      const result = eventCreateSchema.safeParse({
        title: 'Test Event',
        startTime,
        endTime,
        eventType: 'REHEARSAL',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isPublic).toBe(true);
      }
    });

    it('should accept ISO date strings for dates', () => {
      const result = eventCreateSchema.safeParse({
        title: 'Test Event',
        startTime: '2024-06-15T18:00:00Z',
        endTime: '2024-06-15T20:00:00Z',
        eventType: 'CONCERT',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startTime).toBeInstanceOf(Date);
        expect(result.data.endTime).toBeInstanceOf(Date);
      }
    });
  });

  describe('Update Event', () => {
    it('should allow partial updates', () => {
      const result = eventUpdateSchema.safeParse({
        title: 'Updated Title',
      });

      expect(result.success).toBe(true);
    });
  });
});

describe('Music Piece Validation', () => {
  describe('Create Music Piece', () => {
    it('should validate a valid music piece', () => {
      const result = musicPieceCreateSchema.safeParse({
        title: 'Symphony No. 5',
        composer: 'Ludwig van Beethoven',
        difficulty: 'ADVANCED',
        duration: 2400, // 40 minutes in seconds
      });

      expect(result.success).toBe(true);
    });

    it('should reject empty title', () => {
      const result = musicPieceCreateSchema.safeParse({
        title: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid difficulty', () => {
      const result = musicPieceCreateSchema.safeParse({
        title: 'Test Piece',
        difficulty: 'EXPERT', // Not in enum
      });

      expect(result.success).toBe(false);
    });

    it('should reject negative duration', () => {
      const result = musicPieceCreateSchema.safeParse({
        title: 'Test Piece',
        duration: -100,
      });

      expect(result.success).toBe(false);
    });

    it('should default status to ACTIVE', () => {
      const result = musicPieceCreateSchema.safeParse({
        title: 'Test Piece',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('ACTIVE');
      }
    });
  });
});

describe('File Upload Validation', () => {
  describe('File Upload', () => {
    it('should validate a valid file upload', () => {
      const result = fileUploadSchema.safeParse({
        fileName: 'score.pdf',
        fileType: 'application/pdf',
        fileSize: 1024 * 1024, // 1 MB
        pieceId: 'piece-123',
        category: 'SCORE',
      });

      expect(result.success).toBe(true);
    });

    it('should reject disallowed file types', () => {
      const result = fileUploadSchema.safeParse({
        fileName: 'virus.exe',
        fileType: 'application/octet-stream',
        fileSize: 1024,
        pieceId: 'piece-123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('not allowed');
      }
    });

    it('should reject files over 50 MB', () => {
      const result = fileUploadSchema.safeParse({
        fileName: 'large.pdf',
        fileType: 'application/pdf',
        fileSize: 51 * 1024 * 1024, // 51 MB
        pieceId: 'piece-123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('50');
      }
    });

    it('should accept audio files', () => {
      const result = fileUploadSchema.safeParse({
        fileName: 'recording.mp3',
        fileType: 'audio/mpeg',
        fileSize: 5 * 1024 * 1024, // 5 MB
        pieceId: 'piece-123',
        category: 'AUDIO',
      });

      expect(result.success).toBe(true);
    });

    it('should accept image files', () => {
      const result = fileUploadSchema.safeParse({
        fileName: 'cover.jpg',
        fileType: 'image/jpeg',
        fileSize: 500 * 1024, // 500 KB
        pieceId: 'piece-123',
        category: 'IMAGE',
      });

      expect(result.success).toBe(true);
    });

    it('should reject empty file name', () => {
      const result = fileUploadSchema.safeParse({
        fileName: '',
        fileType: 'application/pdf',
        fileSize: 1024,
        pieceId: 'piece-123',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing piece ID', () => {
      const result = fileUploadSchema.safeParse({
        fileName: 'score.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        pieceId: '',
      });

      expect(result.success).toBe(false);
    });

    it('should default category to OTHER', () => {
      const result = fileUploadSchema.safeParse({
        fileName: 'document.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        pieceId: 'piece-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.category).toBe('OTHER');
      }
    });
  });
});

describe('Cross-Field Validation', () => {
  it('should validate event time range', () => {
    // Same start and end time should fail
    const sameTime = new Date();
    const result1 = eventCreateSchema.safeParse({
      title: 'Test',
      startTime: sameTime,
      endTime: sameTime,
      eventType: 'REHEARSAL',
    });

    expect(result1.success).toBe(false);
  });

  it('should accept events with valid time range', () => {
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 1000); // 1 second later

    const result = eventCreateSchema.safeParse({
      title: 'Test',
      startTime,
      endTime,
      eventType: 'REHEARSAL',
    });

    expect(result.success).toBe(true);
  });
});

describe('Input Sanitization', () => {
  it('should handle special characters in strings', () => {
    const result = memberCreateSchema.safeParse({
      email: "test+special@example.com",
      firstName: "O'Brien",
      lastName: "Smith-Jones",
    });

    expect(result.success).toBe(true);
  });

  it('should handle unicode characters', () => {
    const result = memberCreateSchema.safeParse({
      email: 'test@example.com',
      firstName: 'José',
      lastName: 'Müller',
    });

    expect(result.success).toBe(true);
  });

  it('should coerce date strings to Date objects', () => {
    const result = eventCreateSchema.safeParse({
      title: 'Test Event',
      startTime: '2024-12-25T18:00:00.000Z',
      endTime: '2024-12-25T20:00:00.000Z',
      eventType: 'CONCERT',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startTime).toBeInstanceOf(Date);
    }
  });
});
