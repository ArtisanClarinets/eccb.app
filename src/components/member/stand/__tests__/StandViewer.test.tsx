// mock real-time sync hook to avoid undefined errors
vi.mock('@/hooks/use-stand-sync', () => ({
  useStandSync: () => ({
    isConnected: false,
    connectionError: null,
    roster: [],
    currentState: null,
    sendCommand: vi.fn(),
    sendMode: vi.fn(),
    sendAnnotation: vi.fn(),
    reconnect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

// mock roster overlay since it's just a visual component
vi.mock('src/components/member/stand/RosterOverlay.tsx', () => ({
  RosterOverlay: () => <div data-testid="roster-overlay" />,
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { StandViewer } from '../StandViewer';
import { useStandStore } from '@/store/standStore';
import React from 'react';

// Mock the child components to avoid browser API dependencies
vi.mock('../NavigationControls', () => ({
  NavigationControls: () => <div data-testid="navigation-controls">NavigationControls</div>,
}));

vi.mock('../Toolbar', () => ({
  Toolbar: () => <div data-testid="toolbar">Toolbar</div>,
}));

vi.mock('../StandCanvas', () => ({
  StandCanvas: () => <div data-testid="stand-canvas">StandCanvas</div>,
}));

// Mock useFullscreen hook to avoid document API calls
vi.mock('../useFullscreen', () => ({
  useFullscreen: () => ({
    isFullscreen: false,
    toggleFullscreen: vi.fn(),
  }),
}));

// Mock GestureHandler
vi.mock('../GestureHandler', () => ({
  GestureHandler: () => <div data-testid="gesture-handler" />,
}));

// Reset store before each test
beforeEach(() => {
  useStandStore.getState().reset();
  vi.clearAllMocks();
});

describe('StandViewer', () => {
  const mockMusic = [
    {
      id: '1',
      piece: {
        id: 'piece-1',
        title: 'Test Piece 1',
        composer: 'Test Composer',
        files: [
          {
            id: 'file-1',
            mimeType: 'application/pdf',
            storageKey: 'test-file-1.pdf',
            storageUrl: null,
          },
        ],
      },
    },
    {
      id: '2',
      piece: {
        id: 'piece-2',
        title: 'Test Piece 2',
        composer: 'Test Composer 2',
        files: [
          {
            id: 'file-2',
            mimeType: 'application/pdf',
            storageKey: 'test-file-2.pdf',
            storageUrl: 'https://example.com/test-file-2.pdf',
          },
        ],
      },
    },
  ];

  it('renders empty state when no music is provided', () => {
    const { container } = render(<StandViewer data={{ eventId: 'evt', userId: 'u1', eventTitle: 'Test Event', music: [], annotations: [], navigationLinks: [], audioLinks: [], preferences: null, roster: [] }} />);
    
    expect(container.textContent).toContain('No music scheduled for this event.');
  });

  it('renders the viewer with music data', () => {
    const { container: _container } = render(<StandViewer data={{ eventId: 'evt', userId: 'u1', eventTitle: 'Test Event', music: mockMusic, annotations: [], navigationLinks: [], audioLinks: [], preferences: null, roster: [] }} />);
    
    // Check that child components are rendered
    expect(screen.getByTestId('navigation-controls')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('stand-canvas')).toBeInTheDocument();
    // default selected layer remains PERSONAL after mount
    expect(useStandStore.getState().selectedLayer).toBe('PERSONAL');
  });

  it('initializes the store with music data', () => {
    render(<StandViewer data={{ eventId: 'evt', userId: 'u1', eventTitle: 'Test Event', music: mockMusic, annotations: [], navigationLinks: [], audioLinks: [], preferences: null, roster: [] }} />);
    
    const state = useStandStore.getState();
    expect(state.pieces).toHaveLength(2);
    expect(state.pieces[0].title).toBe('Test Piece 1');
    expect(state.pieces[1].title).toBe('Test Piece 2');
  });

  it('sets the event title in the store', () => {
    render(<StandViewer data={{ eventId: 'evt', userId: 'u1', eventTitle: 'My Test Event', music: mockMusic, annotations: [], navigationLinks: [], audioLinks: [], preferences: null, roster: [] }} />);
    
    const state = useStandStore.getState();
    expect(state.eventTitle).toBe('My Test Event');
  });

  it('transforms music data to stand pieces correctly', () => {
    render(<StandViewer data={{ eventId: 'evt', userId: 'u1', eventTitle: 'Test Event', music: mockMusic, annotations: [], navigationLinks: [], audioLinks: [], preferences: null, roster: [] }} />);
    
    const state = useStandStore.getState();
    const piece = state.pieces[0];
    
    expect(piece.id).toBe('1');
    expect(piece.title).toBe('Test Piece 1');
    expect(piece.composer).toBe('Test Composer');
    expect(piece.pdfUrl).toContain('test-file-1.pdf');
    expect(piece.totalPages).toBe(1);
  });

  it('uses storageUrl when available', () => {
    render(<StandViewer data={{ eventId: 'evt', userId: 'u1', eventTitle: 'Test Event', music: mockMusic, annotations: [], navigationLinks: [], audioLinks: [], preferences: null, roster: [] }} />);
    
    const state = useStandStore.getState();
    const piece = state.pieces[1];
    
    expect(piece.pdfUrl).toBe('https://example.com/test-file-2.pdf');
  });

  it('loads audio links into store', () => {
    const audio = [{ id: 'a1', pieceId: 'p', fileKey: 'k', url: 'u', description: 'd', createdAt: new Date() }];
    render(<StandViewer data={{ eventId: 'evt', userId: 'u1', eventTitle: 'Test Event', music: mockMusic, annotations: [], navigationLinks: [], audioLinks: audio, preferences: null, roster: [] }} />);
    const state = useStandStore.getState();
    expect(state.audioLinks).toEqual(audio);
  });

  it('renders utility components when toggled on', async () => {
    // ensure utility flags and audio links are set before rendering
    act(() => {
      useStandStore.setState({
        showMetronome: true,
        showTuner: true,
        showAudioPlayer: true,
        showPitchPipe: true,
        audioLinks: [{ id: 'a1', pieceId: 'p', fileKey: 'k', url: 'u', description: 'd', createdAt: new Date() }],
        selectedAudioLinkId: 'a1',
      });
    });
    const audio = [{ id: 'a1', pieceId: 'p', fileKey: 'k', url: 'u', description: 'd', createdAt: new Date() }];
    const { queryByText } = render(<StandViewer data={{ eventId: 'evt', userId: 'u1', eventTitle: 'Test Event', music: mockMusic, annotations: [], navigationLinks: [], audioLinks: audio, preferences: null, roster: [] }} />);
    // debug store after render
     
    console.log('store after render', useStandStore.getState());
    // utilities may render after the store is initialized by StandViewer effects
    await waitFor(() => expect(queryByText('Start')).toBeInTheDocument()); // metronome
    await waitFor(() => expect(queryByText('Note:')).toBeInTheDocument()); // tuner
    await waitFor(() => expect(queryByText(/Progress:/)).toBeInTheDocument()); // audio player
    await waitFor(() => expect(queryByText('C4')).toBeInTheDocument()); // pitch pipe keyboard
  });
});
