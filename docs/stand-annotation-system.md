# Annotation System Developer Guide

This guide provides detailed information about the annotation system in the Digital Music Stand, including tool implementation, layer management, and collaboration features.

## Overview

The annotation system allows users to draw, highlight, and add notes to music sheets with support for multiple layers and real-time collaboration.

## Tool Architecture

### Tool Types

The annotation system supports five main tool types defined in `src/store/standStore.ts`:

```typescript
export enum Tool {
  PENCIL = 'PENCIL',           // Freehand drawing with pressure sensitivity
  HIGHLIGHTER = 'HIGHLIGHTER', // Semi-transparent highlighting
  ERASER = 'ERASER',           // Erasing annotations
  WHITEOUT = 'WHITEOUT',       // Covering areas with white
  TEXT = 'TEXT',               // Adding text notes
  STAMP = 'STAMP',             // Adding musical symbols
}
```

### Tool Implementation

Each tool is implemented as a separate component in `src/components/member/stand/AnnotationLayer.tsx`:

#### Pencil Tool
- **Purpose**: Freehand drawing with pressure sensitivity
- **Features**:
  - Pressure-sensitive line width based on touch pressure
  - Customizable colors
  - Smooth stroke rendering using quadratic curves
- **Implementation**: Uses canvas drawing API with pressure data

#### Highlighter Tool
- **Purpose**: Highlighting important passages
- **Features**:
  - Semi-transparent coloring (30% opacity)
  - Broader stroke width for highlighting effect
  - Multiple color options
- **Implementation**: Canvas drawing with reduced alpha values

#### Eraser Tool
- **Purpose**: Removing annotations
- **Features**:
  - Size-adjustable eraser radius
  - Selective layer erasing
  - Smooth erasing with pressure sensitivity
- **Implementation**: Canvas clearing with circular erase patterns

#### Text Tool
- **Purpose**: Adding text annotations
- **Features**:
  - Click-to-place text boxes
  - Font size and color customization
  - Text alignment options
- **Implementation**: HTML overlay elements positioned over canvas

#### Stamp Tool
- **Purpose**: Adding standard musical symbols
- **Features**:
  - Pre-defined symbols (fermata, breath mark, etc.)
  - Scalable and rotatable stamps
  - Custom SVG content support
- **Implementation**: SVG rendering with transformation capabilities

### Stroke Data Structure

Each annotation stores detailed stroke information:

```typescript
export interface StrokePoint {
  x: number;           // X coordinate
  y: number;           // Y coordinate
  pressure: number;    // Touch pressure (0.0 to 1.0)
  timestamp: number;   // Time of point creation
}

export interface StrokeData {
  id: string;
  type: Tool;
  points: StrokePoint[];
  color: string;
  baseWidth: number;
  opacity: number;
  // Optional fields for specific tools
  text?: string;
  fontSize?: number;
  stampId?: string;
  svgContent?: string;
  width?: number;
  height?: number;
  rotation?: number;
}
```

## Layer Management

### Layer Architecture

The system supports three annotation layers with different visibility and permissions:

1. **Personal Layer**: Private annotations visible only to the creator
2. **Section Layer**: Shared within the user's instrument section
3. **Director Layer**: Created by conductors, visible to all members

### Layer Implementation

Layer management is handled in `src/store/standStore.ts`:

```typescript
export interface StandState {
  annotations: {
    personal: Record<string, Annotation[]>;  // Keyed by pieceId-pageNumber
    section: Record<string, Annotation[]>;
    director: Record<string, Annotation[]>;
  };
  selectedLayer: 'PERSONAL' | 'SECTION' | 'DIRECTOR';
}
```

### Layer Operations

#### Loading Annotations
```typescript
loadAnnotations: async (pieceId: string, pageNumber: number) => {
  const key = annotationKey(pieceId, pageNumber);
  const layer = get().selectedLayer.toLowerCase();
  // Fetch from API and store in appropriate layer
}
```

#### Adding Annotations
```typescript
addAnnotation: async (annotation: Annotation) => {
  // Save to database and update local state
  // Annotations are automatically assigned to the current layer
}
```

#### Layer Switching
```typescript
setLayer: (layer: 'PERSONAL' | 'SECTION' | 'DIRECTOR') => 
  set({ selectedLayer: layer })
```

## Real-time Collaboration

### WebSocket Integration

Annotation changes are synchronized in real-time using WebSocket connections managed by `src/lib/websocket/stand-socket.ts`:

#### Message Types
```typescript
interface AnnotationMessage {
  type: 'annotation';
  payload: {
    action: 'create' | 'update' | 'delete';
    annotation: Annotation;
    layer: AnnotationLayer;
  };
}
```

#### Synchronization Process
1. **Local Update**: User action updates local state immediately
2. **API Call**: Changes are saved to the server
3. **Broadcast**: Server broadcasts changes to all connected users
4. **Remote Update**: Other users receive and apply the changes

### Conflict Resolution

The system uses a "last-write-wins" approach for annotation conflicts:
- Each annotation has a timestamp
- Most recent changes overwrite previous ones
- Users see real-time updates as they occur

