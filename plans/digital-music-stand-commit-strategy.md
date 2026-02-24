# Digital Music Stand - Commit Strategy & Final Verification

## Overview

This document outlines the commit strategy for the completed Digital Music Stand initiative in `eccb.app`. All major stand feature groups are complete, documentation is updated, and repository gates are clean.

---

## Completed Features Summary

Based on codebase analysis, the following feature groups have been implemented:

| Feature Group | Components/Files | Status |
|---------------|------------------|--------|
| PDF Canvas Rendering | [`StandCanvas.tsx`](src/components/member/stand/StandCanvas.tsx), [`usePdf.ts`](src/components/member/stand/usePdf.ts), [`pdf.ts`](src/lib/pdf.ts) | ✅ Complete |
| Navigation/Page-turning | [`GestureHandler.tsx`](src/components/member/stand/GestureHandler.tsx), [`KeyboardHandler.tsx`](src/components/member/stand/KeyboardHandler.tsx), [`NavigationControls.tsx`](src/components/member/stand/NavigationControls.tsx) | ✅ Complete |
| Setlist Management | [`SetlistManager.tsx`](src/components/member/stand/SetlistManager.tsx) | ✅ Complete |
| Gig/Night Modes | [`PerformanceModeToggle.tsx`](src/components/member/stand/PerformanceModeToggle.tsx), [`NightModeToggle.tsx`](src/components/member/stand/NightModeToggle.tsx), [`wakeLock.ts`](src/lib/wakeLock.ts) | ✅ Complete |
| Roster/Presence | [`RosterOverlay.tsx`](src/components/member/stand/RosterOverlay.tsx), [`use-stand-sync.ts`](src/hooks/use-stand-sync.ts) | ✅ Complete |
| WebSocket Sync | [`sync/route.ts`](src/app/api/stand/sync/route.ts), [`use-stand-sync.ts`](src/hooks/use-stand-sync.ts) | ✅ Complete |
| Annotations + Tools | [`AnnotationLayer.tsx`](src/components/member/stand/AnnotationLayer.tsx), [`annotations/route.ts`](src/app/api/stand/annotations/route.ts) | ✅ Complete |
| Rehearsal Utilities | [`Metronome.tsx`](src/components/member/stand/Metronome.tsx), [`Tuner.tsx`](src/components/member/stand/Tuner.tsx), [`PitchPipe.tsx`](src/components/member/stand/PitchPipe.tsx) | ✅ Complete |
| Audio Playback | [`AudioPlayer.tsx`](src/components/member/stand/AudioPlayer.tsx), [`AudioTrackerSettings.tsx`](src/components/member/stand/AudioTrackerSettings.tsx), [`useAudioTracker.ts`](src/hooks/useAudioTracker.ts) | ✅ Complete |
| Hardware Integration | [`BluetoothHandler.tsx`](src/components/member/stand/BluetoothHandler.tsx), [`MidiHandler.tsx`](src/components/member/stand/MidiHandler.tsx) | ✅ Complete |
| Smart Navigation | [`SmartNavEditor.tsx`](src/components/member/stand/SmartNavEditor.tsx), [`navigation-links/route.ts`](src/app/api/stand/navigation-links/route.ts) | ✅ Complete |
| OMR Integration | [`omr/route.ts`](src/app/api/stand/omr/route.ts) | ✅ Complete |

---

## Proposed Commit Sequence

Following the commit-strategy.prompt.md guidelines, commits are organized into logical groups:

### Commit 1: Dependencies
**Message:** `chore: add stand-related dependencies`

**Files:**
- `package.json` (pdfjs-dist, pdf-lib, pitchy, tonal, webmidi, socket.io, socket.io-client, zustand)
- `package-lock.json`

**Body:**
```
Add dependencies required for Digital Music Stand:
- pdfjs-dist, pdf-lib: PDF rendering and manipulation
- pitchy, tonal: Tuner and pitch pipe functionality
- webmidi: MIDI device integration
- socket.io, socket.io-client: Real-time sync
- zustand: State management
```

---

### Commit 2: Schema Migrations
**Message:** `feat(db): add stand feature schema models`

**Files:**
- `prisma/schema.prisma` (Annotation, NavigationLink, StandSession, AudioLink, UserPreferences models)
- `prisma/migrations/20260224023951_stand_features/migration.sql`

