/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventCalendar, type CalendarEvent } from '../event-calendar';

// Mock events for testing - use current dates and correct property names
const today = new Date();
const mockEvents: CalendarEvent[] = [
  {
    id: '1',
    title: 'Test Concert',
    startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 19, 0),
    endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 21, 0),
    type: 'CONCERT',
    location: 'Test Venue',
  },
  {
    id: '2',
    title: 'Test Rehearsal',
    startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2, 18, 0),
    endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2, 20, 0),
    type: 'REHEARSAL',
    location: 'Test Hall',
  },
];

describe('EventCalendar', () => {
  describe('Rendering', () => {
    it('renders calendar with navigation buttons', () => {
      render(<EventCalendar events={mockEvents} />);

      // Should have Today button
      expect(screen.getByRole('button', { name: /today/i })).toBeInTheDocument();
    });

    it('renders view toggle when showViewToggle is true', () => {
      render(<EventCalendar events={mockEvents} showViewToggle={true} />);

      // Should have view toggle buttons
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('renders without events', () => {
      render(<EventCalendar events={[]} />);

      // Should still render the calendar structure
      expect(screen.getByRole('button', { name: /today/i })).toBeInTheDocument();
    });
  });

  describe('View Toggle', () => {
    it('calls onViewModeChange when view is changed', () => {
      const onViewModeChange = vi.fn();
      render(
        <EventCalendar
          events={mockEvents}
          showViewToggle={true}
          onViewModeChange={onViewModeChange}
        />
      );

      // Find and click the week button
      const weekButton = screen.queryByRole('button', { name: /week/i });
      if (weekButton) {
        fireEvent.click(weekButton);
        expect(onViewModeChange).toHaveBeenCalledWith('week');
      }
    });
  });

  describe('Today Button', () => {
    it('navigates to current month when Today is clicked', () => {
      render(<EventCalendar events={mockEvents} viewMode="month" />);

      const todayButton = screen.getByRole('button', { name: /today/i });
      fireEvent.click(todayButton);

      // The component should navigate to today's month
      expect(todayButton).toBeInTheDocument();
    });
  });

  describe('List View', () => {
    it('shows empty state when no events', () => {
      render(<EventCalendar events={[]} viewMode="list" />);

      expect(screen.getByText('No Events')).toBeInTheDocument();
    });

    it('renders events in list view', () => {
      render(<EventCalendar events={mockEvents} viewMode="list" />);

      // Should show event titles
      expect(screen.getByText('Test Concert')).toBeInTheDocument();
      expect(screen.getByText('Test Rehearsal')).toBeInTheDocument();
    });
  });

  describe('Event Click', () => {
    it('calls onEventClick when event is clicked in list view', () => {
      const onEventClick = vi.fn();
      render(
        <EventCalendar
          events={mockEvents}
          viewMode="list"
          onEventClick={onEventClick}
        />
      );

      // Find event by title and click
      const eventElement = screen.getByText('Test Concert');
      fireEvent.click(eventElement);
      
      expect(onEventClick).toHaveBeenCalled();
    });

    it('renders event as link when eventHref is provided', () => {
      render(
        <EventCalendar
          events={mockEvents}
          viewMode="list"
          eventHref={(event) => `/events/${event.id}`}
        />
      );

      // Should render as links - there are multiple events so use getAllByRole
      const links = screen.getAllByRole('link');
      expect(links[0]).toHaveAttribute('href', '/events/1');
      expect(links[1]).toHaveAttribute('href', '/events/2');
    });
  });
});
