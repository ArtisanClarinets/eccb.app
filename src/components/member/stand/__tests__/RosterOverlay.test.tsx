import React from 'react';
import { render, screen } from '@testing-library/react';
import { useStandStore } from '@/store/standStore';
import { RosterOverlay } from '../RosterOverlay';

// helper to reset store
function resetStore() {
  useStandStore.getState().reset();
}

describe('RosterOverlay component', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders nothing when roster is empty', () => {
    render(<RosterOverlay />);
    expect(screen.queryByText(/General/i)).toBeNull();
  });

  it('groups by section and displays initials', () => {
    const entries = [
      { userId: '1', name: 'Alice Smith', section: 'Woodwinds', joinedAt: 't' },
      { userId: '2', name: 'Bob Jones', section: 'Brass', joinedAt: 't' },
      { userId: '3', name: 'Cathy', section: null, joinedAt: 't' },
    ];
    // populate store
    useStandStore.setState({ roster: entries } as any);

    render(<RosterOverlay />);

    // section headers
    expect(screen.getByText('Woodwinds')).toBeInTheDocument();
    expect(screen.getByText('Brass')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();

    // initials
    expect(screen.getByLabelText('Alice Smith')).toHaveTextContent('AS');
    expect(screen.getByLabelText('Bob Jones')).toHaveTextContent('BJ');
    expect(screen.getByLabelText('Cathy')).toHaveTextContent('C');
  });
});