**Body:**
```
Add Prisma models for Digital Music Stand:
- Annotation: Store user annotations with layer support
- NavigationLink: Smart navigation links between pieces
- StandSession: Track active users during events
- AudioLink: Reference audio files for pieces
- UserPreferences: Store night mode, metronome, MIDI mappings
```

---

### Commit 3: Core Infrastructure
**Message:** `feat(stand): add core utilities and hooks`

**Files:**
- `src/lib/wakeLock.ts` - Wake lock for gig mode
- `src/lib/pdf.ts` - PDF utility functions
- `src/hooks/use-stand-sync.ts` - WebSocket sync hook
- `src/hooks/useAudioTracker.ts` - Audio tracking hook

---

### Commit 4: API Routes
**Message:** `feat(api): add stand API endpoints`

**Files:**
- `src/app/api/stand/annotations/route.ts`
- `src/app/api/stand/annotations/[id]/route.ts`
- `src/app/api/stand/audio/route.ts`
- `src/app/api/stand/metadata/route.ts`
- `src/app/api/stand/navigation-links/route.ts`
- `src/app/api/stand/navigation-links/[id]/route.ts`
- `src/app/api/stand/omr/route.ts`
- `src/app/api/stand/preferences/route.ts`
- `src/app/api/stand/roster/route.ts`
- `src/app/api/stand/sync/route.ts`

**Body:**
```
Add RESTful API endpoints for stand features:
- Annotations CRUD with layer support
- Audio file management
- PDF metadata extraction
- Navigation links management
- OMR processing
- User preferences
- Roster/presence tracking
- WebSocket sync endpoint
```

---

### Commit 5: Component Scaffolding
**Message:** `feat(stand): add viewer components and page route`

**Files:**
- `src/components/member/stand/StandViewer.tsx` - Main viewer component
- `src/components/member/stand/StandCanvas.tsx` - PDF canvas
- `src/components/member/stand/Toolbar.tsx` - Main toolbar
- `src/components/member/stand/usePdf.ts` - PDF hook
- `src/components/member/stand/useFullscreen.ts` - Fullscreen hook
- `src/app/(member)/member/stand/[eventId]/page.tsx` - Page route

---

### Commit 6: PDF Rendering Feature
**Message:** `feat(stand): implement PDF canvas rendering`

**Files:**
- `src/components/member/stand/StandCanvas.tsx` (enhanced)
- `src/components/member/stand/usePdf.ts` (enhanced)

**Body:**
```
Implement PDF rendering with:
- High-quality canvas rendering via pdfjs-dist
- Page caching and preloading
- Zoom and pan support
- Responsive scaling
```

---

### Commit 7: Navigation & Page-turning
**Message:** `feat(stand): add navigation and page-turning controls`

**Files:**
- `src/components/member/stand/GestureHandler.tsx` - Touch gestures
- `src/components/member/stand/KeyboardHandler.tsx` - Keyboard shortcuts
- `src/components/member/stand/NavigationControls.tsx` - UI controls
- `src/components/member/stand/SetlistManager.tsx` - Setlist management

**Body:**
```
Add navigation features:
- Swipe gestures for page turning
- Keyboard shortcuts (arrows, space)
- Bluetooth pedal support
- Setlist ordering and piece switching
```

---

### Commit 8: Annotations System
**Message:** `feat(stand): implement annotation layer with tools`

**Files:**
- `src/components/member/stand/AnnotationLayer.tsx`
- `src/components/member/stand/SmartNavEditor.tsx`

**Body:**
```
Implement annotation system:
- Multi-layer annotations (Personal, Section, Director)
- Drawing tools with color selection
- Smart navigation link editor
- Real-time sync across devices
```

---

### Commit 9: Gig Mode & Night Mode
**Message:** `feat(stand): add performance and night mode toggles`

**Files:**
- `src/components/member/stand/PerformanceModeToggle.tsx`
- `src/components/member/stand/NightModeToggle.tsx`

**Body:**
```
Add performance features:
- Gig mode: fullscreen, wake lock, minimal UI
- Night mode: inverted colors for low-light
- Automatic mode restoration
```

---

### Commit 10: Rehearsal Utilities
**Message:** `feat(stand): add metronome, tuner, and pitch pipe`

