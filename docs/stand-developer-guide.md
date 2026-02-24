# Digital Music Stand Developer Guide

This guide provides comprehensive information for developers working on the Emerald Coast Community Band's Digital Music Stand system.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [API Reference](#api-reference)
3. [Database Schema](#database-schema)
4. [PDF Canvas Rendering](#pdf-canvas-rendering)
5. [WebSocket Protocol](#websocket-protocol)
6. [Audio Scheduling and OMR](#audio-scheduling-and-omr)
7. [Testing Strategy](#testing-strategy)
8. [Performance and Accessibility](#performance-and-accessibility)
9. [Component Architecture](#component-architecture)

## Architecture Overview

The Digital Music Stand is built as a modular React application with the following key architectural patterns:

### Frontend Architecture

- **Framework**: React 19 with TypeScript
- **State Management**: Zustand for global state, React context for local state
- **Styling**: Tailwind CSS with Radix UI primitives
- **PDF Rendering**: PDF.js for canvas-based PDF display
- **Real-time Communication**: WebSocket connections for collaboration
- **Build Tool**: Vite for fast development and optimized builds

### Key Components

- **StandViewer** (`src/components/member/stand/StandViewer.tsx`): Main container component
- **StandCanvas** (`src/components/member/stand/StandCanvas.tsx`): PDF rendering and interaction
- **AnnotationLayer** (`src/components/member/stand/AnnotationLayer.tsx`): Drawing and annotation system
- **Toolbar** (`src/components/member/stand/Toolbar.tsx`): Control interface
- **StandStore** (`src/store/standStore.ts`): Global state management

### State Management

The stand uses a centralized Zustand store (`src/store/standStore.ts`) that manages:

- Navigation state (current piece, page, scroll offset)
- UI state (fullscreen, gig mode, night mode, zoom)
- Annotation data (split by layer: personal, section, director)
- Tool settings (current tool, color, stroke width)
- Audio and rehearsal utility state
- Hardware integration settings (MIDI mappings)

## API Reference

### Stand Endpoints

All stand-related API endpoints are located in `src/app/api/stand/`.

#### Annotations

**POST `/api/stand/annotations`**
- **Purpose**: Create a new annotation
- **Request Body**:
  ```typescript
  {
    musicId: string;
    page: number;
    layer: 'PERSONAL' | 'SECTION' | 'DIRECTOR';
    strokeData: {
      x: number;
      y: number;
      content: string;
      color: string;
    };
  }
  ```
- **Response**: Created annotation object
- **Authentication**: Required

**GET `/api/stand/annotations`**
- **Purpose**: Retrieve annotations for a specific piece and page
- **Query Parameters**:
  - `musicId`: Piece ID
  - `page`: Page number
  - `layer`: Annotation layer (optional, filters by layer)
- **Response**: Array of annotation objects
- **Authentication**: Required

**PUT `/api/stand/annotations/[id]`**
- **Purpose**: Update an existing annotation
- **Request Body**:
  ```typescript
  {
    strokeData: {
      x: number;
      y: number;
      content: string;
      color: string;
    };
    layer: 'PERSONAL' | 'SECTION' | 'DIRECTOR';
  }
  ```
- **Response**: Updated annotation object
- **Authentication**: Required

**DELETE `/api/stand/annotations/[id]`**
- **Purpose**: Delete an annotation
- **Response**: Success status
- **Authentication**: Required

#### Audio Links

**GET `/api/stand/audio`**
- **Purpose**: Retrieve audio links for the current piece
- **Query Parameters**:
  - `pieceId`: Piece ID
- **Response**: Array of audio link objects
- **Authentication**: Required

#### Metadata

**GET `/api/stand/metadata`**
- **Purpose**: Retrieve metadata for a piece
- **Query Parameters**:
  - `pieceId`: Piece ID
- **Response**: Piece metadata including OMR data
- **Authentication**: Required

#### Navigation Links

**GET `/api/stand/navigation-links`**
- **Purpose**: Retrieve navigation links for a piece
- **Query Parameters**:
  - `pieceId`: Piece ID
- **Response**: Array of navigation link objects
- **Authentication**: Required

**POST `/api/stand/navigation-links`**
- **Purpose**: Create a new navigation link
- **Request Body**:
  ```typescript
  {
    fromPieceId: string;
    fromPage: number;
    toPieceId: string;
    toPage: number;
    label: string;
  }
  ```
- **Response**: Created navigation link object
- **Authentication**: Required

#### OMR (Optical Music Recognition)

**POST `/api/stand/omr`**
- **Purpose**: Process a PDF file with OMR analysis
- **Request Body**: FormData with PDF file
- **Response**: OMR analysis results including tempo, key signature, time signature
- **Authentication**: Required

#### Preferences

**GET `/api/stand/preferences`**
- **Purpose**: Retrieve user preferences for the stand
- **Response**: User preferences including MIDI mappings
- **Authentication**: Required

**PUT `/api/stand/preferences`**
- **Purpose**: Update user preferences
- **Request Body**: Partial preferences object
- **Response**: Updated preferences
- **Authentication**: Required

#### Roster

**GET `/api/stand/roster`**
- **Purpose**: Retrieve current roster for an event
- **Query Parameters**:
  - `eventId`: Event ID
- **Response**: Array of roster member objects
- **Authentication**: Required

#### Sync

**POST `/api/stand/sync`**
- **Purpose**: Send synchronization commands to other users
- **Request Body**:
  ```typescript
  {
    type: 'PAGE_CHANGE' | 'PIECE_CHANGE' | 'ANNOTATION_UPDATE';
    payload: any;
    targetLayer?: string;
  }
  ```
- **Response**: Sync status
- **Authentication**: Required

## Database Schema

The stand system uses several key database models defined in `prisma/schema.prisma`:

### Core Models

#### Annotation Model
```prisma
model Annotation {
  id        String           @id @default(cuid())
  musicId   String
  page      Int
  layer     AnnotationLayer
  strokeData Json
  userId    String
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt
  music     MusicPiece       @relation(fields: [musicId], references: [id], onDelete: Cascade)
  user      User             @relation(fields: [userId], references: [id])
  
  @@index([musicId])
  @@index([userId])
  @@index([layer])
}
```

#### NavigationLink Model
```prisma
model NavigationLink {
  id        String     @id @default(cuid())
  musicId   String
  fromX     Float
  fromY     Float
  toX       Float
  toY       Float
  label     String?
  createdAt DateTime   @default(now())
  music     MusicPiece @relation(fields: [musicId], references: [id], onDelete: Cascade)
  
  @@index([musicId])
}
```

#### StandSession Model
```prisma
model StandSession {
  id         String   @id @default(cuid())
  eventId    String
  userId     String
  section    String?
  lastSeenAt DateTime @default(now())
  createdAt  DateTime @default(now())
  
  @@unique([eventId, userId])
  @@index([eventId])
  @@index([userId])
}
```

#### AudioLink Model
```prisma
model AudioLink {
  id          String     @id @default(cuid())
  pieceId     String
  fileKey     String
  url         String?
  description String?
  createdAt   DateTime   @default(now())
  piece       MusicPiece @relation(fields: [pieceId], references: [id], onDelete: Cascade)
  
  @@index([pieceId])
}
```

#### UserPreferences Model
```prisma
model UserPreferences {
  id                String   @id @default(cuid())
  userId            String   @unique
  nightMode         Boolean  @default(false)
  metronomeSettings Json?
  midiMappings      Json?
  otherSettings     Json?
  updatedAt         DateTime @updatedAt
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
}
```

### Enums

#### AnnotationLayer
```prisma
enum AnnotationLayer {
  PERSONAL
  SECTION
  DIRECTOR
}
```

## PDF Canvas Rendering

### Architecture

The PDF rendering system uses PDF.js to render PDF pages to HTML5 canvas elements. Key components:

- **PDF.js Integration**: Handles PDF loading and rendering
- **Canvas Management**: Manages multiple canvas layers for different purposes
- **Zoom and Pan**: Implements zooming and panning functionality
- **Page Cropping**: Automatically crops pages to remove margins

### Key Files

- **usePdf.ts** (`src/components/member/stand/usePdf.ts`): PDF loading and rendering logic
- **StandCanvas.tsx** (`src/components/member/stand/StandCanvas.tsx`): Canvas rendering component
- **AnnotationLayer.tsx** (`src/components/member/stand/AnnotationLayer.tsx`): Drawing layer on top of PDF

### Rendering Process

1. **PDF Loading**: PDF.js loads the PDF file from storage
2. **Page Rendering**: Each page is rendered to a separate canvas
3. **Cropping**: Automatic margin detection and cropping
4. **Layering**: Multiple canvas layers for PDF, annotations, and UI elements
5. **Interaction**: Mouse/touch events handled for drawing and navigation

### Performance Optimizations

- **Lazy Loading**: Only render visible pages
- **Canvas Caching**: Cache rendered pages to avoid re-rendering
- **Resolution Scaling**: Adjust rendering resolution based on zoom level
- **Memory Management**: Dispose of unused canvas elements

## WebSocket Protocol

### Connection Management

WebSocket connections are managed through the `src/lib/websocket/stand-socket.ts` module:

```typescript
// Connection states
enum ConnectionState {
  CONNECTING,
  CONNECTED,
  DISCONNECTED,
  ERROR
}

// Message types
interface StandMessage {
  type: 'presence' | 'annotation' | 'navigation' | 'sync';
  payload: any;
  timestamp: number;
  userId: string;
}
```

### Message Types

#### Presence Messages
```typescript
{
  type: 'presence';
  payload: {
    eventId: string;
    userId: string;
    userName: string;
    section?: string;
    action: 'joined' | 'left';
  };
}
```

#### Annotation Messages
```typescript
{
  type: 'annotation';
  payload: {
    action: 'create' | 'update' | 'delete';
    annotation: Annotation;
    layer: AnnotationLayer;
  };
}
```

#### Navigation Messages
```typescript
{
  type: 'navigation';
  payload: {
    action: 'page_change' | 'piece_change';
    target: {
      pieceIndex?: number;
      page?: number;
    };
  };
}
```

#### Sync Messages
```typescript
{
  type: 'sync';
  payload: {
    command: 'go_to_page' | 'go_to_piece' | 'clear_annotations';
    targetLayer?: AnnotationLayer;
    data?: any;
  };
}
```

### Room Management

- **Event-based Rooms**: Each event creates a separate WebSocket room
- **Permission-based Access**: Users can only join events they have access to
- **Real-time Updates**: Changes are broadcast to all connected users in real-time
- **Conflict Resolution**: Last-write-wins for annotation conflicts

## Audio Scheduling and OMR

### Audio Tracker

The audio tracker uses the Web Audio API to analyze audio input and provide automatic page turning:

#### Implementation
- **Audio Context**: Web Audio API for audio processing
- **FFT Analysis**: Fast Fourier Transform for frequency analysis
- **Beat Detection**: Algorithm to detect tempo and beats
- **Page Turning Logic**: Automatic page turning based on audio analysis

#### Configuration
```typescript
interface AudioTrackerSettings {
  enabled: boolean;
  sensitivity: number; // 0.0 to 1.0
  cooldownMs: number;  // Minimum time between page turns
}
```

### OMR (Optical Music Recognition)

The OMR system processes PDF files to extract musical metadata:

#### Processing Pipeline
1. **PDF Extraction**: Extract text and images from PDF
2. **OCR Processing**: Use AI models to recognize musical notation
3. **Metadata Extraction**: Extract tempo, key signature, time signature
4. **Result Storage**: Store results in database for future use

#### AI Integration
- **Model Selection**: Configurable AI providers and models
- **Fallback Processing**: Multiple processing attempts with different models
- **Quality Assessment**: Confidence scoring for extracted data

## Testing Strategy

### Test Organization

Tests are organized by component and functionality:

- **Unit Tests**: Individual component testing (`*.test.tsx`)
- **Integration Tests**: API endpoint testing (`__tests__/route.test.ts`)
- **E2E Tests**: Full user workflow testing (planned)

### Testing Tools

- **Vitest**: Primary testing framework
- **React Testing Library**: Component testing utilities
- **MSW**: Mock Service Worker for API mocking
- **Playwright**: E2E testing (future implementation)

### Test Coverage Areas

#### Component Tests
- **StandViewer**: Main container functionality
- **StandCanvas**: PDF rendering and interaction
- **AnnotationLayer**: Drawing and annotation features
- **Toolbar**: Control interface functionality

#### API Tests
- **Annotation Endpoints**: CRUD operations for annotations
- **Audio Endpoints**: Audio link management
- **Sync Endpoints**: Real-time synchronization
- **OMR Endpoints**: PDF processing and metadata extraction

#### Integration Tests
- **WebSocket Communication**: Real-time features
- **PDF Rendering**: End-to-end PDF display
- **Annotation Sync**: Multi-user annotation collaboration

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run src/components/member/stand/StandViewer.test.tsx

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Performance and Accessibility

### Performance Optimizations

#### PDF Rendering
- **Lazy Loading**: Only render visible pages
- **Canvas Optimization**: Use appropriate resolution based on zoom level
- **Memory Management**: Dispose of unused resources
- **Caching**: Cache frequently accessed pages

#### Real-time Features
- **Debouncing**: Throttle rapid user interactions
- **Batch Updates**: Group multiple updates for efficiency
- **Connection Management**: Efficient WebSocket connection handling

#### General Performance
- **Code Splitting**: Lazy load non-critical components
- **Bundle Optimization**: Tree shaking and dead code elimination
- **Image Optimization**: Compress and optimize images

### Accessibility Features

#### Keyboard Navigation
- **Tab Navigation**: Full keyboard accessibility
- **Shortcuts**: Keyboard shortcuts for common actions
- **Focus Management**: Proper focus handling for modal dialogs

#### Screen Reader Support
- **ARIA Labels**: Proper labeling for all interactive elements
- **Semantic HTML**: Use semantic elements where appropriate
- **Live Regions**: Announce dynamic content changes

#### Visual Accessibility
- **High Contrast**: Support for high contrast modes
- **Text Scaling**: Respect user text scaling preferences
- **Color Independence**: Don't rely solely on color for information

#### Motor Accessibility
- **Large Targets**: Sufficiently large touch targets
- **Gesture Alternatives**: Provide alternatives to complex gestures
- **Timing Flexibility**: Allow users to control timing of interactions

## Component Architecture

### Core Components

#### StandViewer
**Location**: `src/components/member/stand/StandViewer.tsx`
**Purpose**: Main container component that orchestrates all stand functionality
**Key Features**:
- Manages overall stand state
- Coordinates between different sub-components
- Handles event lifecycle (mount/unmount)
- Manages WebSocket connections

#### StandCanvas
**Location**: `src/components/member/stand/StandCanvas.tsx`
**Purpose**: Handles PDF rendering and canvas interactions
**Key Features**:
- PDF.js integration for PDF rendering
- Canvas layer management
- Zoom and pan functionality
- Page cropping and optimization

#### AnnotationLayer
**Location**: `src/components/member/stand/AnnotationLayer.tsx`
**Purpose**: Provides drawing and annotation capabilities
**Key Features**:
- Multiple annotation tools (pencil, highlighter, eraser, text, stamps)
- Layer-based annotation system
- Pressure-sensitive drawing
- Real-time collaboration

#### Toolbar
**Location**: `src/components/member/stand/Toolbar.tsx`
**Purpose**: Provides user interface controls
**Key Features**:
- Navigation controls
- Annotation tool selection
- Utility toggles (metronome, tuner, etc.)
- Settings and preferences

### State Management

#### StandStore
**Location**: `src/store/standStore.ts`
**Purpose**: Centralized state management for the entire stand system
**Key Features**:
- Zustand-based state management
- Persistent state with localStorage
- Action-based state updates
- Selective state subscriptions

#### Local State
Components use React's useState and useEffect for local state management:
- **GestureHandler**: Touch and gesture state
- **KeyboardHandler**: Keyboard shortcut state
- **MidiHandler**: MIDI controller state

### Hooks

#### Custom Hooks
- **usePdf**: PDF loading and rendering logic
- **useStandSync**: WebSocket synchronization
- **useFullscreen**: Fullscreen mode management
- **useAnnotation**: Annotation-specific state and actions

#### Third-party Hooks
- **useRouter**: Navigation and routing
- **useWebSocket**: WebSocket connection management
- **useMediaQuery**: Responsive design breakpoints

### Data Flow

1. **User Interaction**: User interacts with UI components
2. **State Update**: Components update local or global state
3. **Action Dispatch**: State changes trigger actions
4. **API Calls**: Actions may trigger API calls
5. **Real-time Sync**: Changes are synchronized via WebSocket
6. **UI Update**: Components re-render based on state changes

This architecture provides a scalable, maintainable foundation for the digital music stand system while ensuring good performance and user experience.