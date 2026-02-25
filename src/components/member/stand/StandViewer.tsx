'use client';

import { useEffect } from 'react';
import { useStandStore, StandPiece, Annotation, NavigationLink } from '@/store/standStore';
import { useStandSync } from '@/hooks/use-stand-sync';
import { useAudioTracker } from '@/hooks/useAudioTracker';
import { NavigationControls } from './NavigationControls';
import { Toolbar } from './Toolbar';
import { StandCanvas } from './StandCanvas';
import { GestureHandler } from './GestureHandler';
import { KeyboardHandler } from './KeyboardHandler';
import { MidiHandler } from './MidiHandler';
import { RosterOverlay } from './RosterOverlay';
import { Metronome } from './Metronome';
import { Tuner } from './Tuner';
import { AudioPlayer } from './AudioPlayer';
import { PitchPipe } from './PitchPipe';
import { AudioTrackerSettings } from './AudioTrackerSettings';
import { SmartNavEditor } from './SmartNavEditor';

// Type for music assignment with piece and files (from Prisma)
interface MusicAssignment {
  id: string;
  piece: {
    id: string;
    title: string;
    composer?: string | null;
    files?: Array<{
      id: string;
      mimeType: string;
      storageKey: string;
      storageUrl?: string | null;
    }>;
  };
}

// Type for annotation from loader (database format transformed)
interface StandAnnotation {
  id: string;
  pieceId: string;
  pageNumber: number;
  x: number;
  y: number;
  content: string;
  color: string;
  layer: 'PERSONAL' | 'SECTION' | 'DIRECTOR';
  createdAt: Date;
}

// Type for navigation link from loader
interface StandNavigationLink {
  id: string;
  fromPieceId: string;
  fromPage: number;
  fromX: number;
  fromY: number;
  toPieceId: string;
  toPage: number;
  toX: number;
  toY: number;
  label: string;
}

// Type for audio link from loader
interface StandAudioLink {
  id: string;
  pieceId: string;
  fileKey: string;
  url: string | null;
  description: string | null;
  createdAt: Date;
}

// Type for user preferences from loader
interface StandUserPreferences {
  nightMode: boolean;
  metronomeSettings?: Record<string, any>;
  tunerSettings?: Record<string, any>;
  pitchPipeSettings?: Record<string, any>;
}

// Type for stand session (roster presence)
interface StandSessionPresence {
  id: string;
  eventId: string;
  userId: string;
  section: string | null;
  lastSeenAt: Date;
}

// Aggregated loader data type
export interface StandLoaderData {
  eventId: string;
  userId: string;
  eventTitle: string;
  music: MusicAssignment[];
  annotations: StandAnnotation[];
  navigationLinks: StandNavigationLink[];
  audioLinks: StandAudioLink[];
  preferences: StandUserPreferences | null;
  roster: StandSessionPresence[];
}

interface StandViewerProps {
  data: StandLoaderData;
}

// Transform music data to StandPiece format
function transformToStandPieces(music: MusicAssignment[]): StandPiece[] {
  return music.map((m) => {
    const pdfFile = m.piece?.files?.find((f) => f.mimeType === 'application/pdf');
    return {
      id: m.id,
      title: m.piece?.title || 'Untitled',
      composer: m.piece?.composer || '',
      pdfUrl: pdfFile
        ? // prefer explicit URL when provided, otherwise fall back to download route
          pdfFile.storageUrl ||
          (pdfFile.storageKey ? `/api/files/download/${pdfFile.storageKey}` : null)
        : null,
      totalPages: 1,
    };
  });
}

// Transform annotation from loader to store format
function transformAnnotation(annotation: StandAnnotation): Annotation {
  return {
    id: annotation.id,
    pieceId: annotation.pieceId,
    pageNumber: annotation.pageNumber,
    x: annotation.x,
    y: annotation.y,
    content: annotation.content,
    color: annotation.color,
    layer: annotation.layer,
    createdAt: annotation.createdAt,
  };
}

// Transform navigation link from loader to store format
function transformNavigationLink(link: StandNavigationLink): NavigationLink {
  return {
    id: link.id,
    fromPieceId: link.fromPieceId,
    fromPage: link.fromPage,
    fromX: link.fromX,
    fromY: link.fromY,
    toPieceId: link.toPieceId,
    toPage: link.toPage,
    toX: link.toX,
    toY: link.toY,
    label: link.label,
  };
}