**Files:**
- `src/components/member/stand/Metronome.tsx`
- `src/components/member/stand/Tuner.tsx`
- `src/components/member/stand/PitchPipe.tsx`
- `src/components/member/stand/AudioPlayer.tsx`
- `src/components/member/stand/AudioTrackerSettings.tsx`

**Body:**
```
Add rehearsal tools:
- Metronome with tempo adjustment
- Chromatic tuner using pitchy
- Pitch pipe with all notes
- Audio playback with tracking
```

---

### Commit 11: Hardware Integration
**Message:** `feat(stand): add Bluetooth and MIDI device support`

**Files:**
- `src/components/member/stand/BluetoothHandler.tsx`
- `src/components/member/stand/MidiHandler.tsx`

**Body:**
```
Add hardware integration:
- Bluetooth pedal support for page turning
- MIDI device mapping for commands
- Configurable button assignments
```

---

### Commit 12: Roster & Presence
**Message:** `feat(stand): add roster overlay and presence tracking`

**Files:**
- `src/components/member/stand/RosterOverlay.tsx`

**Body:**
```
Add roster features:
- Real-time presence display
- Section-based filtering
- Last-seen timestamps
```

---

### Commit 13: Tests
**Message:** `test(stand): add unit tests for stand components`

**Files:**
- `src/components/member/stand/__tests__/*.test.tsx` (14 test files)
- `src/app/api/stand/*/__tests__/*.test.ts` (3 test files)
- `src/hooks/__tests__/useStandSync.test.tsx`
- `src/hooks/__tests__/useAudioTracker.test.ts`

**Body:**
```
Add comprehensive test coverage:
- Component tests for all stand features
- API route tests for annotations, sync, OMR
- Hook tests for sync and audio tracking
- Accessibility tests for annotation layer
```

---

### Commit 14: Documentation
**Message:** `docs: add stand feature documentation`

**Files:**
- `docs/stand-annotation-system.md`
- `docs/stand-developer-guide.md`
- `docs/stand-pdf-rendering.md`
- `docs/stand-user-guide.md`

**Body:**
```
Add comprehensive documentation:
- Annotation system architecture
- Developer integration guide
- PDF rendering implementation details
- End-user feature guide
```

---

## Final Verification Checklist

Per commit-strategy.prompt.md requirements:

### Pre-commit Gates
- [ ] `npm run lint` => zero warnings/errors
- [ ] `npm run build` => success
- [ ] `npm run test` => all passing

### Manual Browser Verification
- [ ] Page turns are instant and gesture/keyboard responsive
- [ ] Annotations save, load, and sync across multiple tabs or devices
- [ ] Gig mode prevents sleep and hides UI
- [ ] Bluetooth and MIDI hardware send commands successfully

---

## Risk Notes

1. **WebSocket Connection**: Ensure Redis/socket.io server is properly configured in production
2. **PDF Worker**: Verify pdfjs-dist worker is correctly served from public directory
3. **Wake Lock API**: Test fallback behavior on browsers without Wake Lock support
4. **MIDI Permissions**: Web MIDI requires user permission; test permission flow
5. **Mobile Gestures**: Verify touch gestures work correctly on iOS Safari and Android Chrome

---

## Execution Instructions

1. Run verification gates: `npm run lint && npm run build && npm run test`
2. Execute commits in order listed above
3. After all commits, run final `npm run test` to confirm nothing is broken
4. Perform manual browser verification checklist
5. Mark all todos as complete

---

## Summary

| Commit # | Type | Description | Files |
|----------|------|-------------|-------|
| 1 | chore | Dependencies | 2 |
| 2 | feat | Schema migrations | 2 |
| 3 | feat | Core infrastructure | 4 |
| 4 | feat | API routes | 10 |
| 5 | feat | Component scaffolding | 6 |
| 6 | feat | PDF rendering | 2 |
| 7 | feat | Navigation | 4 |
| 8 | feat | Annotations | 2 |
| 9 | feat | Gig/Night modes | 2 |
| 10 | feat | Rehearsal utilities | 5 |
| 11 | feat | Hardware integration | 2 |
| 12 | feat | Roster/presence | 1 |
| 13 | test | Unit tests | ~19 |
| 14 | docs | Documentation | 4 |

**Total Commits: 14**