## Performance Optimization

### Canvas Management

#### Layered Canvas Approach
The annotation system uses multiple canvas layers:

1. **Background Layer**: PDF rendering (handled by StandCanvas)
2. **Annotation Layer**: User drawings and annotations
3. **UI Layer**: Temporary drawing indicators and selection boxes

#### Rendering Optimization
- **Selective Redrawing**: Only redraw annotations that have changed
- **Canvas Caching**: Cache rendered annotation layers when possible
- **Resolution Scaling**: Adjust canvas resolution based on zoom level

### Memory Management

#### Cleanup Strategies
- **Unused Annotation Removal**: Remove annotations for pages not in view
- **Canvas Disposal**: Properly dispose of canvas elements when unmounting
- **Event Listener Cleanup**: Remove event listeners to prevent memory leaks

#### Performance Monitoring
- **Frame Rate Monitoring**: Track rendering performance
- **Memory Usage**: Monitor memory consumption for large annotation sets
- **Network Optimization**: Batch annotation updates when possible

## Accessibility Features

### Keyboard Navigation
- **Tool Selection**: Keyboard shortcuts for switching tools
- **Color Selection**: Keyboard navigation for color palettes
- **Stroke Width**: Keyboard controls for line thickness

### Screen Reader Support
- **ARIA Labels**: Proper labeling for all annotation tools
- **Live Regions**: Announce annotation changes to screen readers
- **Focus Management**: Maintain focus during annotation creation

### Motor Accessibility
- **Large Targets**: Sufficiently large tool buttons and controls
- **Alternative Input**: Support for alternative input devices
- **Timing Flexibility**: Allow users to control annotation creation speed

## Testing Strategy

### Unit Tests

#### Tool Functionality Tests
```typescript
// Test pencil tool stroke creation
describe('Pencil Tool', () => {
  it('should create stroke with pressure sensitivity', () => {
    // Test pressure-sensitive line width
  });
  
  it('should handle color changes', () => {
    // Test color application
  });
});
```

#### Layer Management Tests
```typescript
// Test layer switching and data isolation
describe('Layer Management', () => {
  it('should isolate annotations by layer', () => {
    // Test that annotations don't leak between layers
  });
  
  it('should persist layer selection', () => {
    // Test layer persistence across sessions
  });
});
```

### Integration Tests

#### WebSocket Synchronization
```typescript
// Test real-time annotation synchronization
describe('Annotation Sync', () => {
  it('should sync annotations across users', () => {
    // Test multi-user annotation collaboration
  });
  
  it('should handle network disconnections', () => {
    // Test offline/online scenarios
  });
});
```

### E2E Tests

#### User Workflow Tests
```typescript
// Test complete annotation workflow
describe('Annotation Workflow', () => {
  it('should allow complete annotation creation flow', () => {
    // Test: select tool → draw → save → sync
  });
  
  it('should handle layer switching during annotation', () => {
    // Test layer switching mid-annotation
  });
});
```

## Customization and Extensibility

### Adding New Tools

To add a new annotation tool:

1. **Extend Tool Enum**:
   ```typescript
   export enum Tool {
     // ... existing tools
     NEW_TOOL = 'NEW_TOOL',
   }
   ```

2. **Implement Tool Logic**:
   - Add tool-specific drawing logic in AnnotationLayer
   - Handle tool-specific events and interactions
   - Implement tool-specific stroke data structure

3. **Update UI**:
   - Add tool button to toolbar
   - Add tool-specific controls and options

4. **Update Tests**:
   - Add unit tests for new tool functionality
   - Add integration tests for tool behavior

### Customizing Existing Tools

#### Tool Configuration
Tools can be configured through the store state:
```typescript
export interface StandState {
  currentTool: Tool;
  toolColor: string;
  strokeWidth: number;
  pressureScale: number;
}
```

#### Tool Behavior Customization
- **Stroke Rendering**: Customize how strokes are drawn
- **Interaction Patterns**: Modify how tools respond to user input
- **Visual Feedback**: Customize tool visual indicators

## Troubleshooting

### Common Issues

#### Performance Problems
- **Symptom**: Slow rendering or lag during annotation
- **Solution**: Check canvas resolution, implement lazy loading, optimize stroke data

#### Synchronization Issues
- **Symptom**: Annotations not appearing on other users' screens
- **Solution**: Check WebSocket connection, verify API endpoints, inspect network logs

#### Memory Leaks
- **Symptom**: Increasing memory usage over time
- **Solution**: Implement proper cleanup, dispose of canvas elements, remove event listeners

### Debug Tools

#### Development Tools
- **Annotation Inspector**: View annotation data structure
- **Layer Debugger**: Visualize layer separation
- **Performance Monitor**: Track rendering performance

#### Logging
- **Action Logging**: Log all annotation actions for debugging
- **Sync Logging**: Log WebSocket messages and synchronization events
- **Error Tracking**: Capture and report annotation-related errors

This annotation system provides a robust foundation for collaborative music annotation with support for multiple tools, layers, and real-time synchronization.