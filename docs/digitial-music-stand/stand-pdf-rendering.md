# PDF Canvas Rendering Developer Guide

This guide provides comprehensive information about the PDF rendering system in the Digital Music Stand, including canvas management, performance optimization, and accessibility features.

## Overview

The PDF rendering system uses PDF.js to render PDF pages to HTML5 canvas elements, providing high-quality display of music sheets with support for zooming, panning, and page cropping.

## Architecture

### Core Components

#### PDF.js Integration
**Location**: `src/components/member/stand/usePdf.ts`
**Purpose**: Handles PDF loading, rendering, and page management
**Key Features**:
- PDF file loading from storage URLs
- Page-by-page rendering with caching
- Automatic page dimension detection
- Memory-efficient page disposal

#### Canvas Management
**Location**: `src/components/member/stand/StandCanvas.tsx`
**Purpose**: Manages the canvas layers and rendering pipeline
**Key Features**:
- Multiple canvas layers for different purposes
- Zoom and pan functionality
- Page cropping and margin detection
- High-DPI display support

#### Page Cropping System
**Purpose**: Automatically removes margins and optimizes page display
**Implementation**:
- Edge detection algorithms to find content boundaries
- Configurable crop margins
- Preservation of important musical content near edges

## PDF.js Integration

### Loading PDF Files

```typescript
// PDF loading with error handling
const loadPdf = async (url: string) => {
  try {
    const loadingTask = pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;
    return pdf;
  } catch (error) {
    console.error('Failed to load PDF:', error);
    throw error;
  }
};
```

### Page Rendering Pipeline

1. **Page Loading**: Load specific page from PDF document
2. **Canvas Creation**: Create canvas element for the page
3. **Context Setup**: Configure canvas rendering context
4. **Scale Calculation**: Determine appropriate scale for display
5. **Rendering**: Draw page content to canvas
6. **Post-processing**: Apply cropping and optimizations

### Memory Management

#### Page Caching Strategy
```typescript
interface PageCache {
  page: PDFPage;
  canvas: HTMLCanvasElement;
  lastAccessed: number;
  isRendered: boolean;
}

// Cache management
const MAX_CACHE_SIZE = 5; // Maximum pages to keep in memory
const CACHE_TTL = 300000; // 5 minutes cache lifetime
```

#### Cleanup Process
- **Unused Page Removal**: Remove pages not accessed recently
- **Canvas Disposal**: Properly dispose of canvas elements
- **Memory Monitoring**: Track memory usage and trigger cleanup when needed

## Canvas Layer Architecture

### Layer Structure

The system uses a layered canvas approach:

1. **Background Layer**: PDF content rendering
2. **Annotation Layer**: User drawings and annotations
3. **UI Overlay Layer**: Temporary indicators and selection boxes

### Canvas Management

#### Multiple Canvas Handling
```typescript
interface CanvasLayers {
  background: HTMLCanvasElement;  // PDF content
  annotations: HTMLCanvasElement; // User annotations
  overlay: HTMLCanvasElement;     // UI elements
}

// Synchronized rendering across layers
const renderAllLayers = () => {
  renderBackgroundLayer();
  renderAnnotationLayer();
  renderOverlayLayer();
};
```

#### Resolution Scaling

Canvas resolution is dynamically adjusted based on zoom level and device pixel ratio:

```typescript
const getCanvasScale = (zoomLevel: number, devicePixelRatio: number) => {
  const baseScale = devicePixelRatio;
  const zoomScale = Math.max(0.5, Math.min(2.0, zoomLevel / 100));
  return baseScale * zoomScale;
};
```

## Performance Optimization

### Lazy Loading

#### Page Preloading
- **Adjacent Pages**: Preload previous and next pages
- **Predictive Loading**: Anticipate user navigation patterns
- **Bandwidth Awareness**: Adjust preloading based on connection speed

#### Rendering Optimization
- **Offscreen Canvas**: Use offscreen canvas for background rendering
- **Web Workers**: Move PDF processing to background threads
- **Incremental Rendering**: Render pages in chunks for better responsiveness

### Memory Optimization

#### Canvas Disposal
```typescript
const disposeCanvas = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
  canvas.width = 0;
  canvas.height = 0;
  canvas.remove();
};
```

#### Image Compression
- **Quality Adjustment**: Reduce image quality for distant zoom levels
- **Format Optimization**: Use appropriate image formats for different content
- **Compression Algorithms**: Apply lossless compression where possible

### Rendering Performance

#### Frame Rate Optimization
- **RequestAnimationFrame**: Use proper animation loops
- **Throttling**: Limit rendering frequency during user interactions
- **Debouncing**: Delay expensive operations until user stops interacting

#### GPU Acceleration
- **Hardware Acceleration**: Enable GPU rendering for canvas operations
- **CSS Transforms**: Use transform properties for smooth animations
- **Will-Change**: Hint browser about upcoming changes

## Zoom and Pan Implementation

### Zoom Functionality

#### Zoom Levels
```typescript
interface ZoomConfig {
  minZoom: number;    // 50%
  maxZoom: number;    // 200%
  step: number;       // 10% increments
  defaultZoom: number; // 100%
}
```

#### Zoom Implementation
```typescript
const handleZoom = (delta: number, centerPoint: Point) => {
  const newZoom = Math.max(
    config.minZoom,
    Math.min(config.maxZoom, currentZoom + delta)
  );
  
  // Calculate new scroll position to zoom towards center
  const newScrollX = centerPoint.x * (newZoom / currentZoom);
  const newScrollY = centerPoint.y * (newZoom / currentZoom);
  
  updateZoom(newZoom, newScrollX, newScrollY);
};
```