export function StandViewer({ data }: StandViewerProps) {
  const {
    setPieces,
    setEventInfo,
    isFullscreen,
    showControls,
    gigMode,
    setAnnotations,
    addAnnotation,
    addNavigationLink,
    toggleNightMode,
    setRoster,
    addRosterEntry,
    removeRosterEntry,
    setAudioLinks,
    updateMetronomeSettings,
    updateTunerSettings,
    updatePitchPipeSettings,
    toggleMetronome: _toggleMetronome,
    toggleTuner: _toggleTuner,
    toggleAudioPlayer: _toggleAudioPlayer,
    togglePitchPipe: _togglePitchPipe,
    updateAudioTrackerSettings,
  } = useStandStore();

  const { eventId, userId, eventTitle, music, annotations, navigationLinks, audioLinks, preferences, roster } = data;

  // Initialize audio tracker hook - auto-starts when enabled in settings
  useAudioTracker();

  // Initialize store with music data
  useEffect(() => {
    if (music && music.length > 0) {
      const standPieces = transformToStandPieces(music);
      setPieces(standPieces);
      setEventInfo(eventId, eventTitle);
    }
  }, [music, eventTitle, setPieces, setEventInfo, eventId]);

  // Initialize annotations
  useEffect(() => {
    if (annotations && annotations.length > 0) {
      const transformedAnnotations = annotations.map(transformAnnotation);
      setAnnotations(transformedAnnotations);
    }
  }, [annotations, setAnnotations]);

  // Initialize navigation links
  useEffect(() => {
    if (navigationLinks && navigationLinks.length > 0) {
      const transformedLinks = navigationLinks.map(transformNavigationLink);
      transformedLinks.forEach((link) => addNavigationLink(link));
    }
  }, [navigationLinks, addNavigationLink]);

  // Apply user preferences (night mode)
  useEffect(() => {
    if (preferences?.nightMode) {
      toggleNightMode();
    }
    // load other preferences if available
    if (preferences?.metronomeSettings) {
      updateMetronomeSettings(preferences.metronomeSettings as any);
    }
    if (preferences?.tunerSettings) {
      updateTunerSettings(preferences.tunerSettings as any);
    }
    if (preferences?.pitchPipeSettings) {
      updatePitchPipeSettings(preferences.pitchPipeSettings as any);
    }
    if ((preferences as any)?.midiMappings) {
      useStandStore.getState().setMidiMappings((preferences as any).midiMappings);
    }
    // Load audio tracker settings from preferences
    if (preferences && (preferences as any).audioTrackerSettings) {
      updateAudioTrackerSettings((preferences as any).audioTrackerSettings);
    }
  }, [preferences, toggleNightMode, updateMetronomeSettings, updateTunerSettings, updatePitchPipeSettings, updateAudioTrackerSettings]);

  // initialize audio links
  useEffect(() => {
    if (audioLinks && audioLinks.length > 0) {
      setAudioLinks(audioLinks);
    }
  }, [audioLinks, setAudioLinks]);

  // initialize roster from loader data
  useEffect(() => {
    if (roster && roster.length > 0) {
      // convert to StandRosterMember
      const entries = roster.map((r) => ({
        userId: r.userId,
        name: '', // loader doesn't include name; will be filled by sync
        section: r.section || undefined,
        joinedAt: r.lastSeenAt.toISOString(),
      }));
      setRoster(entries);
    }
  }, [roster, setRoster]);

  // real-time sync
  useStandSync({
    eventId,
    userId,
    onRosterChange: (members) => setRoster(members),
    onPresenceChange: (presence) => {
      if (presence.status === 'joined') {
        addRosterEntry({
          userId: presence.userId,
          name: presence.name,
          section: presence.section,
          joinedAt: new Date().toISOString(),
        });
      } else {
        removeRosterEntry(presence.userId);
      }
    },
    onAnnotation: (msg) => {
      const d = msg.data as any;
      // convert to our Annotation type and insert
      addAnnotation({
        id: d.id,
        pieceId: d.musicId,
        pageNumber: d.page,
        x: d.x,
        y: d.y,
        content: d.content,
        color: d.color,
        layer: d.layer,
        createdAt: new Date(d.createdAt),
      });
    },
  });

  // Early return for empty music
  if (!music || music.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No music scheduled for this event.
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-[calc(100vh-4rem)] ${
        isFullscreen ? 'fixed inset-0 z-50 bg-background h-screen' : ''
      }`}
    >
      {/* Controls Bar - Navigation and Toolbar */}
      <div
        className={`p-4 border-b flex items-center justify-between bg-card ${
          gigMode || (!showControls && isFullscreen) ? 'hidden' : ''
        }`}
      >
        <NavigationControls />
        <Toolbar />
      </div>
      {/* Utilities toggle sidebar could be placed here if needed */}

      {/* Keyboard Handler - Global keyboard navigation */}
      <KeyboardHandler />
      <MidiHandler />

      {/* Viewer Area - StandCanvas */}
      <div className="flex-1 bg-muted/20 relative overflow-hidden">
        {/* Gesture Handler overlay - positioned over canvas */}
        <GestureHandler />
        <StandCanvas />
        <RosterOverlay />
        {/* Smart Navigation Editor — for creating/editing nav hotspots */}
        <SmartNavEditor />
        {/* Rehearsal utilities */}
        <Metronome />
        <Tuner />
        <AudioPlayer />
        <PitchPipe />
        {/* Audio Tracker Settings Panel */}
        <AudioTrackerSettings />
      </div>
    </div>
  );
}
