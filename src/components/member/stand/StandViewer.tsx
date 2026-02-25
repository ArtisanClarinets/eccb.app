'use client';

import { useEffect } from 'react';
import { useStandStore, StandPiece } from '@/store/standStore';
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

// ── Serialised types coming from the server page ────────────────
// All Date fields are pre-serialised to ISO strings on the server.

interface SerializedMusicFile {
  id: string;
  mimeType: string;
  storageKey: string;
  storageUrl: string | null;
  pageCount: number | null;
}

interface SerializedMusicAssignment {
  id: string;
  piece: {
    id: string;
    title: string;
    composer: string | null;
    files: SerializedMusicFile[];
  };
}

interface SerializedAnnotation {
  id: string;
  pieceId: string;
  page: number;
  layer: 'PERSONAL' | 'SECTION' | 'DIRECTOR';
  strokeData: unknown;
  userId: string;
  sectionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SerializedNavigationLink {
  id: string;
  musicId: string;
  fromPage: number;
  fromX: number;
  fromY: number;
  toPage: number;
  toMusicId: string | null;
  toX: number;
  toY: number;
  label: string;
  createdAt: string;
}

interface SerializedAudioLink {
  id: string;
  pieceId: string;
  fileKey: string;
  url: string | null;
  description: string | null;
  createdAt: string;
}

interface SerializedPreferences {
  nightMode: boolean;
  metronomeSettings?: Record<string, unknown>;
  midiMappings?: Record<string, unknown>;
  tunerSettings?: Record<string, unknown>;
  pitchPipeSettings?: Record<string, unknown>;
  audioTrackerSettings?: Record<string, unknown>;
}

interface SerializedRosterEntry {
  id: string;
  eventId: string;
  userId: string;
  section: string | null;
  lastSeenAt: string;
}

export interface StandLoaderData {
  eventId: string;
  userId: string;
  eventTitle: string;
  roles: string[];
  isDirector: boolean;
  isSectionLeader: boolean;
  userSectionIds: string[];
  music: SerializedMusicAssignment[];
  annotations: SerializedAnnotation[];
  navigationLinks: SerializedNavigationLink[];
  audioLinks: SerializedAudioLink[];
  preferences: SerializedPreferences | null;
  roster: SerializedRosterEntry[];
}

interface StandViewerProps {
  data: StandLoaderData;
}

/**
 * Build StandPiece[] from serialized music assignments.
 * Uses piece.id (MusicPiece PK) as the identity – NOT EventMusic.id.
 * PDF URLs go through the authenticated file proxy.
 */
function buildStandPieces(music: SerializedMusicAssignment[]): StandPiece[] {
  return music.map((m) => {
    const pdf = m.piece.files.find((f) => f.mimeType === 'application/pdf');
    return {
      id: m.piece.id,
      title: m.piece.title ?? 'Untitled',
      composer: m.piece.composer ?? '',
      pdfUrl: pdf
        ? `/api/stand/files/${encodeURIComponent(pdf.storageKey)}`
        : null,
      totalPages: pdf?.pageCount ?? 1,
    };
  });
}

export function StandViewer({ data }: StandViewerProps) {
  const {
    setPieces,
    setEventInfo,
    isFullscreen,
    showControls,
    gigMode,
    setAnnotations,
    setNavigationLinks,
    toggleNightMode,
    setRoster,
    addRosterEntry,
    removeRosterEntry,
    setAudioLinks,
    updateMetronomeSettings,
    updateTunerSettings,
    updatePitchPipeSettings,
    updateAudioTrackerSettings,
    setUserContext,
  } = useStandStore();

  const {
    eventId,
    userId,
    eventTitle,
    roles,
    isDirector,
    isSectionLeader,
    userSectionIds,
    music,
    annotations,
    navigationLinks,
    audioLinks,
    preferences,
    roster,
  } = data;

  // Initialize audio tracker hook
  useAudioTracker();

  // ── Hydrate store with server data (runs once) ──────────────
  useEffect(() => {
    // User context (roles, sections)
    setUserContext({ userId, roles, isDirector, isSectionLeader, userSectionIds });

    // Pieces
    if (music.length > 0) {
      setPieces(buildStandPieces(music));
      setEventInfo(eventId, eventTitle);
    }

    // Annotations – stored keyed by pieceId:page:layer in store
    if (annotations.length > 0) {
      const mappedAnnotations = annotations.map((a) => ({
        id: a.id,
        pieceId: a.pieceId,
        pageNumber: a.page,
        layer: a.layer,
        strokeData: (a.strokeData || {}) as Record<string, unknown>,
        userId: a.userId,
        sectionId: a.sectionId,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      }));
      setAnnotations(mappedAnnotations);
    }

    // Navigation links – bulk set
    if (navigationLinks.length > 0) {
      const mappedLinks = navigationLinks.map((nl) => ({
        id: nl.id,
        fromPieceId: nl.musicId,
        fromPage: nl.fromPage,
        fromX: nl.fromX,
        fromY: nl.fromY,
        toPieceId: nl.toMusicId || nl.musicId,
        toPage: nl.toPage,
        toX: nl.toX,
        toY: nl.toY,
        label: nl.label,
        createdAt: nl.createdAt,
        toMusicId: nl.toMusicId,
      }));
      setNavigationLinks(mappedLinks);
    }

    // Audio links – per-piece map built inside store
    if (audioLinks.length > 0) {
      setAudioLinks(audioLinks);
    }

    // Roster (serialized strings, no Date conversion needed)
    if (roster.length > 0) {
      setRoster(
        roster.map((r) => ({
          userId: r.userId,
          name: '',
          section: r.section ?? undefined,
          joinedAt: r.lastSeenAt,
        }))
      );
    }

    // Preferences
    if (preferences) {
      if (preferences.nightMode) toggleNightMode();
      if (preferences.metronomeSettings)
        updateMetronomeSettings(preferences.metronomeSettings as any);
      if (preferences.tunerSettings)
        updateTunerSettings(preferences.tunerSettings as any);
      if (preferences.pitchPipeSettings)
        updatePitchPipeSettings(preferences.pitchPipeSettings as any);
      if (preferences.midiMappings)
        useStandStore.getState().setMidiMappings(preferences.midiMappings as any);
      if (preferences.audioTrackerSettings)
        updateAudioTrackerSettings(preferences.audioTrackerSettings as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Real-time sync ──────────────────────────────────────────
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
  });

  // Empty state
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
      {/* Controls Bar */}
      <div
        className={`p-4 border-b flex items-center justify-between bg-card ${
          gigMode || (!showControls && isFullscreen) ? 'hidden' : ''
        }`}
      >
        <NavigationControls />
        <Toolbar />
      </div>

      <KeyboardHandler />
      <MidiHandler />

      {/* Viewer area */}
      <div className="flex-1 bg-muted/20 relative overflow-hidden">
        <GestureHandler />
        <StandCanvas />
        <RosterOverlay />
        <SmartNavEditor />
        <Metronome />
        <Tuner />
        <AudioPlayer />
        <PitchPipe />
        <AudioTrackerSettings />
      </div>
    </div>
  );
}