### Pan Functionality

#### Drag Handling
```typescript
const handlePan = (deltaX: number, deltaY: number) => {
  setScrollOffset(prev => ({
    x: prev.x + deltaX,
    y: prev.y + deltaY
  }));
};
```

#### Boundary Detection
- **Edge Constraints**: Prevent panning beyond page boundaries
- **Smooth Bouncing**: Add elastic effect when reaching boundaries
- **Auto-centering**: Automatically center content when zoomed out

## Page Cropping System

### Edge Detection

#### Algorithm Implementation
```typescript
const detectContentBounds = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Find non-white pixels to determine content boundaries
  let left = canvas.width, right = 0;
  let top = canvas.height, bottom = 0;
  
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      
      // Check if pixel is not white (allowing for slight variations)
      if (r < 250 || g < 250 || b < 250) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  
  return { left, right, top, bottom };
};
```

### Cropping Configuration

#### Margin Settings
```typescript
interface CropConfig {
  minMargin: number;    // Minimum margin to preserve
  maxCrop: number;      // Maximum crop percentage
  preserveEdges: boolean; // Whether to preserve edge content
}
```

#### Smart Cropping
- **Content Analysis**: Analyze page content to determine safe cropping areas
- **Music Notation Preservation**: Special handling for musical symbols near edges
- **User Override**: Allow manual adjustment of crop boundaries

## Accessibility Features

### Screen Reader Support

#### Canvas Description
- **ARIA Labels**: Provide descriptions of canvas content
- **Live Regions**: Announce canvas state changes
- **Keyboard Navigation**: Support keyboard-only navigation

#### Alternative Text
```typescript
const getCanvasDescription = (page: number, totalPages: number) => {
  return `Music page ${page} of ${totalPages}. Use arrow keys to navigate pages.`;
};
```

### High Contrast Support

#### Color Inversion
- **Dark Mode**: Support for dark color schemes
- **High Contrast**: Enhanced contrast for better visibility
- **Color Independence**: Ensure functionality doesn't rely solely on color

### Motor Accessibility

#### Large Targets
- **Touch-Friendly**: Large touch targets for mobile devices
- **Gesture Alternatives**: Provide alternatives to complex gestures
- **Timing Flexibility**: Allow users to control interaction timing

## Error Handling

### PDF Loading Errors

#### Error Types
- **Network Errors**: Handle connection issues
- **Format Errors**: Handle unsupported PDF formats
- **Corruption Errors**: Handle corrupted PDF files

#### Recovery Strategies
```typescript
const handlePdfError = (error: Error, retryCount: number = 0) => {
  if (retryCount < 3) {
    setTimeout(() => {
      loadPdf(pdfUrl, retryCount + 1);
    }, 1000 * (retryCount + 1));
  } else {
    showErrorMessage('Failed to load PDF after multiple attempts');
  }
};
```

### Rendering Errors

#### Canvas Errors
- **Context Loss**: Handle WebGL context loss
- **Memory Errors**: Handle out-of-memory situations
- **Size Errors**: Handle canvas size limitations

#### Fallback Mechanisms
- **Simplified Rendering**: Fallback to lower quality rendering
- **Page Skipping**: Skip problematic pages when possible
- **Error Recovery**: Attempt to recover from rendering errors

## Testing Strategy

### Unit Tests

#### PDF Loading Tests
```typescript
describe('PDF Loading', () => {
  it('should load valid PDF files', async () => {
    const pdf = await loadPdf(validPdfUrl);
    expect(pdf.numPages).toBeGreaterThan(0);
  });
  
  it('should handle invalid PDF files', async () => {
    await expect(loadPdf(invalidPdfUrl)).rejects.toThrow();
  });
});
```

#### Canvas Tests
```typescript
describe('Canvas Rendering', () => {
  it('should create canvas with correct dimensions', () => {
    const canvas = createCanvas(pageWidth, pageHeight);
    expect(canvas.width).toBe(pageWidth);
    expect(canvas.height).toBe(pageHeight);
  });
});
```

### Integration Tests

#### End-to-End PDF Flow
```typescript
describe('PDF End-to-End', () => {
  it('should load, render, and display PDF pages', async () => {
    // Test complete PDF loading and rendering workflow
  });
  
  it('should handle page navigation correctly', async () => {
    // Test page turning and navigation
  });
});
```

### Performance Tests

#### Memory Usage
```typescript
describe('Performance', () => {
  it('should not exceed memory limits with multiple pages', () => {
    // Test memory usage with multiple pages loaded
  });
  
  it('should maintain frame rate during interactions', () => {
    // Test rendering performance during user interactions
  });
});
```

## Troubleshooting

### Common Issues

#### Slow Rendering
- **Cause**: Large PDF files or high-resolution rendering
- **Solution**: Implement lazy loading and resolution scaling

#### Memory Leaks
- **Cause**: Improper canvas disposal or event listener cleanup
- **Solution**: Implement proper cleanup in useEffect cleanup functions

#### Display Issues
- **Cause**: Incorrect canvas sizing or scaling
- **Solution**: Verify canvas dimensions and scaling calculations

### Debug Tools

#### Development Console
- **Performance Monitor**: Track rendering performance
- **Memory Inspector**: Monitor memory usage
- **Network Monitor**: Track PDF loading and caching

#### Logging
- **Render Logs**: Log rendering operations and performance
- **Error Logs**: Capture and report rendering errors
- **User Interaction Logs**: Track user interactions for debugging

This PDF rendering system provides a robust foundation for displaying music sheets with excellent performance, accessibility, and user experience.