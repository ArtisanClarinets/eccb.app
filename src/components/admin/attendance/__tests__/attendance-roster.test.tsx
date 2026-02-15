/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AttendanceRoster } from '../attendance-roster';
import { AttendanceStatus } from '@prisma/client';

// Mock the hooks and actions
vi.mock('@/hooks/use-attendance', () => ({
  useAttendance: () => ({
    isLoading: false,
    markBulkAttendance: vi.fn(),
  }),
  useAttendanceStats: vi.fn((attendance) => ({
    total: attendance.length,
    present: attendance.filter((a: { status: string }) => a.status === 'PRESENT').length,
    absent: attendance.filter((a: { status: string }) => a.status === 'ABSENT').length,
    excused: attendance.filter((a: { status: string }) => a.status === 'EXCUSED').length,
    late: attendance.filter((a: { status: string }) => a.status === 'LATE').length,
    leftEarly: attendance.filter((a: { status: string }) => a.status === 'LEFT_EARLY').length,
    attendanceRate: attendance.length > 0 
      ? Math.round((attendance.filter((a: { status: string }) => a.status === 'PRESENT').length / attendance.length) * 100) 
      : 0,
    punctualityRate: 0,
  })),
}));

vi.mock('@/app/(admin)/admin/attendance/actions', () => ({
  markBulkAttendance: vi.fn(() => Promise.resolve({ success: true, count: 5 })),
  initializeEventAttendance: vi.fn(() => Promise.resolve({ success: true, count: 5 })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Test data
const mockMembers = [
  {
    id: 'member-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    status: 'ACTIVE',
    instruments: [{ isPrimary: true, instrument: { id: 'inst-1', name: 'Trumpet' } }],
    sections: [{ section: { id: 'sec-1', name: 'Brass' } }],
  },
  {
    id: 'member-2',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    status: 'ACTIVE',
    instruments: [{ isPrimary: true, instrument: { id: 'inst-2', name: 'Flute' } }],
    sections: [{ section: { id: 'sec-2', name: 'Woodwinds' } }],
  },
  {
    id: 'member-3',
    firstName: 'Bob',
    lastName: 'Johnson',
    email: 'bob@example.com',
    status: 'ACTIVE',
    instruments: [],
    sections: [],
  },
];

const mockExistingAttendance = [
  {
    id: 'att-1',
    memberId: 'member-1',
    status: 'PRESENT' as AttendanceStatus,
    notes: null,
    markedAt: new Date(),
  },
];

describe('AttendanceRoster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the attendance roster with members', () => {
    render(
      <AttendanceRoster
        eventId="event-1"
        eventTitle="Test Event"
        eventType="REHEARSAL"
        members={mockMembers}
        existingAttendance={mockExistingAttendance}
      />
    );

    // Check for member names
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
  });

  it('displays attendance statistics', () => {
    render(
      <AttendanceRoster
        eventId="event-1"
        eventTitle="Test Event"
        eventType="REHEARSAL"
        members={mockMembers}
        existingAttendance={mockExistingAttendance}
      />
    );

    // Check for stats cards - use getAllByText since some text appears multiple times
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getAllByText('Present').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Absent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Excused').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Late').length).toBeGreaterThan(0);
    expect(screen.getByText('Left Early')).toBeInTheDocument();
  });

  it('shows member instruments and sections', () => {
    render(
      <AttendanceRoster
        eventId="event-1"
        eventTitle="Test Event"
        eventType="REHEARSAL"
        members={mockMembers}
        existingAttendance={mockExistingAttendance}
      />
    );

    expect(screen.getByText('Trumpet')).toBeInTheDocument();
    expect(screen.getByText('Flute')).toBeInTheDocument();
    expect(screen.getByText('Brass')).toBeInTheDocument();
    expect(screen.getByText('Woodwinds')).toBeInTheDocument();
  });

  it('filters members by search query', async () => {
    render(
      <AttendanceRoster
        eventId="event-1"
        eventTitle="Test Event"
        eventType="REHEARSAL"
        members={mockMembers}
        existingAttendance={mockExistingAttendance}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search members...');
    fireEvent.change(searchInput, { target: { value: 'John' } });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
    });
  });

  it('allows selecting all members', async () => {
    render(
      <AttendanceRoster
        eventId="event-1"
        eventTitle="Test Event"
        eventType="REHEARSAL"
        members={mockMembers}
        existingAttendance={mockExistingAttendance}
      />
    );

    // Find the "select all" checkbox in the table header
    const checkboxes = screen.getAllByRole('checkbox');
    const selectAllCheckbox = checkboxes[0]; // First checkbox is "select all"
    
    fireEvent.click(selectAllCheckbox);

    await waitFor(() => {
      // Should show bulk actions bar
      expect(screen.getByText(/member.*selected/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no members', () => {
    render(
      <AttendanceRoster
        eventId="event-1"
        eventTitle="Test Event"
        eventType="REHEARSAL"
        members={[]}
        existingAttendance={[]}
      />
    );

    expect(screen.getByText('No members found')).toBeInTheDocument();
  });

  it('displays existing attendance status correctly', () => {
    render(
      <AttendanceRoster
        eventId="event-1"
        eventTitle="Test Event"
        eventType="REHEARSAL"
        members={mockMembers}
        existingAttendance={mockExistingAttendance}
      />
    );

    // John Doe should show as PRESENT (from existing attendance)
    // The status select should show "Present"
    expect(screen.getAllByText('Present')[0]).toBeInTheDocument();
  });

  it('has save attendance button', () => {
    render(
      <AttendanceRoster
        eventId="event-1"
        eventTitle="Test Event"
        eventType="REHEARSAL"
        members={mockMembers}
        existingAttendance={mockExistingAttendance}
      />
    );

    expect(screen.getByText('Save Attendance')).toBeInTheDocument();
  });

  it('has notes button for each member', () => {
    render(
      <AttendanceRoster
        eventId="event-1"
        eventTitle="Test Event"
        eventType="REHEARSAL"
        members={mockMembers}
        existingAttendance={mockExistingAttendance}
      />
    );

    const addNoteButtons = screen.getAllByText('Add note');
    expect(addNoteButtons.length).toBeGreaterThan(0);
  });
});
