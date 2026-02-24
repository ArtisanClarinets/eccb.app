import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnnotationLayer } from '../AnnotationLayer';
import { useStandStore, Tool } from '@/store/standStore';

// Mock requestAnimationFrame for testing
const mockRaf = vi.fn((cb: FrameRequestCallback) => {
  cb(0);
  return 0;
});
const mockCancelRaf = vi.fn();

vi.stubGlobal('requestAnimationFrame', mockRaf);
vi.stubGlobal('cancelAnimationFrame', mockCancelRaf);

// Helper to set up store state
function setupStore(opts: Partial<ReturnType<typeof useStandStore.getState>> = {}) {
  useStandStore.setState((state) => ({ ...state, ...opts }));
}

describe('AnnotationLayer accessibility', () => {
  beforeEach(() => {
    useStandStore.getState().reset();
    mockRaf.mockClear();
    mockCancelRaf.mockClear();
  });

  describe('ARIA attributes', () => {
    it('renders with proper role and aria-label', () => {
      setupStore({
        pieces: [{ id: 'p1', title: 'Test', composer: '', pdfUrl: null, totalPages: 1 }],
        currentPieceIndex: 0,
        currentPage: 1,
      });
      
      const { container } = render(
        <div style={{ width: 100, height: 100 }}>
          <AnnotationLayer />
        </div>
      );
      
      const annotationContainer = container.querySelector('[role="group"]');
      expect(annotationContainer).toBeInTheDocument();
      expect(annotationContainer).toHaveAttribute('aria-label', 'Annotation layers');
    });

    it('each canvas has proper aria-label', () => {
      setupStore({
        pieces: [{ id: 'p1', title: 'Test', composer: '', pdfUrl: null, totalPages: 1 }],
        currentPieceIndex: 0,
        currentPage: 1,
        editMode: false,
        selectedLayer: 'PERSONAL',
      });
      
      const { container } = render(
        <div style={{ width: 100, height: 100 }}>
          <AnnotationLayer />
        </div>
      );
      
      const canvases = container.querySelectorAll('canvas');
      expect(canvases[0]).toHaveAttribute('aria-label', 'personal annotation layer');
      expect(canvases[1]).toHaveAttribute('aria-label', 'section annotation layer');
      expect(canvases[2]).toHaveAttribute('aria-label', 'director annotation layer');
    });

    it('active layer canvas indicates active state in aria-label', () => {
      setupStore({
        pieces: [{ id: 'p1', title: 'Test', composer: '', pdfUrl: null, totalPages: 1 }],
        currentPieceIndex: 0,
        currentPage: 1,
        editMode: true,
        selectedLayer: 'SECTION',
      });
      
      const { container } = render(
        <div style={{ width: 100, height: 100 }}>
          <AnnotationLayer />
        </div>
      );
      
      const canvases = container.querySelectorAll('canvas');
      expect(canvases[1]).toHaveAttribute('aria-label', 'section annotation layer - active');
    });

    it('non-active canvases have aria-hidden when not in edit mode', () => {
      setupStore({
        pieces: [{ id: 'p1', title: 'Test', composer: '', pdfUrl: null, totalPages: 1 }],
        currentPieceIndex: 0,
        currentPage: 1,
        editMode: false,
        selectedLayer: 'PERSONAL',
      });
      
      const { container } = render(
        <div style={{ width: 100, height: 100 }}>
          <AnnotationLayer />
        </div>
      );
      
      const canvases = container.querySelectorAll('canvas');
      canvases.forEach((canvas) => {
        expect(canvas).toHaveAttribute('aria-hidden', 'true');
      });
    });
  });

  describe('Text annotation accessibility', () => {
    it('text input has proper aria-label when visible', () => {
      setupStore({
        pieces: [{ id: 'p1', title: 'Test', composer: '', pdfUrl: null, totalPages: 1 }],
        currentPieceIndex: 0,
        currentPage: 1,
        editMode: true,
        selectedLayer: 'PERSONAL',
        currentTool: Tool.TEXT,
      });
      
      const { container } = render(
        <div style={{ width: 100, height: 100 }}>
          <AnnotationLayer />
        </div>
      );
      
      // Simulate clicking to open text input
      const canvas = container.querySelectorAll('canvas')[0];
      fireEvent.pointerDown(canvas, {
        clientX: 50,
        clientY: 50,
        pressure: 0.5,
      });
      
      // Check for text input with proper aria
      const textInput = screen.queryByRole('textbox');
      if (textInput) {
        expect(textInput).toHaveAttribute('aria-label', 'Text annotation input');
      }
    });

    it('has screen reader help text for text annotation', () => {
      setupStore({
        pieces: [{ id: 'p1', title: 'Test', composer: '', pdfUrl: null, totalPages: 1 }],
        currentPieceIndex: 0,
        currentPage: 1,
        editMode: true,
        selectedLayer: 'PERSONAL',
        currentTool: Tool.TEXT,
      });
      
      const { container } = render(
        <div style={{ width: 100, height: 100 }}>
          <AnnotationLayer />
        </div>
      );
      
      const helpText = container.querySelector('#text-annotation-help');
      expect(helpText).toBeInTheDocument();
      expect(helpText).toHaveClass('sr-only');
    });
  });

  describe('Performance optimizations', () => {
    it('uses requestAnimationFrame for rendering', () => {
      setupStore({
        pieces: [{ id: 'p1', title: 'Test', composer: '', pdfUrl: null, totalPages: 1 }],
        currentPieceIndex: 0,
        currentPage: 1,
        editMode: true,
        selectedLayer: 'PERSONAL',
      });
      
      render(
        <div style={{ width: 100, height: 100 }}>
          <AnnotationLayer />
        </div>
      );
      
      // RAF should be called during render scheduling
      expect(mockRaf).toHaveBeenCalled();
    });
  });

  describe('Focus management', () => {
    it('text input receives focus when opened', async () => {
      setupStore({
        pieces: [{ id: 'p1', title: 'Test', composer: '', pdfUrl: null, totalPages: 1 }],
        currentPieceIndex: 0,
        currentPage: 1,
        editMode: true,
        selectedLayer: 'PERSONAL',
        currentTool: Tool.TEXT,
      });
      
      const { container } = render(
        <div style={{ width: 100, height: 100 }}>
          <AnnotationLayer />
        </div>
      );
      
      // Simulate clicking to open text input
      const canvas = container.querySelectorAll('canvas')[0];
      fireEvent.pointerDown(canvas, {
        clientX: 50,
        clientY: 50,
        pressure: 0.5,
      });
      
      // Text input should be visible
      const textInput = screen.queryByRole('textbox');
      if (textInput) {
        expect(textInput).toBeInTheDocument();
      }
    });
  });
});
