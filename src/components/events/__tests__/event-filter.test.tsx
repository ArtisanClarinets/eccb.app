/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventFilter, useEventFilters, type EventFilterState } from '../event-filter';

describe('EventFilter', () => {
  const defaultFilters: EventFilterState = {
    types: [],
    dateRange: { start: undefined, end: undefined },
    status: 'all',
  };

  describe('Type Filtering', () => {
    it('renders all event type buttons', () => {
      render(
        <EventFilter filters={defaultFilters} onFiltersChange={vi.fn()} />
      );

      expect(screen.getByText('Concert')).toBeInTheDocument();
      expect(screen.getByText('Rehearsal')).toBeInTheDocument();
      expect(screen.getByText('Sectional')).toBeInTheDocument();
      expect(screen.getByText('Board Meeting')).toBeInTheDocument();
      expect(screen.getByText('Social')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();
    });

    it('toggles type filter when clicked', () => {
      const onFiltersChange = vi.fn();
      render(
        <EventFilter filters={defaultFilters} onFiltersChange={onFiltersChange} />
      );

      fireEvent.click(screen.getByText('Concert'));

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        types: ['CONCERT'],
      });
    });

    it('removes type filter when clicked again', () => {
      const onFiltersChange = vi.fn();
      const filtersWithType: EventFilterState = {
        ...defaultFilters,
        types: ['CONCERT'],
      };
      render(
        <EventFilter filters={filtersWithType} onFiltersChange={onFiltersChange} />
      );

      fireEvent.click(screen.getByText('Concert'));

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...filtersWithType,
        types: [],
      });
    });
  });

  describe('Status Filtering', () => {
    it('renders status dropdown when showStatusFilter is true', () => {
      render(
        <EventFilter
          filters={defaultFilters}
          onFiltersChange={vi.fn()}
          showStatusFilter={true}
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('hides status dropdown when showStatusFilter is false', () => {
      render(
        <EventFilter
          filters={defaultFilters}
          onFiltersChange={vi.fn()}
          showStatusFilter={false}
        />
      );

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
  });

  describe('Clear Filters', () => {
    it('shows clear filters button when filters are active', () => {
      const filtersWithTypes: EventFilterState = {
        ...defaultFilters,
        types: ['CONCERT'],
      };
      render(
        <EventFilter filters={filtersWithTypes} onFiltersChange={vi.fn()} />
      );

      expect(screen.getByText('Clear filters')).toBeInTheDocument();
    });

    it('hides clear filters button when no filters are active', () => {
      render(
        <EventFilter filters={defaultFilters} onFiltersChange={vi.fn()} />
      );

      expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
    });

    it('clears all filters when button is clicked', () => {
      const onFiltersChange = vi.fn();
      const filtersWithAll: EventFilterState = {
        types: ['CONCERT'],
        dateRange: { start: new Date(), end: new Date() },
        status: 'upcoming',
      };
      render(
        <EventFilter filters={filtersWithAll} onFiltersChange={onFiltersChange} />
      );

      fireEvent.click(screen.getByText('Clear filters'));

      expect(onFiltersChange).toHaveBeenCalledWith({
        types: [],
        dateRange: { start: undefined, end: undefined },
        status: 'all',
      });
    });
  });

  describe('Active Filters Summary', () => {
    it('shows filter summary when filters are active', () => {
      const filtersWithTypes: EventFilterState = {
        ...defaultFilters,
        types: ['CONCERT', 'REHEARSAL'],
      };
      render(
        <EventFilter filters={filtersWithTypes} onFiltersChange={vi.fn()} />
      );

      expect(screen.getByText('2 types')).toBeInTheDocument();
    });
  });
});

describe('useEventFilters Hook', () => {
  it('returns default filters', () => {
    function TestComponent() {
      const { filters } = useEventFilters();
      return <div data-testid="types-count">{filters.types.length}</div>;
    }
    
    const { getByTestId } = render(<TestComponent />);
    expect(getByTestId('types-count').textContent).toBe('0');
  });

  it('accepts initial filters', () => {
    function TestComponent() {
      const { filters } = useEventFilters({ types: ['CONCERT'], status: 'upcoming' });
      return (
        <div>
          <div data-testid="types-count">{filters.types.length}</div>
          <div data-testid="status">{filters.status}</div>
        </div>
      );
    }
    
    const { getByTestId } = render(<TestComponent />);
    expect(getByTestId('types-count').textContent).toBe('1');
    expect(getByTestId('status').textContent).toBe('upcoming');
  });

  it('clears filters correctly', () => {
    function TestComponent() {
      const { filters, clearFilters, hasActiveFilters } = useEventFilters({ types: ['CONCERT'] });
      
      return (
        <div>
          <div data-testid="types-count">{filters.types.length}</div>
          <div data-testid="has-active">{hasActiveFilters.toString()}</div>
          <button onClick={clearFilters}>Clear</button>
        </div>
      );
    }
    
    const { getByTestId, getByText } = render(<TestComponent />);
    expect(getByTestId('has-active').textContent).toBe('true');
    
    fireEvent.click(getByText('Clear'));
    expect(getByTestId('types-count').textContent).toBe('0');
    expect(getByTestId('has-active').textContent).toBe('false');
  });

  it('detects active filters correctly', () => {
    function TestComponent() {
      const { hasActiveFilters, setFilters } = useEventFilters();
      
      return (
        <div>
          <div data-testid="has-active">{hasActiveFilters.toString()}</div>
          <button
            onClick={() => setFilters({
              types: ['CONCERT'],
              dateRange: { start: undefined, end: undefined },
              status: 'all',
            })}
          >
            Add Filter
          </button>
        </div>
      );
    }
    
    const { getByTestId, getByText } = render(<TestComponent />);
    expect(getByTestId('has-active').textContent).toBe('false');
    
    fireEvent.click(getByText('Add Filter'));
    expect(getByTestId('has-active').textContent).toBe('true');
  });
});
